import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

export async function GET() {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = `CQ-${today}-`;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ quoteId: `${prefix}001` });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價紀錄!A2:A",
    });

    const ids = (response.data.values ?? []).flat().filter((id: string) => id.startsWith(prefix));
    const maxSeq = ids.reduce((max: number, id: string) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isNaN(seq) ? max : Math.max(max, seq);
    }, 0);

    const nextSeq = String(maxSeq + 1).padStart(3, "0");
    return NextResponse.json({ quoteId: `${prefix}${nextSeq}` });
  } catch {
    return NextResponse.json({ quoteId: `${prefix}001` });
  }
}
