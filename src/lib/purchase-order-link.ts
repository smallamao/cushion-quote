import type { PurchaseOrder, PurchaseOrderItem } from "@/lib/types";

// 採購單 ↔ 訂製訂單 關聯（一張採購單可綁多張訂單，涵蓋批量叫貨）。
// 儲存策略：沿用「關聯訂單ID」單一欄位（Sheets col row[16]），以逗號分隔多個 orderId。
// 單值舊資料（"ORD-xxx"）即 1 元素清單，完全相容；空字串＝未綁定。

/** 解析逗號分隔的關聯訂單字串 → 去空白、去空值、去重的 orderId 陣列 */
export function parseRelatedOrderIds(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** 序列化回逗號分隔字串（存回 Sheets） */
export function joinRelatedOrderIds(ids: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.join(",");
}

/** 判斷某採購單的關聯訂單字串是否包含指定 orderId */
export function relatedOrderIncludes(raw: string | undefined | null, orderId: string): boolean {
  return parseRelatedOrderIds(raw).includes(orderId);
}

// ---------------------------------------------------------------------------
// 品項層級成本歸屬
// 一張採購單可同時採多張訂單的料（同廠商批量叫貨），每筆品項的「備註」帶著
// 歸屬（例如「S909追加」「P6157」）。訂單成本應「只算屬於自己的品項」，而非
// 整張採購單金額，否則別張訂單的料會灌進本單成本、虛增毛利。
// ---------------------------------------------------------------------------

/** 訂單識別碼：用來比對採購單品項備註歸屬 */
export interface OrderRef {
  orderNumber?: string;
  caseId?: string;
}

/** 從備註萃取英數代碼 token（"S909追加" → ["s909"]；"P6157" → ["p6157"]） */
function codeTokens(note: string): string[] {
  return note.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * 判斷一張採購單品項是否歸屬於某訂製訂單（依「品項備註歸屬」）。
 *   - 備註為空 / 無任何英數代碼（純中文）→ 視為歸屬此關聯訂單（預設）
 *   - 備註代碼含此訂單的 orderNumber（token 精確比對，避免 S909 誤中 S9091），
 *     或正規化後含 caseId → 歸屬
 *   - 備註有代碼但都不是此訂單 → 不歸屬（是別張訂單的料）
 */
export function purchaseItemBelongsToOrder(itemNotes: string | undefined, ref: OrderRef): boolean {
  const note = (itemNotes ?? "").trim();
  if (!note) return true;
  const tokens = codeTokens(note);
  if (tokens.length === 0) return true; // 純中文備註、無代碼
  const on = (ref.orderNumber ?? "").trim().toLowerCase();
  if (on && tokens.includes(on)) return true;
  const ci = (ref.caseId ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ci && note.toLowerCase().replace(/[^a-z0-9]/g, "").includes(ci)) return true;
  return false;
}

/**
 * 計算某採購單「歸屬於指定訂單」的成本金額。
 *   - 訂單無任何識別碼 → 退回整張 totalAmount（無從歸屬，保底避免低估）
 *   - 無品項資料 → 退回整張 totalAmount（保底）
 *   - 全部品項都歸此訂單 → 回 totalAmount（含運費、稅額）
 *   - 部分品項歸此訂單 → 只加總歸屬品項的金額（運費/稅難公平分攤，best-effort）
 *   - 無品項歸此訂單 → 0（此採購單雖關聯，但料全屬別張單）
 */
export function attributedPurchaseAmount(
  order: Pick<PurchaseOrder, "totalAmount">,
  items: PurchaseOrderItem[] | undefined,
  ref: OrderRef,
): number {
  const full = order.totalAmount || 0;
  const hasRef = Boolean((ref.orderNumber ?? "").trim() || (ref.caseId ?? "").trim());
  if (!hasRef) return full;
  if (!items || items.length === 0) return full;
  const belonging = items.filter((it) => purchaseItemBelongsToOrder(it.notes, ref));
  if (belonging.length === items.length) return full;
  return belonging.reduce((s, it) => s + (it.amount || 0), 0);
}
