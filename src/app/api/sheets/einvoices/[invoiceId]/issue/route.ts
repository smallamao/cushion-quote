import { NextResponse } from "next/server";

import { issueB2BInvoice, issueB2CInvoice } from "@/lib/giveme-client";
import { parseEInvoiceItems, isoNow } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";
import type { EInvoiceRecord } from "@/lib/types";

import { getSession } from "../../_auth";
import { appendEInvoiceEvent, getEInvoiceRecordById, updateEInvoiceRecord } from "../../_shared";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  let inlineRecord: EInvoiceRecord | undefined;
  let bodyInvoiceDate: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { invoiceRecord?: EInvoiceRecord; invoiceDate?: string };
    if (body.invoiceRecord && body.invoiceRecord.invoiceId === invoiceId &&
        (body.invoiceRecord.status === "draft" || body.invoiceRecord.status === "failed")) {
      inlineRecord = body.invoiceRecord;
    }
    if (typeof body.invoiceDate === "string" && body.invoiceDate.trim()) {
      bodyInvoiceDate = body.invoiceDate.trim();
    }
  } catch {
    // body parse failure is non-fatal; fall through to Sheets lookup
  }

  try {
    const current = inlineRecord ?? await getEInvoiceRecordById(client, invoiceId);
    if (!current) {
      return NextResponse.json({ ok: false, error: "invoice not found" }, { status: 404 });
    }
    if (current.status !== "draft" && current.status !== "failed") {
      return NextResponse.json({ ok: false, error: `invoice status ${current.status} cannot issue` }, { status: 409 });
    }

    // When we have the inline record (just created), skip the intermediate "issuing" write
    // to avoid spending the propagation-retry budget before the Giveme call.
    // The final status write below will handle the Sheets update.
    let draftRecord: EInvoiceRecord | null;
    if (inlineRecord) {
      draftRecord = { ...inlineRecord, status: "issuing", ...(bodyInvoiceDate ? { invoiceDate: bodyInvoiceDate } : {}), updatedAt: isoNow() };
    } else {
      draftRecord = await updateEInvoiceRecord(client, invoiceId, (record) => ({
        ...record,
        status: "issuing",
        ...(bodyInvoiceDate ? { invoiceDate: bodyInvoiceDate } : {}),
        updatedAt: isoNow(),
      }));
    }
    if (!draftRecord) {
      return NextResponse.json({ ok: false, error: "invoice not found" }, { status: 404 });
    }

    const items = parseEInvoiceItems(draftRecord.itemsJson).map((item) => ({
      name: item.name,
      money: item.unitPrice,
      number: item.quantity,
      remark: item.remark,
      taxType: item.taxType,
    }));

    await appendEInvoiceEvent(client, {
      invoiceId,
      eventType: "issue_started",
      fromStatus: current.status,
      toStatus: "issuing",
      message: "開始送出 Giveme 開票請求",
      requestJson: JSON.stringify({ sourceType: draftRecord.sourceType, sourceId: draftRecord.sourceId, totalAmount: draftRecord.totalAmount, itemCount: items.length }),
      responseJson: "",
      actor: session.displayName,
    });

    const result = draftRecord.buyerType === "b2b"
      ? await issueB2BInvoice({
          customerName: draftRecord.buyerName,
          buyerTaxId: draftRecord.buyerTaxId,
          datetime: draftRecord.invoiceDate,
          email: draftRecord.email,
          taxState: "0",
          totalFee: String(draftRecord.totalAmount),
          amount: String(draftRecord.taxAmount),
          sales: String(draftRecord.untaxedAmount),
          taxType: draftRecord.taxType === 4 ? 0 : draftRecord.taxType,
          content: draftRecord.content,
          items,
        })
      : await issueB2CInvoice({
          customerName: draftRecord.buyerName,
          datetime: draftRecord.invoiceDate,
          email: draftRecord.email,
          donationCode: draftRecord.donationCode,
          taxType: draftRecord.taxType,
          totalFee: String(draftRecord.totalAmount),
          content: draftRecord.content,
          items,
          ...buildCarrierFields(draftRecord),
        });

    const responseSummary = JSON.stringify({
      success: result.success,
      code: result.code,
      msg: result.msg,
      totalFee: result.totalFee ?? "",
      phone: result.phone ?? "",
      orderCode: result.orderCode ?? "",
    });
    const requestSummary = JSON.stringify(buildPersistedIssuePayloadSummary(draftRecord, items));

    const nextStatus = result.success ? "issued" : "failed";
    const finalUpdater = (record: EInvoiceRecord): EInvoiceRecord => ({
      ...record,
      status: nextStatus,
      providerInvoiceNo: result.code || record.providerInvoiceNo,
      providerResponseJson: responseSummary,
      requestPayloadJson: requestSummary,
      errorCode: result.success ? "" : result.code,
      errorMessage: result.success ? "" : result.msg || "Giveme 開立失敗",
      updatedAt: isoNow(),
    });
    draftRecord = await updateEInvoiceRecord(client, invoiceId, finalUpdater);
    // If Sheets still hasn't propagated (row not found), build final record in memory so the
    // client receives a valid record for immediate local-state update.
    if (!draftRecord && inlineRecord) {
      draftRecord = finalUpdater({ ...inlineRecord, status: "issuing" as const });
    }

    await appendEInvoiceEvent(client, {
      invoiceId,
      eventType: result.success ? "issue_succeeded" : "issue_failed",
      fromStatus: "issuing",
      toStatus: nextStatus,
      message: result.success ? `成功開立 ${result.code}` : result.msg || "Giveme 開立失敗",
      requestJson: draftRecord?.requestPayloadJson ?? "",
      responseJson: responseSummary,
      actor: session.displayName,
    });

    return NextResponse.json({ ok: result.success, invoice: draftRecord, provider: result }, { status: result.success ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await updateEInvoiceRecord(client, invoiceId, (record) => ({
      ...record,
      status: "failed",
      errorMessage: message,
      updatedAt: isoNow(),
    }));
    await appendEInvoiceEvent(client, {
      invoiceId,
      eventType: "issue_failed",
      fromStatus: "issuing",
      toStatus: "failed",
      message,
      requestJson: "",
      responseJson: "",
      actor: session.displayName,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
