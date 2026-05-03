import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  adaptFastApiResponse,
  referrerStatsToRow,
  type FastApiResponse,
} from "@/lib/referral-utils";
import { getReferrerRows, writeReferrerRows } from "../_sheets-utils";

export async function POST() {
  const legacyUrl = process.env.LEGACY_API_URL;
  if (!legacyUrl) {
    return NextResponse.json({ ok: false, error: "LEGACY_API_URL 未設定" }, { status: 503 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Ping health to wake Render's free-tier service (cold start ~30-60s).
    void fetch(`${legacyUrl}/api/health`, {
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);

    // Fetch referral network data (65s timeout covers Render cold start).
    const res = await fetch(`${legacyUrl}/api/referrals/network`, {
      signal: AbortSignal.timeout(65000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `FastAPI 回傳 ${res.status}${text ? `: ${text.slice(0, 100)}` : ""}`,
        },
        { status: 502 },
      );
    }

    const data = (await res.json()) as FastApiResponse;

    // Read existing rows to preserve manually-set rewardStatus.
    const existingRows = await getReferrerRows(client);
    const existingStatusMap = new Map<string, "pending" | "sent">();
    for (const row of existingRows) {
      const id = row[0];
      const status = row[6];
      if (id && (status === "pending" || status === "sent")) {
        existingStatusMap.set(id, status);
      }
    }

    // Adapt FastAPI data → ReferrerStats[].
    const stats = adaptFastApiResponse(data);

    // Preserve existing rewardStatus for known referrers.
    for (const referrer of stats.referrers) {
      const preserved = existingStatusMap.get(referrer.companyId);
      if (preserved) {
        referrer.rewardStatus = preserved;
      }
    }

    const syncedAt = new Date().toISOString();
    const rows = stats.referrers.map((r) => referrerStatsToRow(r, syncedAt));

    await writeReferrerRows(client, rows);

    return NextResponse.json({
      ok: true,
      count: rows.length,
      syncedAt,
      message: `已同步 ${rows.length} 筆轉介紹人資料`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
