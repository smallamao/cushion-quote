import type { CustomOrder, OrderStatus } from "@/lib/types";

/**
 * 在製品超期偵測。
 *
 * 🔴 為什麼不是改排序：訂製訂單清單的排序（order-sort.ts）老闆調過好幾次，
 *    2026-11-05 才把安裝日的方向翻成「有日期優先」。那個順序是用出來的，
 *    不該為了讓超期單浮上來而動它。改用清單上方的警示列，只在有超期時出現。
 *
 * 承諾交期【按品類分開算，而且從已完工訂單回推】——
 * 2026-11-10 實測 56 筆已完工訂單：整體中位 14 工作天、P90 23，
 * 但【維修類中位 26 天、最長 33】，是其他品類的兩倍（拆開才知道狀況，本來就會拖）。
 * 用同一個門檻會把所有維修單誤判成遲到。
 */

/** 還在產線上的狀態 */
const WIP: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["pending_setup", "waiting", "production"]);

/** 樣本太少時的保底值（2026-11-10 由 56 筆回推） */
const FALLBACK_PROMISE: Record<string, number> = { 維修: 26 };
const FALLBACK_DEFAULT = 21;

/** 回推承諾交期時，同品類至少要有幾筆已完工才採信 */
const MIN_SAMPLE = 4;

export type OverdueLevel = "ok" | "late" | "critical";

export interface OverdueItem {
  order: CustomOrder;
  /** 已耗用工作天 */
  days: number;
  /** 該品類的承諾交期（工作天） */
  promise: number;
  /** days / promise */
  ratio: number;
  level: OverdueLevel;
  /** 超出幾個工作天（未超期為 0） */
  over: number;
}

const isDate = (s: string | undefined): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? "").slice(0, 10));

/** 兩個日期之間的工作天（扣週末，不扣國定假日 → 偏樂觀，寧可晚報警不要早報警） */
export function businessDaysBetween(from: string, to: string): number {
  if (!isDate(from) || !isDate(to)) return 0;
  const a = new Date(from.slice(0, 10));
  const b = new Date(to.slice(0, 10));
  if (b <= a) return 0;
  let n = 0;
  const d = new Date(a);
  while (d < b) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) n += 1;
  }
  return n;
}

/**
 * 從已完工訂單回推各品類的承諾交期（取 P75，不取中位）。
 * 取 P75 的理由：門檻是「超過這個就該看一眼」，用中位會讓一半的單都亮燈。
 */
export function derivePromiseDays(orders: readonly CustomOrder[]): Record<string, number> {
  const byCat = new Map<string, number[]>();
  for (const o of orders) {
    if (o.status !== "completed") continue;
    if (!isDate(o.orderDate) || !isDate(o.completedDate)) continue;
    const d = businessDaysBetween(o.orderDate, o.completedDate);
    if (d <= 0) continue;
    const cat = o.itemCategory || "?";
    byCat.set(cat, [...(byCat.get(cat) ?? []), d]);
  }
  const out: Record<string, number> = {};
  for (const [cat, arr] of byCat) {
    if (arr.length < MIN_SAMPLE) continue;
    const sorted = [...arr].sort((x, y) => x - y);
    out[cat] = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))];
  }
  return out;
}

export function promiseFor(category: string, derived: Record<string, number>): number {
  return derived[category] ?? FALLBACK_PROMISE[category] ?? FALLBACK_DEFAULT;
}

/**
 * 算出在製品的超期狀況，超期最嚴重的排前面。
 * @param today YYYY-MM-DD（台北日期，由呼叫端決定，方便測試）
 */
export function findOverdue(orders: readonly CustomOrder[], today: string): OverdueItem[] {
  const derived = derivePromiseDays(orders);
  return orders
    .filter((o) => WIP.has(o.status) && isDate(o.orderDate))
    .map((order) => {
      const promise = promiseFor(order.itemCategory || "?", derived);
      const days = businessDaysBetween(order.orderDate, today);
      const ratio = promise > 0 ? days / promise : 0;
      const level: OverdueLevel = ratio > 1.5 ? "critical" : ratio > 1 ? "late" : "ok";
      return { order, days, promise, ratio, level, over: Math.max(0, days - promise) };
    })
    .filter((x) => x.level !== "ok")
    .sort((a, b) => b.ratio - a.ratio);
}
