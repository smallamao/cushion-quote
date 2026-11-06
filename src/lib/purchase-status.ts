/**
 * 採購單狀態。
 *
 * 🔴 sent（已送出給廠商）以前被漏掉：agent 的 update_purchase_status 合法清單裡沒有它，
 * query_purchase_orders 的標籤表也沒有，於是 1,315 張裡 129 張 sent 的單會被印成英文，
 * 而且助手想把草稿改成「已送出」會被自己擋下來。狀態清單集中在這裡，不要再各寫一份。
 */
export const PURCHASE_STATUSES = ["draft", "sent", "confirmed", "received", "cancelled"] as const;

export type PurchaseStatusValue = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatusValue, string> = {
  draft: "草稿",
  sent: "已送出給廠商",
  confirmed: "已確認",
  received: "已到貨",
  cancelled: "已取消",
};

export function isPurchaseStatus(v: unknown): v is PurchaseStatusValue {
  return typeof v === "string" && (PURCHASE_STATUSES as readonly string[]).includes(v);
}

export function purchaseStatusLabel(v: string): string {
  return isPurchaseStatus(v) ? PURCHASE_STATUS_LABELS[v] : v;
}
