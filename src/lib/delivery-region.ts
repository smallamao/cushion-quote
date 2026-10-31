/**
 * 從 Trello 卡片描述裡的地址抽出配送區域。
 *
 * 🔴 台灣地址常省略，2026-10-31 實測 37 筆有 7 筆用「縣市＋行政區」的樣式抓不到：
 *    - 「新竹市埔頂一路500號」→ 縣市後面直接接路名，沒有行政區
 *    - 「板橋區文化路一段31號」→ 開頭就是行政區，沒有縣市
 *    所以這裡刻意分三種結果，**抓不到就回 null，不猜**。
 *    猜錯區域會害排錯路線，比留白更糟——排車的人看到「需確認」會自己去查，
 *    看到錯的區域則會照著排下去。
 */

/** 直轄市與縣市全名（含常見的台／臺異體字） */
const CITIES = [
  "台北市", "臺北市", "新北市", "桃園市", "台中市", "臺中市", "台南市", "臺南市",
  "高雄市", "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣",
  "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "臺東縣",
  "澎湖縣", "金門縣", "連江縣",
] as const;

/** 大台北＋桃園以外視為遠程。依實際資料：竹北、新竹市、宜蘭、花蓮玉里都是單點遠程。 */
const NEAR_CITIES = new Set(["台北市", "臺北市", "新北市", "桃園市"]);

export interface DeliveryRegion {
  /** 正規化後的縣市（台→臺一律轉成「台」），抓不到為空字串 */
  city: string;
  /** 鄉鎮市區，抓不到為空字串 */
  district: string;
  /** 給人看的標籤：「新北市土城區」「新北市（區未明）」「需確認」 */
  label: string;
  /** 北北桃以外＝遠程，排車要特別處理 */
  isRemote: boolean;
  /** 完全抓不到縣市也抓不到行政區 */
  unknown: boolean;
}

const UNKNOWN: DeliveryRegion = {
  city: "", district: "", label: "需確認", isRemote: false, unknown: true,
};

/** 臺→台，讓「臺北市」與「台北市」歸成同一區 */
function normalizeCity(c: string): string {
  return c.replace(/^臺/, "台");
}

export function parseDeliveryRegion(text: string | undefined | null): DeliveryRegion {
  const src = (text ?? "").replace(/\s+/g, "");
  if (!src) return UNKNOWN;

  const city = CITIES.find((c) => src.includes(c)) ?? "";

  // 行政區：縣市後面緊接著的 1～3 字 + 區/鄉/鎮/市。
  // 沒有縣市時也試著單獨抓（「板橋區文化路…」這種開頭就是行政區的寫法）。
  const after = city ? src.slice(src.indexOf(city) + city.length) : src;
  const d = /^([一-龥]{1,3}[區鄉鎮市])/.exec(after)
    ?? /([一-龥]{1,3}[區鄉鎮])/.exec(after);
  const district = d ? d[1] : "";

  if (!city && !district) return UNKNOWN;

  const norm = normalizeCity(city);
  return {
    city: norm,
    district,
    label: norm && district ? `${norm}${district}` : norm ? `${norm}（區未明）` : `${district}（縣市未明）`,
    // 縣市抓不到就無從判斷遠近，一律當近程不特別標，避免誤導
    isRemote: Boolean(norm) && !NEAR_CITIES.has(norm),
    unknown: false,
  };
}
