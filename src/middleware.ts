import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { canTechnicianAccess } from "@/lib/permissions";

// 注意:middleware 在 Edge runtime 跑,所以不能 import server-only 模組
// 這邊需要自己做簡化版的 session 驗證 (不動用 crypto from "node:crypto")

const SESSION_COOKIE_NAME = "cq_session";

interface MiniSession {
  // 任何非 admin 角色（technician / sales / 未來新增）一律套用白名單，預設拒絕
  role: string;
  exp: number;
}

/**
 * Edge-compatible session parser:只 decode + 檢查 exp,不驗 HMAC 簽章。
 * 真正的簽章驗證留給 API routes (在 node runtime)。
 * middleware 只做粗略守門,讓未登入的人看不到頁面。
 */
function quickParseSession(token: string | undefined): MiniSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const bodyStr = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
    const session = JSON.parse(bodyStr) as MiniSession;
    if (!session.role || !session.exp) return null;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

// 白名單來自 lib/permissions.ts（單一事實來源，與 auth.ts 共用）

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/linebot") ||
    // init & migrate 改由 x-init-secret header 保護，不列為公開路徑
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png" ||
    pathname === "/sw.js" ||
    pathname === "/sw.js.map" ||
    pathname.startsWith("/workbox-") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".mjs")
  );
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

// 排程系統（server-to-server，無瀏覽器 cookie）呼叫的採購貼上端點。
// middleware 只確認帶有 x-api-key header 才放行；真正的金鑰比對（timing-safe）
// 由該 route 在 node runtime 執行。範圍刻意收得極窄：僅此路徑、僅在帶 header 時。
const SCHEDULER_PASTE_PATH = "/api/sheets/purchases/from-paste";

function isSchedulerApiRequest(request: NextRequest, pathname: string): boolean {
  if (pathname !== SCHEDULER_PASTE_PATH) return false;
  const apiKey = request.headers.get("x-api-key");
  return Boolean(apiKey && apiKey.trim().length > 0);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  // 檢查 session
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = quickParseSession(token);

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
    "/((?!_next/static|_next/image|favicon.ico|logo.png|manifest.json|sw.js|workbox-).*)",
  ],
};
