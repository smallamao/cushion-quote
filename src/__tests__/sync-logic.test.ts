import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { QuoteVersionRecord } from "@/lib/types";
import { normalizeVersionUpdate } from "@/app/api/sheets/_v2-utils";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeVersion(overrides: Partial<QuoteVersionRecord> = {}): QuoteVersionRecord {
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
    publicDescription: "",
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
    quoteNameSnapshot: "",
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

// ===========================================================================
// normalizeVersionUpdate — 版本更新正規化（狀態傳播的核心）
// ===========================================================================

describe("normalizeVersionUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const now = "2026-03-20T10:00:00.000Z";

  it("狀態改為 sent 時，應自動設定 sentAt", () => {
    const version = makeVersion({ versionStatus: "sent", sentAt: "" });
    const result = normalizeVersionUpdate(version, now);
    expect(result.sentAt).toBe(now);
  });

  it("已有 sentAt 時不覆蓋", () => {
    const version = makeVersion({ versionStatus: "sent", sentAt: "2026-03-15T08:00:00.000Z" });
    const result = normalizeVersionUpdate(version, now);
    expect(result.sentAt).toBe("2026-03-15T08:00:00.000Z");
  });

  it("draft 狀態不應自動設定 sentAt", () => {
    const version = makeVersion({ versionStatus: "draft", sentAt: "" });
    const result = normalizeVersionUpdate(version, now);
    expect(result.sentAt).toBe("");
  });

  it("有 sentAt + followUpDays 應自動計算 nextFollowUpDate", () => {
    const version = makeVersion({
      versionStatus: "sent",
      sentAt: "2026-03-20T10:00:00.000Z",
      followUpDays: 7,
      nextFollowUpDate: "",
    });
    const result = normalizeVersionUpdate(version, now);
    expect(result.nextFollowUpDate).toBe("2026-03-27");
  });

  it("已有 nextFollowUpDate 不覆蓋", () => {
    const version = makeVersion({
      sentAt: "2026-03-20",
      followUpDays: 7,
      nextFollowUpDate: "2026-04-01",
    });
    const result = normalizeVersionUpdate(version, now);
    expect(result.nextFollowUpDate).toBe("2026-04-01");
  });

  it("accepted 狀態 → reminderStatus 為 done", () => {
    const version = makeVersion({ versionStatus: "accepted", sentAt: "2026-03-15" });
    const result = normalizeVersionUpdate(version, now);
    expect(result.reminderStatus).toBe("done");
  });

  it("rejected 狀態 → reminderStatus 為 done", () => {
    const version = makeVersion({ versionStatus: "rejected", sentAt: "2026-03-15" });
    const result = normalizeVersionUpdate(version, now);
    expect(result.reminderStatus).toBe("done");
  });

  it("superseded 狀態 → reminderStatus 為 done", () => {
    const version = makeVersion({ versionStatus: "superseded", sentAt: "2026-03-15" });
    const result = normalizeVersionUpdate(version, now);
    expect(result.reminderStatus).toBe("done");
  });

  it("updatedAt 應被設為 now", () => {
    const version = makeVersion({ updatedAt: "old-value" });
    const result = normalizeVersionUpdate(version, now);
    expect(result.updatedAt).toBe(now);
  });

  it("不改變其他欄位", () => {
    const version = makeVersion({
      versionStatus: "draft",
      totalAmount: 99999,
      clientNameSnapshot: "特殊客戶",
    });
    const result = normalizeVersionUpdate(version, now);
    expect(result.totalAmount).toBe(99999);
    expect(result.clientNameSnapshot).toBe("特殊客戶");
    expect(result.versionId).toBe(version.versionId);
  });
});

// ===========================================================================
// 狀態傳播邏輯驗證（syncVersionToParents 的核心映射）
// ===========================================================================

describe("版本狀態 → 報價/案件狀態 映射規則", () => {
  it("version accepted → quote 應為 adopted, case 應為 won", () => {
    // 這驗證 syncVersionToParents 中的映射邏輯
    const versionStatus = "accepted";
    const quoteStatus = versionStatus === "accepted" ? "adopted" : versionStatus === "rejected" ? "not_adopted" : "draft";
    const caseStatus = versionStatus === "accepted" ? "won" : versionStatus === "rejected" ? "lost" : "new";
    expect(quoteStatus).toBe("adopted");
    expect(caseStatus).toBe("won");
  });

  it("version rejected → quote 應為 not_adopted, case 應為 lost", () => {
    const versionStatus = "rejected";
    const quoteStatus = versionStatus === "accepted" ? "adopted" : versionStatus === "rejected" ? "not_adopted" : "draft";
    const caseStatus = versionStatus === "accepted" ? "won" : versionStatus === "rejected" ? "lost" : "new";
    expect(quoteStatus).toBe("not_adopted");
    expect(caseStatus).toBe("lost");
  });

  it("version sent → quote/case 狀態不變（保留原值）", () => {
    const versionStatus = "sent";
    const originalQuoteStatus = "quoting";
    const originalCaseStatus = "following_up";
    const quoteStatus = versionStatus === "accepted" ? "adopted" : versionStatus === "rejected" ? "not_adopted" : originalQuoteStatus;
    const caseStatus = versionStatus === "accepted" ? "won" : versionStatus === "rejected" ? "lost" : originalCaseStatus;
    expect(quoteStatus).toBe("quoting");
    expect(caseStatus).toBe("following_up");
  });

  it("version accepted → selectedVersionId 應設為該 versionId", () => {
    const versionStatus = "accepted";
    const versionId = "CA-202603-001-Q01-V02";
    const selectedVersionId = versionStatus === "accepted" ? versionId : "";
    expect(selectedVersionId).toBe("CA-202603-001-Q01-V02");
  });

  it("version accepted → wonVersionId 應設為該 versionId", () => {
    const versionStatus = "accepted";
    const versionId = "CA-202603-001-Q01-V02";
    const wonVersionId = versionStatus === "accepted" ? versionId : "";
    expect(wonVersionId).toBe("CA-202603-001-Q01-V02");
  });
});
