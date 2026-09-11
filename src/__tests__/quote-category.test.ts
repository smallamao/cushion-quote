import { describe, expect, it } from "vitest";

import { classifyQuoteCategory } from "@/lib/quote-category";

describe("classifyQuoteCategory", () => {
  it("泡棉更換優先於坐墊字樣", () => {
    expect(classifyQuoteCategory("坐墊泡棉更換")).toBe("更換泡棉");
    expect(classifyQuoteCategory("沙發泡棉更換")).toBe("更換泡棉");
    expect(classifyQuoteCategory("追加：泡棉內裡 W88 × 80 × 15cm")).toBe("更換泡棉");
  });

  it("床頭案件歸床頭繃布，不被布套字樣搶走", () => {
    expect(classifyQuoteCategory("床頭靠墊外罩套訂製")).toBe("床頭繃布");
  });

  it("維修字樣（換皮、彈簧、翻新）歸維修", () => {
    expect(classifyQuoteCategory("沙發坐面維修")).toBe("維修");
    expect(classifyQuoteCategory("高背餐椅全包覆換皮")).toBe("維修");
    expect(classifyQuoteCategory("沙發 整組維修換皮")).toBe("維修");
  });

  it("布套類歸訂製皮布套", () => {
    expect(classifyQuoteCategory("訂製外布套")).toBe("訂製皮布套");
    expect(classifyQuoteCategory("單人座布套換新")).toBe("訂製皮布套");
  });

  it("坐背墊歸訂製坐背墊", () => {
    expect(classifyQuoteCategory("訂製坐背墊")).toBe("訂製坐背墊");
    expect(classifyQuoteCategory("三人座訂製坐墊＋加高背墊")).toBe("訂製坐背墊");
  });

  it("臥榻、臥鋪、卡座、單純坐墊歸訂製臥榻墊", () => {
    expect(classifyQuoteCategory("訂製臥榻墊")).toBe("訂製臥榻墊");
    expect(classifyQuoteCategory("訂製臥鋪床墊")).toBe("訂製臥榻墊");
    expect(classifyQuoteCategory("訂製 L 形臥榻坐墊")).toBe("訂製臥榻墊");
    expect(classifyQuoteCategory("訂製卡榫式坐墊")).toBe("訂製臥榻墊");
  });

  it("清潔保養歸到府清潔", () => {
    expect(classifyQuoteCategory("沙發到府清潔")).toBe("到府清潔");
  });

  it("新製沙發歸訂製款沙發", () => {
    expect(classifyQuoteCategory("訂製沙發 三人座")).toBe("訂製款沙發");
  });

  it("主要品項判不出來時改用備援文字", () => {
    expect(classifyQuoteCategory("折讓", "訂製臥榻墊 W213 x 60")).toBe("訂製臥榻墊");
  });

  it("完全無法判斷時回 null，不亂填", () => {
    expect(classifyQuoteCategory("卡座繃布板 樣式一")).toBeNull();
    expect(classifyQuoteCategory("")).toBeNull();
  });
});
