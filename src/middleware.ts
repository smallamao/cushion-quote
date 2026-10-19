import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  canTechnicianAccess,
  isApiKeyPath,
  isPublicPath,
  isRateLimitedPublicPath,
} from "@/lib/permissions";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";
import { verifySessionEdge } from "@/lib/auth-edge";
import { timingSafeEqual } from "@/lib/constant-time";

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
// x-api-key 白名單已搬到 lib/permissions.ts（isApiKeyPath），那裡有表格測試在守。


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
  return timingSafeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

function isSchedulerApiRequest(request: NextRequest, pathname: string): boolean {
  if (!isApiKeyPath(pathname)) return false;
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


// ── 公開端點速率限制 ─────────────────────────────────────────────────────────
//
// 放在 middleware 而不是各 route：它本來就跑在每一個請求上，一處就蓋到全部 10 支
// 公開 API ＋ 客人會開的頁面（/sign、/s、/confirm、/od、/d、/cleaning、/w）。
// 頁面不是 API route，自己沒辦法掛限流。
//
// 額度刻意寬鬆：這些是真的客人在用的頁面——載入頁面、看圖、送出簽名，加上重試，
// 一次簽署可能十幾個請求；整間公司也可能共用同一個對外 IP。擋到真客人的代價
// （單子簽不了、老闆要打電話道歉）遠高於讓攻擊者多猜幾次。
// 120 次 / 5 分鐘仍然把暴力猜測壓到每天 3.5 萬次以內，而 10 碼短碼有 2×10^17 組。
//
// ⚠️ rate-limit.ts 是記憶體版，Vercel 多實例各自計數，Edge isolate 也會被回收。
//    這擋得住單機暴衝，擋不住分散式攻擊——要做對得接 Upstash Redis 之類的外部
//    計數器，那是另一個決策。
const PUBLIC_RATE_LIMIT = 120;
const PUBLIC_RATE_WINDOW_MS = 5 * 60 * 1000;

function tooManyRequests(pathname: string): NextResponse {
  const retryAfter = Math.ceil(PUBLIC_RATE_WINDOW_MS / 1000);
  const headers = { "Retry-After": String(retryAfter) };
  // API 回 JSON，頁面回純文字——客人看到的是頁面，不要丟一包 JSON 給他
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "too_many_requests" },
      { status: 429, headers },
    );
  }
  return new NextResponse("請求太頻繁，請稍後再試。", {
    status: 429,
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 簽署短網域根路徑短碼 → /sign/{code}
  //
  // 限流要在這裡做，不能只靠下面公開路徑那一段：NextResponse.rewrite 不會讓
  // middleware 再跑一次，所以 s.potatosofa.com/{短碼} 這條路會整個跳過後面的檢查。
  // 而那正是暴力猜測短碼的入口。
  const shortRewrite = shortHostRewrite(request);
  if (shortRewrite) {
    const ip = extractClientIp(request);
    if (!checkRateLimit(`public:${ip}`, PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS)) {
      return tooManyRequests(pathname);
    }
    return shortRewrite;
  }

  // 所有 response 都注入 x-pathname,給 root layout 用
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // 公開路徑直接通過。但 token 就是唯一憑證的那些要先過速率限制，
  // 否則等於開放無限次猜測。
  if (isPublicPath(pathname)) {
    if (isRateLimitedPublicPath(pathname)) {
      const ip = extractClientIp(request);
      if (!checkRateLimit(`public:${ip}`, PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS)) {
        return tooManyRequests(pathname);
      }
    }
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
