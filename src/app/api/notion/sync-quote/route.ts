import { NextRequest, NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import { versionRowToRecord } from "@/app/api/sheets/_v2-utils";

const NOTION_API = "https://api.notion.com/v1";

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };
}

function mapStatus(versionStatus: string): string {
  switch (versionStatus) {
    case "accepted": return "成交";
    case "rejected":
    case "superseded": return "Fail";
    default: return "詢價";
  }
}

function buildProperties(version: ReturnType<typeof versionRowToRecord>) {
  const fmtMoney = (n: number) => (n ? `$${Math.round(n).toLocaleString("zh-TW")}` : "");
  const title = version.clientNameSnapshot || version.versionLabel || version.versionId;

  const props: Record<string, unknown> = {
    編號: { title: [{ text: { content: title } }] },
    聯絡人: { rich_text: [{ text: { content: version.clientNameSnapshot || "" } }] },
    訂製內容: { rich_text: [{ text: { content: version.projectNameSnapshot || version.quoteNameSnapshot || "" } }] },
    報價: { rich_text: [{ text: { content: fmtMoney(version.totalAmount) } }] },
    估價: { rich_text: [{ text: { content: fmtMoney(version.estimatedCostTotal) } }] },
    狀態: { select: { name: mapStatus(version.versionStatus) } },
  };

  if (version.quoteDate) {
    props["詢價日"] = { date: { start: version.quoteDate } };
  }

  return props;
}

async function findExistingPage(title: string, dbId: string): Promise<string | null> {
  const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filter: { property: "編號", title: { equals: title } },
      page_size: 1,
    }),
  });
  const data = (await res.json()) as { results?: { id: string }[] };
  return data.results?.[0]?.id ?? null;
}

async function upsertImageBlock(pageId: string, imageUrl: string): Promise<void> {
  // Remove existing image blocks
  const blocksRes = await fetch(`${NOTION_API}/blocks/${pageId}/children`, { headers: headers() });
  if (blocksRes.ok) {
    const blocksData = (await blocksRes.json()) as { results?: { id: string; type: string }[] };
    for (const block of blocksData.results ?? []) {
      if (block.type === "image") {
        await fetch(`${NOTION_API}/blocks/${block.id}`, { method: "DELETE", headers: headers() });
      }
    }
  }

  // Append new image block
  await fetch(`${NOTION_API}/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      children: [{ type: "image", image: { type: "external", external: { url: imageUrl } } }],
    }),
  });
}

export async function POST(req: NextRequest) {
  const { versionId, jpgUrl, clientName: clientNameOverride } = (await req.json()) as { versionId: string; jpgUrl?: string; clientName?: string };
  if (!versionId) return NextResponse.json({ ok: false, error: "versionId required" }, { status: 400 });

  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_QUOTE_DB_ID;
  if (!token || !dbId) return NextResponse.json({ ok: false, error: "Notion 未設定" }, { status: 503 });

  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "Sheets 未設定" }, { status: 503 });

  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: "報價版本!A2:AW2000",
  });
  const rows = (res.data.values ?? []) as string[][];
  const row = rows.find((r) => r[0] === versionId);
  if (!row) return NextResponse.json({ ok: false, error: "報價版本不存在" }, { status: 404 });

  const version = versionRowToRecord(row);
  // Prefer live clientName from request (editor state) over potentially-empty snapshot
  if (clientNameOverride) version.clientNameSnapshot = clientNameOverride;
  const properties = buildProperties(version);
  const notionTitle = version.clientNameSnapshot || version.versionLabel || version.versionId;

  const existingId = await findExistingPage(notionTitle, dbId);

  let notionPageId: string;
  let action: "created" | "updated";

  if (existingId) {
    const upRes = await fetch(`${NOTION_API}/pages/${existingId}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ properties }),
    });
    if (!upRes.ok) {
      const err = (await upRes.json()) as { message?: string };
      return NextResponse.json({ ok: false, error: err.message ?? "Notion 更新失敗" }, { status: 500 });
    }
    notionPageId = existingId;
    action = "updated";
  } else {
    const crRes = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ parent: { database_id: dbId }, properties }),
    });
    if (!crRes.ok) {
      const err = (await crRes.json()) as { message?: string };
      return NextResponse.json({ ok: false, error: err.message ?? "Notion 建立失敗" }, { status: 500 });
    }
    const page = (await crRes.json()) as { id: string };
    notionPageId = page.id;
    action = "created";
  }

  if (jpgUrl) {
    await upsertImageBlock(notionPageId, jpgUrl);
  }

  const notionUrl = `https://notion.so/${notionPageId.replace(/-/g, "")}`;
  return NextResponse.json({ ok: true, action, notionPageId, notionUrl });
}
