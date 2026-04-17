import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { Contact } from "@/lib/types/company";

function rowToContact(row: string[]): Contact {
  return {
    id: row[0] ?? "",
    companyId: row[1] ?? "",
    name: row[2] ?? "",
    role: row[3] ?? "",
    phone: row[4] ?? "",
    phone2: row[5] ?? "",
    lineId: row[6] ?? "",
    email: row[7] ?? "",
    businessCardUrl: row[8] ?? "",
    isPrimary: row[9] === "TRUE",
    createdAt: row[10] ?? "",
    updatedAt: row[11] ?? "",
  };
}

function contactToRow(c: Contact): string[] {
  return [
    c.id,
    c.companyId,
    c.name,
    c.role,
    c.phone,
    c.phone2,
    c.lineId,
    c.email,
    c.businessCardUrl,
    c.isPrimary ? "TRUE" : "FALSE",
    c.createdAt,
    c.updatedAt,
  ];
}

async function unsetOtherPrimaries(
  sheetsClient: Awaited<ReturnType<typeof getSheetsClient>>,
  companyId: string,
  excludeId: string,
): Promise<void> {
  if (!sheetsClient) return;

  const response = await sheetsClient.sheets.spreadsheets.values.get({
    spreadsheetId: sheetsClient.spreadsheetId,
    range: "聯絡人!A2:L",
  });

  const rows = response.data.values ?? [];
  const updates: Promise<unknown>[] = [];

  rows.forEach((row, i) => {
    const contact = rowToContact(row);
    if (contact.companyId === companyId && contact.id !== excludeId && contact.isPrimary) {
      const sheetRow = i + 2;
      updates.push(
        sheetsClient.sheets.spreadsheets.values.update({
          spreadsheetId: sheetsClient.spreadsheetId,
          range: `聯絡人!J${sheetRow}`,
          valueInputOption: "RAW",
          requestBody: { values: [["FALSE"]] },
        }),
      );
    }
  });

  await Promise.all(updates);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ contacts: [] as Contact[] });
  }

  try {
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: "聯絡人!A2:L",
    });

    let contacts = (response.data.values ?? []).map(rowToContact);
    if (companyId) {
      contacts = contacts.filter((c) => c.companyId === companyId);
    }

    return NextResponse.json({ contacts });
  } catch {
    return NextResponse.json({ contacts: [] as Contact[] });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Contact;
  const now = new Date().toISOString().slice(0, 10);
  payload.createdAt = now;
  payload.updatedAt = now;

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    if (payload.isPrimary) {
      await unsetOtherPrimaries(sheetsClient, payload.companyId, payload.id);
    }

    await sheetsClient.sheets.spreadsheets.values.append({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: "聯絡人!A:L",
      valueInputOption: "RAW",
      requestBody: { values: [contactToRow(payload)] },
    });

    return NextResponse.json({ ok: true, contact: payload }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Contact;
  payload.updatedAt = new Date().toISOString().slice(0, 10);

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: "聯絡人!A2:A",
    });

    const ids = (response.data.values ?? []).flat();
    const rowIndex = ids.indexOf(payload.id);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "contact not found" }, { status: 404 });
    }

    if (payload.isPrimary) {
      await unsetOtherPrimaries(sheetsClient, payload.companyId, payload.id);
    }

    const sheetRow = rowIndex + 2;
    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `聯絡人!A${sheetRow}:L${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [contactToRow(payload)] },
    });

    return NextResponse.json({ ok: true, contact: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { id } = (await request.json()) as { id: string };

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: "聯絡人!A2:A",
    });

    const ids = (response.data.values ?? []).flat();
    const rowIndex = ids.indexOf(id);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "contact not found" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    await sheetsClient.sheets.spreadsheets.values.clear({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `聯絡人!A${sheetRow}:L${sheetRow}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
