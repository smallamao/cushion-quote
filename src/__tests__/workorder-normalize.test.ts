import { describe, expect, it } from "vitest";

import {
  cleanOrderTitle,
  foamShorthand,
  normalizeInchToCm,
  stripQuoteConditions,
} from "@/lib/workorder-normalize";

/** 測資全部取自 2026-11-14 抽樣的 15 張實際訂單 */

describe("stripQuoteConditions", () => {
  it("刪掉報價條件", () => {
    const kept = stripQuoteConditions(
      [
        "報價不含營業稅",
        "外布套車拉鍊可拆洗，單面布料、底面拼接透氣天鵝絨布",
        "已含士林區送達；舊坐墊與舊背墊由我們優惠回收載走，不另收清運費",
        "本報價以最接近的 3 英吋（約 7.6cm）製作",
        "前側兩角依扶手立柱裁凹角，尺寸以現場實版為準",
      ].join("\n"),
    );
    expect(kept).toEqual([
      "外布套車拉鍊可拆洗，單面布料、底面拼接透氣天鵝絨布",
      "前側兩角依扶手立柱裁凹角，尺寸以現場實版為準",
    ]);
  });

  it("B2B 的那幾種條款也要刪", () => {
    expect(
      stripQuoteConditions(
        [
          "本報價另計 5% 營業稅",
          "面料 GC71606（牌價 $1,000 級距）；面料由本公司供應",
          "木作底板由貴司提供，本報價僅含坐墊製作",
          "含成品送至案場（單程一趟）；貴司自行取件可免",
          "整片不分割，底面整片止滑布",
        ].join("\n"),
      ),
    ).toEqual(["整片不分割，底面整片止滑布"]);
  });

  it("🔴 工法說明一行都不能誤刪", () => {
    const craft = [
      "外布套車拉鍊可拆洗",
      "泡棉包內裏布套(無拉鍊)",
      "單面布料、底面拼接透氣天鵝絨布",
      "底部附黏貼式魔鬼氈固定帶",
      "背墊現場版型，後側削薄 3cm",
      "坐墊後車綁帶",
      "前緣兩側手邊有缺角W2 x D6cm",
      "坐墊為 5 英寸高支撐高密度泡棉；背墊為上薄下厚的弧形楔墊",
    ];
    expect(stripQuoteConditions(craft.join("\n"))).toEqual(craft);
  });

  it("空白行不會變成空備註", () => {
    expect(stripQuoteConditions("\n  \n報價不含營業稅\n")).toEqual([]);
  });
});

describe("normalizeInchToCm", () => {
  it.each([
    ["3 英吋", "8cm"],
    ["貼合 3'' 硬Q料", "貼合 8cm 硬Q料"],
    ["W197 × D82 × 7.6cm", "W197 × D82 × 8cm"],
    ["12.7cm", "13cm"],
    ["10.16公分", "10公分"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeInchToCm(input)).toBe(expected);
  });

  it("🔴 實測尺寸不可以被四捨五入——43.5 是量出來的", () => {
    expect(normalizeInchToCm("W173 x 43.5 x 8cm")).toBe("W173 x 43.5 x 8cm");
    expect(normalizeInchToCm("W77.5 x D35 x 8cm")).toBe("W77.5 x D35 x 8cm");
  });

  it("區間寫法不動", () => {
    expect(normalizeInchToCm("W114 x D56 x 8-10cm")).toBe("W114 x D56 x 8-10cm");
    expect(normalizeInchToCm("12~20cm")).toBe("12~20cm");
  });

  it("對不上換算表的英吋數原樣保留，不要亂算", () => {
    expect(normalizeInchToCm("7 英吋")).toBe("7 英吋");
  });
});

describe("foamShorthand", () => {
  it.each([
    ["高支撐高密度泡棉；40 ~ 50 kg/m³", "(HRH 硬Q料)"],
    ["貼合 3 英吋 高密度泡棉", "(貼合 3'' 一般硬Q料)"],
    ["標準高密度泡棉 30 kg/m³", "(一般硬Q料)"],
    ["背墊 中密度泡棉", "(靠背軟料)"],
  ])("%s → %s", (input, expected) => {
    expect(foamShorthand(input)).toBe(expected);
  });

  it("🔴 看不懂的原樣保留——翻錯會讓師傅做錯料", () => {
    expect(foamShorthand("SC5760")).toBe("SC5760");
    expect(foamShorthand("原泡棉沿用")).toBe("原泡棉沿用");
    expect(foamShorthand("")).toBe("");
  });
});

describe("cleanOrderTitle", () => {
  it.each([
    ["禾雅窗飾｜玄關櫃坐墊", "玄關櫃坐墊"],
    ["臥榻坐背墊 工作室＋書房（現場丈量前概算）", "臥榻坐背墊 工作室＋書房"],
    ["柚木沙發 訂製坐背墊 四件組", "柚木沙發 訂製坐背墊"],
  ])("%s → %s", (input, expected) => {
    expect(cleanOrderTitle(input)).toBe(expected);
  });

  it("🔴 方案名稱整個丟掉——那是報價的東西，工單上看不出要做什麼", () => {
    expect(cleanOrderTitle("確認方案（高支撐泡棉）")).toBe("");
    expect(cleanOrderTitle("方案二")).toBe("");
  });

  it("本來就乾淨的不要動", () => {
    expect(cleanOrderTitle("訂製坐背墊")).toBe("訂製坐背墊");
    expect(cleanOrderTitle("國泰國小 水池櫃體坐墊")).toBe("國泰國小 水池櫃體坐墊");
  });

  it("空值安全", () => {
    expect(cleanOrderTitle(null)).toBe("");
    expect(cleanOrderTitle("  ")).toBe("");
  });
});
