import { describe, expect, it } from "vitest";

import { DEFAULT_TERMS } from "@/lib/constants";
import { applyTaxModeToTerms } from "@/lib/quote-terms";

describe("applyTaxModeToTerms", () => {
  it("未稅：移除逾期罰則、稅金改未含、重新編號為 1-4", () => {
    const out = applyTaxModeToTerms(DEFAULT_TERMS, false);
    expect(out).not.toContain("逾期罰則");
    expect(out).toContain("本報價未含營業稅金");
    expect(out).not.toContain("已含營業稅金");
    const lines = out.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => l.match(/^\d+/)?.[0])).toEqual(["1", "2", "3", "4"]);
    expect(lines[3]).toMatch(/^4\.\s*本報價未含營業稅金$/);
  });

  it("含稅：只把稅金行改回已含，不還原逾期罰則、其他行保留", () => {
    const untaxed = applyTaxModeToTerms(DEFAULT_TERMS, false);
    const retaxed = applyTaxModeToTerms(untaxed, true);
    expect(retaxed).toContain("本報價已含營業稅金");
    expect(retaxed).not.toContain("逾期罰則");
    expect(retaxed).toContain("付款方式：匯款");
    expect(retaxed.split("\n")).toHaveLength(4);
  });

  it("含稅：稅金行 未含→已含（原地置換、保留序號分隔）", () => {
    expect(applyTaxModeToTerms("5. 本報價未含營業稅金", true)).toBe("5. 本報價已含營業稅金");
  });

  it("未稅：保留手動編輯的其他條款文字、序號重排", () => {
    const terms = [
      "1. 付款方式：現金",
      "2. 履約期限：機關簽約後30天",
      "3. 逾期罰則：本案逾期每日千分之一，上限20%。",
      "4. 本報價已含營業稅金",
    ].join("\n");
    const out = applyTaxModeToTerms(terms, false);
    const lines = out.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^1\.\s*付款方式：現金$/);
    expect(lines[1]).toMatch(/^2\.\s*履約期限：機關簽約後30天$/);
    expect(lines[2]).toMatch(/^3\.\s*本報價未含營業稅金$/);
  });

  it("未稅：沒有逾期罰則行也正常（只改稅金、重排序號）", () => {
    const out = applyTaxModeToTerms("1. 付款方式：匯款\n2. 本報價已含營業稅金", false);
    expect(out).toMatch(/^1\.\s*付款方式：匯款\n2\.\s*本報價未含營業稅金$/);
  });
});
