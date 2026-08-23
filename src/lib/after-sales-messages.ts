import { WEEKDAY_ZH } from "@/lib/trello-helpers";
import type { AfterSalesService } from "@/lib/types";

/**
 * 售後服務的客戶通知訊息。
 * 依問題分類選版型：到府清潔 → 清潔通知（沿用排程出貨頁的既有文案與聯絡人）；
 * 其他 → 一般售後服務通知。scheduledDate 只有日期，時段留空由操作者在
 * 可編輯視窗補上後複製。
 */
export function buildAfterSalesNotifyMessage(s: AfterSalesService): { title: string; text: string } {
  const isCleaning =
    (s.issueCategories ?? []).includes("到府清潔") || s.issueDescription.includes("清潔");

  let dateLine = "日期：（請填日期）";
  if (s.scheduledDate) {
    const d = new Date(`${s.scheduledDate}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      dateLine = `日期：${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY_ZH[d.getDay()]}）`;
    }
  }

  const timeLine = (s.scheduledTime ?? "").trim() || "（請填時段）";

  if (isCleaning) {
    return {
      title: "到府清潔通知",
      text: `【馬鈴薯沙發 到府清潔通知】

您好，已為您安排好資訊如下

${dateLine}
時間：${timeLine}

沙發醫護師：Barry 佳莉
電話：0913-605-107

⚠️如需更動煩請儘速通知我們協助調度
⚠️受限於交通狀況，易產生延遲狀況，當日可直接與醫護師聯繫喔！`,
    };
  }

  const item = (s.issueDescription.split("\n")[0] || s.modelNameSnapshot || "").trim();
  return {
    title: "售後服務通知",
    text: `【馬鈴薯沙發 售後服務通知】

您好，已為您安排好服務資訊如下

${dateLine}
時間：${timeLine}
${item ? `\n服務項目：${item}\n` : ""}
⚠️如需更動煩請儘速通知我們協助調度
⚠️受限於交通狀況，易產生延遲狀況，煩請依照師傅實際聯絡情況！`,
  };
}
