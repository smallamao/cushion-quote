import type { OrderItemCategory } from "@/lib/types";

import { classifyQuoteCategory } from "@/lib/quote-category";

/**
 * 報價分類（Notion 那套 8 類）→ 訂製訂單的品項分類（10 類）。
 *
 * 兩套詞彙是各自長出來的，但語意一對一對得上，所以共用同一個分類器，
 * 只在最後翻譯一次。訂單多出來的「到府施工」「大和樂活」沒有對應的
 * 報價分類，維持人工選填。
 */
const TO_ORDER_CATEGORY: Record<string, OrderItemCategory> = {
  維修: "維修",
  訂製坐背墊: "坐/背墊",
  訂製皮布套: "皮/布套",
  更換泡棉: "泡棉內裏",
  訂製臥榻墊: "臥榻墊",
  訂製款沙發: "訂製沙發",
  床頭繃布: "繃布裱板",
  到府清潔: "到府清潔",
};

/**
 * 由報價品項名稱推訂單的品項分類；判不出來回空字串，交給人工選。
 *
 * @param primary 判斷力最強的那一句（通常是第一筆對外品項的名稱）
 * @param fallback 補充語料（方案名稱、其餘品項名稱串起來）
 */
export function classifyOrderCategory(primary: string, fallback = ""): OrderItemCategory | "" {
  const quoteCategory = classifyQuoteCategory(primary, fallback);
  if (!quoteCategory) return "";
  return TO_ORDER_CATEGORY[quoteCategory] ?? "";
}

/**
 * 由報價品項名稱推配送方式。
 *
 * 只認得出三種情形，其餘留空給人工選：
 * - 品項寫明自取／自行送件 → 自運
 * - 有到府施工／安裝的品項 → 到府施工
 * - 有送件運費／搬運的品項 → 宅配
 *
 * 判斷順序不可調換：同一張單常同時有「來回搬運」與「到府安裝」，
 * 這種要算到府施工，不是宅配。
 */
export function inferDeliveryMethod(itemNames: string[]): "自運" | "宅配" | "到府施工" | "" {
  const all = itemNames.join("\n");
  if (/自取|自行送件|自行載|客人自載|自運/.test(all)) return "自運";
  if (/到府施工|到府安裝|現場安裝|到府丈量|到府維修/.test(all)) return "到府施工";
  if (/運費|搬運|配送|送件/.test(all)) return "宅配";
  return "";
}
