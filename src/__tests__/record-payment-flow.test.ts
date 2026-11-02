import { describe, expect, it } from "vitest";

import { arScheduleRowToRecord } from "@/lib/ar-utils";
import {
  INITIAL_RECORD_PAYMENT_FLOW,
  canSubmitPayment,
  recordPaymentFlowReducer as reduce,
  type RecordPaymentFlowState,
} from "@/lib/record-payment-flow";

const schedule = arScheduleRowToRecord([
  "AR-202611-001-S01", "AR-202611-001", "1", "訂金", "50", "4600", "2026-11-02",
  "0", "", "", "pending", "0", "", "", "",
]);
const REPLY = "115/11/2 已經確認收到訂金款項 $4,600 (18173) 囉！ 非常感謝😊";

function saved(): RecordPaymentFlowState {
  let s = reduce(INITIAL_RECORD_PAYMENT_FLOW, { type: "open", target: schedule });
  s = reduce(s, { type: "submit" });
  return reduce(s, { type: "saved", replyText: REPLY });
}

describe("記錄收款流程", () => {
  it("開啟 → 送出 → 存檔：顯示回覆聯，不能再送出", () => {
    let s = reduce(INITIAL_RECORD_PAYMENT_FLOW, { type: "open", target: schedule });
    expect(canSubmitPayment(s)).toBe(true);
    s = reduce(s, { type: "submit" });
    expect(s.phase).toBe("saving");
    expect(canSubmitPayment(s)).toBe(false);
    // 存檔中再按一次：狀態不變
    expect(reduce(s, { type: "submit" })).toBe(s);
    s = reduce(s, { type: "saved", replyText: REPLY });
    expect(s.phase).toBe("saved");
    expect(s.replyText).toBe(REPLY);
    expect(canSubmitPayment(s)).toBe(false);
  });

  it("存檔後重新載入（狀態在頁面層，對話框重掛也讀同一份）：回覆聯仍在、確認收款不可再按", () => {
    const s = saved();
    // 重新載入不會送任何 action；再次 submit 也被擋
    const again = reduce(s, { type: "submit" });
    expect(again).toBe(s);
    expect(again.replyText).toBe(REPLY);
    expect(canSubmitPayment(again)).toBe(false);
  });

  it("存檔失敗回到可編輯，可以重試", () => {
    let s = reduce(INITIAL_RECORD_PAYMENT_FLOW, { type: "open", target: schedule });
    s = reduce(s, { type: "submit" });
    s = reduce(s, { type: "failed" });
    expect(s.phase).toBe("editing");
    expect(s.replyText).toBeNull();
    expect(canSubmitPayment(s)).toBe(true);
  });

  it("存檔中不能關閉或換目標；存檔後按完成才關閉", () => {
    let s = reduce(INITIAL_RECORD_PAYMENT_FLOW, { type: "open", target: schedule });
    s = reduce(s, { type: "submit" });
    expect(reduce(s, { type: "close" })).toBe(s);
    expect(reduce(s, { type: "open", target: schedule })).toBe(s);
    const closed = reduce(saved(), { type: "close" });
    expect(closed).toEqual(INITIAL_RECORD_PAYMENT_FLOW);
  });

  it("沒有在存檔中就收到 saved（過期回應）→ 忽略", () => {
    const s = reduce(INITIAL_RECORD_PAYMENT_FLOW, { type: "open", target: schedule });
    expect(reduce(s, { type: "saved", replyText: REPLY })).toBe(s);
  });
});
