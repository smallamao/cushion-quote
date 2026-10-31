import { describe, expect, it } from "vitest";

import {
  EINVOICE_ERROR_CODE,
  ISSUE_UNKNOWN_RESULT_MESSAGE,
  PROVIDER_UNKNOWN_MESSAGE,
  applyProviderOutcome,
  createIssueLockToken,
  isIssueLockHeldBy,
  buildIssuedWriteFailedRecord,
  classifyIssueResponse,
  isIssuableStatus,
  isIssueResultReview,
  needsIssueResolution,
  resolveIssuingUpdate,
} from "@/lib/einvoice-issue";
import { eInvoiceRowToRecord } from "@/lib/einvoice-utils";
import type { EInvoiceRecord } from "@/lib/types";

function makeRecord(overrides: Partial<EInvoiceRecord> = {}): EInvoiceRecord {
  const row = Array<string>(41).fill("");
  row[0] = "INV-1";
  return { ...eInvoiceRowToRecord(row), status: "issuing", ...overrides };
}

const NOW = "2026-11-01T00:00:00.000Z";
const ctx = { responseJson: "{}", requestJson: "{}", now: NOW };

describe("isIssuableStatus", () => {
  it("只有草稿與失敗可以送出開立", () => {
    expect(isIssuableStatus("draft")).toBe(true);
    expect(isIssuableStatus("failed")).toBe(true);
    for (const s of ["issuing", "issued", "needs_review", "cancelled"] as const) expect(isIssuableStatus(s)).toBe(false);
  });
});

describe("applyProviderOutcome", () => {
  it("Giveme 成功 → issued，帶發票號碼並清掉錯誤", () => {
    const next = applyProviderOutcome(makeRecord({ errorMessage: "舊錯誤" }), { kind: "success", code: "FP52472809", msg: "" }, ctx);
    expect(next).toMatchObject({ status: "issued", providerInvoiceNo: "FP52472809", errorCode: "", errorMessage: "", updatedAt: NOW });
  });

  it("Giveme 明確回失敗 → failed", () => {
    const next = applyProviderOutcome(makeRecord(), { kind: "rejected", code: "E01", msg: "統編錯誤" }, ctx);
    expect(next).toMatchObject({ status: "failed", errorCode: "E01", errorMessage: "統編錯誤" });
  });

  it("Giveme 逾時／連線錯誤 → needs_review + PROVIDER_UNKNOWN，絕不是 failed", () => {
    const next = applyProviderOutcome(makeRecord(), { kind: "unknown", message: "Giveme API timeout (15s)" }, ctx);
    expect(next.status).toBe("needs_review");
    expect(next.errorCode).toBe(EINVOICE_ERROR_CODE.providerUnknown);
    expect(next.errorMessage).toContain(PROVIDER_UNKNOWN_MESSAGE);
    expect(next.errorMessage).toContain("timeout");
  });
});

describe("buildIssuedWriteFailedRecord", () => {
  it("已開立但紀錄寫入失敗 → needs_review + ISSUED_RECORD_WRITE_FAILED + 請勿重開", () => {
    const next = buildIssuedWriteFailedRecord(makeRecord(), "FP52472809", "Quota exceeded", NOW);
    expect(next).toMatchObject({ status: "needs_review", providerInvoiceNo: "FP52472809", errorCode: EINVOICE_ERROR_CODE.issuedRecordWriteFailed });
    expect(next.errorMessage).toBe("已於 Giveme 開立（FP52472809），但系統紀錄寫入失敗：Quota exceeded；請勿重開");
  });
});

describe("classifyIssueResponse", () => {
  it("200 ok → 已開立", () => {
    expect(classifyIssueResponse({ httpStatus: 200, payload: { ok: true } })).toEqual({ kind: "issued", warning: "" });
  });

  it("200 ok + warning → 已開立並帶警告", () => {
    expect(classifyIssueResponse({ httpStatus: 200, payload: { ok: true, warning: "請勿重開" } })).toEqual({ kind: "issued", warning: "請勿重開" });
  });

  it("502 + provider.success === false → Giveme 明確拒絕", () => {
    const r = classifyIssueResponse({ httpStatus: 502, payload: { ok: false, stage: "provider", error: "統編錯誤", provider: { success: false, msg: "統編錯誤" } } });
    expect(r).toMatchObject({ kind: "provider_failed", message: expect.stringContaining("統編錯誤") });
  });

  it("送出前就失敗（stage before_provider）→ 未送出，可重試", () => {
    const r = classifyIssueResponse({ httpStatus: 503, payload: { ok: false, stage: "before_provider", error: "Quota exceeded" } });
    expect(r).toMatchObject({ kind: "not_sent", message: expect.stringContaining("未送出") });
  });

  it("500 JSON 但沒有 stage → 結果未知", () => {
    const r = classifyIssueResponse({ httpStatus: 500, payload: { ok: false, error: "boom" } });
    expect(r).toMatchObject({ kind: "unknown", message: expect.stringContaining(ISSUE_UNKNOWN_RESULT_MESSAGE) });
  });

  it("504 HTML（payload 解析不到）→ 結果未知", () => {
    expect(classifyIssueResponse({ httpStatus: 504, payload: {} }).kind).toBe("unknown");
  });

  it("502 provider_unknown → 結果未知", () => {
    expect(classifyIssueResponse({ httpStatus: 502, payload: { ok: false, stage: "provider_unknown", error: "timeout" } }).kind).toBe("unknown");
  });

  it("fetch 本身丟錯 → 結果未知", () => {
    const r = classifyIssueResponse({ networkError: "Failed to fetch" });
    expect(r).toMatchObject({ kind: "unknown", message: expect.stringContaining("Failed to fetch") });
  });

  it("200 但 ok 不是 true → 結果未知（不當成功也不當可重試）", () => {
    expect(classifyIssueResponse({ httpStatus: 200, payload: {} }).kind).toBe("unknown");
  });
});

describe("needsIssueResolution", () => {
  const now = new Date("2026-11-01T00:10:00.000Z");
  it("開立中超過 5 分鐘 → 需要人工處理", () => {
    expect(needsIssueResolution(makeRecord({ status: "issuing", updatedAt: "2026-11-01T00:04:00.000Z" }), now)).toBe(true);
  });
  it("開立中 5 分鐘內 → 還在進行，不處理", () => {
    expect(needsIssueResolution(makeRecord({ status: "issuing", updatedAt: "2026-11-01T00:06:00.000Z" }), now)).toBe(false);
  });
  it("needs_review + PROVIDER_UNKNOWN → 需要人工處理；一般稅型待確認不算", () => {
    expect(needsIssueResolution(makeRecord({ status: "needs_review", errorCode: EINVOICE_ERROR_CODE.providerUnknown }), now)).toBe(true);
    expect(needsIssueResolution(makeRecord({ status: "needs_review", errorCode: "" }), now)).toBe(false);
  });
});

describe("resolveIssuingUpdate", () => {
  const now = new Date("2026-11-01T00:10:00.000Z");
  const stale = makeRecord({ status: "issuing", updatedAt: "2026-11-01T00:00:00.000Z" });

  it("填入合法發票號碼 → issued", () => {
    const r = resolveIssuingUpdate(stale, { action: "mark_issued", providerInvoiceNo: " fp52472809 " }, now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record).toMatchObject({ status: "issued", providerInvoiceNo: "FP52472809", errorCode: "", errorMessage: "" });
  });

  it("發票號碼空白或格式錯誤 → 拒絕", () => {
    expect(resolveIssuingUpdate(stale, { action: "mark_issued", providerInvoiceNo: "" }, now).ok).toBe(false);
    expect(resolveIssuingUpdate(stale, { action: "mark_issued", providerInvoiceNo: "12345" }, now).ok).toBe(false);
  });

  it("確認沒開出 → failed", () => {
    const r = resolveIssuingUpdate(stale, { action: "mark_failed" }, now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.status).toBe("failed");
  });

  it("只能從逾時的開立中，或回應不明的待確認處理", () => {
    expect(resolveIssuingUpdate(makeRecord({ status: "issued" }), { action: "mark_failed" }, now).ok).toBe(false);
    expect(resolveIssuingUpdate(makeRecord({ status: "draft" }), { action: "mark_failed" }, now).ok).toBe(false);
    // 開立中但還沒逾時：請求可能還在跑，不能改
    expect(resolveIssuingUpdate(makeRecord({ status: "issuing", updatedAt: "2026-11-01T00:09:00.000Z" }), { action: "mark_failed" }, now).ok).toBe(false);
    expect(resolveIssuingUpdate(makeRecord({ status: "needs_review", errorCode: EINVOICE_ERROR_CODE.providerUnknown }), { action: "mark_failed" }, now).ok).toBe(true);
  });

  it("不認得的動作 → 拒絕", () => {
    expect(resolveIssuingUpdate(stale, { action: "nope" } as never, now).ok).toBe(false);
  });
});

describe("isIssueResultReview", () => {
  it("開立結果類的待確認（回應不明、已開立但寫入失敗）與稅型待確認分開", () => {
    expect(isIssueResultReview(makeRecord({ status: "needs_review", errorCode: EINVOICE_ERROR_CODE.providerUnknown }))).toBe(true);
    expect(isIssueResultReview(makeRecord({ status: "needs_review", errorCode: EINVOICE_ERROR_CODE.issuedRecordWriteFailed }))).toBe(true);
    expect(isIssueResultReview(makeRecord({ status: "needs_review", errorCode: "" }))).toBe(false);
    expect(isIssueResultReview(makeRecord({ status: "issued", errorCode: EINVOICE_ERROR_CODE.providerUnknown }))).toBe(false);
  });
});

describe("issue lock token", () => {
  it("每次產生不同的權杖，且以 LOCK: 開頭", () => {
    const a = createIssueLockToken();
    expect(a).toMatch(/^LOCK:/);
    expect(createIssueLockToken()).not.toBe(a);
  });

  it("只有開立中且權杖相同才算持有", () => {
    expect(isIssueLockHeldBy(makeRecord({ status: "issuing", providerTrackNo: "LOCK:a" }), "LOCK:a")).toBe(true);
    expect(isIssueLockHeldBy(makeRecord({ status: "issuing", providerTrackNo: "LOCK:b" }), "LOCK:a")).toBe(false);
    expect(isIssueLockHeldBy(makeRecord({ status: "issued", providerTrackNo: "LOCK:a" }), "LOCK:a")).toBe(false);
  });

  it("寫回結果時清掉權杖", () => {
    const next = applyProviderOutcome(makeRecord({ providerTrackNo: "LOCK:a" }), { kind: "success", code: "FP52472809", msg: "" }, ctx);
    expect(next.providerTrackNo).toBe("");
    const fallback = buildIssuedWriteFailedRecord(makeRecord({ providerTrackNo: "LOCK:a" }), "FP52472809", "x", NOW);
    expect(fallback.providerTrackNo).toBe("");
  });
});
