import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import { getSession } from "../_auth";

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ error: "no client" }, { status: 503 });

  // Find the actual extent of the sheet
  const metaRes = await client.sheets.spreadsheets.get({
    spreadsheetId: client.spreadsheetId,
    fields: "sheets(properties(title,gridProperties))",
  });
  const sheetMeta = (metaRes.data.sheets ?? []).find(
    (s) => s.properties?.title === "電子發票紀錄",
  );
  const rowCount = sheetMeta?.properties?.gridProperties?.rowCount ?? 0;
  const colCount = sheetMeta?.properties?.gridProperties?.columnCount ?? 0;

  // Read A1:B30 as before, plus check near the end
  const [topRes, tailRes] = await Promise.all([
    client.sheets.spreadsheets.values.get({ spreadsheetId: client.spreadsheetId, range: "電子發票紀錄!A1:B50" }),
    rowCount > 50
      ? client.sheets.spreadsheets.values.get({ spreadsheetId: client.spreadsheetId, range: `電子發票紀錄!A${Math.max(rowCount - 20, 1)}:B${rowCount}` })
      : Promise.resolve({ data: { values: [] } }),
  ]);

  const topRows = (topRes.data.values ?? []) as string[][];
  const tailRows = (tailRes.data.values ?? []) as string[][];

  return NextResponse.json({
    spreadsheetId: client.spreadsheetId,
    sheetRowCount: rowCount,
    sheetColCount: colCount,
    top50: topRows.map((r, i) => ({ row: i + 1, colA: r[0] ?? "(empty)" })),
    tail20: tailRows.map((r, i) => ({ row: Math.max(rowCount - 20, 1) + i, colA: r[0] ?? "(empty)" })),
  });
}
