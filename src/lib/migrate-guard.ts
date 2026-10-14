import { NextResponse } from "next/server";

/**
 * 一次性資料搬移端點的守門函式。每個 handler 的第一行就呼叫它。
 *
 * 🔴 2026-10-15 弱點分析：這 16 支 migrate 端點原本只靠瀏覽器的登入 cookie 保護，
 *    而其中 6 支用 **GET** 就會直接寫入線上 Google Sheet。cookie 是 SameSite=Lax，
 *    跨站點選連結時 cookie 會跟著送出，而全專案沒有任何 CSRF 防護——所以只要把
 *    `.../purchase-products/migrate-to-25col?dryRun=false` 這種網址發給老闆並讓他
 *    點下去，整張採購商品主檔就會被重寫。Google Sheets 沒有交易回滾。
 *
 *    搬移是一次性動作，本來就不該靠瀏覽器 session。現在改成伺服器對伺服器的金鑰。
 *
 * fail-closed：`INIT_SECRET` 沒設定時一律回 403，絕不放行。
 * 也就是說金鑰沒設的環境下這些端點等於停用——這是故意的，要用再設。
 *
 * 用法：
 *   const denied = migrateGuard(request);
 *   if (denied) return denied;
 *
 * 呼叫端要帶 `x-init-secret: <INIT_SECRET>` header。
 * 例外：`migrate-case-client-ids` 與 `migrate-v13` 有真正的後台 UI 在用，
 * 瀏覽器拿不到金鑰，那兩支改用 admin session ＋ 寫入只走 POST。
 */
export function migrateGuard(request: Request): NextResponse | null {
  const secret = process.env.INIT_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const provided = (request.headers.get("x-init-secret") ?? "").trim();
  if (!timingSafeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return null;
}

/** 常數時間字串比對。長度不同直接回 false（長度本身不是機密）。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
