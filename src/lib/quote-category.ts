/**
 * 報價單分類（同步到 Notion「訂製資料」的「分類」欄）。
 *
 * Notion 的分類是 select，選項固定為下列八項；判不出來就回 null 留空，
 * 不亂填——填錯的分類比空白更難察覺。
 */

export const QUOTE_CATEGORIES = [
  "到府清潔",
  "床頭繃布",
  "更換泡棉",
  "維修",
  "訂製皮布套",
  "訂製坐背墊",
  "訂製臥榻墊",
  "訂製款沙發",
] as const;

export type QuoteCategory = (typeof QUOTE_CATEGORIES)[number];

/**
 * 由具體到概括排序，先命中者勝。順序是規則的一部分：
 * 「坐墊泡棉更換」要歸更換泡棉而不是臥榻墊、「床頭靠墊外罩套」要歸床頭繃布而不是布套。
 */
const RULES: { category: QuoteCategory; pattern: RegExp }[] = [
  { category: "到府清潔", pattern: /清潔|保養|除蟎/ },
  { category: "床頭繃布", pattern: /床頭/ },
  { category: "更換泡棉", pattern: /泡棉更換|更換泡棉|換泡棉|泡棉內裡|換海綿|海綿更換/ },
  { category: "維修", pattern: /維修|修補|換皮|繃皮|彈簧|繃帶|翻新|重繃|拆件|坐面修/ },
  { category: "訂製款沙發", pattern: /訂製沙發|沙發訂製|訂製款沙發/ },
  { category: "訂製皮布套", pattern: /布套|皮套|罩套/ },
  { category: "訂製坐背墊", pattern: /坐背墊|背墊|靠墊/ },
  // 刻意不收「卡座」：卡座繃布板是板材工程、不是墊子，留白讓人工判斷；
  // 真正的「卡座坐墊」仍會被「坐墊」接住。
  { category: "訂製臥榻墊", pattern: /臥榻|臥鋪|床墊|坐墊|椅墊/ },
];

function matchIn(text: string): QuoteCategory | null {
  const clean = (text ?? "").replace(/\s+/g, "");
  if (!clean) return null;
  return RULES.find((r) => r.pattern.test(clean))?.category ?? null;
}

/**
 * 主判斷只看品名第一行：品名後面常掛工法附註（例「（含外布套拉鍊）」），
 * 掃整段會被附註劫持——臥榻坐墊因此被歸成訂製皮布套（禾雅 2026-09-14）。
 */
function matchFirstLine(text: string): QuoteCategory | null {
  return matchIn((text ?? "").split("\n")[0]);
}

/**
 * @param primary  主要品項名（通常是第一行對外品項），判斷力最強
 * @param fallback 備援文字（方案名稱＋全部品項），primary 判不出來時才看
 */
export function classifyQuoteCategory(primary: string, fallback = ""): QuoteCategory | null {
  // 備援刻意掃全文：主判斷已經失敗，這時寧可從附註撈到線索也好過留白
  return matchFirstLine(primary) ?? matchIn(fallback);
}
