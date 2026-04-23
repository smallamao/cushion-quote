import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { VersionRecord } from "@/lib/types";

import { getSession } from "../_auth";

const OPT_OUT_SHEET = "電子發票不開清單";
const OPT_OUT_RANGE = `${OPT_OUT_SHEET}!A:A`;

export async function POST(request: Request) {
  const session = getSession(request as unknown as Request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  let body: { versionId: string; action: "add" | "remove" };
  try {
    body = (await request.json()) as { versionId: string; action: "add" | "remove" };
  } catch {
    return NextResponse.json({ ok: false, error: "格式錯誤" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const spreadsheetId = client.spreadsheetId;

    if (body.action === "add") {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: OPT_OUT_RANGE,
        valueInputOption: "RAW",
        requestBody: { values: [[body.versionId, new Date().toISOString()]] },
      });
      return NextResponse.json({ ok: true, message: `已將 ${body.versionId} 設為不開發票` });
    }

    if (body.action === "remove") {
      const res = await client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: OPT_OUT_RANGE,
      });
      const rows = (res.data.values ?? []) as string[][];
      const idx = rows.findIndex((r) => r[0] === body.versionId);
      if (idx >= 0) {
        await client.sheets.spreadsheets.values.batchClear({
          spreadsheetId,
          ranges: [`${OPT_OUT_SHEET}!A${idx + 1}:B${idx + 1}`],
        });
      }
      return NextResponse.json({ ok: true, message: `已將 ${body.versionId} 恢復開票` });
    }

    return NextResponse.json({ ok: false, error: "action 必須是 add 或 remove" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "操作失敗" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json([]);
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: OPT_OUT_RANGE,
    });
    const rows = (res.data.values ?? []) as string[][];
    return NextResponse.json(rows.map((r) => r[0]).filter(Boolean));
  } catch {
    return NextResponse.json([]);
  }
}