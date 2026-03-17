import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { QuoteLineRecord, QuoteRecord, QuoteStatus } from "@/lib/types";

function rowToHeader(row: string[]): QuoteRecord {
  return {
    quoteId: row[0] ?? "",
    quoteDate: row[1] ?? "",
    clientName: row[2] ?? "",
    clientContact: row[3] ?? "",
    clientPhone: row[4] ?? "",
    projectName: row[5] ?? "",
    projectAddress: row[6] ?? "",
    channel: (row[7] as QuoteRecord["channel"]) ?? "wholesale",
    totalBeforeTax: Number(row[8] ?? 0),
    tax: Number(row[9] ?? 0),
    total: Number(row[10] ?? 0),
    commissionMode: (row[11] as QuoteRecord["commissionMode"]) ?? "none",
    commissionRate: Number(row[12] ?? 0),
    commissionAmount: Number(row[13] ?? 0),
    status: (row[14] as QuoteStatus) ?? "draft",
    createdBy: row[15] ?? "",
    notes: row[16] ?? "",
    createdAt: row[17] ?? "",
    updatedAt: row[18] ?? "",
  };
}

function rowToLine(row: string[]): QuoteLineRecord {
  return {
    quoteId: row[0] ?? "",
    lineNumber: Number(row[1] ?? 0),
    itemName: row[2] ?? "",
    method: (row[3] as QuoteLineRecord["method"]) ?? "flat",
    widthCm: Number(row[4] ?? 0),
    heightCm: Number(row[5] ?? 0),
    caiCount: Number(row[6] ?? 0),
    foamThickness: Number(row[7] ?? 0),
    materialId: row[8] ?? "",
    materialDesc: row[9] ?? "",
    qty: Number(row[10] ?? 0),
    laborRate: Number(row[11] ?? 0),
    materialRate: Number(row[12] ?? 0),
    extras: row[13] ?? "",
    unitPrice: Number(row[14] ?? 0),
    piecePrice: Number(row[15] ?? 0),
    subtotal: Number(row[16] ?? 0),
    notes: row[17] ?? "",
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> }
) {
  const { quoteId } = await params;
  
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { error: "Google Sheets 未設定" },
      { status: 503 }
    );
  }

  try {
    const headerResponse = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價紀錄!A2:S",
    });
    const headerRows = headerResponse.data.values ?? [];
    const header = headerRows
      .map(rowToHeader)
      .find((h) => h.quoteId === quoteId);

    if (!header) {
      return NextResponse.json({ error: "報價單不存在" }, { status: 404 });
    }

    const linesResponse = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價明細!A2:R",
    });
    const lineRows = linesResponse.data.values ?? [];
    const lines = lineRows
      .map(rowToLine)
      .filter((l) => l.quoteId === quoteId);

    return NextResponse.json({ header, lines, source: "sheets" as const });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
