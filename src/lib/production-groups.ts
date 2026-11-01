import type { ProductionOrderView } from "@/lib/production-orders";

// 生產訂單清單的「交期分群」：逾期／今天／本週／之後／已完成。
//
// 🔴 「今天」一律用台灣日期算。order-utils.todayDateStr 是 UTC，台灣早上 8 點前
//    會算成前一天——師傅清晨開工看到「今天」的單其實是昨天的，逾期也會少算一天。
//    這裡不能沿用那支。
//
// 本週的定義：明天～今天＋7 天（含第 7 天），也就是「接下來 7 天內」，
// 不是「到這個星期日為止」。師傅排工看的是還剩幾天，星期幾截斷在週五、週六
// 會讓本週只剩一兩天，反而把後天的單丟進「之後」。

export type ProductionGroupKey = "overdue" | "today" | "week" | "later" | "done";

/** 分群顯示順序（已完成永遠墊底） */
export const PRODUCTION_GROUP_ORDER: readonly ProductionGroupKey[] = ["overdue", "today", "week", "later", "done"];

/** 本週＝接下來幾天（不含今天） */
export const WEEK_WINDOW_DAYS = 7;

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000; // 台灣沒有日光節約時間，固定 UTC+8

/** 台灣的今天（YYYY-MM-DD） */
export function taipeiDateStr(now: Date = new Date()): string {
  return new Date(now.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

/** b − a 的天數（兩個都是 YYYY-MM-DD） */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

type DueFields = Pick<ProductionOrderView, "productionDueDate" | "deadline">;

/** 交期：生產交期優先，沒填用訂單交期；只取日期部分。格式不對當作沒填。 */
export function productionDueOf(order: DueFields): string {
  const raw = (order.productionDueDate || order.deadline || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

export function productionGroupOf(
  order: DueFields & Pick<ProductionOrderView, "status">,
  today: string,
): ProductionGroupKey {
  if (order.status === "completed") return "done";
  const due = productionDueOf(order);
  if (!due) return "later"; // 沒填交期：歸「之後」，排在最末
  const diff = daysBetween(today, due);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= WEEK_WINDOW_DAYS) return "week";
  return "later";
}

export interface ProductionGroup {
  key: ProductionGroupKey;
  orders: ProductionOrderView[];
}

// 未完成：交期近的在前、沒交期的最後；已完成：最近完成的在前
function compareInGroup(key: ProductionGroupKey, a: ProductionOrderView, b: ProductionOrderView): number {
  if (key === "done") {
    return (b.completedDate || "").localeCompare(a.completedDate || "") || a.orderNumber.localeCompare(b.orderNumber);
  }
  const da = productionDueOf(a) || "9999-99-99";
  const db = productionDueOf(b) || "9999-99-99";
  return da.localeCompare(db) || a.orderNumber.localeCompare(b.orderNumber);
}

/** 依交期分群，只回有單的群組，順序固定為 PRODUCTION_GROUP_ORDER。 */
export function groupProductionOrders(orders: readonly ProductionOrderView[], today: string): ProductionGroup[] {
  return PRODUCTION_GROUP_ORDER.map((key) => ({
    key,
    orders: orders.filter((o) => productionGroupOf(o, today) === key).sort((a, b) => compareInGroup(key, a, b)),
  })).filter((g) => g.orders.length > 0);
}

/** 卡片上的交期文字：「逾期 3 天」「今天 11/01」「明天 11/02」「11/05（四）」 */
export function dueLabel(order: DueFields, today: string): string {
  const due = productionDueOf(order);
  if (!due) return "未填交期";
  const md = `${due.slice(5, 7)}/${due.slice(8, 10)}`;
  const diff = daysBetween(today, due);
  if (diff < 0) return `逾期 ${-diff} 天（${md}）`;
  if (diff === 0) return `今天 ${md}`;
  if (diff === 1) return `明天 ${md}`;
  const weekday = "日一二三四五六"[new Date(`${due}T00:00:00Z`).getUTCDay()];
  return `${md}（${weekday}）`;
}
