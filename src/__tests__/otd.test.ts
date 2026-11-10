import { describe, expect, it } from "vitest";

import { buildOtdByWeek, classifyOtd, type OtdOrder } from "@/lib/otd";
import { productionWindow } from "@/lib/production-window";

/**
 * 🔴 這組測試守的是**刪失偏誤**。2026-11-10 實測：只看「已交付」的單會
 *    系統性高估達成率，因為會晚的單常常還沒交付、於是不在分母裡。
 *
 *      生產週      只看已交付        納入已超期未交付
 *      2026-10-12  45% (5/11)   →   33% (5/15)
 *      2026-10-26  88% (7/8)    →   64% (7/11)
 *      2026-11-02 100% (4/4)    →   尚未可判定
 *
 *    錯的算法會畫出「45%→60%→88%→100%」的假改善曲線，真實是 33%→60%→64%。
 *    看板給錯方向的好消息，比沒有看板更糟。
 */

/**
 * 🔴 承諾完工日**現算**，不要抄成字面值。2026-11-10 另一個 session 把
 *    BUFFER_DAYS 從 3 改成 4，當時寫死 "2026-10-21" 的測試全部變紅——
 *    而且順便暴露出 otd.ts 裡我自己硬算 BUFFER+WINDOW=9 的 bug。
 *    衍生值一律從來源推導，常數才能自由調整。
 */
const WEEK = "2026-10-12";                          // 週一
const PROMISED = productionWindow(WEEK).end;        // 週一 + BUFFER + WINDOW
const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const AFTER = (n: number) => addDays(PROMISED, n);  // 承諾日之後 n 天

function order(no: string, chosenDate: string, status = "scheduled"): OtdOrder {
  return { orderNumber: no, customerName: "測試", weekKey: WEEK, chosenDate, status };
}

describe("classifyOtd — 單筆判定", () => {
  it("前提：承諾完工日落在生產週的週一之後，且是該週共用的", () => {
    expect(PROMISED > WEEK).toBe(true);
    expect(productionWindow("2026-10-15").end).toBe(PROMISED); // 同週週四
  });

  it("已交付且在區間內 → 準時", () => {
    expect(classifyOtd(order("P1", AFTER(-1)), "2026-11-10")?.outcome).toBe("on_time");
    expect(classifyOtd(order("P2", PROMISED), "2026-11-10")?.outcome).toBe("on_time"); // 當天算準時
  });

  it("已交付但超出區間 → 逾期，並算出天數", () => {
    const r = classifyOtd(order("P3", AFTER(17)), "2026-11-10");
    expect(r?.outcome).toBe("late");
    expect(r?.lateDays).toBe(17); // P6271 的真實情形：晚 17 天
  });

  /** 這條是整個檔案的重點 */
  it("未交付、但區間已過 → 算逾期（它不可能再準時了）", () => {
    const today = AFTER(20);
    const r = classifyOtd(order("P4", ""), today);
    expect(r?.outcome).toBe("late_undelivered");
    expect(r?.lateDays).toBe(20);  // 承諾日到今天的天數
  });

  it("未交付、區間還沒過 → 不可判定，不能當成準時也不能當成逾期", () => {
    const r = classifyOtd(order("P5", ""), AFTER(-3));
    expect(r?.outcome).toBe("pending");
    expect(r?.lateDays).toBe(0);
  });

  it("沒有生產週 → 整筆排除，不猜也不當成準時", () => {
    expect(classifyOtd({ ...order("P6", AFTER(-1)), weekKey: "" }, "2026-11-10")).toBeNull();
  });

  it("壞日期不丟錯", () => {
    expect(classifyOtd({ ...order("P7", AFTER(-1)), weekKey: "bad" }, "2026-11-10")).toBeNull();
    expect(classifyOtd(order("P8", "bad"), "2026-11-10")).toBeNull();
  });
});

describe("buildOtdByWeek — 按週聚合", () => {
  it("重現真實的偏誤：同一批資料，正確算法給 33% 不是 45%", () => {
    // 15 筆：5 準時、6 已交付但晚、4 未交付且已超期
    const orders: OtdOrder[] = [
      ...Array.from({ length: 5 }, (_, i) => order(`ok${i}`, AFTER(-1))),
      ...Array.from({ length: 6 }, (_, i) => order(`late${i}`, AFTER(4))),
      ...Array.from({ length: 4 }, (_, i) => order(`stuck${i}`, "")),
    ];
    const [w] = buildOtdByWeek(orders, AFTER(20));

    expect(w.onTime).toBe(5);
    expect(w.late).toBe(6);
    expect(w.lateUndelivered).toBe(4);
    expect(w.judged).toBe(15);           // ← 分母含那 4 筆
    expect(w.rate).toBe(33);             // 5/15，不是 5/11=45%
    expect(w.complete).toBe(true);
  });

  it("還在進行中的週：rate 為 null 而不是 100%", () => {
    const orders = [order("a", AFTER(-1)), order("b", ""), order("c", "")];
    const [w] = buildOtdByWeek(orders, AFTER(-3)); // 區間還沒過

    expect(w.pending).toBe(2);
    expect(w.judged).toBe(1);
    expect(w.complete).toBe(false);      // ← 不適合拿來看趨勢
  });

  it("完全沒有可判定的單：rate 是 null，不可當 0% 也不可當 100%", () => {
    const [w] = buildOtdByWeek([order("a", ""), order("b", "")], AFTER(-3));
    expect(w.rate).toBeNull();
    expect(w.judged).toBe(0);
  });

  it("已取消的單不列入——取消不是交期問題", () => {
    const orders = [order("a", AFTER(-1)), order("b", AFTER(17), "cancelled")];
    const [w] = buildOtdByWeek(orders, AFTER(20));
    expect(w.items).toHaveLength(1);
    expect(w.rate).toBe(100);
  });

  it("多週要依週一升冪排序，且週一推算正確", () => {
    const weeks = buildOtdByWeek(
      [
        { ...order("a", AFTER(-1)), weekKey: "2026-10-12" },
        { ...order("b", AFTER(6)), weekKey: "2026-10-19" },
        { ...order("c", AFTER(13)), weekKey: "2026-10-26" },
      ],
      AFTER(30),
    );
    expect(weeks.map((w) => w.weekMonday)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(weeks[0].promisedEnd).toBe(PROMISED);
  });

  it("同一生產週的不同日期要歸成同一組（整週共用承諾區間）", () => {
    const weeks = buildOtdByWeek(
      [
        { ...order("a", AFTER(-1)), weekKey: "2026-10-12" }, // 週一
        { ...order("b", AFTER(-1)), weekKey: "2026-10-15" }, // 同週週四
        { ...order("c", AFTER(-1)), weekKey: "2026-10-18" }, // 同週週日
      ],
      AFTER(20),
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0].items).toHaveLength(3);
  });

  it("逾期最多的排在最前面（根因訪談的對象）", () => {
    const [w] = buildOtdByWeek(
      [order("small", AFTER(1)), order("big", AFTER(17)), order("ok", AFTER(-1))],
      AFTER(20),
    );
    expect(w.items[0].orderNumber).toBe("big");
    expect(w.items[0].lateDays).toBe(17);
  });
});
