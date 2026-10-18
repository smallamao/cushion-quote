import { describe, expect, it } from "vitest";

import { earliestDeliveryDate } from "@/lib/material-confirm-types";

/**
 * 守門測試：客人不得選到「沙發還沒做好」的收件日。
 *
 * 真實事故 2026-10-09 P6273 陳素霞：製作起日 10/19，客人卻選到 10/09（確認當天）。
 * 原因是前端只靠 <input min>，而 min 的值在「製作區間讀不到」時會退回今天——
 * 等於完全沒擋。後端當時沒有任何日期驗證。
 */
describe("earliestDeliveryDate：最快可收件日", () => {
  it("製作起日在未來 → 以製作起日為準，不是結束日", () => {
    expect(earliestDeliveryDate("2026-10-19", "2026-10-25", "2026-10-09")).toBe("2026-10-19");
  });

  it("製作起日已過 → 以今天為準，不給選過去", () => {
    expect(earliestDeliveryDate("2026-10-19", "2026-10-25", "2026-10-22")).toBe("2026-10-22");
  });

  it("🔴 破口存證：製作區間完全讀不到時會退回今天", () => {
    // 這正是 P6273 的情境——回傳今天，於是客人選到了確認當天。
    // 前端擋不住，所以後端 POST 必須自己重抓製作區間再驗一次。
    expect(earliestDeliveryDate("", "", "2026-10-09")).toBe("2026-10-09");
  });

  it("只有預計出貨日、沒有製作起日 → 退而求其次用出貨日", () => {
    expect(earliestDeliveryDate("", "2026-10-25", "2026-10-09")).toBe("2026-10-25");
  });

  it("P6273 情境重現：若當時讀得到製作起日，10/09 就會被判定過早", () => {
    const minAllowed = earliestDeliveryDate("2026-10-19", "2026-10-23", "2026-10-09");
    expect(minAllowed).toBe("2026-10-19");
    expect("2026-10-09" < minAllowed).toBe(true); // ← 後端據此退回
  });
});
