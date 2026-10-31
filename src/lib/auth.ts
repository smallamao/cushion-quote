import "server-only";

import crypto from "crypto";

import { MIN_SECRET_LEN } from "@/lib/auth-edge";
import { canRoleAccess as canRoleAccessByRole } from "@/lib/permissions";
import type { Session, UserRole } from "@/lib/types";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "";
if (AUTH_SECRET && AUTH_SECRET.length < MIN_SECRET_LEN) {
  console.warn(
    `[auth] AUTH_SECRET 長度不足 ${MIN_SECRET_LEN} 字元，視為未設定；所有登入操作將被拒絕。`,
  );
}
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
  if (AUTH_SECRET.length < MIN_SECRET_LEN) {
    throw new Error("AUTH_SECRET not configured or too short (minimum 32 characters)");
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
  if (!token || AUTH_SECRET.length < MIN_SECRET_LEN) return null;
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
): Promise<{ email: string; name: string; picture: string } | null> {
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
    return {
      email: payload.email.toLowerCase(),
      name: payload.name ?? "",
      picture: payload.picture ?? "",
    };
  } catch {
    return null;
  }
}

/** Drive 備份只要 drive.file：App 只看得到自己建立的檔案，看不到老闆 Drive 裡其他東西 */
export const DRIVE_BACKUP_SCOPE = "https://www.googleapis.com/auth/drive.file";

/**
 * 產生「連結 Google Drive 備份」的授權 URL。與登入共用 client 與 redirect URI，
 * 差別在 scope 與 access_type=offline（要拿 refresh token，排程才能在沒人在線時上傳）。
 * prompt 帶 consent：Google 只在同意畫面出現時才會發 refresh token，重新連結也要拿得到。
 */
export function buildGoogleDriveConnectUrl(state: string): string {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID not configured");
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: `${DRIVE_BACKUP_SCOPE} openid email`,
    state,
    prompt: "select_account consent",
    access_type: "offline",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type DriveCodeExchangeResult =
  | {
      ok: true;
      email: string;
      refreshToken: string;
      /** Google 只在 OAuth 同意畫面為「測試」狀態時回這個欄位（秒），正式版不會有 */
      refreshTokenExpiresIn: number | null;
    }
  | { ok: false; reason: "exchange_failed" | "no_refresh_token" | "scope_missing" | "no_email" };

/** 解 id_token 的 payload（沿用 exchangeGoogleCode 的信任模型：來自用 client secret 換的 HTTPS 回應） */
function decodeIdTokenPayload(idToken: string | undefined): GoogleIdTokenPayload | null {
  const [, payloadB64] = (idToken ?? "").split(".");
  if (!payloadB64) return null;
  try {
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8")) as GoogleIdTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Drive 連結流程用 code 換 token。只回 refresh token 與帳號，不建立任何登入身分。
 *
 * Google 的同意畫面允許使用者取消勾選個別權限（granular consent），
 * 所以要確認回來的 scope 真的含 drive.file，否則存了也上傳不了。
 */
export async function exchangeGoogleCodeForDrive(code: string): Promise<DriveCodeExchangeResult> {
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
  if (!res.ok) return { ok: false, reason: "exchange_failed" };

  const data = (await res.json()) as {
    id_token?: string;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    scope?: string;
  };
  if (!(data.scope ?? "").split(" ").includes(DRIVE_BACKUP_SCOPE)) {
    return { ok: false, reason: "scope_missing" };
  }
  if (!data.refresh_token) return { ok: false, reason: "no_refresh_token" };

  const payload = decodeIdTokenPayload(data.id_token);
  if (!payload?.email || payload.email_verified === false) return { ok: false, reason: "no_email" };

  const expiresIn = Number(data.refresh_token_expires_in);
  return {
    ok: true,
    email: payload.email.toLowerCase(),
    refreshToken: data.refresh_token,
    refreshTokenExpiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : null,
  };
}

/**
 * OAuth state 的用途。
 *
 * 登入與「連結 Google Drive 備份」共用同一個 OAuth client 與同一個 redirect URI
 * （Google Cloud Console 無法再註冊新的 redirect URI），callback 只能靠 state 分辨。
 * 用途必須包在簽章裡：否則有人拿一張登入用的 state 自己加上 purpose 欄位，
 * 就能把登入流程導進 Drive 連結分支（反之亦然）。
 */
export type OAuthStatePurpose = "login" | "drive-backup";

/**
 * state 簽章的原文。
 *
 * 登入維持 2026-10 以前的格式 `${ts}:${nonce}:${returnTo}`，已經發出去、還在
 * 10 分鐘有效期內的登入連結不受影響。其他用途加上 `purpose:<用途>:` 前綴——
 * 登入原文一定以數字（ts）開頭，前綴以字母開頭，兩種原文不可能撞成同一個字串，
 * 也就無法靠調整 returnTo 把登入 state 的簽章挪用成 Drive state 的簽章。
 *
 * Drive state 另外簽進「按下連結的那位 admin 的 email」：callback 會要求它等於
 * 當下瀏覽器裡的 session。別人拿到這張 state（例如被轉傳的授權網址）也不能用
 * 自己的 session 完成連結。
 */
function stateSigningInput(
  purpose: OAuthStatePurpose,
  ts: number,
  nonce: string,
  returnTo: string,
  boundEmail: string,
): string {
  const base = `${ts}:${nonce}:${returnTo}`;
  return purpose === "login" ? base : `purpose:${purpose}:${boundEmail}:${base}`;
}

/**
 * 產生帶 HMAC 簽章的 OAuth state payload（base64url 編碼）。
 * 簽章內嵌於 URL state 參數中，callback 端可直接驗證，
 * 不再依賴 cookie 傳遞 state，避免跨站 redirect 遺失 cookie 的問題。
 */
export function buildSignedState(
  returnTo: string,
  purpose: OAuthStatePurpose = "login",
  /** purpose 不是 login 時必填：發起者的 email */
  boundEmail = "",
): string {
  if (AUTH_SECRET.length < MIN_SECRET_LEN) throw new Error("AUTH_SECRET not configured or too short (minimum 32 characters)");
  const email = boundEmail.trim().toLowerCase();
  if (purpose !== "login" && !email) throw new Error("非登入用途的 state 必須綁定發起者 email");
  const nonce = crypto.randomBytes(16).toString("base64url");
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(stateSigningInput(purpose, ts, nonce, returnTo, email))
    .digest("base64url");
  // 登入 state 不帶 purpose／email 欄位，內容與改版前完全相同
  const payload = purpose === "login"
    ? { nonce, ts, sig, returnTo }
    : { nonce, ts, sig, returnTo, purpose, email };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

const STATE_MAX_AGE_SECONDS = 600; // 10 分鐘

/**
 * 驗證 signed state 並回傳 returnTo 與用途；失敗回 null。
 * 沒有 purpose 欄位＝登入（改版前發出的 state 也是這樣）。認不得的用途一律拒絕。
 * 非登入用途另外回傳簽章內綁定的發起者 email（小寫），登入時為空字串。
 */
export function verifySignedState(
  stateParam: string,
): { returnTo: string; purpose: OAuthStatePurpose; boundEmail: string } | null {
  if (AUTH_SECRET.length < MIN_SECRET_LEN) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(stateParam, "base64url").toString("utf-8"),
    ) as { nonce?: string; ts?: number; sig?: string; returnTo?: string; purpose?: unknown; email?: unknown };
    if (!decoded.nonce || !decoded.ts || !decoded.sig) return null;

    let purpose: OAuthStatePurpose;
    if (decoded.purpose === undefined) purpose = "login";
    else if (decoded.purpose === "drive-backup") purpose = "drive-backup";
    else return null;

    const boundEmail = purpose === "login" ? "" : typeof decoded.email === "string" ? decoded.email : "";
    if (purpose !== "login" && !boundEmail) return null;

    // 檢查時效
    const now = Math.floor(Date.now() / 1000);
    if (decoded.ts > now + 60) return null;
    if (now - decoded.ts > STATE_MAX_AGE_SECONDS) return null;

    // 驗證簽章（含 returnTo 與用途，防止竄改重導目標或改走別的分支）
    const expectedSig = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(stateSigningInput(purpose, decoded.ts, decoded.nonce, decoded.returnTo ?? "", boundEmail))
      .digest("base64url");
    if (
      decoded.sig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(
        Buffer.from(decoded.sig),
        Buffer.from(expectedSig),
      )
    ) {
      return null;
    }

    return { returnTo: decoded.returnTo || "/", purpose, boundEmail };
  } catch {
    return null;
  }
}

export function getBootstrapAdminEmail(): string {
  return BOOTSTRAP_ADMIN_EMAIL;
}

/**
 * 依 role 判斷路徑存取權（白名單定義於 lib/permissions.ts，與 middleware 共用）
 */
export function canRoleAccess(pathname: string, role: UserRole): boolean {
  return canRoleAccessByRole(role, pathname);
}
