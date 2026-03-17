import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { Channel, Client, ClientType, CommissionMode } from "@/lib/types";

function rowToClient(row: string[]): Client {
  return {
    id: row[0] ?? "",
    companyName: row[1] ?? "",
    shortName: row[2] ?? "",
    clientType: (row[3] as ClientType) ?? "other",
    channel: (row[4] as Channel) ?? "wholesale",
    contactName: row[5] ?? "",
    phone: row[6] ?? "",
    phone2: row[7] ?? "",
    lineId: row[8] ?? "",
    email: row[9] ?? "",
    address: row[10] ?? "",
    taxId: row[11] ?? "",
    commissionMode: (row[12] as CommissionMode | "default") ?? "default",
    commissionRate: Number(row[13] ?? 0),
    paymentTerms: row[14] ?? "",
    defaultNotes: row[15] ?? "",
    isActive: row[16] !== "FALSE",
    createdAt: row[17] ?? "",
    updatedAt: row[18] ?? "",
    notes: row[19] ?? "",
  };
}

function clientToRow(c: Client): string[] {
  return [
    c.id, c.companyName, c.shortName, c.clientType, c.channel,
    c.contactName, c.phone, c.phone2, c.lineId, c.email,
    c.address, c.taxId, c.commissionMode, String(c.commissionRate),
    c.paymentTerms, c.defaultNotes, c.isActive ? "TRUE" : "FALSE",
    c.createdAt, c.updatedAt, c.notes,
  ];
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ clients: [] as Client[], source: "defaults" as const });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!A2:T",
    });
    const clients = (response.data.values ?? []).map(rowToClient).filter((c) => c.isActive);
    return NextResponse.json({ clients, source: "sheets" as const });
  } catch {
    return NextResponse.json({ clients: [] as Client[], source: "defaults" as const });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Client;
  const now = new Date().toISOString().slice(0, 10);
  payload.createdAt = now;
  payload.updatedAt = now;
  payload.isActive = true;

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    await sheetsClient.sheets.spreadsheets.values.append({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: "客戶資料庫!A:T",
      valueInputOption: "RAW",
      requestBody: { values: [clientToRow(payload)] },
    });
    return NextResponse.json({ ok: true, client: payload }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Client;
  payload.updatedAt = new Date().toISOString().slice(0, 10);

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: "客戶資料庫!A2:A",
    });
    const ids = (response.data.values ?? []).flat();
    const rowIndex = ids.indexOf(payload.id);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `客戶資料庫!A${sheetRow}:T${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [clientToRow(payload)] },
    });
    return NextResponse.json({ ok: true, client: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
