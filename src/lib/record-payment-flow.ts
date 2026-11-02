// 記錄收款對話框的流程狀態（放在頁面層，不放在對話框裡）：
// 存檔後會重新載入應收資料，對話框就算被重新掛載，也不能回到可再送出的表單，
// 否則老闆會看不到客戶回覆聯、還可能把同一筆收款記兩次。

import type { ARScheduleRecord } from "@/lib/types";

export type RecordPaymentPhase = "closed" | "editing" | "saving" | "saved";

export interface RecordPaymentFlowState {
  phase: RecordPaymentPhase;
  target: ARScheduleRecord | null;
  /** 存檔成功後要傳給客人的客戶回覆聯 */
  replyText: string | null;
}

export type RecordPaymentFlowAction =
  | { type: "open"; target: ARScheduleRecord }
  | { type: "submit" }
  | { type: "saved"; replyText: string }
  | { type: "failed" }
  | { type: "close" };

export const INITIAL_RECORD_PAYMENT_FLOW: RecordPaymentFlowState = {
  phase: "closed",
  target: null,
  replyText: null,
};

export function recordPaymentFlowReducer(
  state: RecordPaymentFlowState,
  action: RecordPaymentFlowAction,
): RecordPaymentFlowState {
  switch (action.type) {
    case "open":
      // 正在存檔時不能換目標
      if (state.phase === "saving") return state;
      return { phase: "editing", target: action.target, replyText: null };
    case "submit":
      // 只有編輯中才能送出：存檔中、已存檔都擋掉，避免重複記錄
      if (state.phase !== "editing") return state;
      return { ...state, phase: "saving" };
    case "saved":
      if (state.phase !== "saving") return state;
      return { ...state, phase: "saved", replyText: action.replyText };
    case "failed":
      if (state.phase !== "saving") return state;
      return { ...state, phase: "editing" };
    case "close":
      // 存檔中不允許關閉，等結果回來
      if (state.phase === "saving") return state;
      return INITIAL_RECORD_PAYMENT_FLOW;
  }
}

export function canSubmitPayment(state: RecordPaymentFlowState): boolean {
  return state.phase === "editing";
}
