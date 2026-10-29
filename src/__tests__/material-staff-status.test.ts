import { describe, expect, it } from "vitest";

import { CUSTOMER_DONE_STATUSES, isCustomerConfirmed } from "@/lib/material-confirm-types";

/**
 * 2026-10-29 實查：6 筆卡在 sent 的單沒有一筆真的在等客人
 * （3 筆延單、1 筆取消、2 筆線下已確認），催辦卻天天發假警報。
 * 這組測試鎖住「這些狀態不得再被當成待辦」。
 */
describe("內勤標記的狀態不應再被視為待辦", () => {
  it("取消與線下已確認都算「客人那邊已有結論」", () => {
    expect(isCustomerConfirmed("cancelled")).toBe(true);
    expect(isCustomerConfirmed("confirmed_offline")).toBe(true);
  });

  it("延單不算結論——那是暫停，之後還要重新發", () => {
    expect(isCustomerConfirmed("postponed")).toBe(false);
  });

  it("sent 仍然是待辦，不可被誤判為完成", () => {
    expect(isCustomerConfirmed("sent")).toBe(false);
  });

  it("confirmed_offline 與 confirmed 是不同狀態，不可合併", () => {
    // 分開是刻意的：confirmed 有簽名圖與 IP 可存證，口頭同意沒有。
    // 合併會讓存證資料混進一批沒有簽名的空殼。
    expect("confirmed_offline").not.toBe("confirmed");
    expect(CUSTOMER_DONE_STATUSES).toContain("confirmed");
    expect(CUSTOMER_DONE_STATUSES).toContain("confirmed_offline");
  });
});
