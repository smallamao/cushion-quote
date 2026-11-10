import type { PreferredSlot } from "@/lib/material-confirm-types";

/**
 * 「準備製作前・最後確認」給客人的訊息。
 *
 * 🔴 文案沿用老闆現行版本（2026-11-08 提供），只插入「您預登記的收件時段」一段。
 *    原文本來就寫「將依預登記時段優先配送」，但客人看不到那是指哪幾天——
 *    列出來之後那句才有所指。其餘字句請勿改寫，那是業務在用的措辭。
 *
 * 這通訊息不能省略：客人不會主動說要延期，只有被問才說（老闆 2026-11-08）。
 * 系統代替不了「問」，但可以記住問過誰、誰還沒回。
 */
export interface FinalConfirmOptions {
  customerName: string;
  slots: PreferredSlot[];
  /** 「11/9(一)」這種格式，由呼叫端提供，與看板顯示共用同一支 */
  fmtDate: (ymd: string) => string;
}

/** 三字以上去姓（陳羿蓉→羿蓉）；兩字保留，免得「王菲」被削成「菲」。 */
export function givenName(full: string): string {
  const t = (full ?? "").trim();
  return t.length >= 3 ? t.slice(1) : t;
}

/**
 * 給「LINE 批次傳送」擴充功能（v3.13.0 起）用的訊息範本：
 * 跟 buildFinalConfirmMessage 同一套字句，只把姓名、時段換成 {{姓名}}、{{時段}}。
 * 擴充功能把每列「時段:A｜B｜C」排成「　1. A」三行，代進 {{時段}}。
 */
export function buildFinalConfirmTemplate(): string {
  return finalConfirmLines("{{姓名}}", ["{{時段}}"]).join("\n");
}

/** 批次清單的一列：「P6332 宜庭 時段:11/19(四) 上午 10:00-12:00｜11/20(五) …」 */
export function finalConfirmBatchLine(
  orderNumber: string,
  customerName: string,
  slots: PreferredSlot[],
  fmtDate: (ymd: string) => string,
): string {
  const slotText = slots.map((s) => `${fmtDate(s.date)} ${s.period}`).join("｜");
  return `${orderNumber} ${givenName(customerName)} 時段:${slotText}`;
}

function finalConfirmLines(name: string, slotLines: string[]): string[] {
  return [
    "【準備製作前・最後確認】",
    "",
    `${name} 您好 👋`,
    "上游材料（木架、泡棉）準備陸續進廠",
    "廠內作業尚未開始製作",
    "",
    ...(slotLines.length > 0
      ? ["您預登記的收件時段：", ...slotLines, ""]
      : []),
    "請確認是否能如期進沙發：",
    "",
    "若可如期，將依預登記時段優先配送",
    "若裝潢延誤或無法進場，請立即告知",
    "我們會協助調整排程，避免成品放置過久 🙇‍♂️",
  ];
}

export function buildFinalConfirmMessage({
  customerName,
  slots,
  fmtDate,
}: FinalConfirmOptions): string {
  const lines = slots.map((s, i) => `　${i + 1}. ${fmtDate(s.date)} ${s.period}`);
  return finalConfirmLines(givenName(customerName), lines).join("\n");
}
