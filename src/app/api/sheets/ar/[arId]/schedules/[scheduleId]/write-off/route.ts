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
import type { ARRecord, ARScheduleRecord } from "@/lib/types";

interface RouteContext {
  params: Promise<{ arId: string; scheduleId: string }>;
}

// POST /api/sheets/ar/[arId]/schedules/[scheduleId]/write-off
// Body: { amount: number, reason: string }
//
// 沖銷分期的未收差額（例：客戶匯款時自行扣掉 $30 匯費 → 那 $30 不是應收，是手續費）。
// 作法：把差額記為負的 adjustmentAmount，使「應收 = amount + adjustment」下修，
// 該期即以實收金額結清。已收現金金額完全不動 —— 帳面現金仍與銀行一致。
export async function POST(request: Request, context: RouteContext) {
  const { arId, scheduleId } = await context.params;
  const body = (await request.json()) as { amount?: number; reason?: string };
  const amount = Math.round(body.amount ?? 0);
  const reason = (body.reason ?? "").trim() || "沖銷差額";

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: "沖銷金額必須大於 0" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [arRes, schedRes] = await Promise.all([
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

    const schedRows = (schedRes.data.values ?? []) as string[][];
    const schedRowIndex = schedRows.findIndex((r) => r[0] === scheduleId);
    if (schedRowIndex === -1) {
      return NextResponse.json({ ok: false, error: "schedule not found" }, { status: 404 });
    }
    const existing = arScheduleRowToRecord(schedRows[schedRowIndex]);

    // 只能沖銷「這期還沒收到的部分」，不能沖超過
    const outstanding =
      existing.amount + existing.adjustmentAmount - existing.receivedAmount;
    if (amount > outstanding) {
      return NextResponse.json(
        { ok: false, error: `沖銷金額不可超過此期未收金額 ${Math.round(outstanding)}` },
        { status: 400 },
      );
    }

    const now = isoNow();
    const today = isoDateNow();

    const updatedSchedule: ARScheduleRecord = {
      ...existing,
      adjustmentAmount: existing.adjustmentAmount - amount, // 負值＝下修應收
      notes: [existing.notes, `沖銷 $${amount}：${reason}`].filter(Boolean).join("\n"),
      updatedAt: now,
    };
    updatedSchedule.scheduleStatus = calcScheduleDerivedStatus(updatedSchedule, today);

    // 重算 AR 彙總（已收現金不變，只有應收下修）
    const allSchedules = schedRows
      .map(arScheduleRowToRecord)
      .filter((s) => s.arId === arId)
      .map((s) => (s.scheduleId === scheduleId ? updatedSchedule : s));

    const totalReceived = allSchedules.reduce((sum, s) => sum + s.receivedAmount, 0);
    const totalAdjustment = allSchedules.reduce((sum, s) => sum + s.adjustmentAmount, 0);
    const { arStatus, hasOverdue } = calcARStatusFromSchedules(allSchedules, today);

    const updatedAr: ARRecord = {
      ...ar,
      receivedAmount: totalReceived,
      outstandingAmount: Math.max(0, ar.totalAmount + totalAdjustment - totalReceived),
      arStatus,
      hasOverdue,
      updatedAt: now,
    };

    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: AR_ROW_RANGE(arRowIndex + 2), values: [arRecordToRow(updatedAr)] },
          {
            range: AR_SCHEDULE_ROW_RANGE(schedRowIndex + 2),
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
