import type { CustomOrder, OrderRework, ReworkCause, ReworkFoundAt, ReworkSymptom } from "./types";

/**
 * 重做（做錯）紀錄 —— 統計用的純函式層。
 *
 * 🔴 為什麼是「症狀／歸因／何時發現」三個選項，而不是一個文字欄：
 *    2026-11-10 盤點訂製訂單 52 個欄位的填寫率，結果是乾淨的兩群——
 *    流程副產物（下單日、金額、狀態）73~99%，靠人記得去填的欄位 0~12%。
 *    十一個「要人主動想起來才會填」的欄位全部趴在 12% 以下。
 *    所以這裡的設計前提是：**能用點的就不要用打的**，三下點完，補充欄選填。
 *
 * 🔴 為什麼歸因可以留空：老闆自己提的——「當下不知道根因怎麼辦？」
 *    師傅說做錯了，但到底是工單抄錯還是叫料錯，常常要隔兩天才查得出來。
 *    逼他當下選一個，選出來的會是猜的，那比空白更糟（空白至少誠實）。
 *    unknownCause 單獨統計，就是在提醒「這些還沒查」。
 *
 * 🔴 為什麼記到品項層級：一張單十幾個品項，只有背墊做錯。
 *    記成「這張單做錯」會讓日後完全看不出是哪一類品項在出問題。
 */

/** 開始記錄的日期。用來算重做率的分母——在這天之前的訂單沒有紀錄機制，不能當 0 次來平均。 */
export const REWORK_TRACKING_SINCE = "2026-11-10";

export const REWORK_SYMPTOMS: readonly ReworkSymptom[] = [
  "尺寸",
  "材質色號",
  "工法",
  "件數",
  "泡棉規格",
  "其他",
];

export const REWORK_CAUSES: readonly ReworkCause[] = [
  "客人給錯",
  "報價寫錯",
  "工單抄錯",
  "叫料錯",
  "師傅做錯",
  "廠商料問題",
];

export const REWORK_FOUND_AT: readonly ReworkFoundAt[] = ["製作中", "出貨前", "客人反映"];

export interface ReworkStat {
  key: string;
  count: number;
}

export interface ReworkSummary {
  /** 重做筆數（一張單可能有多筆） */
  total: number;
  /** 有重做紀錄的訂單數 */
  orderCount: number;
  /** 納入分母的訂單數（下單日 >= since） */
  scopeOrders: number;
  /** orderCount / scopeOrders，scopeOrders 為 0 時給 0 */
  rate: number;
  /** 分母的起算日，要跟著數字一起顯示，否則「2% 重做率」會被誤讀 */
  since: string;
  bySymptom: ReworkStat[];
  byCause: ReworkStat[];
  byFoundAt: ReworkStat[];
  byCategory: ReworkStat[];
  /** 歸因還留空的筆數——代表「還沒查出根因」，不是「沒有根因」 */
  unknownCause: number;
}

function tally(values: string[]): ReworkStat[] {
  const map = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  // 同票時用字碼比大小，不用 localeCompare——中文的 localeCompare 取決於 Node 的
  // ICU 資料，本機和 Vercel 可能排出不同順序，畫面會莫名其妙跳動。
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * 彙總重做資料。
 *
 * ★ 分母只算 since 之後下單的訂單。這不是潔癖——把 2026 年初的幾百張舊單
 *   當成「零次重做」平均進去，重做率會被稀釋到看起來像 1%，然後這個數字
 *   就會被拿去跟別人說「我們幾乎不出錯」。寧可分母小而誠實。
 */
export function summarizeReworks(
  orders: CustomOrder[],
  since: string = REWORK_TRACKING_SINCE,
): ReworkSummary {
  const inScope = orders.filter((o) => (o.orderDate || "") >= since);

  // 紀錄本身不設日期下限：舊單上若有人補記，照樣算進次數，只是不影響分母。
  const entries: Array<{ rework: OrderRework; order: CustomOrder }> = [];
  for (const order of orders) {
    for (const rework of order.reworks ?? []) entries.push({ rework, order });
  }

  const withRework = new Set(
    inScope.filter((o) => (o.reworks ?? []).length > 0).map((o) => o.orderId),
  );

  return {
    total: entries.length,
    orderCount: withRework.size,
    scopeOrders: inScope.length,
    rate: inScope.length > 0 ? withRework.size / inScope.length : 0,
    since,
    bySymptom: tally(entries.map((e) => e.rework.symptom)),
    byCause: tally(entries.map((e) => e.rework.cause)),
    byFoundAt: tally(entries.map((e) => e.rework.foundAt)),
    byCategory: tally(entries.map((e) => e.order.itemCategory || "未分類")),
    unknownCause: entries.filter((e) => !e.rework.cause).length,
  };
}

/** 產生一筆新紀錄的 id。用時間戳＋亂數，不需要全域唯一，只要同一張單內不撞。 */
export function newReworkId(): string {
  return `RW-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
