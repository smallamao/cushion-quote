import type { PreferredSlot } from "@/lib/material-confirm-types";

/**
 * 客人確認叫料內容後，回給他的「已收到＋這只是預選」訊息。
 *
 * 🔴 為什麼需要（老闆 2026-10-29）：客人把自己選的三組當成已經約好的配送日，
 *    但那只是排車參考，實際可能媒合到第 2 或第 3 組。確認成功頁有寫，
 *    可是客人關掉就沒了；留在 LINE 對話裡的訊息才是日後講得清楚的依據。
 *    司機三選一的流程當時尚未上線，更不能讓客人以為已經排定。
 *
 * 抽成純函式是為了可測試——這是對外文案，不該只存在於元件裡改到沒人發現。
 */
export interface MaterialAckOptions {
  slots: PreferredSlot[];
  /** 「10/30(五)」這種格式，由呼叫端提供，與看板顯示共用同一支格式化函式 */
  fmtDate: (ymd: string) => string;
}

export function buildMaterialAckMessage({ slots, fmtDate }: MaterialAckOptions): string {
  const lines = slots.map((s, i) => `${i + 1}. ${fmtDate(s.date)} ${s.period}`).join("\n");
  return [
    "【馬鈴薯沙發】收到您的確認，謝謝😊",
    "",
    slots.length > 0
      ? `您提供的希望時段我們收到了：\n${lines}`
      : "您表示時間可以配合，由我們安排。",
    "",
    "⚠️ 這是「預選時段」，不是確定的配送日。",
    "我們會依製作進度與配送路線安排，有可能排到第 2 或第 3 組，確定之後會再通知您。",
    "",
    "🔺 在收到我們的配送確認之前，請先不要安排搬家、裝潢或其他需要配合的事項。",
  ].join("\n");
}
