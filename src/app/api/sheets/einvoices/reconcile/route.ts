import { NextResponse } from "next/server";

import { eInvoiceEventRowToRecord, isoNow, isoDateNow } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";
import type { EInvoiceRecord } from "@/lib/types";

import { getSession } from "../_auth";
import {
  appendEInvoiceRecord,
  getEInvoiceEventRows,
  getEInvoiceRecords,
  updateEInvoiceRecord,
} from "../_shared";

function parseJsonSafe(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
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

    let repaired = 0;
    let updated = 0;

    for (const [invoiceId, evList] of byInvoice) {
      const successEv = evList.find((e) => e.eventType === "issue_succeeded");
      if (!successEv) continue;

      const draftEv = evList.find((e) => e.eventType === "draft_created");
      const responseData = parseJsonSafe(successEv.responseJson);
      const requestData = parseJsonSafe(successEv.requestJson ?? "");
      const draftRequestData = draftEv ? parseJsonSafe(draftEv.requestJson ?? "") : {};

      const providerInvoiceNo = typeof responseData.code === "string" ? responseData.code : "";
      const sourceType = (typeof requestData.sourceType === "string" ? requestData.sourceType : draftRequestData.sourceType ?? "manual") as EInvoiceRecord["sourceType"];
      const sourceId = typeof requestData.sourceId === "string" ? requestData.sourceId : typeof draftRequestData.sourceId === "string" ? draftRequestData.sourceId : "";
      const buyerType = (typeof requestData.buyerType === "string" ? requestData.buyerType : "b2c") as EInvoiceRecord["buyerType"];
      const totalAmount = typeof requestData.totalAmount === "number" ? requestData.totalAmount : typeof draftRequestData.totalAmount === "number" ? draftRequestData.totalAmount : 0;
      const untaxedAmount = Math.round(totalAmount / 1.05);
      const taxAmount = totalAmount - untaxedAmount;
      const occurredAt = draftEv?.occurredAt ?? successEv.occurredAt;
      const invoiceDate = occurredAt ? occurredAt.slice(0, 10) : isoDateNow();

      const existing = existingById.get(invoiceId);

      if (!existing) {
        // Record missing entirely — create stub from event data
        const now = isoNow();
        const stub: EInvoiceRecord = {
          invoiceId,
          retryOfInvoiceId: "",
          sourceType,
          sourceId,
          sourceSubId: "",
          quoteId: "",
          versionId: "",
          caseId: "",
          clientId: "",
          buyerType,
          buyerName: "（記錄已遺失）",
          buyerTaxId: "",
          email: "",
          carrierType: "none",
          carrierValue: "",
          donationCode: "",
          invoiceDate,
          taxType: 0,
          untaxedAmount,
          taxAmount,
          totalAmount,
          taxRate: 5,
          itemCount: typeof draftRequestData.itemCount === "number" ? draftRequestData.itemCount : 1,
          itemsJson: "[]",
          content: "",
          status: "issued",
          providerName: "giveme",
          providerInvoiceNo,
          providerTrackNo: "",
          providerResponseJson: successEv.responseJson,
          requestPayloadJson: successEv.requestJson ?? "",
          errorCode: "",
          errorMessage: "",
          cancelledAt: "",
          cancelReason: "",
          createdBy: successEv.actor,
          createdAt: occurredAt ?? now,
          updatedAt: now,
        };
        await appendEInvoiceRecord(client, stub);
        existingById.set(invoiceId, stub);
        repaired++;
      } else if (existing.status === "draft" || existing.status === "issuing") {
        // Record exists but status not updated — fix it
        await updateEInvoiceRecord(client, invoiceId, (record) => ({
          ...record,
          status: "issued",
          providerInvoiceNo: providerInvoiceNo || record.providerInvoiceNo,
          providerResponseJson: successEv.responseJson || record.providerResponseJson,
          updatedAt: isoNow(),
        }));
        updated++;
      }
    }

    // Wait for Sheets propagation before returning so the client's reload sees the new rows
    if (repaired > 0 || updated > 0) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }

    return NextResponse.json({ ok: true, repaired, updated, message: `修復完成：新建 ${repaired} 筆，更新狀態 ${updated} 筆` });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "修復失敗" }, { status: 500 });
  }
}
