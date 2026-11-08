import { describe, expect, it } from "vitest";

import { SYSTEM_INSTRUCTION, buildSystemInstruction } from "@/lib/assistant/order-tools";

describe("buildSystemInstruction", () => {
  // 基準用系統 date 查過：2026-11-08 是星期日、11-09 星期一、11-14 星期六
  it.each([
    ["2026-11-08T12:00:00+08:00", "2026-11-08（星期日）"],
    ["2026-11-09T12:00:00+08:00", "2026-11-09（星期一）"],
    ["2026-11-14T12:00:00+08:00", "2026-11-14（星期六）"],
  ])("%s → %s", (iso, expected) => {
    expect(buildSystemInstruction(new Date(iso))).toContain(expected);
  });

  it("🔴 台灣清晨也要算成台灣的今天，不可以掉回前一天（UTC 會差一天）", () => {
    // 台灣 2026-11-09 07:00 = UTC 2026-11-08 23:00
    expect(buildSystemInstruction(new Date("2026-11-09T07:00:00+08:00"))).toContain("2026-11-09");
  });

  it("保留原本的工具清單與規則", () => {
    const out = buildSystemInstruction(new Date("2026-11-08T12:00:00+08:00"));
    expect(out).toContain(SYSTEM_INSTRUCTION);
    expect(out).toContain("query_orders");
  });

  it("要說明兩種編號——使用者講的是 S1119 不是 ORD-", () => {
    expect(SYSTEM_INSTRUCTION).toContain("S1119");
  });

  it("要說明歷史不留工具紀錄，免得模型自我懷疑又撤回答案", () => {
    expect(SYSTEM_INSTRUCTION).toContain("不要因為看不到工具紀錄就懷疑");
  });
});
