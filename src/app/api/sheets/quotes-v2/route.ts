import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { QuotePlanRecord, QuoteVersionRecord, VersionLineRecord } from "@/lib/types";

import {
  calculateNextFollowUpDate,
  calculateReminderStatus,
  caseRecordToRow,
  caseRowToRecord,
  generateQuoteId,
  getCaseRows,
  getQuoteRows,
  isoDateNow,
  isoNow,
  lineRecordToRow,
  makeItemId,
  quoteRecordToRow,
  quoteRowToRecord,
  sortSheetRows,
  versionRecordToRow,
} from "../_v2-utils";
import { syncAutoCommissionSettlements } from "../_settlement-utils";

interface CreateQuotePayload {
  caseId: string;
  quoteName?: string;
  quoteType?: string;
  scopeNote?: string;
  sortOrder?: number;
  internalNotes?: string;
  firstVersion?: Partial<QuoteVersionRecord> & {
    lines?: Array<Partial<VersionLineRecord>>;
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("caseId")?.trim() ?? "";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ quotes: [] as QuotePlanRecord[] });
  }

  try {
    const rows = await getQuoteRows(client);
    const quotes = rows.map(quoteRowToRecord).filter((quote) => !caseId || quote.caseId === caseId);
    return NextResponse.json({ quotes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as CreateQuotePayload;
  const caseId = payload.caseId?.trim() ?? "";

  if (!caseId) {
    return NextResponse.json({ ok: false, error: "caseId is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const caseRows = await getCaseRows(client);
    const caseRowIndex = caseRows.findIndex((row) => row[0] === caseId);
    if (caseRowIndex === -1) {
      return NextResponse.json({ ok: false, error: "case not found" }, { status: 404 });
    }

    const caseRecord = caseRowToRecord(caseRows[caseRowIndex] ?? []);
    const { quoteId, quoteSeq } = await generateQuoteId(client, caseId);
    const versionId = `${quoteId}-V01`;
    const now = isoNow();
    const today = isoDateNow();

    const quoteRecord: QuotePlanRecord = {
      quoteId,
      caseId,
      quoteSeq,
      quoteName: payload.quoteName ?? "",
      quoteType: payload.quoteType ?? "",
      scopeNote: payload.scopeNote ?? "",
      quoteStatus: "draft",
      currentVersionId: versionId,
      selectedVersionId: "",
      versionCount: 1,
      latestSentAt: "",
      nextFollowUpDate: "",
      sortOrder: payload.sortOrder ?? quoteSeq,
      internalNotes: payload.internalNotes ?? "",
      createdAt: now,
      updatedAt: now,
    };

    const firstVersion = payload.firstVersion ?? {};
    const followUpDays = firstVersion.followUpDays ?? 0;
    const sentAt = firstVersion.sentAt ?? "";
    const nextFollowUpDate =
      firstVersion.nextFollowUpDate ?? calculateNextFollowUpDate(sentAt, followUpDays);

    const versionRecord: QuoteVersionRecord = {
      versionId,
      quoteId,
      caseId,
      versionNo: 1,
      basedOnVersionId: "",
      versionLabel: firstVersion.versionLabel ?? "V01",
      versionStatus: firstVersion.versionStatus ?? "draft",
      quoteDate: firstVersion.quoteDate ?? today,
      sentAt,
      validUntil: firstVersion.validUntil ?? "",
      followUpDays,
      nextFollowUpDate,
      lastFollowUpAt: firstVersion.lastFollowUpAt ?? "",
      reminderStatus: calculateReminderStatus({
        versionStatus: firstVersion.versionStatus ?? "draft",
        sentAt,
        nextFollowUpDate,
        lastFollowUpAt: firstVersion.lastFollowUpAt ?? "",
      }),
      subtotalBeforeTax: firstVersion.subtotalBeforeTax ?? 0,
      discountAmount: firstVersion.discountAmount ?? 0,
      taxRate: firstVersion.taxRate ?? 0,
      taxAmount: firstVersion.taxAmount ?? 0,
      totalAmount: firstVersion.totalAmount ?? 0,
      commissionMode: firstVersion.commissionMode ?? "price_gap",
      commissionRate: firstVersion.commissionRate ?? 0,
      commissionAmount: firstVersion.commissionAmount ?? 0,
      commissionFixedAmount: firstVersion.commissionFixedAmount ?? 0,
      commissionPartners: firstVersion.commissionPartners ?? "",
      estimatedCostTotal: firstVersion.estimatedCostTotal ?? 0,
      grossMarginAmount: firstVersion.grossMarginAmount ?? 0,
      grossMarginRate: firstVersion.grossMarginRate ?? 0,
      channel: firstVersion.channel ?? caseRecord.channelSnapshot,
      termsTemplate: firstVersion.termsTemplate ?? "",
      publicDescription: firstVersion.publicDescription ?? "",
      descriptionImageUrl: firstVersion.descriptionImageUrl ?? "",
      internalNotes: firstVersion.internalNotes ?? "",
      snapshotLocked: firstVersion.snapshotLocked ?? false,
      snapshotLockedAt: firstVersion.snapshotLockedAt ?? "",
      clientNameSnapshot: firstVersion.clientNameSnapshot ?? caseRecord.clientNameSnapshot,
      contactNameSnapshot: firstVersion.contactNameSnapshot ?? caseRecord.contactNameSnapshot,
      clientPhoneSnapshot: firstVersion.clientPhoneSnapshot ?? caseRecord.phoneSnapshot,
      projectNameSnapshot: firstVersion.projectNameSnapshot ?? caseRecord.caseName,
      projectAddressSnapshot: firstVersion.projectAddressSnapshot ?? caseRecord.projectAddress,
      channelSnapshot: firstVersion.channelSnapshot ?? caseRecord.channelSnapshot,
      quoteNameSnapshot: quoteRecord.quoteName,
      createdAt: now,
      updatedAt: now,
    };

    const linesInput = firstVersion.lines ?? [];
    const lineRecords: VersionLineRecord[] = linesInput.map((line, index) => ({
      itemId: makeItemId(versionId, index + 1),
      versionId,
      quoteId,
      caseId,
      lineNo: line.lineNo ?? index + 1,
      itemName: line.itemName ?? "",
      spec: line.spec ?? "",
      materialId: line.materialId ?? "",
      qty: line.qty ?? 0,
      unit: line.unit ?? "式",
      unitPrice: line.unitPrice ?? 0,
      lineAmount: line.lineAmount ?? 0,
      estimatedUnitCost: line.estimatedUnitCost ?? 0,
      estimatedCostAmount: line.estimatedCostAmount ?? 0,
      lineMarginAmount: line.lineMarginAmount ?? 0,
      lineMarginRate: line.lineMarginRate ?? 0,
      isCostItem: line.isCostItem ?? false,
      showOnQuote: line.showOnQuote ?? true,
      notes: line.notes ?? "",
      imageUrl: line.imageUrl ?? "",
      specImageUrl: line.specImageUrl ?? "",
      createdAt: now,
      updatedAt: now,
      installHeightTier: "",
      panelSizeTier: "",
      installSurchargeRate: 0,
      panelInputMode: line.panelInputMode ?? "",
      surfaceWidthCm: line.surfaceWidthCm ?? 0,
      surfaceHeightCm: line.surfaceHeightCm ?? 0,
      splitDirection: line.splitDirection ?? "",
      splitCount: line.splitCount ?? 0,
      caiRoundingMode: line.caiRoundingMode ?? "",
      customSplitSizesCsv: line.customSplitSizesCsv ?? "",
    }));

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: "報價!A:P",
      valueInputOption: "RAW",
      requestBody: { values: [quoteRecordToRow(quoteRecord)] },
    });

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
        range: "報價版本!A:AQ",
      valueInputOption: "RAW",
      requestBody: { values: [versionRecordToRow(versionRecord)] },
    });

    await syncAutoCommissionSettlements(client, versionRecord);

    if (lineRecords.length > 0) {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: "報價版本明細!A:AG",
        valueInputOption: "RAW",
        requestBody: { values: lineRecords.map(lineRecordToRow) },
      });
    }

    const updatedCase = {
      ...caseRecord,
      caseStatus: caseRecord.caseStatus === "new" ? "quoting" : caseRecord.caseStatus,
      latestQuoteId: quoteId,
      latestVersionId: versionId,
      updatedAt: now,
    };
    const caseSheetRow = caseRowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `案件!A${caseSheetRow}:W${caseSheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [caseRecordToRow(updatedCase)] },
    });

    await sortSheetRows(client, {
      sheetName: "報價",
      dataRange: "報價!A2:P",
      totalColumnCount: 16,
      primarySortColumnIndex: 14,
      secondarySortColumnIndex: 0,
    });
    await sortSheetRows(client, {
      sheetName: "報價版本",
      dataRange: "報價版本!A2:AQ",
      totalColumnCount: 43,
      primarySortColumnIndex: 35,
      secondarySortColumnIndex: 0,
    });
    await sortSheetRows(client, {
      sheetName: "案件",
      dataRange: "案件!A2:W",
      totalColumnCount: 23,
      primarySortColumnIndex: 18,
      secondarySortColumnIndex: 0,
    });

    return NextResponse.json({ ok: true, quoteId, versionId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Partial<QuotePlanRecord> & { quoteId?: string };
  const quoteId = payload.quoteId?.trim() ?? "";
  if (!quoteId) {
    return NextResponse.json({ ok: false, error: "quoteId is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getQuoteRows(client);
    const rowIndex = rows.findIndex((row) => row[0] === quoteId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "quote not found" }, { status: 404 });
    }

    const current = quoteRowToRecord(rows[rowIndex] ?? []);
    const merged: QuotePlanRecord = {
      ...current,
      ...payload,
      quoteId: current.quoteId,
      caseId: current.caseId,
      quoteSeq: current.quoteSeq,
      createdAt: current.createdAt,
      updatedAt: isoNow(),
    };

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價!A${sheetRow}:P${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [quoteRecordToRow(merged)] },
    });

    return NextResponse.json({ ok: true, quoteId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
