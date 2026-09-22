import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { findServiceById } from "@/lib/after-sales-sheet";
import {
  RANGE_DATA,
  RANGE_FULL,
  generateSessionId,
  generateToken,
  rowToSession,
  sessionToRow,
} from "@/lib/cleaning-slots-sheet";
import type { CleaningSlotSession } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/sheets/after-sales/[serviceId]/slot-session → 現有媒合 session（最新一筆），無則 null
export async function GET(_req: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    const sessions = ((res.data.values ?? []) as string[][]).map(rowToSession).filter((s) => s.serviceId === serviceId);
    const session = sessions[sessions.length - 1] ?? null; // 最新一筆
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/sheets/after-sales/[serviceId]/slot-session
// 建立（或取回）到府清潔時段媒合 session，回傳客人選時段連結的 token。
export async function POST(_req: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }
  try {
    const service = await findServiceById(serviceId);
    if (!service) {
      return NextResponse.json({ ok: false, error: "找不到售後服務單" }, { status: 404 });
    }

    // 已有未確認的 session 就沿用（避免重複產生連結）
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    const existing = rows
      .map(rowToSession)
      .find((s) => s.serviceId === serviceId && (s.status === "awaiting_customer" || s.status === "awaiting_tech"));
    if (existing) {
      return NextResponse.json({ ok: true, session: existing, reused: true });
    }

    const now = new Date().toISOString();
    const session: CleaningSlotSession = {
      sessionId: generateSessionId(),
      serviceId,
      customerToken: generateToken(),
      techToken: "",
      proposedSlots: [],
      confirmedDate: "",
      confirmedPeriod: "",
      status: "awaiting_customer",
      customerAddress: service.deliveryAddress ?? "",
      customerPhone: service.clientPhone ?? "",
      createdAt: now,
      updatedAt: now,
    };
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_FULL,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [sessionToRow(session)] },
    });
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
