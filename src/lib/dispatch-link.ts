import crypto from "node:crypto";

/**
 * 派工連結簽章（給外部師傅看電話/地址用）。
 *
 * 設計：無狀態 HMAC 簽章，不另存 token 欄位——連結 = /dispatch/{serviceId}/{sig}，
 * sig = base64url(HMAC-SHA256(AUTH_SECRET, "dispatch:"+serviceId)) 取前 32 字。
 * 好處：不動售後服務表 schema、任何時候都能由 serviceId 重算驗證；
 * 代價：無法單獨撤銷某一條連結（換 AUTH_SECRET 會讓全部失效）。對內部派工足夠。
 *
 * ⚠️ 純 server 端（node:crypto）。不可在 Edge middleware 匯入；middleware 只比對路徑前綴。
 */

const SIG_LEN = 32; // base64url 字元數，約 192 bits，足以防猜

// 專用簽章密鑰：優先用 DISPATCH_LINK_SECRET，未設定才退回 AUTH_SECRET。
// 這樣要作廢所有派工連結時，可單獨換 DISPATCH_LINK_SECRET，不會連帶登出所有內勤
// （AUTH_SECRET 同時簽 session／OAuth state）。未設專用密鑰時行為與過去一致。
function secret(): string | null {
  const dedicated = process.env.DISPATCH_LINK_SECRET?.trim();
  if (dedicated) return dedicated;
  const s = process.env.AUTH_SECRET?.trim();
  return s ? s : null;
}

function computeSig(serviceId: string, key: string): string {
  return crypto
    .createHmac("sha256", key)
    .update(`dispatch:${serviceId}`)
    .digest("base64url")
    .slice(0, SIG_LEN);
}

/** 由 serviceId 產生簽章；AUTH_SECRET 未設定回 null（呼叫端據此停用功能）。 */
export function signDispatchToken(serviceId: string): string | null {
  const key = secret();
  if (!key || !serviceId) return null;
  return computeSig(serviceId, key);
}

/** timing-safe 驗證 serviceId + sig 是否相符。 */
export function verifyDispatchToken(serviceId: string, sig: string): boolean {
  const key = secret();
  if (!key || !serviceId || !sig) return false;
  const expected = computeSig(serviceId, key);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** 組出派工連結的站內路徑；未設定密鑰回 null。 */
export function buildDispatchPath(serviceId: string): string | null {
  const sig = signDispatchToken(serviceId);
  if (!sig) return null;
  return `/dispatch/${encodeURIComponent(serviceId)}/${sig}`;
}
