// 權限白名單「單一事實來源」。
//
// 這個檔案刻意不 import 任何 server-only / node 模組，
// 才能同時被 Edge runtime 的 middleware.ts 與 server 端的 auth.ts 共用。
// （過去 middleware 與 auth.ts 各自維護一份，兩份逐漸走鐘：
//   middleware 多放行了案件／報價版本／庫存／商品／供應商／行事曆。）

/**
 * 非 admin 角色（師傅等）可訪問的路徑 prefix — 白名單，其餘一律拒絕。
 *
 * 目前開放：售後服務（含我的行程）＋ 設備型錄 API（售後單選型號用）。
 * 靜態資源與公開路徑另由 middleware 的 isPublicPath 處理。
 */
export const TECHNICIAN_ALLOWED_PREFIXES = [
  "/after-sales",
  "/my-schedule", // 師傅自己的派工行程（資料來源就是售後服務）
  "/login",
  "/api/auth",
  "/api/sheets/after-sales",
  "/api/sheets/equipment", // 售後單選設備型號
  "/api/sheets/orders/my-installs", // 師傅的「我的安裝」（安全投影，無金額）
  "/api/upload", // 現場照片／簽名上傳
] as const;

/** 僅 admin 可訪問（即使誤加進白名單也擋下） */
const ADMIN_ONLY_PREFIXES = [
  "/admin",
  "/settings",
  "/api/sheets/users",
  "/api/sheets/_debug",
  "/api/sheets/debug-",
] as const;

export function isAdminOnly(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
}

/** 非 admin 角色能不能訪問此路徑 */
export function canTechnicianAccess(pathname: string): boolean {
  if (isAdminOnly(pathname)) return false;
  return TECHNICIAN_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

// ─────────────────────────────────────────────────────────────────────────────
// 公開路徑（免登入）
//
// 這段從 middleware.ts 搬過來，目的是讓它能被測試覆蓋。middleware.ts import
// next/server，在測試環境裡不好直接載入；放在這個不依賴任何 runtime 的檔案裡，
// 路由決策就能用表格測試一條一條驗（見 __tests__/permissions.test.ts）。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * public/ 根層的靜態資產：/icon-192.png、/pdf.min.mjs 之類。
 *
 * 🔴 2026-10-15 修補：這裡原本是「任何結尾是 .png/.jpg/.svg/.ico/.mjs 的路徑
 *    都免登入」，而這個判斷在 session 檢查**之前**跑。結果是網址結尾加 .png
 *    就能繞過登入——例如
 *      /api/trello/cards/<卡號>/attachments/<附件號>/download/x.png
 *    會被當成靜態圖直接放行，而那支 catch-all 代理會自己補上公司的 Trello
 *    金鑰再把回應吐回來。等於不用帳號密碼就能拿訂單附件。
 *
 *    現在限定「根層單一路徑片段」：/icon-192.png 通，/api/…/x.png 不通。
 *    public/ 根層的資產（圖示、pdf.min.mjs）照樣免登入，巢狀的
 *    /screenshots/*.png 改為需要登入——它只出現在登入後的說明頁，沒有影響。
 *
 * ⚠️ 如果以後在 src/app/ 根層加了動態路由（例如 src/app/[slug]/page.tsx），
 *    它會吃掉 /任意.png，這條規則就不再安全。加之前先把這裡改成明列檔名。
 */
const ROOT_STATIC_ASSET = /^\/[^/]+\.(png|jpg|svg|ico|mjs)$/;

/** 免登入路徑。middleware 在驗 session 之前呼叫它，所以這裡放行就是完全不設防。 */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/linebot") ||
    // 客戶線上簽署頁與其公開 API（token 為唯一憑證，免登入）
    pathname === "/sign" ||
    pathname.startsWith("/sign/") ||
    pathname === "/cleaning" ||
    pathname.startsWith("/cleaning/") ||
    // 外部師傅派工單頁（簽章綁單號，免登入；驗簽在頁面 node runtime 做）
    // /w 為現行短路徑，/dispatch 為改版前舊路徑（只做轉址）
    pathname.startsWith("/w/") ||
    pathname === "/dispatch" ||
    pathname.startsWith("/dispatch/") ||
    // 叫料確認單：客人核對訂貨單照片＋簽名＋提供希望收件時段（token 為唯一憑證，免登入）
    pathname.startsWith("/confirm/") ||
    // 線上下訂確認（客人簽名頁，token 為唯一憑證）
    pathname.startsWith("/od/") ||
    // 司機配送時段確認（token 為唯一憑證，免登入）
    pathname.startsWith("/d/") ||
    pathname.startsWith("/s/") ||
    pathname.startsWith("/api/public/") ||
    // init & migrate 改由 x-init-secret header 保護，不列為公開路徑
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png" ||
    pathname === "/sw.js" ||
    pathname === "/sw.js.map" ||
    pathname.startsWith("/workbox-") ||
    // 🔴 自訂 service worker（worker/index.ts 編出來的 worker-<hash>.js）。
    //    sw.js 會 importScripts 它，被導向登入頁的話整個 SW 安裝就失敗，
    //    連帶 PWA 離線快取與推播一起壞掉。新增 public/ 下的 SW 資產都要補這裡。
    pathname.startsWith("/worker-") ||
    ROOT_STATIC_ASSET.test(pathname)
  );
}

/** returnTo 解析失敗或指向站外時的預設落點 */
export const RETURN_TO_FALLBACK = "/shipping-notice";

/**
 * 登入完成後要導回哪裡。只接受本站路徑。
 *
 * 🔴 2026-10-15 修補：原本用 `/^\/[^/]/` 擋，能擋 `//evil.com`，但擋不住
 *    `/\evil.com`——瀏覽器會把反斜線當斜線，所以那個值會真的導到 evil.com。
 *    tab 字元與 `/\/evil.com` 也都能穿過。攻擊手法是把
 *    `https://<本站>/api/auth/login?returnTo=/\evil.com` 發給員工：網址開頭是
 *    公司自己的網域、中間是真的 Google 登入，最後一頁才是釣魚的假逾時畫面。
 *    騙到的是 Google 帳號密碼，而那是這套系統唯一的鑰匙。
 *
 *    現在不用 regex 猜，直接交給 URL 解析器判斷它會跑到哪個 origin。
 */
export function sanitizeReturnTo(raw: string | null): string {
  if (!raw) return RETURN_TO_FALLBACK;
  let parsed: URL;
  try {
    parsed = new URL(raw, "https://placeholder.invalid");
  } catch {
    return RETURN_TO_FALLBACK;
  }
  // 任何會跑到別的 origin 的值（含反斜線、tab、編碼變形）都擋掉
  if (parsed.origin !== "https://placeholder.invalid") return RETURN_TO_FALLBACK;
  return parsed.pathname + parsed.search;
}

/**
 * 免登入、且網址裡的 token 就是唯一憑證的路徑。這些要掛速率限制。
 *
 * 🔴 2026-10-15 弱點分析：公開端點完全沒有猜測次數限制。客戶簽署短碼原本只有
 *    6 碼（約 34 bits），要猜中「隨便一張還沒簽的單」難度跟當下有幾張有效連結
 *    成反比——沒有速率限制的話，用機器跑幾週是做得到的。短碼已加長到 10 碼，
 *    這裡再加一道次數限制。
 *
 * 不含 /api/auth（登入流程本身），也不含 /_next 與靜態資產。
 */
const RATE_LIMITED_PUBLIC_PREFIXES = [
  "/api/public/",
  "/sign/",
  "/s/",
  "/confirm/",
  "/od/",
  "/d/",
  "/cleaning/",
  "/w/",
] as const;

export function isRateLimitedPublicPath(pathname: string): boolean {
  return RATE_LIMITED_PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
