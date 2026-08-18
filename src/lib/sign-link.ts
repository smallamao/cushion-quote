/**
 * 客戶簽署連結（對外網址）。
 * 有設定短網域（NEXT_PUBLIC_SIGN_SHORT_HOST，例 s.potatosofa.com）→ 根路徑接短碼：
 *   https://s.potatosofa.com/Ab7kQ2
 * 未設定 → 回退目前站台：https://{origin}/s/Ab7kQ2
 *
 * LINE 內建瀏覽器改由簽署頁自行偵測並補 ?openExternalBrowser=1 跳轉，
 * 連結本身不再帶參數，越短越好貼。
 */
export function buildSignLink(token: string): string {
  const shortHost = (process.env.NEXT_PUBLIC_SIGN_SHORT_HOST ?? "").trim();
  if (shortHost) return `https://${shortHost}/${token}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/s/${token}`;
}
