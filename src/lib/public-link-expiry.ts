/**
 * 客人／司機公開連結的有效期。
 *
 * 🔴 2026-10-16：叫料確認、配送時段、清潔時段這三種連結原本**完全沒有過期機制**，
 *    一旦發出就永久有效。實查線上資料：叫料確認 32 條、清潔時段 5 條，最舊的
 *    2026-09-26，其中 24 條客人早就確認完了，連結照樣打得開。
 *
 *    token 本身是 72 bits 猜不到，風險不是被暴力破解，而是**連結外流後永遠有效**：
 *    客人把 LINE 訊息轉給家人、換手機沒清紀錄、或在我們加上 no-referrer 之前
 *    被第三方從 Referer header 撿走。而且這個數量只會一直累積。
 *
 * 期限沿用 order-confirm 既有的 90 天（ORDER_CONFIRM_TTL_DAYS），不另外發明數字。
 * 線上下訂本來就是這樣做的，而且會回 410。要收緊就改這一個常數。
 */
export const PUBLIC_LINK_TTL_DAYS = 90;

/**
 * 這條連結過期了嗎。
 *
 * 建立時間缺失或無法解析時一律當成「已過期」——預設拒絕。
 * 反過來做的話，最舊、最該失效的那批舊資料反而會永遠開著。
 */
export function isPublicLinkExpired(
  createdAt: string | undefined | null,
  nowMs: number = Date.now(),
): boolean {
  if (!createdAt) return true;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t > PUBLIC_LINK_TTL_DAYS * 86_400_000;
}
