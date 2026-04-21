import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  PENDING_MONTHLY_RANGE_DATA,
  pendingMonthlyRowToRecord,
} from "@/lib/ar-utils";
import type { PendingMonthlyRecord, PendingMonthlyStatus } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status")?.trim() ?? "pending") as
    | PendingMonthlyStatus
    | "all";
  const clientId = searchParams.get("clientId")?.trim() ?? "";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({
      ok: true,
      pending: [] as PendingMonthlyRecord[],
    });
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: PENDING_MONTHLY_RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    const records = rows
      .map(pendingMonthlyRowToRecord)
      .filter((r) => r.pendingId)
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => !clientId || r.clientId === clientId)
      .sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt));
    return NextResponse.json({ ok: true, pending: records });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    // If the sheet doesn't exist yet, return empty rather than 500 so
    // the UI can gracefully prompt admin to run migrate-v13.
    if (/Unable to parse range/i.test(message)) {
      return NextResponse.json({
        ok: true,
        pending: [] as PendingMonthlyRecord[],
        needsMigration: true,
      });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
