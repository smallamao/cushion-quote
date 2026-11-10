import { productionWindow } from "@/lib/production-window";

/**
 * 交期達成率（On-Time Delivery）——按生產週統計「承諾區間內交付」的比例。
 *
 * 「承諾區間」＝ productionWindow(生產週).end，也就是已經寫進客人訊息的
 * 「【X/X ～ X/X 製作完成】」那個迄日。它不是內部估算，是對外承諾。
 *
 * 🔴 這份計算的重點全在**刪失偏誤（censoring bias）**。2026-11-10 實測：
 *    只看「已交付」的單會系統性高估達成率，因為會晚的單常常還沒交付，
 *    於是不在分母裡。同一批資料兩種算法差距很大：
 *
 *      生產週      只看已交付        納入已超期未交付
 *      2026-10-12  45% (5/11)   →   33% (5/15)
 *      2026-10-26  88% (7/8)    →   64% (7/11)
 *      2026-11-02 100% (4/4)    →   尚未可判定（6 筆還在區間內）
 *
 *    錯的算法會畫出「45%→60%→88%→100%」的假改善曲線。
 *    真實是 33%→60%→64%，而近期幾週根本還不能判定。
 *
 * 所以這裡的規則是：
 *    ① 已交付且在區間內            → 準時
 *    ② 已交付但超出區間            → 逾期
 *    ③ 未交付、但區間已過          → **算逾期**（它不可能再準時了）
 *    ④ 未交付、區間還沒過          → 不可判定，排除在分母外，但要顯示出來
 *
 * ④ 一定要顯示而不是靜默排除：看板若只給一個百分比，看的人不會知道
 * 那是「3 筆算出來的」還是「15 筆算出來的」。
 */

export interface OtdOrder {
  orderNumber: string;
  customerName: string;
  /** 生產週（任一天都可以，內部會推到該週週一） */
  weekKey: string;
  /** 已排定／實際的配送日；空＝還沒交付 */
  chosenDate: string;
  status: string;
}

export type OtdOutcome = "on_time" | "late" | "late_undelivered" | "pending";

export interface OtdItem {
  orderNumber: string;
  customerName: string;
  /** 承諾的製作完成日 */
  promisedEnd: string;
  chosenDate: string;
  outcome: OtdOutcome;
  /** 超出承諾區間幾天；準時與不可判定為 0 */
  lateDays: number;
}

export interface OtdWeek {
  /** 生產週的週一 */
  weekMonday: string;
  promisedEnd: string;
  items: OtdItem[];
  onTime: number;
  late: number;
  /** 未交付且區間已過——算逾期，但單獨列出來因為它們還救得回來（至少知道要去追） */
  lateUndelivered: number;
  /** 未交付、區間還沒過＝還不能判定 */
  pending: number;
  /** 分母＝已判定的筆數（準時＋逾期＋已超期未交付） */
  judged: number;
  /** 達成率；judged 為 0 時是 null，**不要當成 0% 或 100%** */
  rate: number | null;
  /** 這一週是否全部判定完畢（沒有 pending）。只有 true 才適合拿來看趨勢 */
  complete: boolean;
}

function diffDays(fromYmd: string, toYmd: string): number | null {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** 單筆的判定。`today` 必須是台灣時區的 YYYY-MM-DD。 */
export function classifyOtd(order: OtdOrder, today: string): OtdItem | null {
  const { end } = productionWindow(order.weekKey);
  // 沒有生產週＝算不出承諾日，整筆排除（不要猜，也不要當成準時）
  if (!end) return null;

  const delivered = (order.chosenDate ?? "").slice(0, 10);
  const base = {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    promisedEnd: end,
    chosenDate: delivered,
  };

  if (delivered) {
    const late = diffDays(end, delivered);
    if (late === null) return null;
    return late > 0
      ? { ...base, outcome: "late", lateDays: late }
      : { ...base, outcome: "on_time", lateDays: 0 };
  }

  // 未交付：區間已過就是逾期（不可能再準時），否則還不能判定
  if (end < today) {
    const late = diffDays(end, today) ?? 0;
    return { ...base, outcome: "late_undelivered", lateDays: late };
  }
  return { ...base, outcome: "pending", lateDays: 0 };
}

/**
 * 按生產週聚合。已取消的單在呼叫端先濾掉——取消不是交期問題。
 * 回傳依週一升冪排序。
 */
export function buildOtdByWeek(orders: readonly OtdOrder[], today: string): OtdWeek[] {
  const groups = new Map<string, OtdItem[]>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const item = classifyOtd(o, today);
    if (!item) continue;
    // 用承諾完工日當分組鍵的來源：同一生產週的單共用同一個 end
    const list = groups.get(item.promisedEnd) ?? [];
    list.push(item);
    groups.set(item.promisedEnd, list);
  }

  return [...groups.entries()]
    .map(([promisedEnd, items]) => {
      const onTime = items.filter((i) => i.outcome === "on_time").length;
      const late = items.filter((i) => i.outcome === "late").length;
      const lateUndelivered = items.filter((i) => i.outcome === "late_undelivered").length;
      const pending = items.filter((i) => i.outcome === "pending").length;
      const judged = onTime + late + lateUndelivered;
      return {
        // 承諾完工日 = 週一+9，回推得到週一
        weekMonday: addDaysBack(promisedEnd, 9),
        promisedEnd,
        items: items.sort((a, b) => b.lateDays - a.lateDays),
        onTime,
        late,
        lateUndelivered,
        pending,
        judged,
        rate: judged > 0 ? Math.round((onTime / judged) * 100) : null,
        complete: pending === 0,
      };
    })
    .sort((a, b) => a.weekMonday.localeCompare(b.weekMonday));
}

function addDaysBack(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(t)) return ymd;
  const d = new Date(t - n * 86_400_000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
