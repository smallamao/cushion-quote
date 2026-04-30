import "server-only";

import { NextResponse } from "next/server";

import { queryInvoice } from "@/lib/giveme-client";
import { getSheetsClient } from "@/lib/sheets-client";
import { lookupCompanyByTaxId } from "@/lib/tax-id";

import { getSession } from "../_auth";
import { getEInvoiceRecords, updateEInvoiceRecord } from "../_shared";

interface BackfillResult {
  invoiceId: string;
  providerInvoiceNo: string;
  status: "updated" | "skipped" | "failed";
  filledFields: string[];
  reason?: string;
}

export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) return NextResponse.json({ error: "Google Sheets 未設定" }, { status: 503 });

  const records = await getEInvoiceRecords(sheetsClient);

  // Only target issued invoices that have a giveme invoice number AND are missing
  // at least one of the buyer fields. Anything else is skipped to keep the
  // operation idempotent and cheap.
  const targets = records.filter(
    (r) =>
      r.status === "issued" &&
      r.providerInvoiceNo.trim() !== "" &&
      (!r.buyerName.trim() || !r.buyerTaxId.trim() || !r.buyerAddress.trim()),
  );

  const results: BackfillResult[] = [];

  for (const record of targets) {
    const filledFields: string[] = [];
    let nextBuyerName = record.buyerName;
    let nextBuyerTaxId = record.buyerTaxId;
    let nextBuyerAddress = record.buyerAddress;

    try {
      // Step 1: query giveme for customerName + phone (taxId)
      if (!nextBuyerName.trim() || !nextBuyerTaxId.trim()) {
        try {
          const remote = await queryInvoice(record.providerInvoiceNo);
          const remoteName = (remote.customerName ?? "").trim();
          const remoteTaxId = (remote.phone ?? "").trim();
          if (!nextBuyerName.trim() && remoteName) {
            nextBuyerName = remoteName;
            filledFields.push("buyerName");
          }
          if (!nextBuyerTaxId.trim() && remoteTaxId) {
            nextBuyerTaxId = remoteTaxId;
            filledFields.push("buyerTaxId");
          }
        } catch (err) {
          results.push({
            invoiceId: record.invoiceId,
            providerInvoiceNo: record.providerInvoiceNo,
            status: "failed",
            filledFields,
            reason: `giveme query failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
      }

      // Step 2: GCIS lookup for address (and name fallback) when taxId is known
      if (nextBuyerTaxId.trim() && (!nextBuyerAddress.trim() || !nextBuyerName.trim())) {
        const company = await lookupCompanyByTaxId(nextBuyerTaxId.trim());
        if (company) {
          if (!nextBuyerAddress.trim() && company.address) {
            nextBuyerAddress = company.address;
            filledFields.push("buyerAddress");
          }
          if (!nextBuyerName.trim() && company.name) {
            nextBuyerName = company.name;
            filledFields.push("buyerName");
          }
        }
      }

      if (filledFields.length === 0) {
        results.push({
          invoiceId: record.invoiceId,
          providerInvoiceNo: record.providerInvoiceNo,
          status: "skipped",
          filledFields,
          reason: "no remote data found",
        });
        continue;
      }

      await updateEInvoiceRecord(sheetsClient, record.invoiceId, (current) => ({
        ...current,
        buyerName: nextBuyerName,
        buyerTaxId: nextBuyerTaxId,
        buyerAddress: nextBuyerAddress,
        updatedAt: new Date().toISOString(),
      }));

      results.push({
        invoiceId: record.invoiceId,
        providerInvoiceNo: record.providerInvoiceNo,
        status: "updated",
        filledFields,
      });
    } catch (err) {
      results.push({
        invoiceId: record.invoiceId,
        providerInvoiceNo: record.providerInvoiceNo,
        status: "failed",
        filledFields,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    scanned: records.length,
    eligible: targets.length,
    updated: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
  };

  return NextResponse.json({ summary, results });
}
