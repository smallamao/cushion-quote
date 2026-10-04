/**
 * 派工連結的對外完整網址（給外部師傅貼 LINE 用，越短越好貼）。
 *
 * 有設定短網域（NEXT_PUBLIC_SIGN_SHORT_HOST，例 s.potatosofa.com）→
 *   https://s.potatosofa.com/w/AS-20260925-01/xxx~yyy
 * 未設定 → 回退目前站台 origin。
 *
 * 沿用簽署連結那支短網域環境變數：它指向同一個 Vercel 專案，
 * /w/… 在該網域一樣路由得到（middleware 的短碼改寫只吃單段路徑，不會攔到）。
 * 此檔為純字串運算、不含 server-only 相依，client component 可直接匯入。
 */
/** 任何對外頁的完整網址（有短網域就用短網域）。 */
export function buildPublicUrl(path: string): string {
  if (!path) return "";
  const shortHost = (process.env.NEXT_PUBLIC_SIGN_SHORT_HOST ?? "").trim();
  if (shortHost) return `https://${shortHost}${path}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${path}`;
}

/** 派工連結專用的別名（語意清楚，實作與其他對外連結共用）。 */
export function buildDispatchUrl(path: string): string {
  return buildPublicUrl(path);
}
