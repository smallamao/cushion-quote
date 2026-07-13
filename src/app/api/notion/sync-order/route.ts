import { NextRequest, NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";
import {
  NOTION_API,
  buildNotionProperties,
  findNotionPage,
  notionHeaders,
  notionPageName,
} from "@/lib/notion-order";

async function upsertImageBlock(pageId: string, imageUrl: string): Promise<void> {
  const blocksRes = await fetch(`${NOTION_API}/blocks/${pageId}/children`, { headers: notionHeaders() });
  if (blocksRes.ok) {
    const blocksData = (await blocksRes.json()) as { results?: { id: string; type: string }[] };
    for (const block of blocksData.results ?? []) {
      if (block.type === "image") {
        await fetch(`${NOTION_API}/blocks/${block.id}`, { method: "DELETE", headers: notionHeaders() });
      }
    }
  }
  await fetch(`${NOTION_API}/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({
      children: [{ type: "image", image: { type: "external", external: { url: imageUrl } } }],
    }),
  });
}

export async function POST(req: NextRequest) {
  const { orderId, jpgUrl } = (await req.json()) as { orderId: string; jpgUrl?: string };
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });

  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_ORDER_DB_ID;
  if (!token || !dbId) return NextResponse.json({ ok: false, error: "Notion 未設定" }, { status: 503 });

  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "Sheets 未設定" }, { status: 503 });

  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: ORDER_RANGE_DATA,
  });
  const rows = (res.data.values ?? []) as string[][];
  const row = rows.find((r) => r[0] === orderId);
  if (!row) return NextResponse.json({ ok: false, error: "訂單不存在" }, { status: 404 });

  const order = orderRowToRecord(row);
  const properties = buildNotionProperties(order);
  const pageName = notionPageName(order);

  const existingId = await findNotionPage(pageName, dbId);

  let notionPageId: string;
  let action: "created" | "updated";

  if (existingId) {
    const upRes = await fetch(`${NOTION_API}/pages/${existingId}`, {
      method: "PATCH",
      headers: notionHeaders(),
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
      headers: notionHeaders(),
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
