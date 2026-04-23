import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 注意:middleware 在 Edge runtime 跑,所以不能 import server-only 模組
// 這邊需要自己做簡化版的 session 驗證 (不動用 crypto from "node:crypto")

const SESSION_COOKIE_NAME = "cq_session";

interface MiniSession {
  role: "admin" | "technician";
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

const TECHNICIAN_ALLOWED_PREFIXES = [
  "/after-sales",
  "/api/auth",
  "/api/sheets/after-sales",
  "/api/sheets/equipment",
  "/api/sheets/cases",
  "/api/sheets/versions",
  "/api/upload",
  "/login",
  "/calendar",
];

const TECHNICIAN_BLOCKED_API = [
  "/api/sheets/ar",
  "/api/sheets/commissions",
  "/api/sheets/receivables",
];

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/sheets/init" ||
    pathname.startsWith("/api/sheets/einvoices") ||
    pathname.startsWith("/api/sheets/migrate") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png" ||
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

function isTechnicianAllowed(pathname: string): boolean {
  return TECHNICIAN_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

function isTechnicianBlockedApi(pathname: string): boolean {
  return TECHNICIAN_BLOCKED_API.some((p) => pathname.startsWith(p));
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

  // 技師權限控制
  if (session.role === "technician") {
    // 封鎖特定財務 API
    if (isTechnicianBlockedApi(pathname)) {
      if (isApiPath(pathname)) {
        return NextResponse.json(
          { ok: false, error: "forbidden" },
          { status: 403 },
        );
      }
    }
    // 封鎖未允許的頁面
    if (!isTechnicianAllowed(pathname)) {
      if (isApiPath(pathname)) {
        return NextResponse.json(
          { ok: false, error: "forbidden" },
          { status: 403 },
        );
      }
      const url = new URL("/after-sales", request.url);
      return NextResponse.redirect(url);
    }
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
    "/((?!_next/static|_next/image|favicon.ico|logo.png|manifest.json).*)",
  ],
};
