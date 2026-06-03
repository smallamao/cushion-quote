import { describe, expect, it } from "vitest";
import { matchAllTransactions } from "@/lib/bank-reconciliation-matcher";
import type { BankTransaction, ARWithSchedules } from "@/lib/types";

function makeTx(overrides: Partial<BankTransaction>): BankTransaction {
  return {
    txId: "test-id",
    txDate: "2026-05-20",
    txTime: "16:52",
    valueDate: "2026-05-20",
    description: "跨行轉帳",
    debit: null,
    credit: null,
    balance: 627297,
    memo: "",
    ...overrides,
  };
}

const S879_AR: ARWithSchedules = {
  arId: "AR-202605-001",
  caseId: "S879",
  caseNameSnapshot: "張皓程",
  clientNameSnapshot: "張皓程",
  clientId: "C001",
  quoteId: "Q001",
  versionId: "VER-001",
  contactNameSnapshot: "",
  clientPhoneSnapshot: "",
  projectNameSnapshot: "",
  issueDate: "2026-05-01",
  totalAmount: 8800,
  receivedAmount: 0,
  outstandingAmount: 8800,
  scheduleCount: 1,
  arStatus: "active",
  hasOverdue: false,
  lastReceivedAt: "",
  notes: "",
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
  createdBy: "admin",
  schedules: [
    {
      scheduleId: "AR-202605-001-S01",
      arId: "AR-202605-001",
      seq: 1,
      label: "全額",
      ratio: 100,
      amount: 8800,
      dueDate: "2026-06-01",
      receivedAmount: 0,
      receivedDate: "",
      paymentMethod: "",
      scheduleStatus: "pending",
      adjustmentAmount: 0,
      notes: "",
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    },
  ],
};

describe("matchAllTransactions", () => {
  it("備注含全形訂單號且金額完全符合 → 高信心", () => {
    const tx = makeTx({
      credit: 8800,
      memo: "0090053145100792600 Ｓ８７９張皓程",
    });
    const entries = matchAllTransactions([tx], [S879_AR]);
    const e = entries[0];
    expect(e.confidence).toBe("high");
    expect(e.arId).toBe("AR-202605-001");
    expect(e.scheduleId).toBe("AR-202605-001-S01");
    expect(e.caseId).toBe("S879");
    expect(e.paymentType).toBe("全額");
  });

  it("金額差 ≤ 50 元 → 中信心", () => {
    const tx = makeTx({
      credit: 8770,
      memo: "7000003111430221601 Ｓ８７９",
    });
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].confidence).toBe("medium");
    expect(entries[0].arId).toBe("AR-202605-001");
  });

  it("金額差恰好 50 → 中信心（邊界值）", () => {
    const tx = makeTx({ credit: 8750, memo: "Ｓ８７９" }); // diff = 50
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].confidence).toBe("medium");
    expect(entries[0].arId).toBe("AR-202605-001");
  });

  it("金額差 51 → 無配對分期，scheduleId=null", () => {
    const tx = makeTx({ credit: 8749, memo: "Ｓ８７９" }); // diff = 51
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].scheduleId).toBeNull();
    // AR still found via caseId, confidence is medium (AR found but no schedule)
    expect(entries[0].arId).toBe("AR-202605-001");
  });

  it("找到 AR 但無匹配分期金額 → arId 有值，scheduleId 為 null，中信心", () => {
    const tx = makeTx({
      credit: 50000,
      memo: "Ｓ８７９測試",
    });
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].arId).toBe("AR-202605-001");
    expect(entries[0].scheduleId).toBeNull();
    expect(entries[0].confidence).toBe("medium");
  });

  it("支出項目（debit）→ 無比對，confidence=none", () => {
    const tx = makeTx({ debit: 11500, credit: null, memo: "Ｌ５８７南港床頭翻修" });
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].arId).toBeNull();
    expect(entries[0].confidence).toBe("none");
  });

  it("備注無訂單號且金額無法比對 → confidence=none", () => {
    const tx = makeTx({ credit: 9999, memo: "8220000613540250150" });
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].confidence).toBe("none");
    expect(entries[0].arId).toBeNull();
  });

  it("已收款分期（scheduleStatus=paid）不列為候選", () => {
    const paidAR: ARWithSchedules = {
      ...S879_AR,
      schedules: [{ ...S879_AR.schedules[0], scheduleStatus: "paid", receivedAmount: 8800 }],
    };
    const tx = makeTx({ credit: 8800, memo: "Ｓ８７９" });
    const entries = matchAllTransactions([tx], [paidAR]);
    expect(entries[0].scheduleId).toBeNull();
  });

  it("status=pending 的 entry 初始狀態為 pending", () => {
    const tx = makeTx({ credit: 8800, memo: "Ｓ８７９" });
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].status).toBe("pending");
  });
});
