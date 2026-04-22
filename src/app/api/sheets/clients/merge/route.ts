import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { mergeClients } from "@/lib/client-cleanup";

interface MergePayload {
  sourceIds: string[];
  targetId: string;
  moveContacts?: boolean;
}

export async function POST(request: Request) {
  let payload: MergePayload;
  try {
    payload = (await request.json()) as MergePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const sourceIds = Array.isArray(payload.sourceIds)
    ? payload.sourceIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const targetId = (payload.targetId ?? "").trim();
  const moveContacts = payload.moveContacts !== false; // default true

  if (sourceIds.length === 0) {
    return NextResponse.json({ ok: false, error: "sourceIds is required" }, { status: 400 });
  }
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "targetId is required" }, { status: 400 });
  }
  if (sourceIds.includes(targetId)) {
    return NextResponse.json(
      { ok: false, error: "targetId 不能在 sourceIds 內" },
      { status: 400 },
    );
  }

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const result = await mergeClients(sheetsClient, sourceIds, targetId, moveContacts);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
