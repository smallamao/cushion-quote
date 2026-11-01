/**
 * 排車規則。全部來自老闆 2026-11-01 的口述，並以 Trello 歷史出貨日驗證過。
 *
 * 🔴 這些是「規則」不是「演算法」——系統照規則提示，排車仍由人決定。
 *    每週只有 5～8 筆，順不順路取決於現場狀況，自動指派會給出要人重排的結果。
 */

/** 一天幾趟：近四個月 87 個出貨日共 182 趟，中位數 2、九成在 4 以內、最大 7。 */
export const SOFT_CAP = 4;
/** 老闆口述上限 5～6。歷史上只有 3 天達到，超過就是真的異常。 */
export const HARD_CAP = 6;

/**
 * 一天最多幾條路線。老闆：「2～3 條，早上新竹、下午台北」。
 *
 * 🔴 用「縣市數」當路線數的近似，不是用距離。依老闆實例：
 *    淡水＋土城同一天可以（都算新北，一條路線）；早上新竹、下午台北是兩條。
 *    所以跨縣市本身不是問題，跨太多條才是——先前版本一跨縣市就警告，方向錯了。
 */
export const MAX_ROUTES = 3;

/** 完工後最多寄放兩週。老闆：「避免放置超過二周」。 */
export const MAX_STORAGE_DAYS = 14;

/** 排定後提前幾天通知客人。老闆：「2-3 天」。 */
export const NOTIFY_LEAD_DAYS = 3;

/**
 * 依配送縣市建議司機。
 *   阿富   東部（花蓮、台東）
 *   葉先生 南部（高雄）回頭車，要配合車次
 *   阿信   主力，北部與其餘地區；排不下時由簡先生支援
 */
export function suggestDriver(city: string): { name: string; note: string } {
  const c = (city ?? "").replace(/^臺/, "台");
  if (c === "花蓮縣" || c === "台東縣") return { name: "阿富", note: "東部固定路線" };
  if (c === "高雄市") return { name: "葉先生", note: "回頭車，需配合車次" };
  if (["台北市", "新北市", "桃園市", "新竹市", "新竹縣"].includes(c)) {
    return { name: "阿信", note: "排不下可請簡先生支援" };
  }
  if (!c) return { name: "", note: "地址未解析，需人工確認" };
  return { name: "阿信", note: "不在固定路線上，需確認" };
}

/**
 * 製作完成到配送之間放太久。
 * dueDate＝預計出貨（製作完成）日，deliveryYmd＝打算排的配送日。
 */
export function isStorageOverdue(dueDate: string, deliveryYmd: string): boolean {
  const due = Date.parse(`${(dueDate ?? "").slice(0, 10)}T00:00:00+08:00`);
  const del = Date.parse(`${deliveryYmd}T00:00:00+08:00`);
  if (!Number.isFinite(due) || !Number.isFinite(del)) return false;
  return (del - due) / 86_400_000 > MAX_STORAGE_DAYS;
}
