import type { CustomOrder } from "@/lib/types";

// Notion 訂單資料庫同步共用邏輯：
// - /api/notion/sync-order（手動整單同步，含工單圖）
// - /api/sheets/orders/[id]/status（改狀態時 best-effort 更新既有頁面）
export const NOTION_API = "https://api.notion.com/v1";

export function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };
}

// System itemCategory → Notion 品項 select name
export const NOTION_CATEGORY_MAP: Record<string, string> = {
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

// System status → Notion 狀態 select name。
// 系統 OrderStatus = production | waiting | completed | cancelled。
// Notion「狀態」select 只有三個選項（排程/待出貨/完成），無「取消」；
// 因此 cancelled（或未知）回 null → 呼叫端不覆寫 Notion 狀態，避免推錯值或誤建新選項。
export function mapNotionStatus(status: string): string | null {
  switch (status) {
    case "production": return "排程 | Production";
    case "waiting": return "待出貨 | Wait For Shipping";
    case "completed": return "完成 | Completed";
    default: return null; // cancelled 等：Notion 無對應選項
  }
}

// Notion 命名慣例：「工單編號 客戶名」（例：S896 吳燕君）
export function notionPageName(order: CustomOrder): string {
  return [order.orderNumber, order.clientName].filter(Boolean).join(" ") || order.orderId;
}

export function buildNotionProperties(order: CustomOrder) {
  const totalCost =
    (order.materialPurchases ?? []).length > 0
      ? order.materialPurchases!.reduce((s, p) => s + (p.amount || 0), 0)
      : order.materialCost + order.laborCost + order.shippingCost + order.otherCost;

  const colorCodes = order.items
    .map((it) => it.colorCode)
    .filter((c): c is string => Boolean(c))
    .join(", ");

  const name = notionPageName(order);

  const props: Record<string, unknown> = {
    Name: { title: [{ text: { content: name } }] },
    報價: { number: order.quotedAmount || 0 },
    成本: { number: totalCost || 0 },
  };

  // 狀態：僅在有對應的 Notion 選項時才寫入（cancelled 無對應 → 不覆寫，維持原值）
  const notionStatus = mapNotionStatus(order.status);
  if (notionStatus) {
    props["狀態"] = { select: { name: notionStatus } };
  }

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

  const notionCategory = order.itemCategory ? NOTION_CATEGORY_MAP[order.itemCategory] : undefined;
  if (notionCategory) {
    props["品項"] = { select: { name: notionCategory } };
  }

  return props;
}

export async function findNotionPage(name: string, dbId: string): Promise<string | null> {
  const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      filter: { property: "Name", title: { equals: name } },
      page_size: 1,
    }),
  });
  const data = (await res.json()) as { results?: { id: string }[] };
  return data.results?.[0]?.id ?? null;
}

/**
 * Notion 已有此訂單的頁面時，更新其屬性（含狀態）；沒有頁面則不動作、不建新頁。
 * 回傳是否有更新。供改狀態等輕量操作 best-effort 呼叫。
 */
export async function updateNotionPageIfExists(order: CustomOrder): Promise<boolean> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_ORDER_DB_ID;
  if (!token || !dbId) return false;

  const pageId = await findNotionPage(notionPageName(order), dbId);
  if (!pageId) return false;

  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({ properties: buildNotionProperties(order) }),
  });
  return res.ok;
}
