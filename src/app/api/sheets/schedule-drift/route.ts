/**
 * POST /api/sheets/schedule-drift —— 排程系統（本機）把 Numbers vs Trello 的比對結果推上來。
 *
 * 🔴 金鑰驗證一定要在這支 route 裡做。middleware 的白名單只確認「有帶 x-api-key」，
 *    真正的 timing-safe 比對一向由各 route 負責——2026-09-27 採購單 PDF 就是因為
 *    只上線了白名單、沒上線這段驗證，任何人帶任意 header 都能下載全部採購單。
 */
import { NextResponse } from "next/server";

import { authorizeSchedulerRequest } from "../purchases/_catalog";
import { writeDrift, type DriftPayload, type DriftRecord } from "@/lib/schedule-drift-sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function POST(request: Request) {
  const denied = authorizeSchedulerRequest(request);
  if (denied) return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const checkedAt = str(body.checkedAt);
  if (!checkedAt) return NextResponse.json({ ok: false, error: "缺 checkedAt" }, { status: 400 });

  const rawRecords = Array.isArray(body.records) ? (body.records as Array<Record<string, unknown>>) : [];
  const records: DriftRecord[] = rawRecords.slice(0, 500).map((r) => ({
    orderNumber: str(r.orderNumber),
    cardId: str(r.cardId),
    scheduleDate: str(r.scheduleDate),
    kind: str(r.kind) || "other",
    reason: str(r.reason),
  }));

  const payload: DriftPayload = {
    checkedAt,
    start: str(body.start),
    weeks: Number(body.weeks) || 0,
    numbersSavedAt: str(body.numbersSavedAt),
    records,
    ...(str(body.error) ? { error: str(body.error) } : {}),
  };

  try {
    await writeDrift(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: records.length });
}
