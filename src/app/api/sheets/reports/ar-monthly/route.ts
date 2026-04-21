import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  AR_RANGE_DATA,
  AR_SCHEDULE_RANGE_DATA,
  arRowToRecord,
  arScheduleRowToRecord,
  calcScheduleDerivedStatus,
  isoDateNow,
} from "@/lib/ar-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month")?.trim() ?? isoDateNow().slice(0, 7); // YYYY-MM

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: true, summary: emptySummary(month) });
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

    const today = isoDateNow();
    const ars = ((arRes.data.values ?? []) as string[][])
      .map(arRowToRecord)
      .filter((ar) => ar.arStatus !== "cancelled");
    const schedules = ((scheduleRes.data.values ?? []) as string[][]).map(
      arScheduleRowToRecord,
    );

    // Scope: schedules whose dueDate falls in the selected month
    const scopedSchedules = schedules.filter((s) => s.dueDate.startsWith(month));

    const dueAmount = scopedSchedules.reduce((sum, s) => sum + s.amount, 0);
    const receivedAmount = scopedSchedules.reduce((sum, s) => sum + s.receivedAmount, 0);
    const outstandingAmount = dueAmount - receivedAmount;

    const overdueSchedules = schedules.filter(
      (s) => calcScheduleDerivedStatus(s, today) === "overdue",
    );
    const overdueAmount = overdueSchedules.reduce(
      (sum, s) => sum + (s.amount + s.adjustmentAmount - s.receivedAmount),
      0,
    );

    return NextResponse.json({
      ok: true,
      summary: {
        month,
        arCount: ars.length,
        dueAmount,
        receivedAmount,
        outstandingAmount,
        overdueCount: overdueSchedules.length,
        overdueAmount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function emptySummary(month: string) {
  return {
    month,
    arCount: 0,
    dueAmount: 0,
    receivedAmount: 0,
    outstandingAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
  };
}
