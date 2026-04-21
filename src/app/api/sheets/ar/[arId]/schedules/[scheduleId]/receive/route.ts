import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  AR_RANGE_DATA,
  AR_ROW_RANGE,
  AR_SCHEDULE_RANGE_DATA,
  AR_SCHEDULE_ROW_RANGE,
  arRecordToRow,
  arRowToRecord,
  arScheduleRecordToRow,
  arScheduleRowToRecord,
  calcARStatusFromSchedules,
  calcScheduleDerivedStatus,
  isoDateNow,
  isoNow,
} from "@/lib/ar-utils";
import type {
  ARRecord,
  ARScheduleRecord,
  RecordARPaymentPayload,
} from "@/lib/types";

interface RouteContext {
  params: Promise<{ arId: string; scheduleId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { arId, scheduleId } = await context.params;
  const payload = (await request.json()) as RecordARPaymentPayload;

  if (payload.receivedAmount == null || payload.receivedAmount <= 0) {
    return NextResponse.json(
      { ok: false, error: "receivedAmount must be > 0" },
      { status: 400 },
    );
  }
  if (!payload.receivedDate) {
    return NextResponse.json(
      { ok: false, error: "receivedDate is required" },
      { status: 400 },
    );
  }

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
    const arRowIndex = arRows.findIndex((r) => r[0] === arId);
    if (arRowIndex === -1) {
      return NextResponse.json({ ok: false, error: "AR not found" }, { status: 404 });
    }
    const ar = arRowToRecord(arRows[arRowIndex]);

    const scheduleRows = (scheduleRes.data.values ?? []) as string[][];
    const scheduleRowIndex = scheduleRows.findIndex((r) => r[0] === scheduleId);
    if (scheduleRowIndex === -1) {
      return NextResponse.json({ ok: false, error: "schedule not found" }, { status: 404 });
    }

    const now = isoNow();
    const today = isoDateNow();

    const existingSchedule = arScheduleRowToRecord(scheduleRows[scheduleRowIndex]);
    const updatedSchedule: ARScheduleRecord = {
      ...existingSchedule,
      receivedAmount: existingSchedule.receivedAmount + payload.receivedAmount,
      receivedDate: payload.receivedDate,
      paymentMethod: payload.paymentMethod,
      notes: payload.notes ?? existingSchedule.notes,
      updatedAt: now,
    };
    updatedSchedule.scheduleStatus = calcScheduleDerivedStatus(updatedSchedule, today);

    // Recompute AR derived totals
    const allSchedules = scheduleRows
      .map(arScheduleRowToRecord)
      .filter((s) => s.arId === arId)
      .map((s) => (s.scheduleId === scheduleId ? updatedSchedule : s));

    const totalReceived = allSchedules.reduce((sum, s) => sum + s.receivedAmount, 0);
    const { arStatus, hasOverdue } = calcARStatusFromSchedules(allSchedules, today);

    const updatedAr: ARRecord = {
      ...ar,
      receivedAmount: totalReceived,
      outstandingAmount: ar.totalAmount - totalReceived,
      lastReceivedAt: payload.receivedDate,
      arStatus,
      hasOverdue,
      updatedAt: now,
    };

    const arSheetRow = arRowIndex + 2;
    const scheduleSheetRow = scheduleRowIndex + 2;

    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          {
            range: AR_ROW_RANGE(arSheetRow),
            values: [arRecordToRow(updatedAr)],
          },
          {
            range: AR_SCHEDULE_ROW_RANGE(scheduleSheetRow),
            values: [arScheduleRecordToRow(updatedSchedule)],
          },
        ],
      },
    });

    return NextResponse.json({ ok: true, ar: updatedAr, schedule: updatedSchedule });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
