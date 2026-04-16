import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

/**
 * Debug-only: 列出採購單表的 raw row 內容 (前 N 列 + 指定 orderId)
 * GET ?limit=5&id=PS-20251229-01
 */
export async function GET(request: Request) {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "no sheets" }, { status: 503 });
  }
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 5);
  const targetId = url.searchParams.get("id") ?? "";

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "採購單!A1:P",
    });
    const rows = res.data.values ?? [];
    const header = rows[0] ?? [];
    const body = rows.slice(1);

    const samples = body.slice(0, limit);
    const targetRow = targetId
      ? body.find((r) => r[0] === targetId) ?? null
      : null;

    return NextResponse.json({
      ok: true,
      header,
      headerCount: header.length,
      totalRows: body.length,
      samples: samples.map((r) => ({
        cols: r.length,
        data: r.map((v, i) => ({ col: String.fromCharCode(65 + i), val: v ?? "" })),
      })),
      target: targetRow
        ? {
            cols: targetRow.length,
            data: targetRow.map((v, i) => ({
              col: String.fromCharCode(65 + i),
              val: v ?? "",
            })),
          }
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "fail" },
      { status: 500 },
    );
  }
}
