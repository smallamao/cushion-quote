import { describe, expect, it } from "vitest";

import { buildFinalConfirmMessage, givenName } from "@/lib/final-confirm-message";
import type { PreferredSlot } from "@/lib/material-confirm-types";

const fmt = (y: string) => y.slice(5).replace("-", "/");
const slots = [
  { date: "2026-11-09", period: "上午 10:00-12:00" },
  { date: "2026-11-09", period: "下午 15:00-17:00" },
] as PreferredSlot[];

describe("givenName", () => {
  it("三字以上去姓", () => {
    expect(givenName("陳羿蓉")).toBe("羿蓉");
    expect(givenName("何秉謙")).toBe("秉謙");
  });
  it("兩字保留完整——削成單字會很奇怪", () => {
    expect(givenName("王菲")).toBe("王菲");
  });
  it("空值不炸", () => {
    expect(givenName("")).toBe("");
  });
});

describe("buildFinalConfirmMessage", () => {
  it("保留老闆原本的文案字句", () => {
    const m = buildFinalConfirmMessage({ orderNumber: "P6332", customerName: "何秉謙", slots, fmtDate: fmt });
    expect(m).toContain("【準備製作前・最後確認】");
    expect(m).toContain("上游材料（木架、泡棉）準備陸續進廠");
    expect(m).toContain("若可如期，將依預登記時段優先配送");
    expect(m).toContain("我們會協助調整排程，避免成品放置過久 🙇‍♂️");
  });

  it("插入預登記時段，讓原文那句「依預登記時段」有所指", () => {
    const m = buildFinalConfirmMessage({ orderNumber: "P6332", customerName: "何秉謙", slots, fmtDate: fmt });
    expect(m).toContain("您預登記的收件時段：");
    expect(m).toContain("1. 11/09 上午 10:00-12:00");
    expect(m).toContain("2. 11/09 下午 15:00-17:00");
  });

  it("稱呼用單號（不放姓名）", () => {
    const m = buildFinalConfirmMessage({ orderNumber: "P6332", customerName: "何秉謙", slots, fmtDate: fmt });
    // 2026-11-10 老闆：開頭改用單號打招呼，不放姓名
    expect(m).toContain("P6332 您好 👋");
    expect(m).not.toContain("秉謙");
  });

  it("沒有時段時不要留下空的標題", () => {
    const m = buildFinalConfirmMessage({ orderNumber: "P6332", customerName: "王小明", slots: [], fmtDate: fmt });
    expect(m).not.toContain("您預登記的收件時段");
    expect(m).toContain("請確認是否能如期進沙發");
  });
});
