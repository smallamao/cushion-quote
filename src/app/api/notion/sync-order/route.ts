import { NextRequest, NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";
import type { CustomOrder } from "@/lib/types";

const NOTION_API = "https://api.notion.com/v1";

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };
}

// System itemCategory → Notion 品項 select name
const CATEGORY_MAP: Record<string, string> = {
  "坐/背墊": "坐/背墊",
  "臥榻墊": "臥榻墊",
  "縫布裱板": "繃布裱板工程",
  "到府清潔": "到府清潔",
  "到府施工": "到府施工",
  "訂製沙發": "訂製款沙發",
  "泡棉內裏": "泡棉內裏",
  "皮/布套": "皮/布套",
  "維修": "維修",
  "大和樂活": "大和樂活",
};

// System status → Notion 狀態 select name
function mapStatus(status: string): string {
  switch (status) {
    case "completed": return "待出貨 | Wait For Shipping";
    case "delivered": return "完成 | Completed";
    default: return "排程 | Production";
  }
}

function buildProperties(order: CustomOrder) {
  const totalCost =
    (order.materialPurchases ?? []).length > 0
      ? order.materialPurchases!.reduce((s, p) => s + (p.amount || 0), 0)
      : order.materialCost + order.laborCost + order.shippingCost + order.otherCost;

  // Collect color codes from items
  const colorCodes = order.items
    .map((it) => it.colorCode)
    .filter((c): c is string => Boolean(c))
    .join(", ");

  // Notion 命名慣例：「工單編號 客戶名」（例：S896 吳燕君）
  const name = [order.orderNumber, order.clientName].filter(Boolean).join(" ");

  const props: Record<string, unknown> = {
    Name: { title: [{ text: { content: name || order.orderNumber || order.orderId } }] },
    報價: { number: order.quotedAmount || 0 },
    成本: { number: totalCost || 0 },
    狀態: { select: { name: mapStatus(order.status) } },
  };

  if (order.shippingCost > 0) {
    props["運費"] = { number: order.shippingCost };
  }

  if (order.orderDate) {
    props["下單日"] = { date: { start: order.orderDate } };
  }

  if (order.installDate) {
    props["出貨日"] = { date: { start: order.installDate } };
  }

  if (colorCodes) {
    props["色號"] = { rich_text: [{ text: { content: colorCodes } }] };
  }

  const notionCategory = order.itemCategory ? CATEGORY_MAP[order.itemCategory] : undefined;
  if (notionCategory) {
    props["品項"] = { select: { name: notionCategory } };
  }

  return props;
}

async function findExistingPage(name: string, dbId: string): Promise<string | null> {
  const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filter: { property: "Name", title: { equals: name } },
      page_size: 1,
    }),
  });
  const data = (await res.json()) as { results?: { id: string }[] };
  return data.results?.[0]?.id ?? null;
}

async function upsertImageBlock(pageId: string, imageUrl: string): Promise<void> {
  const blocksRes = await fetch(`${NOTION_API}/blocks/${pageId}/children`, { headers: headers() });
  if (blocksRes.ok) {
    const blocksData = (await blocksRes.json()) as { results?: { id: string; type: string }[] };
    for (const block of blocksData.results ?? []) {
      if (block.type === "image") {
        await fetch(`${NOTION_API}/blocks/${block.id}`, { method: "DELETE", headers: headers() });
      }
    }
  }
  await fetch(`${NOTION_API}/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: headers(),
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
  const properties = buildProperties(order);
  const pageName = [order.orderNumber, order.clientName].filter(Boolean).join(" ") || order.orderId;

  const existingId = await findExistingPage(pageName, dbId);

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
