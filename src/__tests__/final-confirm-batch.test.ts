import { describe, expect, it } from "vitest";
import {
  buildFinalConfirmMessage,
  buildFinalConfirmTemplate,
  finalConfirmBatchLine,
} from "@/lib/final-confirm-message";

const fmt = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${"日一二三四五六"[d.getUTCDay()]})`;
};
const slots = [
  { date: "2026-11-19", period: "上午 10:00-12:00" },
  { date: "2026-11-20", period: "上午 10:00-12:00" },
  { date: "2026-11-21", period: "上午 10:00-12:00" },
] as never;

// 擴充功能 v3.13.0 的代換規則（與 line-batch-sender/content.js 相同）：時段以「｜」分隔，每組一行「　n. …」
function extRender(line: string, tpl: string): string {
  const m = line.match(/時段[:：]\s*(.+)$/)!;
  const head = line.slice(0, m.index).trim();
  const name = head.replace(/P\d{4,}/i, "").trim();
  const slotLines = m[1].split(/[｜|]/).map((x) => x.trim()).filter(Boolean).map((x, i) => `　${i + 1}. ${x}`).join("\n");
  return tpl.replace("{{姓名}}", name).replace("{{時段}}", slotLines);
}

describe("準備製作前・最後確認：批次清單＋範本", () => {
  it("清單一列一筆：編號 名字 時段:A｜B｜C", () => {
    expect(finalConfirmBatchLine("P6332", "蔡宜庭", slots, fmt)).toBe(
      "P6332 宜庭 時段:11/19(四) 上午 10:00-12:00｜11/20(五) 上午 10:00-12:00｜11/21(六) 上午 10:00-12:00",
    );
  });

  it("範本經擴充功能代換後，跟單筆訊息一字不差", () => {
    const line = finalConfirmBatchLine("P6332", "蔡宜庭", slots, fmt);
    const single = buildFinalConfirmMessage({ customerName: "蔡宜庭", slots, fmtDate: fmt });
    expect(extRender(line, buildFinalConfirmTemplate())).toBe(single);
  });

  it("範本含兩個變數", () => {
    const t = buildFinalConfirmTemplate();
    expect(t).toContain("{{姓名}} 您好 👋");
    expect(t).toContain("您預登記的收件時段：\n{{時段}}\n");
  });
});
