/**
 * Edge runtime 可用的 session 簽章驗證。
 *
 * 為什麼需要這一支：middleware 跑在 Edge，不能 import `node:crypto`，所以原本
 * 的守門程式只把憑證 base64 解碼、看一下角色與到期日就放行——**完全不驗簽章**。
 * 任何人自己手寫 `{"role":"admin","exp":<未來>}` 轉 base64 當 cookie 送出，
 * 就是管理員。而 /api/sheets 底下 118 個端點只有 12 個自己驗簽，其餘 106 個
 * 全靠這道門（2026-10-15 清查，老闆指示資安優先處理）。
 *
 * 簽章格式必須與 lib/auth.ts 的 signSession 完全一致：
 *   token = base64url(JSON) + "." + base64url(HMAC-SHA256(body, AUTH_SECRET))
 * 這裡用 WebCrypto 重現同一套，並以常數時間比對避免 timing 側錄。
 */

export interface EdgeSession {
  userId?: string;
  email?: string;
  displayName?: string;
  role: string;
  iat?: number;
  exp: number;
}

function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 常數時間比對：長度不同直接判否，長度相同則逐位元 XOR 累加，不提早跳出。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 驗證並解析 session；任何一關不過都回 null。
 * 沒設定 AUTH_SECRET 時一律回 null——寧可全部擋下，也不要無聲放行。
 */
export async function verifySessionEdge(
  token: string | undefined | null,
  secret: string | undefined,
): Promise<EdgeSession | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    if (!timingSafeEqual(sig, bytesToBase64Url(new Uint8Array(mac)))) return null;

    const session = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as EdgeSession;
    if (!session.role || typeof session.exp !== "number") return null;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}
