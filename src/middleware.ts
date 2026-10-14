import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { canTechnicianAccess, isPublicPath } from "@/lib/permissions";
import { verifySessionEdge } from "@/lib/auth-edge";

// middleware 在 Edge runtime 跑，不能 import server-only 模組，所以簽章驗證
// 用 WebCrypto 另外實作一份（lib/auth-edge.ts），格式與 lib/auth.ts 完全一致。
//
// 🔴 2026-10-15 修補：先前這裡只把憑證 base64 解碼、看角色與到期日就放行，
//    完全不驗簽章——任何人手寫 {"role":"admin","exp":<未來>} 轉 base64 當
//    cookie 送出就是管理員。而 /api/sheets 底下 118 個端點只有 12 個自己驗簽，
//    其餘 106 個全靠這道門。驗簽與否的差別在 __tests__/auth-edge.test.ts 有測。

const SESSION_COOKIE_NAME = "cq_session";

// 白名單與公開路徑判斷都來自 lib/permissions.ts（單一事實來源，與 auth.ts 共用）

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

// 排程系統（server-to-server，無瀏覽器 cookie）呼叫的採購貼上端點。
// middleware 只確認帶有 x-api-key header 才放行；真正的金鑰比對（timing-safe）
// 由該 route 在 node runtime 執行。範圍刻意收得極窄：僅此路徑、僅在帶 header 時。
// 帶 x-api-key 的 server-to-server 端點（各 route 自行做 timing-safe 金鑰比對）
const API_KEY_PATHS = new Set([
  "/api/sheets/purchases/from-paste",   // 排程系統：用布量貼上
  "/api/sheets/quotes-v2/from-agent",   // 對話 agent：建報價草稿
  "/api/sheets/products/lookup",        // 排程系統：建單前查目錄／供應商
  "/api/sheets/products/from-agent",    // 排程系統：補建缺少的採購商品（copyFrom 指定範本）
  "/api/sheets/schedule-drift",         // 排程系統：推送 Numbers vs Trello 對帳結果
]);

// 採購單 PDF 取回：路徑帶單號（/api/sheets/purchases/PS-20260922-05/pdf），
// 不是固定字串所以另外用 regex。route 內有 timing-safe 金鑰比對（authorizeSchedulerRequest）。
// 用途：出完採購單後把 PDF 存進 Synology 正式存檔——2026-09-22 發現本地 JPG 會遺失，
// 單子只存在繃布系統裡，想重新拿檔案卻沒有伺服器路徑。
// 採購單狀態更新：出完單、傳給廠商之後要標「已發送」。
// 2026-10-11 老闆：「請幫我更改狀態為已發送」——原本只接受登入 session，
// 排程系統拿 x-api-key 打會 401，等於每張單都要人工進後台點一次
// （違反「要全自動不要手動步驟」）。route 內有 timing-safe 金鑰比對。
const API_KEY_PATH_PATTERNS: RegExp[] = [
  /^\/api\/sheets\/purchases\/[^/]+\/pdf$/,
  /^\/api\/sheets\/purchases\/[^/]+\/status$/,
];

/**
 * Vercel Cron 的呼叫。
 *
 * 🔴 2026-10-13 查出來的事故：vercel.json 從設定日起就有每日備份排程，
 *    但 Cron 請求不帶 session cookie 也不帶 x-api-key，middleware 直接回 401，
 *    /api/admin/backup 裡的 allowInternalCron() 永遠執行不到。
 *    實查服務帳號 Drive：備份資料夾與備份檔都是 0 個——備份一次都沒成功過。
 *    （CRON_SECRET 當時也沒設，等於雙重失效。）
 *
 * 這裡只負責「放行到 route」，真正的金鑰比對仍由各 route 自己做。
 * 新增 Cron 路徑一定要同時加進這個集合，否則一樣會被擋在門外而且毫無聲音。
 */
const CRON_PATHS = new Set<string>([
  "/api/admin/backup",
  "/api/cron/pending-reminders",
]);

function isVercelCronRequest(request: NextRequest, pathname: string): boolean {
  if (!CRON_PATHS.has(pathname)) return false;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function isSchedulerApiRequest(request: NextRequest, pathname: string): boolean {
  const allowed = API_KEY_PATHS.has(pathname)
    || API_KEY_PATH_PATTERNS.some((re) => re.test(pathname));
  if (!allowed) return false;
  const apiKey = request.headers.get("x-api-key");
  return Boolean(apiKey && apiKey.trim().length > 0);
}

// 客戶簽署短網域（例：s.potatosofa.com）。設定後該網域的根路徑直接接短碼：
//   s.potatosofa.com/Ab7kQ2  →  內部 /sign/Ab7kQ2
// 未設定或主機不符時不啟用（一般 /s/{code} 與 /sign/{code} 仍照常）。
const SIGN_SHORT_HOST = (process.env.NEXT_PUBLIC_SIGN_SHORT_HOST ?? "").trim().toLowerCase();
const SHORT_CODE_RE = /^\/([A-Za-z0-9]{6,32})\/?$/;

function shortHostRewrite(request: NextRequest): NextResponse | null {
  if (!SIGN_SHORT_HOST) return null;
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (host !== SIGN_SHORT_HOST) return null;
  const { pathname } = request.nextUrl;
  const m = pathname.match(SHORT_CODE_RE);
  if (!m) return null;
  const url = request.nextUrl.clone();
  url.pathname = `/sign/${m[1]}`;
  const headers = new Headers(request.headers);
  headers.set("x-pathname", url.pathname);
  return NextResponse.rewrite(url, { request: { headers } });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 簽署短網域根路徑短碼 → /sign/{code}
  const shortRewrite = shortHostRewrite(request);
  if (shortRewrite) return shortRewrite;

  // 所有 response 都注入 x-pathname,給 root layout 用
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // 公開路徑直接通過
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // 排程系統 API：帶 x-api-key 時放行到 route（route 再做真正的金鑰驗證）
  if (isSchedulerApiRequest(request, pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Vercel Cron：帶正確 CRON_SECRET 的 Bearer 時放行到 route
  if (isVercelCronRequest(request, pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // 檢查 session
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  // 真正驗 HMAC 簽章。AUTH_SECRET 沒設定時 verifySessionEdge 一律回 null，
  // 全部擋在門外——寧可大家都進不來，也不要無聲放行偽造憑證。
  const session = await verifySessionEdge(token, process.env.AUTH_SECRET);

  if (!session) {
    // API 路徑回 JSON 401,方便前端 fetch 處理
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { ok: false, error: "not_authenticated" },
        { status: 401 },
      );
    }
    // 頁面未登入 → 導 login,帶 returnTo
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // 非 admin 一律套白名單（預設拒絕）。
  // 過去只擋 role === "technician"，導致 sales 等其他角色直接拿到 admin 全權限。
  if (session.role !== "admin" && !canTechnicianAccess(pathname)) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/after-sales", request.url));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon, logo, manifest etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|logo.png|manifest.json|sw.js|workbox-|worker-).*)",
  ],
};
