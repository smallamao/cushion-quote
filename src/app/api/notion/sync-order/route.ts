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

const VALID_CATEGORIES = [
  "維修", "訂製坐背墊", "訂製皮布套", "更換泡棉",
  "訂製臥榻墊", "訂製款沙發", "床頭繃布", "到府清潔",
];

function mapStatus(status: string): string {
  switch (status) {
    case "production":
    case "completed":
    case "delivered": return "成交";
    case "cancelled": return "Fail";
    default: return "詢價";
  }
}

function buildProperties(order: CustomOrder) {
  const totalCost =
    (order.materialPurchases ?? []).length > 0
      ? order.materialPurchases!.reduce((s, p) => s + (p.amount || 0), 0)
      : order.materialCost + order.laborCost + order.shippingCost + order.otherCost;

  const fmtMoney = (n: number) => (n ? `$${n.toLocaleString("zh-TW")}` : "");

  const props: Record<string, unknown> = {
    編號: { title: [{ text: { content: order.orderNumber || order.orderId } }] },
    聯絡人: { rich_text: [{ text: { content: order.clientName || "" } }] },
    訂製內容: { rich_text: [{ text: { content: order.orderTitle || "" } }] },
    報價: { rich_text: [{ text: { content: fmtMoney(order.quotedAmount) } }] },
    估價: { rich_text: [{ text: { content: fmtMoney(totalCost) } }] },
    狀態: { select: { name: mapStatus(order.status) } },
  };

  // 詢價日 — use orderDate (creation date), fallback to createdAt date part
  const dateStr = order.orderDate || order.createdAt?.slice(0, 10) || null;
  if (dateStr) {
    props["詢價日"] = { date: { start: dateStr } };
  }

  if (order.itemCategory && VALID_CATEGORIES.includes(order.itemCategory)) {
    props["分類"] = { select: { name: order.itemCategory } };
  }

  return props;
}

async function findExistingPage(orderNumber: string): Promise<string | null> {
  const dbId = process.env.NOTION_QUOTE_DB_ID!;
  const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filter: {
        property: "編號",
        title: { equals: orderNumber },
      },
      page_size: 1,
    }),
  });
  const data = (await res.json()) as { results?: { id: string }[] };
  return data.results?.[0]?.id ?? null;
}

export async function POST(req: NextRequest) {
  const { orderId } = (await req.json()) as { orderId: string };
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });

  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_QUOTE_DB_ID;
  if (!token || !dbId) return NextResponse.json({ ok: false, error: "Notion 未設定" }, { status: 503 });

  // Fetch order from Sheets
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
  const orderNum = order.orderNumber || order.orderId;

  // Check if page already exists (by 編號)
  const existingId = await findExistingPage(orderNum);

  let notionPageId: string;
  let action: "created" | "updated";

  if (existingId) {
    // Update existing page
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
    // Create new page
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

  const notionUrl = `https://notion.so/${notionPageId.replace(/-/g, "")}`;
  return NextResponse.json({ ok: true, action, notionPageId, notionUrl });
}
