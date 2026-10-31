import type { EInvoiceRecord, EInvoiceStatus } from "@/lib/types";

/**
 * 電子發票「送出開立」的狀態決策（純函式，前後端共用）。
 * 核心原則：只要 Giveme 有可能已開出，就不能讓紀錄回到可重開的狀態（draft / failed）。
 */

export const EINVOICE_ERROR_CODE = {
  /** Giveme 逾時／連線錯誤／非 JSON：不知道有沒有開出 */
  providerUnknown: "PROVIDER_UNKNOWN",
  /** Giveme 已開出，但寫回 issued 失敗 */
  issuedRecordWriteFailed: "ISSUED_RECORD_WRITE_FAILED",
} as const;

export const ISSUE_TIMING = {
  /** 路由 maxDuration 60 秒，留 10 秒餘裕 */
  totalBudgetMs: 50_000,
  /** 呼叫 Giveme（逾時 15 秒）＋寫回結果至少要留這麼多時間，不夠就不送 */
  minRemainingForProviderMs: 30_000,
  /** 開立中超過這麼久視為卡住，開放人工處理 */
  staleIssuingMs: 5 * 60_000,
} as const;

export const PROVIDER_UNKNOWN_MESSAGE = "Giveme 回應不明（逾時/連線錯誤），可能已開立，請到 giveme 後台確認，勿重開";
export const ISSUE_UNKNOWN_RESULT_MESSAGE = "結果未知：Giveme 可能已開立，請勿重開，請到開票歷史確認";
export const STALE_ISSUING_LABEL = "結果未知：請到 giveme 後台查詢，勿重開";

const ISSUABLE_STATUSES: ReadonlySet<EInvoiceStatus> = new Set(["draft", "failed"]);

export function isIssuableStatus(status: EInvoiceStatus): boolean {
  return ISSUABLE_STATUSES.has(status);
}

export type ProviderOutcome =
  | { kind: "success"; code: string; msg: string }
  | { kind: "rejected"; code: string; msg: string }
  | { kind: "unknown"; message: string };

export function applyProviderOutcome(
  record: EInvoiceRecord,
  outcome: ProviderOutcome,
  ctx: { responseJson: string; requestJson: string; now: string },
): EInvoiceRecord {
  const base = { ...record, providerResponseJson: ctx.responseJson, requestPayloadJson: ctx.requestJson, updatedAt: ctx.now };
  if (outcome.kind === "success") {
    return { ...base, status: "issued", providerInvoiceNo: outcome.code || record.providerInvoiceNo, errorCode: "", errorMessage: "" };
  }
  if (outcome.kind === "rejected") {
    return { ...base, status: "failed", errorCode: outcome.code, errorMessage: outcome.msg || "Giveme 開立失敗" };
  }
  return {
    ...base,
    status: "needs_review",
    errorCode: EINVOICE_ERROR_CODE.providerUnknown,
    errorMessage: `${PROVIDER_UNKNOWN_MESSAGE}（${outcome.message}）`,
  };
}

export function buildIssuedWriteFailedRecord(
  record: EInvoiceRecord,
  providerInvoiceNo: string,
  writeError: string,
  now: string,
): EInvoiceRecord {
  return {
    ...record,
    status: "needs_review",
    providerInvoiceNo: providerInvoiceNo || record.providerInvoiceNo,
    errorCode: EINVOICE_ERROR_CODE.issuedRecordWriteFailed,
    errorMessage: `已於 Giveme 開立（${providerInvoiceNo || "號碼未知"}），但系統紀錄寫入失敗：${writeError}；請勿重開`,
    updatedAt: now,
  };
}

export type IssueResponseClass =
  | { kind: "issued"; warning: string }
  | { kind: "provider_failed"; message: string }
  | { kind: "not_sent"; message: string }
  | { kind: "unknown"; message: string };

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * 前端判讀開立 API 的回應。只有兩種情況可以確定「沒開出」：
 * 伺服器明說還沒送 Giveme（stage before_provider），或 Giveme 明確回 success:false。
 * 其餘（504、HTML、連線中斷、沒有 stage 的 500）一律視為結果未知，不可重試。
 */
export function classifyIssueResponse(
  input: { httpStatus: number; payload: unknown } | { networkError: string },
): IssueResponseClass {
  if ("networkError" in input) {
    return { kind: "unknown", message: `${ISSUE_UNKNOWN_RESULT_MESSAGE}（${input.networkError}）` };
  }
  const payload = (input.payload && typeof input.payload === "object" ? input.payload : {}) as {
    ok?: unknown;
    stage?: unknown;
    error?: unknown;
    warning?: unknown;
    provider?: { success?: unknown; msg?: unknown };
  };
  const error = readString(payload.error);
  if (input.httpStatus === 200 && payload.ok === true) {
    return { kind: "issued", warning: readString(payload.warning) };
  }
  if (payload.stage === "before_provider") {
    return { kind: "not_sent", message: `未送出 Giveme，可重試${error ? `：${error}` : ""}` };
  }
  if (input.httpStatus === 502 && payload.provider?.success === false) {
    return { kind: "provider_failed", message: readString(payload.provider.msg) || error || "Giveme 開立失敗" };
  }
  const detail = error || `HTTP ${input.httpStatus}`;
  return { kind: "unknown", message: `${ISSUE_UNKNOWN_RESULT_MESSAGE}（${detail}）` };
}

function isStaleIssuing(record: EInvoiceRecord, now: Date): boolean {
  if (record.status !== "issuing") return false;
  const updated = Date.parse(record.updatedAt);
  // 沒有時間戳就無法判斷是否還在進行，視為卡住讓人處理
  if (!Number.isFinite(updated)) return true;
  return now.getTime() - updated >= ISSUE_TIMING.staleIssuingMs;
}

/** 開立結果不明、需要人工到 giveme 後台查證的紀錄 */
export function needsIssueResolution(record: EInvoiceRecord, now: Date = new Date()): boolean {
  if (record.status === "needs_review") return record.errorCode === EINVOICE_ERROR_CODE.providerUnknown;
  return isStaleIssuing(record, now);
}

export type ResolveIssuingRequest =
  | { action: "mark_issued"; providerInvoiceNo: string }
  | { action: "mark_failed" };

const INVOICE_NUMBER_PATTERN = /^[A-Z]{2}\d{8}$/;

export function resolveIssuingUpdate(
  record: EInvoiceRecord,
  request: ResolveIssuingRequest,
  now: Date = new Date(),
): { ok: true; record: EInvoiceRecord } | { ok: false; reason: "status" | "invalid"; error: string } {
  if (!needsIssueResolution(record, now)) {
    return { ok: false, reason: "status", error: `只有開立中超過 5 分鐘或 Giveme 回應不明的發票可以這樣處理（目前狀態 ${record.status}）` };
  }
  const updatedAt = now.toISOString();
  if (request.action === "mark_issued") {
    const providerInvoiceNo = (request.providerInvoiceNo ?? "").trim().toUpperCase();
    if (!INVOICE_NUMBER_PATTERN.test(providerInvoiceNo)) {
      return { ok: false, reason: "invalid", error: "發票號碼格式錯誤（應為 2 個英文字母 + 8 位數字，例如 AB12345678）" };
    }
    return { ok: true, record: { ...record, status: "issued", providerInvoiceNo, errorCode: "", errorMessage: "", updatedAt } };
  }
  if (request.action === "mark_failed") {
    return {
      ok: true,
      record: { ...record, status: "failed", errorCode: "", errorMessage: "人工確認 giveme 沒有開出，改為失敗", updatedAt },
    };
  }
  return { ok: false, reason: "invalid", error: "unknown action" };
}
