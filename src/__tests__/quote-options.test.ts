import { describe, expect, it } from "vitest";

import {
  deriveOptionLabels,
  deriveOptionMeta,
  displayAmountOf,
  isAddonLine,
} from "@/lib/quote-options";

const line = (itemName: string, lineAmount: number, extra: Record<string, unknown> = {}) => ({
  itemName,
  lineAmount,
  spec: "",
  isCostItem: false,
  showOnQuote: true,
  ...extra,
});

describe("deriveOptionMeta", () => {
  it("單一方案：不是多方案，最低方案＝該行金額", () => {
    const meta = deriveOptionMeta([line("訂製臥榻墊 W114 x 92", 13600)]);
    expect(meta).toEqual({ isMultiOption: false, optionMinAmount: 13600 });
  });

  it("同品名兩檔（標準／高支撐）：多方案，最低方案取低的那檔", () => {
    const meta = deriveOptionMeta([
      line("訂製坐背墊\n\n坐墊 …(標準)", 29800),
      line("訂製坐背墊\n\n坐墊 …(高支撐)", 32300),
    ]);
    expect(meta).toEqual({ isMultiOption: true, optionMinAmount: 29800 });
  });

  it("兩檔＋乳膠加價選項：加價選項不計入最低方案", () => {
    const meta = deriveOptionMeta([
      line("訂製坐背墊\n\n坐墊 …", 29800),
      line("訂製坐背墊\n\n坐墊 …", 32300),
      line("升級 5cm 天然乳膠＋爆破泡棉（坐墊二只）", 5500, { spec: "加價選項，可與上方任一檔搭配" }),
    ]);
    expect(meta).toEqual({ isMultiOption: true, optionMinAmount: 29800 });
  });

  it("單一方案＋加價選項：仍算多方案（合計會失真），最低方案＝主品項", () => {
    const meta = deriveOptionMeta([
      line("訂製臥榻墊 W201 x 109", 12600),
      line("升級 5cm 天然乳膠+爆破泡棉", 4000),
    ]);
    expect(meta).toEqual({ isMultiOption: true, optionMinAmount: 12600 });
  });

  it("兩組品項各自兩檔：最低方案＝各組最低相加", () => {
    const meta = deriveOptionMeta([
      line("坐墊", 10000), line("坐墊", 12000),
      line("背墊", 5000), line("背墊", 6000),
    ]);
    expect(meta).toEqual({ isMultiOption: true, optionMinAmount: 15000 });
  });

  it("工本費與不顯示在報價單的行不參與判定", () => {
    const meta = deriveOptionMeta([
      line("訂製坐墊", 9600),
      line("訂製坐墊", 500, { isCostItem: true }),
      line("訂製坐墊", 700, { showOnQuote: false }),
    ]);
    expect(meta).toEqual({ isMultiOption: false, optionMinAmount: 9600 });
  });

  it("isAddonLine 抓得到 升級／加價選項／加購", () => {
    expect(isAddonLine({ itemName: "升級 乳膠" })).toBe(true);
    expect(isAddonLine({ itemName: "泡棉", spec: "加價選項" })).toBe(true);
    expect(isAddonLine({ itemName: "訂製臥榻墊" })).toBe(false);
  });
});

describe("displayAmountOf", () => {
  it("多方案顯示最低方案；否則顯示總額", () => {
    expect(displayAmountOf({ totalAmount: 67600, isMultiOption: true, optionMinAmount: 29800 })).toBe(29800);
    expect(displayAmountOf({ totalAmount: 15600, isMultiOption: false, optionMinAmount: 15600 })).toBe(15600);
    expect(displayAmountOf({ totalAmount: 15600 })).toBe(15600);
  });
});

describe("deriveOptionLabels", () => {
  it("單一品項：不標方案（沿用數字項次）", () => {
    expect(deriveOptionLabels([line("訂製臥榻墊 W114 x 92", 13600)])).toEqual([null]);
  });

  it("同品名兩檔：標方案一／方案二", () => {
    expect(
      deriveOptionLabels([
        line("訂製坐背墊\n\n坐墊 …(標準)", 20000),
        line("訂製坐背墊\n\n坐墊 …(高支撐)", 21500),
      ]),
    ).toEqual(["方案一", "方案二"]);
  });

  it("加價選項標「加購」，不佔方案編號", () => {
    expect(
      deriveOptionLabels([
        line("訂製臥榻墊", 10800),
        line("訂製臥榻墊", 12100),
        line("升級 5cm 天然乳膠", 5000),
      ]),
    ).toEqual(["方案一", "方案二", "加購"]);
  });

  it("不同品項各自成組：都不標方案", () => {
    expect(
      deriveOptionLabels([line("訂製坐背墊", 12300), line("單人座布套換新", 4800)]),
    ).toEqual([null, null]);
  });

  it("兩組各兩檔：各組獨立編號", () => {
    expect(
      deriveOptionLabels([
        line("訂製坐墊", 10000),
        line("訂製坐墊", 12000),
        line("訂製背墊", 3000),
        line("訂製背墊", 3500),
      ]),
    ).toEqual(["方案一", "方案二", "方案一", "方案二"]);
  });

  it("同組各檔穿插排列時，編號仍照出現順序給", () => {
    expect(
      deriveOptionLabels([
        line("訂製坐墊", 10000),
        line("訂製背墊", 3000),
        line("訂製坐墊", 12000),
        line("訂製背墊", 3500),
      ]),
    ).toEqual(["方案一", "方案一", "方案二", "方案二"]);
  });

  it("工本費與不顯示的行不標籤", () => {
    expect(
      deriveOptionLabels([
        line("訂製坐背墊", 20000),
        line("訂製坐背墊", 21500),
        line("運費墊付", 1000, { isCostItem: true }),
        line("內部備料", 500, { showOnQuote: false }),
      ]),
    ).toEqual(["方案一", "方案二", null, null]);
  });

  it("三檔：方案一二三", () => {
    expect(
      deriveOptionLabels([line("摺疊墊", 7800), line("摺疊墊", 16500), line("摺疊墊", 19000)]),
    ).toEqual(["方案一", "方案二", "方案三"]);
  });
});
