import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { getCaseRows, caseRowToRecord, getVersionRows, versionRowToRecord } from "@/app/api/sheets/_v2-utils";
import { computeReferralStats } from "@/lib/referral-utils";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [caseRows, versionRows] = await Promise.all([
      getCaseRows(client),
      getVersionRows(client),
    ]);

    const cases = caseRows.map(caseRowToRecord);
    const versions = versionRows.map(versionRowToRecord);
    const stats = computeReferralStats(cases, versions);

    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
