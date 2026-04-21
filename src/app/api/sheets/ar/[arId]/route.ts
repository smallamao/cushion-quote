import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  AR_RANGE_DATA,
  AR_ROW_RANGE,
  AR_SCHEDULE_RANGE_DATA,
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
