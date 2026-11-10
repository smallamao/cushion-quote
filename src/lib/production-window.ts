/**
 * 客人看到的「製作完成區間」——純函式，前後端共用。
 *
 * 🔴 從 trello-server.ts 抽出來（2026-11-10）。那一支有 `import "server-only"`，
 *    所以前端拿不到這段算術；而排車視圖需要它來判斷「完工到配送之間放太久」。
 *    先前那個判斷是拿卡片 due 算的，而 due 是專案自己宣告不可信的欄位
 *    （2026-09-27 對帳實測 17 筆對不上），等於規則算在錯的錨點上。
 *
 * 🔴 日期算術一律以 UTC 午夜為基準。同一個領域裡曾有三套不同基準
 *    （+08:00、UTC、Date.UTC），邊界日就會 off-by-one。這裡只留一套。
 */

/**
 * 排程日到開工之間的緩衝天數。
 * 不能排程日當天就算開工（老闆 2026-09-30 指正，P6202 因此顯示成 10/12～10/26）。
 * 🔴 老闆 2026-11-10：再往後推一天（週一+3 → 週一+4）。例：生產週一 10/12 → 10/16 ～ 10/22。
 */
const BUFFER_DAYS = 4;

/** 製作區間的長度（起日 + 6 天）。 */
const WINDOW_DAYS = 6;

/** YYYY-MM-DD 加減天數；壞日期原樣回傳，不丟錯。 */
export function addDaysYmd(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(t)) return ymd;
  const d = new Date(t + n * 86400000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 任一天 → 所屬生產週的週一（週一為一週之始）。 */
export function weekMonday(ymd: string): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(t)) return ymd;
  const dow = new Date(t).getUTCDay();  // 0=日
  const back = dow === 0 ? 6 : dow - 1; // 回推到週一
  return addDaysYmd(ymd, -back);
}

/**
 * 客人看到的「製作完成區間」＝生產週一 +3 ～ +9。
 *
 * 🔴 一律從**生產週的週一**算，不看各筆排程日、也不看卡片 due：
 *    - 同一週一起生產，整週共用一個區間（老闆 2026-09-30 明確指正）
 *    - due 長期不可信：2026-09-27 對帳實測 17 筆對不上，而且兩邊都可能是舊的那一方
 *    - 排程日在 Numbers 與 Trello 之間零筆不一致，是唯一可信的錨點
 *
 * 這個區間是**已經寫進給客人的訊息**的（「【10/8 ～ 10/14 製作完成】」），
 * 所以它不只是內部估算，是對外承諾。
 */
export function productionWindow(weekKeyOrScheduleYmd: string): { start: string; end: string } {
  if (!weekKeyOrScheduleYmd) return { start: "", end: "" };
  const monday = weekMonday(weekKeyOrScheduleYmd);
  const start = addDaysYmd(monday, BUFFER_DAYS);
  return { start, end: addDaysYmd(start, WINDOW_DAYS) };
}
