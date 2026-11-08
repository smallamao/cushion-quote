import crypto from "node:crypto";

/**
 * 派工連結簽章（給外部師傅看電話/地址用）。
 *
 * 連結 = /dispatch/{serviceId}/{token}，token = `{發出日}~{sig}`：
 *   發出日 = floor(now/一天) 的 base36（簽進 sig，不可竄改）
 *   sig    = base64url(HMAC-SHA256(密鑰, "dispatch:"+serviceId+":"+發出日)) 取前 32 字
 *
 * 三層時效（哪條先到就先失效）：
 *   0) 預定日過 3 天失效 —— 見檔尾 isPastDispatchWindow（2026-11-08）。
 *   1) 30 天失效 —— 驗證時 today-發出日 > 30 即拒（時間戳在 sig 內，改了就驗不過）。
 *   2) 已完成／已取消失效 —— 由頁面讀工單狀態把關（見 dispatch page），非本模組職責。
 *
 * ⚠️ 純 server 端（node:crypto）。不可在 Edge middleware 匯入；middleware 只比對路徑前綴。
 */

// 簽章長度（base64url 字元）。16 字 ≈ 96 bits，暴力猜仍不可行，但網址短很多。
// 舊連結用 32 字；因 16 字剛好是 32 字的前綴，驗證時只要按長度截取即可相容，
// 讓已發出的舊連結在自己的 30 天內繼續有效，不會因改版突然斷掉。
const SIG_LEN = 16;
const LEGACY_SIG_LEN = 32;
const TTL_DAYS = 30;
const DAY_MS = 86_400_000;
const SEP = "~"; // URL unreserved、且不在 base64url 字元集內，可安全當分隔符
/** 對外短路徑（越短越好貼；/dispatch 舊路徑保留轉址） */
const PATH_PREFIX = "/w";

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

function computeSig(serviceId: string, day: number, key: string, len: number = SIG_LEN): string {
  return crypto
    .createHmac("sha256", key)
    .update(`dispatch:${serviceId}:${day}`)
    .digest("base64url")
    .slice(0, len);
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
  // 只接受新（16）或舊（32）長度；其餘一律拒絕，避免被拿超短簽章試猜。
  if (sig.length !== SIG_LEN && sig.length !== LEGACY_SIG_LEN) return false;
  const expected = computeSig(serviceId, day, key, sig.length);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** 組出派工連結的站內短路徑（/w/…）；未設定密鑰回 null。 */
export function buildDispatchPath(serviceId: string): string | null {
  const token = signDispatchToken(serviceId);
  if (!token) return null;
  return `${PATH_PREFIX}/${encodeURIComponent(serviceId)}/${token}`;
}

/**
 * 預定日過後幾天，連結就停用（老闆 2026-11-08）。
 * 起因：AS-20261013-01 預定 10/27，沒人按完成，11/8 師傅仍看得到客人電話地址——
 * 「結案才停用」靠人記得按，而 30 天是從發出日算，跟實際上門日無關。
 * 期限跟著工單上的預定日走：改期後內勤改了日期，連結自動跟著延長，不必重發。
 */
export const DISPATCH_GRACE_DAYS_AFTER_SCHEDULE = 3;
const TAIPEI_OFFSET_MS = 8 * 3_600_000;

/** 預定日（YYYY-MM-DD，台灣日期）＋寬限天數已經過了嗎。沒排日期或格式不對 → false（交給 30 天規則）。 */
export function isPastDispatchWindow(scheduledDate: string, nowMs: number = Date.now()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate ?? "")) return false;
  const [y, m, d] = scheduledDate.split("-").map(Number);
  const lastOpenDay = new Date(Date.UTC(y, m - 1, d + DISPATCH_GRACE_DAYS_AFTER_SCHEDULE))
    .toISOString()
    .slice(0, 10);
  // 伺服器跑在 UTC，直接取日期會差 8 小時；換成台灣日期再比
  const todayTaipei = new Date(nowMs + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
  return todayTaipei > lastOpenDay;
}

/**
 * 派工頁與行事曆下載共用的停用判斷（簽章另外驗）。
 * closed＝已完成／已取消；past_schedule＝預定日已過寬限期；null＝可以看。
 */
export function dispatchClosedReason(
  service: { status: string; scheduledDate: string },
  nowMs: number = Date.now(),
): "closed" | "past_schedule" | null {
  if (service.status === "completed" || service.status === "cancelled") return "closed";
  if (isPastDispatchWindow(service.scheduledDate, nowMs)) return "past_schedule";
  return null;
}
