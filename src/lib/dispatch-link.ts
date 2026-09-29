import crypto from "node:crypto";

/**
 * 派工連結簽章（給外部師傅看電話/地址用）。
 *
 * 連結 = /dispatch/{serviceId}/{token}，token = `{發出日}~{sig}`：
 *   發出日 = floor(now/一天) 的 base36（簽進 sig，不可竄改）
 *   sig    = base64url(HMAC-SHA256(密鑰, "dispatch:"+serviceId+":"+發出日)) 取前 32 字
 *
 * 兩層時效：
 *   1) 30 天失效 —— 驗證時 today-發出日 > 30 即拒（時間戳在 sig 內，改了就驗不過）。
 *   2) 已完成／已取消失效 —— 由頁面讀工單狀態把關（見 dispatch page），非本模組職責。
 *
 * ⚠️ 純 server 端（node:crypto）。不可在 Edge middleware 匯入；middleware 只比對路徑前綴。
 */

const SIG_LEN = 32; // base64url 字元數，約 192 bits，足以防猜
const TTL_DAYS = 30;
const DAY_MS = 86_400_000;
const SEP = "~"; // URL unreserved、且不在 base64url 字元集內，可安全當分隔符

export const DISPATCH_LINK_TTL_DAYS = TTL_DAYS;

// 專用簽章密鑰：優先用 DISPATCH_LINK_SECRET，未設定才退回 AUTH_SECRET。
// 這樣要作廢所有派工連結時，可單獨換 DISPATCH_LINK_SECRET，不會連帶登出所有內勤
// （AUTH_SECRET 同時簽 session／OAuth state）。未設專用密鑰時行為與過去一致。
function secret(): string | null {
  const dedicated = process.env.DISPATCH_LINK_SECRET?.trim();
  if (dedicated) return dedicated;
  const s = process.env.AUTH_SECRET?.trim();
  return s ? s : null;
}

function dayNumber(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS);
}

function computeSig(serviceId: string, day: number, key: string): string {
  return crypto
    .createHmac("sha256", key)
    .update(`dispatch:${serviceId}:${day}`)
    .digest("base64url")
    .slice(0, SIG_LEN);
}

/** 由 serviceId 產生帶時間戳的 token；AUTH_SECRET/DISPATCH_LINK_SECRET 未設回 null。 */
export function signDispatchToken(serviceId: string, nowMs: number = Date.now()): string | null {
  const key = secret();
  if (!key || !serviceId) return null;
  const day = dayNumber(nowMs);
  return `${day.toString(36)}${SEP}${computeSig(serviceId, day, key)}`;
}

/** timing-safe 驗證 token（含 30 天時效）。逾期或竄改一律 false。 */
export function verifyDispatchToken(
  serviceId: string,
  token: string,
  nowMs: number = Date.now(),
): boolean {
  const key = secret();
  if (!key || !serviceId || !token) return false;
  const sepIdx = token.indexOf(SEP);
  if (sepIdx <= 0) return false;
  const dayStr = token.slice(0, sepIdx);
  const sig = token.slice(sepIdx + 1);
  if (!/^[0-9a-z]+$/.test(dayStr) || !sig) return false;
  const day = parseInt(dayStr, 36);
  if (!Number.isFinite(day)) return false;
  const today = dayNumber(nowMs);
  // 未來日（時鐘偏移或竄改）或已超過 TTL → 失效
  if (today < day || today - day > TTL_DAYS) return false;
  const expected = computeSig(serviceId, day, key);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** 組出派工連結的站內路徑；未設定密鑰回 null。 */
export function buildDispatchPath(serviceId: string): string | null {
  const token = signDispatchToken(serviceId);
  if (!token) return null;
  return `/dispatch/${encodeURIComponent(serviceId)}/${token}`;
}
