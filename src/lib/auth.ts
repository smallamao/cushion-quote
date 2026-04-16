import "server-only";

import crypto from "crypto";

import type { Session, UserRole } from "@/lib/types";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ??
  "http://localhost:3001/api/auth/callback/google";
const BOOTSTRAP_ADMIN_EMAIL = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "")
  .trim()
  .toLowerCase();

export const SESSION_COOKIE_NAME = "cq_session";
export const SESSION_DURATION_DAYS = 30;

/** 把資料簽名成 base64 session token */
export function signSession(payload: Omit<Session, "iat" | "exp">): string {
  if (!AUTH_SECRET) {
    throw new Error("AUTH_SECRET not configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const session: Session = {
    ...payload,
    iat: now,
    exp: now + SESSION_DURATION_DAYS * 86400,
  };
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

/** 驗證並解析 session token;失敗回 null */
export function verifySession(token: string | undefined | null): Session | null {
  if (!token || !AUTH_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(body)
    .digest("base64url");
  if (
    sig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
  ) {
    return null;
  }
  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as Session;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

/** 產生 Google OAuth 授權 URL */
export function buildGoogleAuthUrl(state: string): string {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID not configured");
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

interface GoogleIdTokenPayload {
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
  sub?: string;
}

/** 用 code 換 tokens,並驗證 id_token */
export async function exchangeGoogleCode(
  code: string,
): Promise<{ email: string; name: string } | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth credentials not configured");
  }

  const params = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as GoogleTokenResponse;
  if (!data.id_token) return null;

  // decode id_token (JWT) - we trust it because it came from an HTTPS exchange
  // with Google using our client secret. For extra safety we'd verify the
  // signature via tokeninfo, but for a small internal app the exchange-level
  // trust is sufficient.
  const [, payloadB64] = data.id_token.split(".");
  if (!payloadB64) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8"),
    ) as GoogleIdTokenPayload;
    if (!payload.email) return null;
    if (payload.email_verified === false) return null;
    return { email: payload.email.toLowerCase(), name: payload.name ?? "" };
  } catch {
    return null;
  }
}

/** 產生 state 字串 + 驗證 (防止 CSRF) */
export function generateState(): string {
  return crypto.randomBytes(16).toString("base64url");
}

export function getBootstrapAdminEmail(): string {
  return BOOTSTRAP_ADMIN_EMAIL;
}

/**
 * 路由 whitelist — technician 可以訪問的路徑 prefix
 * (其餘 admin 才能看)
 */
export const TECHNICIAN_ALLOWED_PREFIXES = [
  "/after-sales",
  "/api/auth",
  "/api/sheets/after-sales",
  "/api/sheets/equipment",
  "/api/upload",
  "/login",
  "/_next",
  "/logo.png",
  "/favicon.ico",
];

/**
 * 判斷某個路徑 technician 可不可以訪問
 */
export function canTechnicianAccess(pathname: string): boolean {
  return TECHNICIAN_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * 判斷某個路徑是不是 admin 才能看
 */
export function isAdminOnly(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/sheets/users") ||
    pathname.startsWith("/api/sheets/_debug") ||
    pathname.startsWith("/api/sheets/debug-")
  );
}

/**
 * 依 role 過濾 sidebar 項目 (前端用)
 */
export function canRoleAccess(pathname: string, role: UserRole): boolean {
  if (role === "admin") return true;
  return canTechnicianAccess(pathname) && !isAdminOnly(pathname);
}
