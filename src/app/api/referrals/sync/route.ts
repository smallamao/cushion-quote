import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

export const maxDuration = 70;

import { getSheetsClient } from "@/lib/sheets-client";
import {
  adaptFastApiResponse,
  referrerStatsToRow,
  type FastApiResponse,
} from "@/lib/referral-utils";
import { getReferrerRows, writeReferrerRows } from "../_sheets-utils";

export async function POST(request: Request) {
  // 🔴 2026-10-15 第二輪稽核：/api/sheets 以外的端點在第一輪被整批漏掉——
  //    我的掃描範圍只做了 /api/sheets/**。這些端點一樣碰公司憑證與營運資料
  //    （Trello／Notion 金鑰、舊系統代理、司機電話、AI 助理工具），
  //    而且同樣只靠 middleware 那一道門。route 層再驗一次。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const legacyUrl = process.env.LEGACY_API_URL;
  if (!legacyUrl) {
    return NextResponse.json({ ok: false, error: "LEGACY_API_URL 未設定" }, { status: 503 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Await health ping to allow Render to start waking before the main request.
    await fetch(`${legacyUrl}/api/health`, {
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);

    // Fetch referral network data (65s timeout covers Render cold start).
    const res = await fetch(`${legacyUrl}/api/referrals/network`, {
      signal: AbortSignal.timeout(65000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `FastAPI 服務回傳錯誤 (HTTP ${res.status})` },
        { status: 502 },
      );
    }

    const rawData = (await res.json()) as unknown;
    if (
      !rawData ||
      typeof rawData !== "object" ||
      !Array.isArray((rawData as Record<string, unknown>).networks)
    ) {
      return NextResponse.json(
        { ok: false, error: "FastAPI 回傳資料格式錯誤" },
        { status: 502 },
      );
    }
    const data = rawData as FastApiResponse;

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

    const syncedAt = new Date().toISOString();
    const rows = stats.referrers.map((r) =>
      referrerStatsToRow(
        { ...r, rewardStatus: existingStatusMap.get(r.companyId) ?? r.rewardStatus },
        syncedAt,
      ),
    );

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
