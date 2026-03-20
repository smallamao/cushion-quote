import { describe, it, expect } from "vitest";
import type { CommissionSettlement } from "@/lib/types";
import {
  parseCommissionPartners,
  generateSettlementIdFromRows,
  rowToSettlement,
  settlementToRow,
} from "@/app/api/sheets/_settlement-utils";

// ===========================================================================
// parseCommissionPartners — 佣金夥伴 JSON 解析
// ===========================================================================

describe("parseCommissionPartners", () => {
  it("正確解析有效 JSON", () => {
    const json = JSON.stringify([
      { name: "陳設計師", partnerId: "P-001", role: "designer", amount: 5000 },
      { name: "林師傅", partnerId: "P-002", role: "installer", amount: 3000 },
    ]);
    const result = parseCommissionPartners(json);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "陳設計師",
      partnerId: "P-001",
      role: "designer",
      amount: 5000,
    });
    expect(result[1]).toEqual({
      name: "林師傅",
      partnerId: "P-002",
      role: "installer",
      amount: 3000,
    });
  });

  it("空字串 → 空陣列", () => {
    expect(parseCommissionPartners("")).toEqual([]);
    expect(parseCommissionPartners("  ")).toEqual([]);
  });

  it("無效 JSON → 空陣列（不 throw）", () => {
    expect(parseCommissionPartners("{invalid}")).toEqual([]);
    expect(parseCommissionPartners("not json")).toEqual([]);
  });

  it("非陣列 JSON → 空陣列", () => {
    expect(parseCommissionPartners('{"name":"test"}')).toEqual([]);
  });

  it("金額 <= 0 的項目會被過濾掉", () => {
    const json = JSON.stringify([
      { name: "A", partnerId: "P1", role: "designer", amount: 5000 },
      { name: "B", partnerId: "P2", role: "installer", amount: 0 },
      { name: "C", partnerId: "P3", role: "referrer", amount: -100 },
    ]);
    const result = parseCommissionPartners(json);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("A");
  });

  it("缺少 name 的項目會被過濾掉", () => {
    const json = JSON.stringify([
      { partnerId: "P1", role: "designer", amount: 5000 },
      { name: "B", partnerId: "P2", role: "installer", amount: 3000 },
    ]);
    const result = parseCommissionPartners(json);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("B");
  });

  it("金額會四捨五入為整數", () => {
    const json = JSON.stringify([
      { name: "A", partnerId: "P1", role: "designer", amount: 5000.7 },
    ]);
    const result = parseCommissionPartners(json);
    expect(result[0]!.amount).toBe(5001);
  });

  it("缺少 role 預設為 other", () => {
    const json = JSON.stringify([
      { name: "A", partnerId: "P1", amount: 5000 },
    ]);
    const result = parseCommissionPartners(json);
    expect(result[0]!.role).toBe("other");
  });
});

// ===========================================================================
// generateSettlementIdFromRows — 結算 ID 生成
// ===========================================================================

describe("generateSettlementIdFromRows", () => {
  const fixedDate = new Date("2026-03-20T10:00:00Z");

  it("無既有資料 → STL-20260320-001", () => {
    expect(generateSettlementIdFromRows([], fixedDate)).toBe("STL-20260320-001");
  });

  it("已有 002 → 下一個為 003", () => {
    const rows = [
      ["STL-20260320-001"],
      ["STL-20260320-002"],
    ];
    expect(generateSettlementIdFromRows(rows, fixedDate)).toBe("STL-20260320-003");
  });

  it("不同日期的 ID 不影響序號", () => {
    const rows = [
      ["STL-20260319-005"],
      ["STL-20260320-001"],
    ];
    expect(generateSettlementIdFromRows(rows, fixedDate)).toBe("STL-20260320-002");
  });

  it("非法 ID 不影響計算", () => {
    const rows = [
      ["STL-20260320-001"],
      ["GARBAGE-ID"],
      ["STL-20260320-abc"],
    ];
    expect(generateSettlementIdFromRows(rows, fixedDate)).toBe("STL-20260320-002");
  });
});

// ===========================================================================
// Settlement Row ↔ Record 雙向轉換
// ===========================================================================

describe("Settlement Row ↔ Record 雙向轉換", () => {
  function makeSettlement(overrides: Partial<CommissionSettlement> = {}): CommissionSettlement {
    return {
      settlementId: "STL-20260320-001",
      quoteId: "CA-202603-001-Q01",
      versionId: "CA-202603-001-Q01-V01",
      caseId: "CA-202603-001",
      partnerName: "陳設計師",
      partnerId: "P-001",
      partnerRole: "designer",
      commissionMode: "price_gap",
      commissionRate: 0.1,
      commissionAmount: 5000,
      settlementStatus: "pending",
      paidAt: "",
      paymentMethod: "",
      receiptNotes: "",
      createdAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
      ...overrides,
    };
  }

  it("roundtrip: record → row → record 應完全一致", () => {
    const original = makeSettlement();
    const row = settlementToRow(original);
    const restored = rowToSettlement(row);
    expect(restored).toEqual(original);
  });

  it("row 長度應為 16 欄", () => {
    const row = settlementToRow(makeSettlement());
    expect(row).toHaveLength(16);
  });

  it("paid 狀態 roundtrip", () => {
    const original = makeSettlement({
      settlementStatus: "paid",
      paidAt: "2026-03-25",
      paymentMethod: "匯款",
      receiptNotes: "已確認",
    });
    const restored = rowToSettlement(settlementToRow(original));
    expect(restored.settlementStatus).toBe("paid");
    expect(restored.paidAt).toBe("2026-03-25");
    expect(restored.paymentMethod).toBe("匯款");
  });

  it("空 row 應有安全預設值", () => {
    const record = rowToSettlement([]);
    expect(record.settlementId).toBe("");
    expect(record.partnerRole).toBe("other");
    expect(record.commissionMode).toBe("none");
    expect(record.settlementStatus).toBe("pending");
    expect(record.commissionRate).toBe(0);
    expect(record.commissionAmount).toBe(0);
  });
});
