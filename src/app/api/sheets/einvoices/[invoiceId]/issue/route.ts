import { NextResponse } from "next/server";

import { issueB2BInvoice, issueB2CInvoice } from "@/lib/giveme-client";
import { parseEInvoiceItems, isoNow } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../../_auth";
import { appendEInvoiceEvent, getEInvoiceRecordById, updateEInvoiceRecord } from "../../_shared";

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

  try {
    const current = await getEInvoiceRecordById(client, invoiceId);
    if (!current) {
      return NextResponse.json({ ok: false, error: "invoice not found" }, { status: 404 });
    }
    if (current.status !== "draft") {
      return NextResponse.json({ ok: false, error: `invoice status ${current.status} cannot issue` }, { status: 409 });
    }

    let draftRecord = await updateEInvoiceRecord(client, invoiceId, (record) => ({
      ...record,
      status: "issuing",
      updatedAt: isoNow(),
    }));
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
    const requestSummary = JSON.stringify({
      buyerType: draftRecord.buyerType,
      sourceType: draftRecord.sourceType,
      sourceId: draftRecord.sourceId,
      totalAmount: draftRecord.totalAmount,
      itemNames: items.map((item) => item.name),
      buyerTaxIdMasked: draftRecord.buyerTaxId ? `${"*".repeat(Math.max(0, draftRecord.buyerTaxId.length - 4))}${draftRecord.buyerTaxId.slice(-4)}` : "",
      emailMasked: draftRecord.email ? `${draftRecord.email.slice(0, 2)}***` : "",
    });

    const nextStatus = result.success ? "issued" : "failed";
    draftRecord = await updateEInvoiceRecord(client, invoiceId, (record) => ({
      ...record,
      status: nextStatus,
      providerInvoiceNo: result.code || record.providerInvoiceNo,
      providerResponseJson: responseSummary,
      requestPayloadJson: requestSummary,
      errorCode: result.success ? "" : result.code,
      errorMessage: result.success ? "" : result.msg || "Giveme 開立失敗",
      updatedAt: isoNow(),
    }));

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
