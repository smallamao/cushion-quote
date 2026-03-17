import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

type RevisionChangeType = "create" | "update" | "status_change";

interface QuoteRevisionRecord {
  quoteId: string;
  revision: number;
  timestamp: string;
  changeType: RevisionChangeType;
  snapshot: string;
}

function toChangeType(value: string | undefined): RevisionChangeType {
  if (value === "create" || value === "status_change" || value === "update") {
    return value;
  }
  return "update";
}

function rowToRevision(row: string[]): QuoteRevisionRecord {
  return {
    quoteId: row[0] ?? "",
    revision: Number(row[1] ?? 0),
    timestamp: row[2] ?? "",
    changeType: toChangeType(row[3]),
    snapshot: row[4] ?? "",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const quoteId = searchParams.get("quoteId")?.trim() ?? "";

  if (!quoteId) {
    return NextResponse.json({ error: "quoteId is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { error: "Google Sheets 未設定", revisions: [] },
      { status: 503 },
    );
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價變更紀錄!A2:E",
    });
    const revisions = (response.data.values ?? [])
      .map(rowToRevision)
      .filter((revision) => revision.quoteId === quoteId);

    return NextResponse.json({ revisions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
