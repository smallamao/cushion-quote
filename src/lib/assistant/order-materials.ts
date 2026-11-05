import "server-only";

import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";
import { getSheetsClient } from "@/lib/sheets-client";
import { STATUS_LABELS } from "@/lib/assistant/order-tools";
import type { CustomOrder } from "@/lib/types";

/**
 * 回答「這張訂製訂單的料叫了沒」。
 *
 * 老闆 2026-11-04 問「目前排程中的訂製訂單，面料都有採購了嗎？」，助手答不出來——
 * 它手上的 query_purchase_orders 只吐廠商／日期／金額／狀態，看不到採購單綁了哪張訂單，
 * 也看不到買了什麼。這支把「訂製訂單 → 採購單 → 明細 → 商品分類」接起來。
 *
 * 🔴 這支刻意只給「查到什麼」，不給「有沒有採購」的結論，原因是查證後的兩件事：
 *
 * 1. 關聯訂單欄（採購單 Q 欄）1,310 張裡只有 16 張有填。手動建的採購單多半沒綁訂單，
 *    所以「查無關聯採購單」完全不等於「沒買」。
 * 2. 採購單狀態常停在 draft 沒往後推——PS-20261031-02 早就傳給廠商了，狀態還是草稿。
 *    不能拿狀態判斷有沒有下單。
 *
 * 兩個限制都會隨資料即時算出來寫進回傳文字，讓模型照實轉述，不要自己腦補成結論。
 */

const PO_RANGE = "採購單!A2:Q";
const ITEM_RANGE = "採購單明細!A2:J";
const PRODUCT_RANGE = "採購商品!A2:F";

/** 採購單狀態標籤。sent 以前漏掉，1,310 張裡有 129 張是這個狀態。 */
const PO_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  sent: "已送出給廠商",
  confirmed: "已確認",
  received: "已到貨",
  cancelled: "已取消",
};

export interface PurchaseLink {
  purchaseId: string;
  purchaseDate: string;
  supplierName: string;
  status: string;
  /** 關聯訂單 ID，可能一張採購單綁多張訂單 */
  relatedOrderIds: string[];
}

export interface PurchaseItemLine {
  purchaseId: string;
  productName: string;
  category: string;
  quantity: string;
  unit: string;
}

export interface MaterialReportInput {
  orders: CustomOrder[];
  purchases: PurchaseLink[];
  items: PurchaseItemLine[];
  /** 全部採購單張數，用來算關聯欄位的覆蓋率 */
  totalPurchaseCount: number;
}

/** 一張採購單上「看起來像料」的品項；其他（工資、運費）照列但不特別標。 */
const MATERIAL_CATEGORIES = new Set(["面料", "皮革", "泡棉"]);

function describeItem(it: PurchaseItemLine): string {
  const cat = it.category ? `［${it.category}］` : "";
  const qty = it.quantity ? ` ${it.quantity}${it.unit}` : "";
  return `${cat}${it.productName}${qty}`;
}

/**
 * 組出給模型看的報告。純函式——sheet 讀取與這裡分開，才測得到。
 */
export function buildMaterialReport(input: MaterialReportInput): string {
  const { orders, purchases, items, totalPurchaseCount } = input;
  if (orders.length === 0) return "查無符合條件的訂製訂單。";

  const itemsByPurchase = new Map<string, PurchaseItemLine[]>();
  for (const it of items) {
    const list = itemsByPurchase.get(it.purchaseId);
    if (list) list.push(it);
    else itemsByPurchase.set(it.purchaseId, [it]);
  }

  const linkedCount = purchases.filter((p) => p.relatedOrderIds.length > 0).length;
  const blocks: string[] = [];
  let withPurchase = 0;

  for (const o of orders) {
    const linked = purchases.filter((p) => p.relatedOrderIds.includes(o.orderId));
    const head = `${o.orderId}　${o.clientName || "(未填客戶)"}　${STATUS_LABELS[o.status] ?? o.status}　${o.orderTitle || ""}`.trimEnd();

    if (linked.length === 0) {
      blocks.push(`${head}\n  查無關聯採購單`);
      continue;
    }
    withPurchase += 1;

    const lines = linked.map((p) => {
      const its = itemsByPurchase.get(p.purchaseId) ?? [];
      const materials = its.filter((it) => MATERIAL_CATEGORIES.has(it.category));
      const shown = (materials.length > 0 ? materials : its).map(describeItem);
      const body = shown.length > 0 ? shown.map((s) => `\n      ${s}`).join("") : "\n      (這張採購單沒有明細)";
      return `  採購單 ${p.purchaseId}／${p.supplierName || "未填廠商"}／${PO_STATUS_LABEL[p.status] ?? p.status}／${p.purchaseDate}${body}`;
    });
    blocks.push(`${head}\n${lines.join("\n")}`);
  }

  const coverage =
    totalPurchaseCount > 0
      ? `全系統 ${totalPurchaseCount.toLocaleString()} 張採購單裡，只有 ${linkedCount} 張有填「關聯訂單」`
      : "目前沒有採購單資料";

  return [
    `共 ${orders.length} 張訂單，其中 ${withPurchase} 張查得到關聯採購單。`,
    "",
    blocks.join("\n\n"),
    "",
    "⚠️ 判讀限制（回答時必須一併說明，不可省略）：",
    `1. 「查無關聯採購單」不等於沒採購。${coverage}——手動建立的採購單多半沒綁訂單，這裡就查不到。`,
    "2. 採購單狀態常停在「草稿」沒往後推，已經傳給廠商的單也可能還掛草稿，不能用狀態判斷有沒有下單。",
    "3. 因此只能回報「查到什麼」，不要下「已採購／未採購」的結論。",
  ].join("\n");
}

/** 取得訂製訂單的料況。不給 orderIds 就看全部「排程/生產中」的訂單。 */
export async function getOrderMaterials(args: {
  orderIds?: string[];
  orderStatus?: string;
}): Promise<string> {
  const client = await getSheetsClient();
  if (!client) return "❌ Google Sheets 未設定。";

  const res = await client.sheets.spreadsheets.values.batchGet({
    spreadsheetId: client.spreadsheetId,
    ranges: [ORDER_RANGE_DATA, PO_RANGE, ITEM_RANGE, PRODUCT_RANGE],
  });
  const [orderRows, poRows, itemRows, productRows] = (res.data.valueRanges ?? []).map(
    (v) => (v.values ?? []) as string[][],
  );

  const allOrders = (orderRows ?? []).filter((r) => r[0]).map(orderRowToRecord);
  const wanted = (args.orderIds ?? []).map((s) => s.trim()).filter(Boolean);
  const status = (args.orderStatus ?? "").trim() || "production";
  const orders =
    wanted.length > 0
      ? allOrders.filter((o) => wanted.includes(o.orderId))
      : allOrders.filter((o) => o.status === status);

  const purchases: PurchaseLink[] = (poRows ?? [])
    .filter((r) => r[0])
    .map((r) => ({
      purchaseId: r[0] ?? "",
      purchaseDate: r[1] ?? "",
      supplierName: (() => {
        try {
          return (JSON.parse(r[5] ?? "{}") as Record<string, string>).name ?? r[2] ?? "";
        } catch {
          return r[2] ?? "";
        }
      })(),
      status: r[11] ?? "",
      relatedOrderIds: (r[16] ?? "")
        .split(/[,、;／/\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    }));

  // 商品 ID → 分類。明細的商品快照沒有分類欄，要回商品主檔查。
  const categoryById = new Map<string, string>();
  for (const r of productRows ?? []) {
    if (r[0]) categoryById.set(r[0], r[5] ?? "");
  }

  const items: PurchaseItemLine[] = (itemRows ?? [])
    .filter((r) => r[1])
    .map((r) => {
      let name = "";
      let unit = "";
      try {
        const snap = JSON.parse(r[4] ?? "{}") as Record<string, string>;
        name = snap.productName ?? "";
        unit = snap.unit ?? "";
      } catch {
        name = "";
      }
      return {
        purchaseId: r[1] ?? "",
        productName: name || r[3] || "(未命名品項)",
        category: categoryById.get(r[3] ?? "") ?? "",
        quantity: r[5] ?? "",
        unit,
      };
    });

  return buildMaterialReport({
    orders,
    purchases,
    items,
    totalPurchaseCount: (poRows ?? []).filter((r) => r[0]).length,
  });
}
