import { NextResponse } from "next/server";

import { issueB2BInvoice, issueB2CInvoice } from "@/lib/giveme-client";
import {
  ISSUE_TIMING,
  PROVIDER_UNKNOWN_MESSAGE,
  applyProviderOutcome,
  buildIssuedWriteFailedRecord,
  isIssuableStatus,
  type ProviderOutcome,
} from "@/lib/einvoice-issue";
import { parseEInvoiceItems, isoNow } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";
import { SHEETS_NO_RETRY } from "@/lib/sheets-retry";
import type { EInvoiceEventRecord, EInvoiceRecord, EInvoiceStatus } from "@/lib/types";

import { getSession } from "../../_auth";
import { appendEInvoiceEvent, updateEInvoiceRecord } from "../../_shared";

// 時間預算見 ISSUE_TIMING：送出前寫入最多用到第 20 秒，結果寫回最多到第 50 秒
export const maxDuration = 60;

type PersistedIssueItemSummary = {
  name: string;
  money: number;
  number: number;
  remark: string;
  taxType: 0 | 1 | 2;
};

interface PersistedIssuePayloadSummary {
  sourceType: EInvoiceRecord["sourceType"];
  sourceId: string;
  sourceSubId: string;
  quoteId: string;
  versionId: string;
  caseId: string;
  clientId: string;
  buyerType: EInvoiceRecord["buyerType"];
  buyerName: string;
  buyerTaxId: string;
  buyerAddress: string;
  email: string;
  carrierType: EInvoiceRecord["carrierType"];
  carrierValue: string;
  donationCode: string;
  invoiceDate: string;
  taxType: EInvoiceRecord["taxType"];
  untaxedAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  itemCount: number;
  itemNames: string[];
  items: PersistedIssueItemSummary[];
  content: string;
}

function buildPersistedIssuePayloadSummary(
  record: EInvoiceRecord,
  items: PersistedIssueItemSummary[],
): PersistedIssuePayloadSummary {
  return {
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    sourceSubId: record.sourceSubId,
    quoteId: record.quoteId,
    versionId: record.versionId,
    caseId: record.caseId,
    clientId: record.clientId,
    buyerType: record.buyerType,
    buyerName: record.buyerName,
    buyerTaxId: record.buyerTaxId,
    buyerAddress: record.buyerAddress,
    email: record.email,
    carrierType: record.carrierType,
    carrierValue: record.carrierValue,
    donationCode: record.donationCode,
    invoiceDate: record.invoiceDate,
    taxType: record.taxType,
    untaxedAmount: record.untaxedAmount,
    taxAmount: record.taxAmount,
    totalAmount: record.totalAmount,
    taxRate: record.taxRate,
    itemCount: items.length,
    itemNames: items.map((item) => item.name),
    items,
    content: record.content,
  };
}

function buildCarrierFields(record: {
  carrierType: string;
  carrierValue: string;
}): { phone?: string; orderCode?: string } {
  if (record.carrierType === "mobile_barcode") {
    return { phone: record.carrierValue };
  }
  if (record.carrierType === "member_code") {
    return { orderCode: record.carrierValue };
  }
  return {};
}

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

class IssueStatusConflictError extends Error {
  constructor(readonly status: EInvoiceStatus) {
    super(`invoice status ${status} cannot issue`);
  }
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 還沒呼叫 Giveme 就結束：前端可據此判斷「未送出，可重試」 */
function beforeProvider(status: number, error: string) {
  return NextResponse.json({ ok: false, stage: "before_provider", error }, { status });
}

/** 事件 log 只是紀錄，不重試、不佔時間預算，失敗只記 log */
async function logEventBestEffort(
  client: SheetsClient,
  event: Omit<EInvoiceEventRecord, "eventId" | "occurredAt">,
): Promise<void> {
  try {
    await appendEInvoiceEvent(client, event, SHEETS_NO_RETRY);
  } catch (err) {
    console.error("[einvoice issue] 事件寫入失敗", event.invoiceId, event.eventType, errorMessageOf(err));
  }
}

async function callGiveme(record: EInvoiceRecord, items: PersistedIssueItemSummary[]) {
  return record.buyerType === "b2b"
    ? issueB2BInvoice({
        customerName: record.buyerName,
        buyerTaxId: record.buyerTaxId,
        datetime: record.invoiceDate,
        email: record.email,
        taxState: "0",
        totalFee: String(record.totalAmount),
        amount: String(record.taxAmount),
        sales: String(record.untaxedAmount),
        taxType: record.taxType === 4 ? 0 : record.taxType,
        content: record.overallRemark?.trim() || record.content,
        items,
      })
    : issueB2CInvoice({
        customerName: record.buyerName,
        datetime: record.invoiceDate,
        email: record.email,
        donationCode: record.donationCode,
        taxType: record.taxType,
        totalFee: String(record.totalAmount),
        content: record.overallRemark?.trim() || record.content,
        items,
        ...buildCarrierFields(record),
      });
}

/**
 * Giveme 成功後的寫回：先用剩餘預算寫一次 issued；失敗就（不重試）改寫 needs_review。
 * 兩次都失敗時紀錄停在 issuing（不可重開，5 分鐘後畫面會開放人工處理），
 * 回給前端的狀態用 needs_review 表示「已開出、紀錄未確定」。
 */
async function persistIssued(
  client: SheetsClient,
  invoiceId: string,
  issuingRecord: EInvoiceRecord,
  finalRecord: (record: EInvoiceRecord) => EInvoiceRecord,
  deadline: number,
): Promise<{ record: EInvoiceRecord; warning: string }> {
  let writeError: string;
  try {
    const persisted = await updateEInvoiceRecord(client, invoiceId, finalRecord, { deadline });
    if (persisted) return { record: persisted, warning: "" };
    writeError = "找不到發票紀錄列";
  } catch (err) {
    writeError = errorMessageOf(err);
  }
  const issued = finalRecord(issuingRecord);
  const fallback = buildIssuedWriteFailedRecord(issued, issued.providerInvoiceNo, writeError, isoNow());
  try {
    const persisted = await updateEInvoiceRecord(
      client,
      invoiceId,
      (record) => buildIssuedWriteFailedRecord(finalRecord(record), issued.providerInvoiceNo, writeError, isoNow()),
      SHEETS_NO_RETRY,
    );
    if (!persisted) console.error("[einvoice issue] 已開立但改寫 needs_review 時找不到紀錄列", invoiceId, issued.providerInvoiceNo);
  } catch (err) {
    console.error("[einvoice issue] 已開立但紀錄兩次寫入都失敗", invoiceId, issued.providerInvoiceNo, errorMessageOf(err));
  }
  return { record: fallback, warning: fallback.errorMessage };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const startedAt = Date.now();
  const providerCutoff = startedAt + ISSUE_TIMING.totalBudgetMs - ISSUE_TIMING.minRemainingForProviderMs;
  const finalDeadline = startedAt + ISSUE_TIMING.totalBudgetMs;

  const { invoiceId } = await params;
  const session = await getSession(request);
  if (!session) return beforeProvider(401, "not_authenticated");
  if (session.role !== "admin") return beforeProvider(403, "forbidden");

  const client = await getSheetsClient();
  if (!client) return beforeProvider(503, "Google Sheets 未設定");

  // body 只取開立日期；紀錄一律以 Sheets 為準（不信任前端帶來的 invoiceRecord）
  const body = (await request.json().catch(() => ({}))) as { invoiceDate?: unknown };
  const bodyInvoiceDate = typeof body.invoiceDate === "string" ? body.invoiceDate.trim() : "";

  // 1. 送 Giveme 前一定先把狀態寫成 issuing：之後不論逾時或被中斷，紀錄都不會停在可重開的 draft/failed
  let fromStatus: EInvoiceStatus = "draft";
  let issuingRecord: EInvoiceRecord | null;
  try {
    issuingRecord = await updateEInvoiceRecord(client, invoiceId, (record) => {
      if (!isIssuableStatus(record.status)) throw new IssueStatusConflictError(record.status);
      fromStatus = record.status;
      return {
        ...record,
        status: "issuing",
        ...(bodyInvoiceDate ? { invoiceDate: bodyInvoiceDate } : {}),
        updatedAt: isoNow(),
      };
    }, { deadline: providerCutoff });
  } catch (err) {
    if (err instanceof IssueStatusConflictError) return beforeProvider(409, err.message);
    return beforeProvider(503, `系統紀錄暫時無法寫入，未送出開立：${errorMessageOf(err)}`);
  }
  if (!issuingRecord) return beforeProvider(404, "invoice not found");

  // 2. 剩餘時間不夠呼叫 Giveme 並寫回結果 → 不送，盡力把狀態改回去
  if (Date.now() > providerCutoff) {
    const revertTo = fromStatus;
    await updateEInvoiceRecord(client, invoiceId, (record) => (
      record.status === "issuing" ? { ...record, status: revertTo, updatedAt: isoNow() } : record
    ), SHEETS_NO_RETRY).catch((err) => console.error("[einvoice issue] 改回原狀態失敗", invoiceId, errorMessageOf(err)));
    return beforeProvider(503, "系統忙碌（Google 寫入配額），未送出開立，請稍後重試");
  }

  const items = parseEInvoiceItems(issuingRecord.itemsJson).map((item) => ({
    name: item.name,
    money: item.unitPrice,
    number: item.quantity,
    remark: item.remark,
    taxType: item.taxType,
  }));
  const requestSummary = JSON.stringify(buildPersistedIssuePayloadSummary(issuingRecord, items));

  await logEventBestEffort(client, {
    invoiceId,
    eventType: "issue_started",
    fromStatus,
    toStatus: "issuing",
    message: "開始送出 Giveme 開票請求",
    requestJson: JSON.stringify({ sourceType: issuingRecord.sourceType, sourceId: issuingRecord.sourceId, totalAmount: issuingRecord.totalAmount, itemCount: items.length }),
    responseJson: "",
    actor: session.displayName,
  });

  // 3. 呼叫 Giveme：只有乾淨的 success:false 才算確定沒開出；逾時／連線／非 JSON 一律視為不明
  let outcome: ProviderOutcome;
  let providerResponse: Awaited<ReturnType<typeof callGiveme>> | null = null;
  try {
    providerResponse = await callGiveme(issuingRecord, items);
    outcome = providerResponse.success
      ? { kind: "success", code: providerResponse.code, msg: providerResponse.msg }
      : { kind: "rejected", code: providerResponse.code, msg: providerResponse.msg };
  } catch (err) {
    outcome = { kind: "unknown", message: errorMessageOf(err) };
  }

  const responseSummary = JSON.stringify(providerResponse
    ? {
        success: providerResponse.success,
        code: providerResponse.code,
        msg: providerResponse.msg,
        totalFee: providerResponse.totalFee ?? "",
        phone: providerResponse.phone ?? "",
        orderCode: providerResponse.orderCode ?? "",
      }
    : { error: outcome.kind === "unknown" ? outcome.message : "" });
  const finalRecord = (record: EInvoiceRecord) =>
    applyProviderOutcome(record, outcome, { responseJson: responseSummary, requestJson: requestSummary, now: isoNow() });

  // 4. 寫回結果
  if (outcome.kind === "success") {
    const { record, warning } = await persistIssued(client, invoiceId, issuingRecord, finalRecord, finalDeadline);
    await logEventBestEffort(client, {
      invoiceId,
      eventType: "issue_succeeded",
      fromStatus: "issuing",
      toStatus: record.status,
      message: warning || `成功開立 ${outcome.code}`,
      requestJson: requestSummary,
      responseJson: responseSummary,
      actor: session.displayName,
    });
    return NextResponse.json({ ok: true, invoice: record, provider: providerResponse, ...(warning ? { warning } : {}) });
  }

  let record = finalRecord(issuingRecord);
  let warning = "";
  try {
    record = (await updateEInvoiceRecord(client, invoiceId, finalRecord, { deadline: finalDeadline })) ?? record;
  } catch (err) {
    // 紀錄停在 issuing（不可重開），5 分鐘後畫面開放人工處理
    warning = `結果寫回失敗，開票歷史會顯示「開立中」：${errorMessageOf(err)}`;
    console.error("[einvoice issue] 結果寫回失敗", invoiceId, outcome.kind, errorMessageOf(err));
  }
  await logEventBestEffort(client, {
    invoiceId,
    eventType: "issue_failed",
    fromStatus: "issuing",
    toStatus: record.status,
    message: record.errorMessage,
    requestJson: requestSummary,
    responseJson: responseSummary,
    actor: session.displayName,
  });

  if (outcome.kind === "rejected") {
    return NextResponse.json(
      { ok: false, stage: "provider", error: record.errorMessage, invoice: record, provider: providerResponse, ...(warning ? { warning } : {}) },
      { status: 502 },
    );
  }
  return NextResponse.json(
    { ok: false, stage: "provider_unknown", error: PROVIDER_UNKNOWN_MESSAGE, invoice: record, ...(warning ? { warning } : {}) },
    { status: 502 },
  );
}
