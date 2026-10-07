/**
 * 期貨布料判斷（2026-10-07 老闆補充 P6278）。
 *
 * FG 開頭＝安得利比利時抗污布，是期貨商品：要提前叫料、交期依實際到料、
 * 色差不退換。這段必須在客人**簽名之前**出現，否則「不可更改與取消」
 * 講在採購階段等於沒講。
 */
import { describe, expect, it } from "vitest";

import {
  FUTURES_FABRIC_NOTICE,
  FUTURES_FABRIC_PREFIXES,
  hasFuturesFabric,
  isFuturesFabricCode,
} from "@/lib/material-confirm-types";

describe("isFuturesFabricCode", () => {
  it.each(["FG60213-11", "FG240-16", "FG00240-02", "fg123"])("%s 是期貨", (c) => {
    expect(isFuturesFabricCode(c)).toBe(true);
  });

  it.each(["FKM5500-4", "LY9308A", "S6934", "SC5756", "谷804", "PVC6935", ""])(
    "%s 不是期貨", (c) => {
      expect(isFuturesFabricCode(c)).toBe(false);
    });

  it("前綴後面一定要接數字——FGX1 不是色號格式，不可誤判", () => {
    expect(isFuturesFabricCode("FGX1")).toBe(false);
  });
});

describe("hasFuturesFabric", () => {
  it("P6278 本案：主色期貨、副色一般 → 整筆算期貨", () => {
    expect(hasFuturesFabric("FG60213-11&LY9308A")).toBe(true);
  });

  it("只要有一個是期貨就算——那塊布一樣要提前叫、一樣不能改單", () => {
    expect(hasFuturesFabric("LY9308A&FG60213-11")).toBe(true);
    expect(hasFuturesFabric("S6934,FG240-16")).toBe(true);
    expect(hasFuturesFabric("TJ7609、FG00240-02")).toBe(true);
  });

  it("全部一般布 → 不出告知（避免每一單都噴，老闆會不再看它）", () => {
    expect(hasFuturesFabric("FKM5500-4&FKM5500-7")).toBe(false);
    expect(hasFuturesFabric("3200A23,3200A25")).toBe(false);
    expect(hasFuturesFabric("")).toBe(false);
  });
});

describe("文案", () => {
  it("是老闆的原文，四個重點都在", () => {
    for (const k of ["期貨商品", "無法更改與取消訂單", "色差", "依照實際到料"]) {
      expect(FUTURES_FABRIC_NOTICE).toContain(k);
    }
  });

  it("哨兵：前綴表是可擴充的陣列，不是寫死在判斷式裡", () => {
    expect(Array.isArray(FUTURES_FABRIC_PREFIXES)).toBe(true);
    expect(FUTURES_FABRIC_PREFIXES).toContain("FG");
  });
});

/* ───────── 時段 → Trello due 時分（2026-10-07 P6272）───────── */

import { dueIsoFromSlot, slotStartHour } from "@/lib/material-confirm-types";

describe("時段 → Trello due", () => {
  it.each([
    ["上午 10:00-12:00", 10],
    ["下午 13:00-15:00", 13],
    ["下午 15:00-17:00", 15],
    ["傍晚 17:00-19:00", 17],
    ["皆可", 10],
  ])("%s → 台灣 %i 點", (period, hour) => {
    expect(slotStartHour(period)).toBe(hour);
  });

  it("P6272 本案：10/23 傍晚 → UTC 09:00Z（＝台灣 17:00）", () => {
    expect(dueIsoFromSlot("2026-10-23", "傍晚 17:00-19:00"))
      .toBe("2026-10-23T09:00:00.000Z");
  });

  it("🔴 一定要減 8 小時：少了這步 17:00 會變成隔天凌晨 01:00", () => {
    const iso = dueIsoFromSlot("2026-10-23", "傍晚 17:00-19:00")!;
    const taipeiHour = new Date(Date.parse(iso) + 8 * 3600_000).getUTCHours();
    expect(taipeiHour).toBe(17);
  });

  it.each([
    ["2026-10-23", "上午 10:00-12:00", "2026-10-23T02:00:00.000Z"],
    ["2026-10-23", "下午 15:00-17:00", "2026-10-23T07:00:00.000Z"],
    ["2026-12-31", "傍晚 17:00-19:00", "2026-12-31T09:00:00.000Z"],
  ])("%s %s → %s", (ymd, period, iso) => {
    expect(dueIsoFromSlot(ymd, period)).toBe(iso);
  });

  it("看不懂的時段或日期回 null——呼叫端就不要動 due，不可亂猜一個時間", () => {
    expect(dueIsoFromSlot("2026-10-23", "晚上八點")).toBeNull();
    expect(dueIsoFromSlot("10/23", "皆可")).toBeNull();
    expect(dueIsoFromSlot("", "皆可")).toBeNull();
    expect(slotStartHour("")).toBeNull();
  });
});
