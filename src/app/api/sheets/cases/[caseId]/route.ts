import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

import {
  caseRowToRecord,
  getCaseRows,
  getQuoteRows,
  getVersionRows,
  quoteRowToRecord,
  versionRowToRecord,
} from "../../_v2-utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [caseRows, quoteRows, versionRows] = await Promise.all([
      getCaseRows(client),
      getQuoteRows(client),
      getVersionRows(client),
    ]);

    const foundCase = caseRows.map(caseRowToRecord).find((record) => record.caseId === caseId);
    if (!foundCase) {
      return NextResponse.json({ ok: false, error: "case not found" }, { status: 404 });
    }

    const quotes = quoteRows
      .map(quoteRowToRecord)
      .filter((quote) => quote.caseId === caseId);
    const versions = versionRows
      .map(versionRowToRecord)
      .filter((version) => version.caseId === caseId);

    return NextResponse.json({
      case: foundCase,
      quotes: quotes.map((quote) => ({
        quote,
        versions: versions.filter((version) => version.quoteId === quote.quoteId),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
