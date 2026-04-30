import { NextResponse } from "next/server";

import { eInvoiceEventRowToRecord, isoNow, isoDateNow } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";
import type { EInvoiceRecord } from "@/lib/types";

import { getSession } from "../_auth";
import {
  batchAppendEInvoiceRecords,
  getEInvoiceEventRows,
  getEInvoiceRecords,
  updateEInvoiceRecord,
} from "../_shared";

function parseJsonSafe(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

function readStringField(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readNumberField(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeRecoveredItems(value: unknown): Array<{
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  remark: string;
  taxType: 0 | 1 | 2;
}> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const current = item as Record<string, unknown>;
    const name = readStringField(current.name);
    if (!name) return [];

    const quantity = readNumberField(current.quantity, current.number) || 1;
    const unitPrice = readNumberField(current.unitPrice, current.money);
    const amount = readNumberField(current.amount) || unitPrice * quantity;
    const rawTaxType = readNumberField(current.taxType);

    return [{
      name,
      quantity,
      unitPrice,
      amount,
      remark: readStringField(current.remark),
      taxType: rawTaxType === 1 || rawTaxType === 2 ? rawTaxType : 0,
    }];
  });
}

export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });

  try {
    const [eventRows, existingRecords] = await Promise.all([
      getEInvoiceEventRows(client),
      getEInvoiceRecords(client),
    ]);

    const events = eventRows.map(eInvoiceEventRowToRecord).filter((e) => e.invoiceId);
    const existingById = new Map(existingRecords.map((r) => [r.invoiceId, r]));

    // Group events by invoiceId
    const byInvoice = new Map<string, typeof events>();
    for (const ev of events) {
      const list = byInvoice.get(ev.invoiceId) ?? [];
      list.push(ev);
      byInvoice.set(ev.invoiceId, list);
    }

    const newRecords: EInvoiceRecord[] = [];
    const updatedRecords: EInvoiceRecord[] = [];

    for (const [invoiceId, evList] of byInvoice) {
      const successEv = evList.find((e) => e.eventType === "issue_succeeded");
      if (!successEv) continue;

      const draftEv = evList.find((e) => e.eventType === "draft_created");
      const responseData = parseJsonSafe(successEv.responseJson);
      const requestData = parseJsonSafe(successEv.requestJson ?? "");
      const draftRequestData = draftEv ? parseJsonSafe(draftEv.requestJson ?? "") : {};

      const providerInvoiceNo = readStringField(responseData.code);
      const sourceType = (readStringField(requestData.sourceType, draftRequestData.sourceType) || "manual") as EInvoiceRecord["sourceType"];
      const sourceId = readStringField(requestData.sourceId, draftRequestData.sourceId);
      const sourceSubId = readStringField(requestData.sourceSubId, draftRequestData.sourceSubId);
      const quoteId = readStringField(requestData.quoteId, draftRequestData.quoteId);
      const versionId = readStringField(requestData.versionId, draftRequestData.versionId);
      const caseId = readStringField(requestData.caseId, draftRequestData.caseId);
      const clientId = readStringField(requestData.clientId, draftRequestData.clientId);
      const buyerName = readStringField(requestData.buyerName, draftRequestData.buyerName);
      const buyerTaxId = readStringField(requestData.buyerTaxId, draftRequestData.buyerTaxId);
      const buyerAddress = readStringField(requestData.buyerAddress, draftRequestData.buyerAddress);
      // Derive buyerType: explicit "b2b" wins; otherwise infer from buyerTaxId presence
      const rawBuyerType = readStringField(requestData.buyerType, draftRequestData.buyerType);
      const buyerType: EInvoiceRecord["buyerType"] = rawBuyerType === "b2b" || Boolean(buyerTaxId) ? "b2b" : "b2c";
      const email = readStringField(requestData.email, draftRequestData.email);
      const content = readStringField(requestData.content, draftRequestData.content);
      const carrierType = (readStringField(requestData.carrierType, draftRequestData.carrierType) || "none") as EInvoiceRecord["carrierType"];
      const carrierValue = readStringField(requestData.carrierValue, draftRequestData.carrierValue);
      const donationCode = readStringField(requestData.donationCode, draftRequestData.donationCode);
      const totalAmount = readNumberField(requestData.totalAmount, draftRequestData.totalAmount);

      // Read taxType / taxRate from event log — never assume 5% (event log must record these)
      const rawTaxType = requestData.taxType ?? draftRequestData.taxType;
      const rawTaxRate = requestData.taxRate ?? draftRequestData.taxRate;
      const knownTaxType = typeof rawTaxType === "number" && [0, 1, 2, 4].includes(rawTaxType);
      const knownTaxRate = typeof rawTaxRate === "number";

      const taxType: EInvoiceRecord["taxType"] = knownTaxType ? (rawTaxType as 0 | 1 | 2 | 4) : 0;
      const taxRate: number = knownTaxRate ? rawTaxRate as number : (knownTaxType ? (taxType === 0 ? 5 : 0) : 5);
      const untaxedAmount = knownTaxType || knownTaxRate
        ? (taxRate > 0 ? Math.round(totalAmount / (1 + taxRate / 100)) : totalAmount)
        : Math.round(totalAmount / 1.05);
      const taxAmount = totalAmount - untaxedAmount;

      // If tax info is unknown, flag for manual review instead of auto-publishing with guessed values
      const isUnknownTax = !knownTaxType && !knownTaxRate;

      const occurredAt = draftEv?.occurredAt ?? successEv.occurredAt;
      const invoiceDate = readStringField(requestData.invoiceDate, draftRequestData.invoiceDate) || (occurredAt ? occurredAt.slice(0, 10) : isoDateNow());
      const recoveredItems = normalizeRecoveredItems(
        Array.isArray(requestData.items)
          ? requestData.items
          : Array.isArray(draftRequestData.items)
            ? draftRequestData.items
            : [],
      );
      const itemsJson = recoveredItems.length > 0 ? JSON.stringify(recoveredItems) : "[]";
      const itemCount = readNumberField(requestData.itemCount, draftRequestData.itemCount) || recoveredItems.length || 1;

      const existing = existingById.get(invoiceId);

      if (!existing) {
        const now = isoNow();
        const stub: EInvoiceRecord = {
          invoiceId,
          retryOfInvoiceId: "",
          sourceType,
          sourceId,
          sourceSubId,
          quoteId,
          versionId,
          caseId,
          clientId,
          buyerType,
          buyerName: buyerName || "（記錄已遺失）",
          buyerTaxId,
          buyerAddress,
          email,
          carrierType,
          carrierValue,
          donationCode,
          invoiceDate,
          taxType,
          untaxedAmount,
          taxAmount,
          totalAmount,
          taxRate,
          itemCount,
          itemsJson,
          content,
          // If we can't determine the tax type from event logs, flag for manual review
          status: isUnknownTax ? "needs_review" : "issued",
          providerName: "giveme",
          providerInvoiceNo,
          providerTrackNo: "",
          providerResponseJson: successEv.responseJson,
          requestPayloadJson: successEv.requestJson ?? "",
          errorCode: "",
          errorMessage: isUnknownTax ? "reconcile 無法從事件紀錄判定稅型，請人工確認稅率後修正" : "",
          cancelledAt: "",
          cancelReason: "",
          createdBy: successEv.actor,
          createdAt: occurredAt ?? now,
          updatedAt: now,
          internalNote: "",
          overallRemark: "",
        };
        newRecords.push(stub);
      } else if (existing.status === "draft" || existing.status === "issuing") {
        const next = await updateEInvoiceRecord(client, invoiceId, (record) => ({
          ...record,
          status: isUnknownTax ? "needs_review" : "issued",
          buyerType: record.buyerType === "b2b" || buyerTaxId ? "b2b" : record.buyerType,
          buyerName: record.buyerName || buyerName,
          buyerTaxId: record.buyerTaxId || buyerTaxId,
          buyerAddress: record.buyerAddress || buyerAddress,
          email: record.email || email,
          carrierType: record.carrierType === "none" && carrierType !== "none" ? carrierType : record.carrierType,
          carrierValue: record.carrierValue || carrierValue,
          donationCode: record.donationCode || donationCode,
          sourceSubId: record.sourceSubId || sourceSubId,
          quoteId: record.quoteId || quoteId,
          versionId: record.versionId || versionId,
          caseId: record.caseId || caseId,
          clientId: record.clientId || clientId,
          invoiceDate: record.invoiceDate || invoiceDate,
          itemCount: record.itemCount || itemCount,
          itemsJson: record.itemsJson === "[]" && itemsJson !== "[]" ? itemsJson : record.itemsJson,
          content: record.content || content,
          providerInvoiceNo: providerInvoiceNo || record.providerInvoiceNo,
          providerResponseJson: successEv.responseJson || record.providerResponseJson,
          requestPayloadJson: successEv.requestJson || record.requestPayloadJson,
          errorMessage: isUnknownTax ? "reconcile 無法從事件紀錄判定稅型，請人工確認稅率後修正" : record.errorMessage,
          updatedAt: isoNow(),
        }));
        if (next) updatedRecords.push(next);
      } else if (
        (existing.buyerName === "（記錄已遺失）" && buyerName)
        || (!existing.buyerAddress && buyerAddress)
        || (!existing.buyerTaxId && buyerTaxId)
      ) {
        // Backfill buyer info into existing stubs that were previously missing it
        const next = await updateEInvoiceRecord(client, invoiceId, (record) => {
          const filledTaxId = record.buyerTaxId || buyerTaxId;
          const correctedBuyerType: EInvoiceRecord["buyerType"] =
            record.buyerType === "b2b" || filledTaxId ? "b2b" : record.buyerType;
          return {
            ...record,
            buyerType: correctedBuyerType,
            buyerName: record.buyerName === "（記錄已遺失）" && buyerName ? buyerName : record.buyerName,
            buyerTaxId: filledTaxId,
            buyerAddress: record.buyerAddress || buyerAddress,
            email: record.email || email,
            sourceSubId: record.sourceSubId || sourceSubId,
            quoteId: record.quoteId || quoteId,
            versionId: record.versionId || versionId,
            caseId: record.caseId || caseId,
            clientId: record.clientId || clientId,
            carrierType: record.carrierType === "none" && carrierType !== "none" ? carrierType : record.carrierType,
            carrierValue: record.carrierValue || carrierValue,
            donationCode: record.donationCode || donationCode,
            itemsJson: record.itemsJson === "[]" && itemsJson !== "[]" ? itemsJson : record.itemsJson,
            itemCount: record.itemCount || itemCount,
            content: record.content || content,
            updatedAt: isoNow(),
          };
        });
        if (next) updatedRecords.push(next);
      }
    }

    // Write all new stubs in a single batch to avoid table-detection scatter
    await batchAppendEInvoiceRecords(client, newRecords);

    return NextResponse.json({
      ok: true,
      repaired: newRecords.length,
      updated: updatedRecords.length,
      newRecords,
      updatedRecords,
      message: `修復完成：新建 ${newRecords.length} 筆，更新狀態 ${updatedRecords.length} 筆`,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "修復失敗" }, { status: 500 });
  }
}
