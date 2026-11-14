/**
 * 報價 → 工單的語言轉換。
 *
 * 2026-11-14 抽樣近 15 張自動開的單，逐欄比對「系統產出」與「人工改完」：
 *   備註 13/15、工單品項 13/15、主布料 12/15、配送方式 11/15、訂製內容 10/15 被改過。
 * 改動不是隨機的，有固定規律——報價的讀者是客人，工單的讀者是師傅，兩邊的語言不同。
 * 這支把規律固定下來，讓系統先做對，人工只處理真正要判斷的部分。
 */

/**
 * 報價條件：給客人看的商業條款，師傅不需要。
 *
 * 抽樣 53 行系統帶過來的備註，其中 23 行（43%）是這類；人工改完只剩 1 行殘留。
 * 🔴 只刪「明顯是報價條件」的行。工法說明誤刪的代價遠大於多留一行。
 */
const QUOTE_CONDITION =
  /(報價(不含|另計|僅含|以)|不含營業稅|營業稅|牌價|級距|交期[:：]|工作天|回收載走|清運費|自行取件|由貴司提供|貴司自行|單程一趟|不另收|優惠回收|含.{0,6}(送達|送貨到府|配送至|送至案場))/;

/** 把報價的對外說明轉成工單備註：逐行去掉報價條件。 */
export function stripQuoteConditions(scopeDescription: string): string[] {
  return scopeDescription
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !QUOTE_CONDITION.test(l));
}

/** 英吋換算到公分的標準值（師傅用整數，報價用換算值） */
const INCH_TO_CM: Record<string, number> = {
  "1": 3, "1.5": 4, "2": 5, "2.5": 6, "3": 8, "3.5": 9,
  "4": 10, "4.5": 11, "5": 13, "5.5": 14, "6": 15,
};

/** 7.62 / 10.16 / 12.7 這種換算值 → 8 / 10 / 13 */
const CONVERTED_CM = new Map<string, number>([
  ["2.54", 3], ["3.81", 4], ["5.08", 5], ["6.35", 6],
  ["7.6", 8], ["7.62", 8], ["8.89", 9],
  ["10.16", 10], ["11.43", 11], ["12.7", 13], ["13.97", 14], ["15.24", 15],
]);

/**
 * 把英吋與英吋換算值寫成師傅看的整數公分。
 *
 * 🔴 只動「確定是英吋換算來的數字」。全面四捨五入會把 43.5cm 改成 44cm——
 *    那是實際量出來的尺寸，不可以動（L541 人工改完仍保留 43.5）。
 */
export function normalizeInchToCm(text: string): string {
  if (!text) return text;
  let out = text;
  // 3 英吋 / 3" / 3'' → 8cm
  out = out.replace(/(\d+(?:\.\d+)?)\s*(?:英吋|英寸|吋|''|["”])/g, (whole, n: string) => {
    const cm = INCH_TO_CM[n];
    return cm ? `${cm}cm` : whole;
  });
  // 7.6cm → 8cm（只換對得上換算表的）
  out = out.replace(/(\d+\.\d+)\s*(cm|CM|公分)/g, (whole, n: string, unit: string) => {
    const cm = CONVERTED_CM.get(n);
    return cm ? `${cm}${unit}` : whole;
  });
  return out;
}

/**
 * 泡棉：報價寫密度，工單寫料號。
 *
 * 對照取自實際工單用語（HRH／HRP／硬Q／軟Q）。看不懂的一律原樣保留——
 * 翻錯會讓師傅做錯料，寧可不翻。
 */
export function foamShorthand(spec: string): string {
  const s = (spec ?? "").trim();
  if (!s) return s;

  const thickness = normalizeInchToCm(s).match(/(\d+)\s*(?:cm|CM|公分)/)?.[1];
  const inch = s.match(/(\d+(?:\.\d+)?)\s*(?:英吋|英寸|吋|''|["”])/)?.[1];

  let grade = "";
  if (/高支撐/.test(s)) grade = "HRH 硬Q料";
  else if (/中密度|靠背|背墊.*(中|軟)/.test(s)) grade = "靠背軟料";
  else if (/標準高密度|高密度/.test(s)) grade = "一般硬Q料";
  else if (/乳膠/.test(s)) grade = "乳膠";

  if (!grade) return s; // 看不懂就別動

  const size = inch ? `${inch}''` : thickness ? `${thickness}cm` : "";
  return size ? `(貼合 ${size} ${grade})` : `(${grade})`;
}

/**
 * 訂製內容：案件名稱常帶著客戶、場所、方案名與補充說明，工單上只要做什麼。
 *
 * 🔴 這支只做「去雜訊」，不自己發明品類名。
 *    把「國泰國小 水池櫃體坐墊」改成「訂製坐墊」需要判斷，判斷錯了工單就看不出要做什麼。
 */
export function cleanOrderTitle(raw: string | undefined | null): string {
  let t = (raw ?? "").trim();
  if (!t) return "";

  // 「確認方案（高支撐泡棉）」這種是報價的方案名稱，完全不該出現在工單
  if (/^(確認)?方案/.test(t)) return "";
  // 客戶／場所前綴：「禾雅窗飾｜玄關櫃坐墊」→「玄關櫃坐墊」
  t = t.replace(/^[^｜|]{1,12}[｜|]\s*/, "");
  // 括號補充：「（現場丈量前概算）」「(含運)」
  t = t.replace(/[（(][^）)]*[）)]/g, "");
  // 數量後綴：「四件組」「共十二片」
  t = t.replace(/\s*[一二三四五六七八九十\d]+\s*(件組|件套|片組)\s*$/, "");
  return t.trim();
}
