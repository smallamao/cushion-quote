import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { QuoteLineRecord, QuoteRecord, QuoteStatus } from "@/lib/types";

interface SaveQuotePayload {
  header: QuoteRecord;
  lines: QuoteLineRecord[];
}

function headerToRow(h: QuoteRecord): string[] {
  return [
    h.quoteId,
    h.quoteDate,
    h.clientName,
    h.clientContact,
    h.clientPhone,
    h.projectName,
    h.projectAddress,
    h.channel,
    String(h.totalBeforeTax),
    String(h.tax),
    String(h.total),
    h.commissionMode,
    String(h.commissionRate),
    String(h.commissionAmount),
    h.status,
    h.createdBy,
    h.notes,
    h.createdAt,
    h.updatedAt,
    h.clientId ?? "",
  ];
}

function lineToRow(l: QuoteLineRecord): string[] {
  return [
    l.quoteId,
    String(l.lineNumber),
    l.itemName,
    l.method,
    String(l.widthCm),
    String(l.heightCm),
    String(l.caiCount),
    String(l.foamThickness),
    l.materialId,
    l.materialDesc,
    String(l.qty),
    String(l.laborRate),
    String(l.materialRate),
    l.extras,
    String(l.unitPrice),
    String(l.piecePrice),
    String(l.subtotal),
    l.notes,
  ];
}

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
    clientId: row[19] ?? "",
  };
}

async function batchExpireQuotes(
  client: Awaited<ReturnType<typeof getSheetsClient>>,
  quoteIds: string[],
): Promise<void> {
  if (!client || quoteIds.length === 0) return;

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價紀錄!A2:A",
    });
    const ids = (response.data.values ?? []).flat();
    const now = new Date().toISOString().slice(0, 10);
    const data = quoteIds.reduce<Array<{ range: string; values: string[][] }>>(
      (acc, quoteId) => {
        const idx = ids.indexOf(quoteId);
        if (idx === -1) return acc;

        const row = idx + 2;
        acc.push(
          { range: `報價紀錄!O${row}`, values: [["expired"]] },
          { range: `報價紀錄!S${row}`, values: [[now]] },
        );
        return acc;
      },
      [],
    );

    if (data.length > 0) {
      await client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: { valueInputOption: "RAW", data },
      });
    }
  } catch {
    // Ignore background sync failures; the next GET will retry.
  }
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ quotes: [] as QuoteRecord[], source: "defaults" as const });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價紀錄!A2:T",
    });
    const quotes = (response.data.values ?? []).map(rowToHeader);
    const today = new Date().toISOString().slice(0, 10);
    const validityDays = 30;

    const expiredIds: string[] = [];
    const updatedQuotes = quotes.map((q) => {
      if (q.status !== "draft" && q.status !== "sent") return q;

      const quoteDate = new Date(q.quoteDate);
      quoteDate.setDate(quoteDate.getDate() + validityDays);
      const validUntil = quoteDate.toISOString().slice(0, 10);

      if (today > validUntil) {
        expiredIds.push(q.quoteId);
        return { ...q, status: "expired" as QuoteStatus };
      }

      return q;
    });

    if (expiredIds.length > 0) {
      void batchExpireQuotes(client, expiredIds);
    }

    return NextResponse.json({ quotes: updatedQuotes, source: "sheets" as const });
  } catch {
    return NextResponse.json({ quotes: [] as QuoteRecord[], source: "defaults" as const });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as SaveQuotePayload;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定，無法儲存報價" }, { status: 503 });
  }

  try {
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: "報價紀錄!A:T",
      valueInputOption: "RAW",
      requestBody: { values: [headerToRow(payload.header)] },
    });

    if (payload.lines.length > 0) {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: "報價明細!A:R",
        valueInputOption: "RAW",
        requestBody: { values: payload.lines.map(lineToRow) },
      });
    }

    return NextResponse.json({ ok: true, quoteId: payload.header.quoteId, source: "sheets" as const }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const payload = (await request.json()) as SaveQuotePayload;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定，無法更新報價" }, { status: 503 });
  }

  try {
    const headerIds = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價紀錄!A2:A",
    });
    const ids = (headerIds.data.values ?? []).flat();
    const rowIndex = ids.indexOf(payload.header.quoteId);

    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "報價單不存在" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價紀錄!A${sheetRow}:T${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [headerToRow(payload.header)] },
    });

    const linesResponse = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價明細!A2:A",
    });
    const allLineIds = (linesResponse.data.values ?? []).flat();
    const lineRowIndices: number[] = [];
    allLineIds.forEach((id, i) => {
      if (id === payload.header.quoteId) lineRowIndices.push(i);
    });

    if (lineRowIndices.length > 0) {
      const clearRequests = lineRowIndices.reverse().map((i) => ({
        deleteDimension: {
          range: {
            sheetId: -1,
            dimension: "ROWS" as const,
            startIndex: i + 1,
            endIndex: i + 2,
          },
        },
      }));

      const sheetsInfo = await client.sheets.spreadsheets.get({
        spreadsheetId: client.spreadsheetId,
      });
      const detailSheet = (sheetsInfo.data.sheets ?? []).find(
        (s) => s.properties?.title === "報價明細"
      );
      const detailSheetId = detailSheet?.properties?.sheetId ?? 0;

      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: clearRequests.map((req) => ({
            deleteDimension: {
              range: { ...req.deleteDimension.range, sheetId: detailSheetId },
            },
          })),
        },
      });
    }

    if (payload.lines.length > 0) {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: "報價明細!A:R",
        valueInputOption: "RAW",
        requestBody: { values: payload.lines.map(lineToRow) },
      });
    }

    return NextResponse.json({ ok: true, quoteId: payload.header.quoteId, source: "sheets" as const });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { quoteId, status } = (await request.json()) as { quoteId: string; status: QuoteStatus };

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定，無法更新狀態" }, { status: 503 });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價紀錄!A2:A",
    });
    const ids = (response.data.values ?? []).flat();
    const rowIndex = ids.indexOf(quoteId);

    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "quote not found" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    const now = new Date().toISOString().slice(0, 10);

    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `報價紀錄!O${sheetRow}`, values: [[status]] },
          { range: `報價紀錄!S${sheetRow}`, values: [[now]] },
        ],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { quoteId } = (await request.json()) as { quoteId: string };

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const headerResponse = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價紀錄!A2:A",
    });
    const headerIds = (headerResponse.data.values ?? []).flat();
    const headerRowIndex = headerIds.indexOf(quoteId);

    if (headerRowIndex === -1) {
      return NextResponse.json({ ok: false, error: "報價單不存在" }, { status: 404 });
    }

    const sheetRow = headerRowIndex + 2;
    const now = new Date().toISOString().slice(0, 10);

    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `報價紀錄!O${sheetRow}`, values: [["deleted"]] },
          { range: `報價紀錄!S${sheetRow}`, values: [[now]] },
        ],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
