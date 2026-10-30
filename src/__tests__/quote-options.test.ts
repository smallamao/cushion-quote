import { describe, expect, it } from "vitest";

import {
  deriveOptionLabels,
  deriveOptionPresentation,
  deriveOptionMeta,
  displayAmountOf,
  isAddonLine,
  multiOptionNote,
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

describe("multiOptionNote", () => {
  it("未稅：說明金額未含營業稅", () => {
    const note = multiOptionNote(false);
    expect(note).toContain("請擇一");
    expect(note).toContain("未含營業稅");
    expect(note).not.toContain("已含");
  });

  it("含稅：方案金額是未稅行金額，必須說另加稅，不能寫已含（禾雅事件）", () => {
    const note = multiOptionNote(true, 5);
    expect(note).toContain("未含營業稅");
    expect(note).toContain("5%");
    expect(note).not.toContain("已含營業稅");
  });
});

describe("deriveOptionPresentation", () => {
  const pline = (
    itemName: string,
    lineAmount: number,
    extra: Record<string, unknown> = {},
  ) => ({ itemName, lineAmount, spec: "", isCostItem: false, showOnQuote: true, qty: 1, unitPrice: lineAmount, ...extra });

  it("兩檔價差小：基準檔印絕對金額，另一檔印差額", () => {
    // CA-202610-050-Q01-V01 S1073 周業昌：泡棉更換 15,600／17,900
    const p = deriveOptionPresentation([
      pline("沙發坐墊泡棉更換\n大沙發 150 × 65cm（兩塊）", 15600),
      pline("沙發坐墊泡棉更換\n大沙發 150 × 65cm（兩塊）", 17900),
    ]);
    expect(p.rows[0]).toMatchObject({ kind: "tier", label: "方案一", useDelta: true, isBase: true, deltaAmount: 0, groupStart: true, groupSize: 2 });
    expect(p.rows[1]).toMatchObject({ kind: "tier", label: "方案二", useDelta: true, isBase: false, deltaAmount: 2300, groupStart: false });
    expect(p.hasDeltaGroup).toBe(true);
    expect(p.hasAbsoluteGroup).toBe(false);
    expect(p.canShowBaseTotal).toBe(true);
    expect(p.baseTotal).toBe(15600);
  });

  it("差額加回基準檔＝該檔的正確金額（客人若相加也得到對的數字）", () => {
    // CA-202610-013-Q01-V02 S1038 Xavier：三檔皮質 11,400／15,900／20,600
    const amounts = [11400, 15900, 20600];
    const p = deriveOptionPresentation(amounts.map((a) => pline("訂製坐背墊\n坐墊 W66 x D60", a)));
    const base = p.baseTotal;
    amounts.forEach((amount, idx) => {
      expect(base + p.rows[idx].deltaAmount).toBe(amount);
    });
    expect(p.rows.map((r) => r.label)).toEqual(["方案一", "方案二", "方案三"]);
  });

  it("價差超過 2 倍：不是升級而是不同做法，維持絕對金額", () => {
    // CA-202609-039-Q01-V01 S1008 蔡昀蓁：接縫修補 3,500／整張換皮 7,800（2.23x）
    const p = deriveOptionPresentation([
      pline("單人椅沙發 維修\n接縫爆線修補", 3500),
      pline("單人椅沙發 維修\n整張換皮", 7800),
    ]);
    expect(p.rows.every((r) => r.useDelta)).toBe(false);
    expect(p.hasDeltaGroup).toBe(false);
    expect(p.hasAbsoluteGroup).toBe(true);
    // 合計講不清楚是哪一案，不顯示
    expect(p.canShowBaseTotal).toBe(false);
    // 方案標籤照舊要有
    expect(p.rows.map((r) => r.label)).toEqual(["方案一", "方案二"]);
  });

  it("恰好 2 倍仍用差額，超過一元就不用", () => {
    const exactly = deriveOptionPresentation([pline("A", 5000), pline("A", 10000)]);
    expect(exactly.rows[1].useDelta).toBe(true);
    const over = deriveOptionPresentation([pline("A", 5000), pline("A", 10001)]);
    expect(over.rows[1].useDelta).toBe(false);
  });

  it("加購與運費：加購不參與分檔、不計入合計，運費計入", () => {
    // CA-202610-012-Q01-V01 S1037 蔡慶旺：兩檔＋加購進階面料＋送件運費
    const p = deriveOptionPresentation([
      pline("藤編扶手椅 坐背墊\n坐墊 W58", 22500),
      pline("藤編扶手椅 坐背墊\n坐墊 W58", 24600),
      pline("加購｜升級進階面料\n（可搭任一方案）", 2400),
      pline("送件運費\n（基隆・單程）", 1500),
    ]);
    expect(p.rows[1].deltaAmount).toBe(2100);
    expect(p.rows[2]).toMatchObject({ kind: "addon", label: "加購", groupStart: true });
    expect(p.rows[3]).toMatchObject({ kind: "normal", label: null });
    expect(p.hasAddon).toBe(true);
    // 22,500（最低檔）＋1,500（運費），不含 2,400 加購
    expect(p.baseTotal).toBe(24000);
  });

  it("數量相同且大於 1：單價欄也給差額（每件多少）", () => {
    // CA-202610-063-Q01-V01 形狀：吧台高腳椅坐面換皮 12 張
    const p = deriveOptionPresentation([
      pline("吧台高腳椅坐面換皮", 14400, { qty: 12, unitPrice: 1200 }),
      pline("吧台高腳椅坐面換皮", 16800, { qty: 12, unitPrice: 1400 }),
    ]);
    expect(p.rows[1].deltaAmount).toBe(2400);
    expect(p.rows[1].deltaUnitPrice).toBe(200);
  });

  it("同組數量不一致：無法逐件比較，單價差給 null", () => {
    const p = deriveOptionPresentation([
      pline("坐墊更換", 10000, { qty: 2, unitPrice: 5000 }),
      pline("坐墊更換", 12000, { qty: 3, unitPrice: 4000 }),
    ]);
    expect(p.rows[1].deltaAmount).toBe(2000);
    expect(p.rows[1].deltaUnitPrice).toBeNull();
  });

  it("兩檔同價：差額 0，基準檔取先出現的那一列", () => {
    // CA-202605-012-Q01-V01 實際存在同價兩檔
    const p = deriveOptionPresentation([pline("訂製墊", 11700), pline("訂製墊", 11700)]);
    expect(p.rows[0].isBase).toBe(true);
    expect(p.rows[1].isBase).toBe(false);
    expect(p.rows[1].deltaAmount).toBe(0);
  });

  it("工本費與不顯示的列不參與分檔，也不計入合計", () => {
    const p = deriveOptionPresentation([
      pline("訂製坐背墊", 29800),
      pline("訂製坐背墊", 32300),
      pline("內部工本", 5000, { isCostItem: true }),
      pline("不印這行", 900, { showOnQuote: false }),
    ]);
    expect(p.rows[2]).toMatchObject({ kind: "normal", label: null });
    expect(p.rows[3]).toMatchObject({ kind: "normal", label: null });
    expect(p.baseTotal).toBe(29800);
  });

  it("單一方案的單檔品項：不給方案標籤、不給差額", () => {
    const p = deriveOptionPresentation([
      pline("訂製臥榻墊 W114 x 92", 13600),
      pline("送件運費", 1500),
    ]);
    expect(p.rows.every((r) => r.label === null)).toBe(true);
    expect(p.hasDeltaGroup).toBe(false);
    expect(p.canShowBaseTotal).toBe(false);
  });

  it("兩組各自分檔：差額各自以自己那組的最低檔為基準", () => {
    const p = deriveOptionPresentation([
      pline("坐墊", 10000),
      pline("坐墊", 11000),
      pline("背墊", 20000),
      pline("背墊", 23000),
    ]);
    expect(p.rows.map((r) => r.deltaAmount)).toEqual([0, 1000, 0, 3000]);
    expect(p.rows.map((r) => r.groupStart)).toEqual([true, false, true, false]);
    expect(p.rows.map((r) => r.label)).toEqual(["方案一", "方案二", "方案一", "方案二"]);
    expect(p.baseTotal).toBe(30000);
  });
});
