import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { QuoteVersionRecord, VersionLineRecord } from "@/lib/types";

import {
  calculateNextFollowUpDate,
  calculateReminderStatus,
  getVersionLineRows,
  getVersionRows,
  isoNow,
  lineRowToRecord,
  makeItemId,
  replaceVersionLines,
  versionRecordToRow,
  versionRowToRecord,
} from "../../_v2-utils";
import { syncAutoCommissionSettlements } from "../../_settlement-utils";

interface PutVersionPayload {
  version: QuoteVersionRecord;
  lines: Array<Partial<VersionLineRecord>>;
}

function normalizeVersion(record: QuoteVersionRecord, now: string): QuoteVersionRecord {
  const sentAt = record.sentAt || (record.versionStatus === "sent" ? now : "");
  const nextFollowUpDate =
    record.nextFollowUpDate || calculateNextFollowUpDate(sentAt, record.followUpDays);
  return {
    ...record,
    sentAt,
    nextFollowUpDate,
    reminderStatus: calculateReminderStatus({
      versionStatus: record.versionStatus,
      sentAt,
      nextFollowUpDate,
      lastFollowUpAt: record.lastFollowUpAt,
    }),
    updatedAt: now,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [versionRows, lineRows] = await Promise.all([
      getVersionRows(client),
      getVersionLineRows(client),
    ]);
    const version = versionRows
      .map(versionRowToRecord)
      .find((row) => row.versionId === versionId);

    if (!version) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }

    const lines = lineRows
      .map(lineRowToRecord)
      .filter((line) => line.versionId === versionId);

    return NextResponse.json({ version, lines });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;
  const payload = (await request.json()) as PutVersionPayload;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const versionRows = await getVersionRows(client);
    const rowIndex = versionRows.findIndex((row) => row[0] === versionId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }
    if (payload.version.versionId !== versionId) {
      return NextResponse.json({ ok: false, error: "versionId mismatch" }, { status: 400 });
    }

    const now = isoNow();
    const record = normalizeVersion(
      {
        ...payload.version,
        updatedAt: now,
      },
      now,
    );

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價版本!A${sheetRow}:AP${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [versionRecordToRow(record)] },
    });

    const lines: VersionLineRecord[] = payload.lines.map((line, index) => ({
      itemId: makeItemId(versionId, index + 1),
      versionId,
      quoteId: record.quoteId,
      caseId: record.caseId,
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
      createdAt: line.createdAt ?? now,
      updatedAt: now,
      installHeightTier: line.installHeightTier ?? "",
      panelSizeTier: line.panelSizeTier ?? "",
      installSurchargeRate: line.installSurchargeRate ?? 0,
      // v0.3.2 fields
      panelInputMode: line.panelInputMode ?? "",
      surfaceWidthCm: line.surfaceWidthCm ?? 0,
      surfaceHeightCm: line.surfaceHeightCm ?? 0,
      splitDirection: line.splitDirection ?? "",
      splitCount: line.splitCount ?? 0,
      caiRoundingMode: line.caiRoundingMode ?? "",
    }));

    await replaceVersionLines(client, versionId, lines);

    await syncAutoCommissionSettlements(client, record);

    return NextResponse.json({ ok: true, versionId, lineCount: lines.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
