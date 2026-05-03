import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { referrerRowToStats } from "@/lib/referral-utils";
import type { ReferralSummary } from "@/lib/referral-utils";
import { getReferrerRows } from "../_sheets-utils";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getReferrerRows(client);
    const referrers = rows
      .filter((row) => row.length >= 9 && row[0])
      .map(referrerRowToStats);

    const summary: ReferralSummary = {
      totalReferrers: referrers.length,
      totalReferredCases: referrers.reduce((s, r) => s + r.caseCount, 0),
      totalWonCases: referrers.reduce((s, r) => s + r.wonCaseCount, 0),
      totalRevenue: referrers.reduce((s, r) => s + r.revenue, 0),
      pendingRewardCount: referrers.filter(
        (r) => r.rewardTier >= 1 && r.rewardStatus !== "sent",
      ).length,
    };

    return NextResponse.json({ ok: true, referrers, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
