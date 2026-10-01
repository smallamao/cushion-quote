import { describe, it, expect } from "vitest";

import { parseFaq } from "@/lib/sign-faq";
import { DEFAULT_SETTINGS } from "@/lib/constants";

describe("sign-faq 解析", () => {
  it("用 --- 分隔，第一行是問題、其餘是答案", () => {
    const out = parseFaq("可以改嗎？\n可以。\n---\n多久？\n約兩週。");
    expect(out).toEqual([
      { q: "可以改嗎？", a: "可以。" },
      { q: "多久？", a: "約兩週。" },
    ]);
  });

  it("答案可以多行", () => {
    const out = parseFaq("付款？\n訂金一半。\n尾款出貨前付。");
    expect(out).toHaveLength(1);
    expect(out[0].a).toBe("訂金一半。\n尾款出貨前付。");
  });

  it("只有問題沒有答案的那則不顯示（避免客人看到半截文案）", () => {
    const out = parseFaq("只有問題？\n---\n正常題\n正常答");
    expect(out).toEqual([{ q: "正常題", a: "正常答" }]);
  });

  it("空字串 / undefined 回空陣列（簽署頁就不顯示常見問題）", () => {
    expect(parseFaq("")).toEqual([]);
    expect(parseFaq(undefined)).toEqual([]);
    expect(parseFaq("   \n  \n")).toEqual([]);
  });

  it("分隔線容許前後空白與三個以上的連字號", () => {
    const out = parseFaq("A\na1\n  ----  \nB\nb1");
    expect(out.map((x) => x.q)).toEqual(["A", "B"]);
  });

  it("答案中的「---」若非獨立一行，不會被當成分隔線", () => {
    const out = parseFaq("尺寸？\n寬 100 --- 120 公分都可以");
    expect(out).toHaveLength(1);
    expect(out[0].a).toBe("寬 100 --- 120 公分都可以");
  });

  it("預設文案本身可被正確解析（5 則，皆有問有答）", () => {
    const out = parseFaq(DEFAULT_SETTINGS.signFaq);
    expect(out).toHaveLength(5);
    for (const item of out) {
      expect(item.q.length).toBeGreaterThan(0);
      expect(item.a.length).toBeGreaterThan(0);
    }
    expect(out[0].q).toContain("還可以改");
  });
});
