import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  CaseRecord,
  QuotePlanRecord,
  QuoteVersionRecord,
  VersionLineRecord,
} from "@/lib/types";
import {
  caseRowToRecord,
  caseRecordToRow,
  quoteRowToRecord,
  quoteRecordToRow,
  versionRowToRecord,
  versionRecordToRow,
  lineRowToRecord,
  lineRecordToRow,
  calculateReminderStatus,
  calculateNextFollowUpDate,
  makeItemId,
  isoDateNow,
} from "@/app/api/sheets/_v2-utils";

// ---------------------------------------------------------------------------
// Helper: 建立完整的測試 record
// ---------------------------------------------------------------------------

function makeCaseRecord(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    caseId: "CA-202603-001",
    caseName: "測試案件",
    clientId: "CL-001",
    clientNameSnapshot: "王先生",
    contactNameSnapshot: "王小明",
    phoneSnapshot: "0912345678",
    projectAddress: "台北市信義區",
    channelSnapshot: "wholesale",
    caseStatus: "new",
    inquiryDate: "2026-03-20",
    latestQuoteId: "CA-202603-001-Q01",
    latestVersionId: "CA-202603-001-Q01-V01",
    latestSentAt: "2026-03-20",
    nextFollowUpDate: "2026-03-27",
    lastFollowUpAt: "",
    wonVersionId: "",
    lostReason: "",
    internalNotes: "測試備註",
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    leadSource: "google_search",
    leadSourceContact: "搜尋",
    leadSourceNotes: "",
    ...overrides,
  };
}

function makeQuoteRecord(overrides: Partial<QuotePlanRecord> = {}): QuotePlanRecord {
  return {
    quoteId: "CA-202603-001-Q01",
    caseId: "CA-202603-001",
    quoteSeq: 1,
    quoteName: "客廳沙發方案",
    quoteType: "standard",
    scopeNote: "含安裝",
    quoteStatus: "draft",
    currentVersionId: "CA-202603-001-Q01-V01",
    selectedVersionId: "",
    versionCount: 1,
    latestSentAt: "",
    nextFollowUpDate: "",
    sortOrder: 1,
    internalNotes: "",
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    ...overrides,
  };
}

function makeVersionRecord(overrides: Partial<QuoteVersionRecord> = {}): QuoteVersionRecord {
  return {
    versionId: "CA-202603-001-Q01-V01",
    quoteId: "CA-202603-001-Q01",
    caseId: "CA-202603-001",
    versionNo: 1,
    basedOnVersionId: "",
    versionLabel: "V01",
    versionStatus: "draft",
    quoteDate: "2026-03-20",
    sentAt: "",
    validUntil: "2026-04-19",
    followUpDays: 7,
    nextFollowUpDate: "",
    lastFollowUpAt: "",
    reminderStatus: "not_sent",
    subtotalBeforeTax: 50000,
    discountAmount: 0,
    taxRate: 0.05,
    taxAmount: 2500,
    totalAmount: 52500,
    estimatedCostTotal: 30000,
    grossMarginAmount: 20000,
    grossMarginRate: 0.4,
    channel: "wholesale",
    termsTemplate: "standard",
    publicDescription: "沙發繃布報價",
    descriptionImageUrl: "",
    internalNotes: "",
    snapshotLocked: false,
    snapshotLockedAt: "",
    clientNameSnapshot: "王先生",
    contactNameSnapshot: "王小明",
    clientPhoneSnapshot: "0912345678",
    projectNameSnapshot: "信義案",
    projectAddressSnapshot: "台北市信義區",
    channelSnapshot: "wholesale",
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    commissionMode: "price_gap",
    commissionRate: 0.1,
    commissionAmount: 5000,
    commissionFixedAmount: 0,
    commissionPartners: "",
    ...overrides,
  };
}

function makeLineRecord(overrides: Partial<VersionLineRecord> = {}): VersionLineRecord {
  return {
    itemId: "CA-202603-001-Q01-V01-I001",
    versionId: "CA-202603-001-Q01-V01",
    quoteId: "CA-202603-001-Q01",
    caseId: "CA-202603-001",
    lineNo: 1,
    itemName: "L型沙發繃布",
    spec: "200x80cm / 平面車縫 / 3吋泡棉",
    materialId: "MAT-001",
    qty: 1,
    unit: "式",
    unitPrice: 15000,
    lineAmount: 15000,
    estimatedUnitCost: 9000,
    estimatedCostAmount: 9000,
    lineMarginAmount: 6000,
    lineMarginRate: 0.4,
    isCostItem: false,
    showOnQuote: true,
    notes: "",
    imageUrl: "",
    specImageUrl: "",
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    ...overrides,
  };
}

// ===========================================================================
// Case: Row ↔ Record 雙向轉換
// ===========================================================================

describe("Case Row ↔ Record 雙向轉換", () => {
  it("roundtrip: record → row → record 應完全一致", () => {
    const original = makeCaseRecord();
    const row = caseRecordToRow(original);
    const restored = caseRowToRecord(row);
    expect(restored).toEqual(original);
  });

  it("row 長度應為 23 欄", () => {
    const row = caseRecordToRow(makeCaseRecord());
    expect(row).toHaveLength(23);
  });

  it("空 row 應有安全預設值", () => {
    const record = caseRowToRecord([]);
    expect(record.caseId).toBe("");
    expect(record.caseStatus).toBe("new");
    expect(record.channelSnapshot).toBe("wholesale");
    expect(record.leadSource).toBe("unknown");
  });

  it("部分 row 不應 crash", () => {
    const record = caseRowToRecord(["CA-001", "測試"]);
    expect(record.caseId).toBe("CA-001");
    expect(record.caseName).toBe("測試");
    expect(record.clientId).toBe("");
  });
});

// ===========================================================================
// Quote: Row ↔ Record 雙向轉換
// ===========================================================================

describe("Quote Row ↔ Record 雙向轉換", () => {
  it("roundtrip: record → row → record 應完全一致", () => {
    const original = makeQuoteRecord();
    const row = quoteRecordToRow(original);
    const restored = quoteRowToRecord(row);
    expect(restored).toEqual(original);
  });

  it("row 長度應為 16 欄", () => {
    const row = quoteRecordToRow(makeQuoteRecord());
    expect(row).toHaveLength(16);
  });

  it("數字欄位應正確轉換", () => {
    const row = quoteRecordToRow(makeQuoteRecord({ quoteSeq: 3, versionCount: 5, sortOrder: 2 }));
    const restored = quoteRowToRecord(row);
    expect(restored.quoteSeq).toBe(3);
    expect(restored.versionCount).toBe(5);
    expect(restored.sortOrder).toBe(2);
  });

  it("空 row 的數字欄位應為 0", () => {
    const record = quoteRowToRecord([]);
    expect(record.quoteSeq).toBe(0);
    expect(record.versionCount).toBe(0);
    expect(record.sortOrder).toBe(0);
  });
});

// ===========================================================================
// Version: Row ↔ Record 雙向轉換（42 欄，最高風險）
// ===========================================================================

describe("Version Row ↔ Record 雙向轉換", () => {
  it("roundtrip: record → row → record 應完全一致", () => {
    const original = makeVersionRecord();
    const row = versionRecordToRow(original);
    const restored = versionRowToRecord(row);
    expect(restored).toEqual(original);
  });

  it("row 長度應為 42 欄", () => {
    const row = versionRecordToRow(makeVersionRecord());
    expect(row).toHaveLength(42);
  });

  it("boolean 欄位 snapshotLocked=true 應正確轉換", () => {
    const original = makeVersionRecord({ snapshotLocked: true });
    const row = versionRecordToRow(original);
    expect(row[27]).toBe("TRUE");
    const restored = versionRowToRecord(row);
    expect(restored.snapshotLocked).toBe(true);
  });

  it("boolean 欄位 snapshotLocked=false 應正確轉換", () => {
    const original = makeVersionRecord({ snapshotLocked: false });
    const row = versionRecordToRow(original);
    expect(row[27]).toBe("FALSE");
    const restored = versionRowToRecord(row);
    expect(restored.snapshotLocked).toBe(false);
  });

  it("金額欄位 roundtrip 應精確", () => {
    const original = makeVersionRecord({
      subtotalBeforeTax: 123456,
      discountAmount: 500,
      taxRate: 0.05,
      taxAmount: 6147.8,
      totalAmount: 129103.8,
      estimatedCostTotal: 75000,
      grossMarginAmount: 48456,
      grossMarginRate: 0.3934,
      commissionRate: 0.15,
      commissionAmount: 18000,
      commissionFixedAmount: 3000,
    });
    const restored = versionRowToRecord(versionRecordToRow(original));
    expect(restored.subtotalBeforeTax).toBe(123456);
    expect(restored.taxAmount).toBe(6147.8);
    expect(restored.totalAmount).toBe(129103.8);
    expect(restored.grossMarginRate).toBe(0.3934);
    expect(restored.commissionFixedAmount).toBe(3000);
  });

  it("所有 channel 類型應 roundtrip 正確", () => {
    for (const ch of ["wholesale", "designer", "retail", "luxury_retail"] as const) {
      const original = makeVersionRecord({ channel: ch, channelSnapshot: ch });
      const restored = versionRowToRecord(versionRecordToRow(original));
      expect(restored.channel).toBe(ch);
      expect(restored.channelSnapshot).toBe(ch);
    }
  });

  it("所有 versionStatus 應 roundtrip 正確", () => {
    for (const status of ["draft", "sent", "following_up", "negotiating", "accepted", "rejected", "superseded"] as const) {
      const original = makeVersionRecord({ versionStatus: status });
      const restored = versionRowToRecord(versionRecordToRow(original));
      expect(restored.versionStatus).toBe(status);
    }
  });

  it("空 row 應有安全預設值", () => {
    const record = versionRowToRecord([]);
    expect(record.versionId).toBe("");
    expect(record.versionStatus).toBe("draft");
    expect(record.channel).toBe("wholesale");
    expect(record.channelSnapshot).toBe("wholesale");
    expect(record.reminderStatus).toBe("not_sent");
    expect(record.commissionMode).toBe("price_gap");
    expect(record.snapshotLocked).toBe(false);
    expect(record.subtotalBeforeTax).toBe(0);
  });

  it("欄位順序不能錯：第 0 欄是 versionId，第 18 欄是 totalAmount", () => {
    const row = versionRecordToRow(makeVersionRecord({
      versionId: "TEST-V01",
      totalAmount: 99999,
    }));
    expect(row[0]).toBe("TEST-V01");
    expect(row[18]).toBe("99999");
  });
});

// ===========================================================================
// Line: Row ↔ Record 雙向轉換
// ===========================================================================

describe("Line Row ↔ Record 雙向轉換", () => {
  it("roundtrip: record → row → record 應完全一致", () => {
    const original = makeLineRecord();
    const row = lineRecordToRow(original);
    const restored = lineRowToRecord(row);
    expect(restored).toEqual(original);
  });

  it("row 長度應為 23 欄", () => {
    const row = lineRecordToRow(makeLineRecord());
    expect(row).toHaveLength(23);
  });

  it("isCostItem=true 和 showOnQuote=false 應正確轉換", () => {
    const original = makeLineRecord({ isCostItem: true, showOnQuote: false });
    const row = lineRecordToRow(original);
    expect(row[16]).toBe("TRUE");
    expect(row[17]).toBe("FALSE");
    const restored = lineRowToRecord(row);
    expect(restored.isCostItem).toBe(true);
    expect(restored.showOnQuote).toBe(false);
  });

  it("showOnQuote 預設為 true（空值時）", () => {
    const record = lineRowToRecord([]);
    expect(record.showOnQuote).toBe(true);
  });

  it("unit 預設為 '式'", () => {
    const record = lineRowToRecord([]);
    expect(record.unit).toBe("式");
  });
});

// ===========================================================================
// calculateReminderStatus
// ===========================================================================

describe("calculateReminderStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepted → done", () => {
    expect(calculateReminderStatus({
      versionStatus: "accepted", sentAt: "2026-03-15", nextFollowUpDate: "2026-03-22", lastFollowUpAt: "",
    })).toBe("done");
  });

  it("rejected → done", () => {
    expect(calculateReminderStatus({
      versionStatus: "rejected", sentAt: "2026-03-15", nextFollowUpDate: "2026-03-22", lastFollowUpAt: "",
    })).toBe("done");
  });

  it("superseded → done", () => {
    expect(calculateReminderStatus({
      versionStatus: "superseded", sentAt: "2026-03-15", nextFollowUpDate: "2026-03-22", lastFollowUpAt: "",
    })).toBe("done");
  });

  it("未發送 → not_sent", () => {
    expect(calculateReminderStatus({
      versionStatus: "draft", sentAt: "", nextFollowUpDate: "", lastFollowUpAt: "",
    })).toBe("not_sent");
  });

  it("已追蹤且追蹤日 >= 下次追蹤日 → done", () => {
    expect(calculateReminderStatus({
      versionStatus: "sent", sentAt: "2026-03-15", nextFollowUpDate: "2026-03-18", lastFollowUpAt: "2026-03-18",
    })).toBe("done");
  });

  it("已發送但無追蹤日 → pending", () => {
    expect(calculateReminderStatus({
      versionStatus: "sent", sentAt: "2026-03-15", nextFollowUpDate: "", lastFollowUpAt: "",
    })).toBe("pending");
  });

  it("追蹤日在未來 → pending", () => {
    expect(calculateReminderStatus({
      versionStatus: "sent", sentAt: "2026-03-15", nextFollowUpDate: "2026-03-25", lastFollowUpAt: "",
    })).toBe("pending");
  });

  it("追蹤日是今天 → due_today", () => {
    expect(calculateReminderStatus({
      versionStatus: "sent", sentAt: "2026-03-13", nextFollowUpDate: "2026-03-20", lastFollowUpAt: "",
    })).toBe("due_today");
  });

  it("追蹤日已過 → overdue", () => {
    expect(calculateReminderStatus({
      versionStatus: "following_up", sentAt: "2026-03-10", nextFollowUpDate: "2026-03-17", lastFollowUpAt: "",
    })).toBe("overdue");
  });
});

// ===========================================================================
// calculateNextFollowUpDate
// ===========================================================================

describe("calculateNextFollowUpDate", () => {
  it("正常計算：發送日 + 7 天", () => {
    expect(calculateNextFollowUpDate("2026-03-20", 7)).toBe("2026-03-27");
  });

  it("跨月計算", () => {
    expect(calculateNextFollowUpDate("2026-03-28", 7)).toBe("2026-04-04");
  });

  it("空 sentAt → 空字串", () => {
    expect(calculateNextFollowUpDate("", 7)).toBe("");
  });

  it("followUpDays <= 0 → 空字串", () => {
    expect(calculateNextFollowUpDate("2026-03-20", 0)).toBe("");
    expect(calculateNextFollowUpDate("2026-03-20", -1)).toBe("");
  });

  it("帶時間戳的 sentAt 應只取日期部分", () => {
    expect(calculateNextFollowUpDate("2026-03-20T15:30:00.000Z", 3)).toBe("2026-03-23");
  });
});

// ===========================================================================
// makeItemId
// ===========================================================================

describe("makeItemId", () => {
  it("正確格式化並補零", () => {
    expect(makeItemId("Q01-V01", 1)).toBe("Q01-V01-I001");
    expect(makeItemId("Q01-V01", 99)).toBe("Q01-V01-I099");
    expect(makeItemId("Q01-V01", 100)).toBe("Q01-V01-I100");
  });
});
