import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  AR_RANGE_DATA,
  AR_ROW_RANGE,
  AR_SCHEDULE_RANGE_DATA,
  AR_SCHEDULE_SHEET,
  AR_SHEET,
  arRecordToRow,
  arRowToRecord,
  arScheduleRowToRecord,
  isoNow,
} from "@/lib/ar-utils";
import type { ARRecord } from "@/lib/types";

interface RouteContext {
  params: Promise<{ arId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { arId } = await context.params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [arRes, scheduleRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_RANGE_DATA,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_SCHEDULE_RANGE_DATA,
      }),
    ]);

    const arRows = (arRes.data.values ?? []) as string[][];
    const arRow = arRows.find((r) => r[0] === arId);
    if (!arRow) {
      return NextResponse.json({ ok: false, error: "AR not found" }, { status: 404 });
    }
    const ar = arRowToRecord(arRow);
    const scheduleRows = (scheduleRes.data.values ?? []) as string[][];
    const schedules = scheduleRows
      .map(arScheduleRowToRecord)
      .filter((s) => s.arId === arId)
      .sort((a, b) => a.seq - b.seq);

    return NextResponse.json({ ok: true, ar, schedules });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

interface PatchARPayload {
  arStatus?: ARRecord["arStatus"];
  notes?: string;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { arId } = await context.params;
  const patch = (await request.json()) as PatchARPayload;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const arRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: AR_RANGE_DATA,
    });
    const rows = (arRes.data.values ?? []) as string[][];
    const rowIndex = rows.findIndex((r) => r[0] === arId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "AR not found" }, { status: 404 });
    }

    const existing = arRowToRecord(rows[rowIndex]);
    const updated: ARRecord = {
      ...existing,
      arStatus: patch.arStatus ?? existing.arStatus,
      notes: patch.notes ?? existing.notes,
      updatedAt: isoNow(),
    };

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: AR_ROW_RANGE(sheetRow),
      valueInputOption: "RAW",
      requestBody: { values: [arRecordToRow(updated)] },
    });

    return NextResponse.json({ ok: true, ar: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// DELETE /api/sheets/ar/[arId]
// Removes the AR record and all of its schedule rows (cascade).
// Intended for the "delete then recreate from the updated quote version" workflow.
export async function DELETE(_request: Request, context: RouteContext) {
  const { arId } = await context.params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [arRes, scheduleRes, meta] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_RANGE_DATA,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_SCHEDULE_RANGE_DATA,
      }),
      client.sheets.spreadsheets.get({
        spreadsheetId: client.spreadsheetId,
        fields: "sheets.properties",
      }),
    ]);

    const arRows = (arRes.data.values ?? []) as string[][];
    const arIndex = arRows.findIndex((r) => r[0] === arId);
    if (arIndex === -1) {
      return NextResponse.json({ ok: false, error: "AR not found" }, { status: 404 });
    }

    const arSheetId = meta.data.sheets?.find(
      (s) => s.properties?.title === AR_SHEET,
    )?.properties?.sheetId;
    const scheduleSheetId = meta.data.sheets?.find(
      (s) => s.properties?.title === AR_SCHEDULE_SHEET,
    )?.properties?.sheetId;
    if (arSheetId == null || scheduleSheetId == null) {
      return NextResponse.json({ ok: false, error: "sheet tab not found" }, { status: 500 });
    }

    // Schedule arId lives in column B (index 1). Collect the 1-based sheet rows.
    const scheduleRows = (scheduleRes.data.values ?? []) as string[][];
    const scheduleSheetRows = scheduleRows
      .map((r, i) => ({ arId: r[1] ?? "", sheetRow: i + 2 }))
      .filter((r) => r.arId === arId)
      .map((r) => r.sheetRow);

    // Build delete requests. Rows within the same sheet must be deleted from
    // the bottom up so earlier deletions don't shift later row indices.
    const requests = [
      ...scheduleSheetRows
        .sort((a, b) => b - a)
        .map((sheetRow) => ({
          deleteDimension: {
            range: {
              sheetId: scheduleSheetId,
              dimension: "ROWS" as const,
              startIndex: sheetRow - 1,
              endIndex: sheetRow,
            },
          },
        })),
      {
        deleteDimension: {
          range: {
            sheetId: arSheetId,
            dimension: "ROWS" as const,
            startIndex: arIndex + 1, // arIndex is 0-based within data (row 2 = index 0)
            endIndex: arIndex + 2,
          },
        },
      },
    ];

    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: { requests },
    });

    return NextResponse.json({ ok: true, deletedSchedules: scheduleSheetRows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
