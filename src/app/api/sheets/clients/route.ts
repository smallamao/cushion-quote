import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { Company, Contact, CompanyWithPrimaryContact } from "@/lib/types/company";
import { companyToClient } from "@/lib/types/company";
import type { Channel, Client, ClientType, CommissionMode } from "@/lib/types";

import type { ClientSource } from "@/lib/types";

// New schema: 17 columns A:Q
function rowToCompany(row: string[]): Company {
  return {
    id: row[0] ?? "",
    companyName: row[1] ?? "",
    shortName: row[2] ?? "",
    clientType: (row[3] as ClientType) ?? "other",
    channel: (row[4] as Channel) ?? "wholesale",
    address: row[5] ?? "",
    taxId: row[6] ?? "",
    commissionMode: (row[7] as CommissionMode | "default") ?? "default",
    commissionRate: Number(row[8] ?? 0),
    paymentTerms: row[9] ?? "",
    defaultNotes: row[10] ?? "",
    isActive: row[11] !== "FALSE",
    createdAt: row[12] ?? "",
    updatedAt: row[13] ?? "",
    notes: row[14] ?? "",
    commissionFixedAmount: Number(row[15] ?? 0),
    leadSource: (row[16] as ClientSource) ?? "unknown",
  };
}

// Legacy schema: 21 columns A:U — read-only
function legacyRowToCompanyAndContact(
  row: string[],
): { company: Company; contact: Contact | null } {
  const company: Company = {
    id: row[0] ?? "",
    companyName: row[1] ?? "",
    shortName: row[2] ?? "",
    clientType: (row[3] as ClientType) ?? "other",
    channel: (row[4] as Channel) ?? "wholesale",
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
    commissionFixedAmount: Number(row[20] ?? 0),
    leadSource: "unknown" as ClientSource,
  };

  const contactName = row[5] ?? "";
  const contact: Contact | null = contactName
    ? {
        id: `legacy-${company.id}`,
        companyId: company.id,
        name: contactName,
        role: "",
        phone: row[6] ?? "",
        phone2: row[7] ?? "",
        lineId: row[8] ?? "",
        email: row[9] ?? "",
        businessCardUrl: "",
        isPrimary: true,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      }
    : null;

  return { company, contact };
}

function companyToRow(c: Company): string[] {
  return [
    c.id,
    c.companyName,
    c.shortName,
    c.clientType,
    c.channel,
    c.address,
    c.taxId,
    c.commissionMode,
    String(c.commissionRate),
    c.paymentTerms,
    c.defaultNotes,
    c.isActive ? "TRUE" : "FALSE",
    c.createdAt,
    c.updatedAt,
    c.notes,
    String(c.commissionFixedAmount),
    c.leadSource ?? "unknown",
  ];
}

export async function GET() {
  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({
      companies: [] as CompanyWithPrimaryContact[],
      clients: [] as Client[],
      source: "defaults" as const,
    });
  }

  try {
    const [companiesRes, contactsRes] = await Promise.all([
      sheetsClient.sheets.spreadsheets.values.get({
        spreadsheetId: sheetsClient.spreadsheetId,
        range: "客戶資料庫!A2:U",
      }),
      sheetsClient.sheets.spreadsheets.values.get({
        spreadsheetId: sheetsClient.spreadsheetId,
        range: "聯絡人!A2:L",
      }),
    ]);

    const rawRows = companiesRes.data.values ?? [];
    const contactRows = contactsRes.data.values ?? [];

    // Build primary contact map from 聯絡人 sheet
    const primaryContactMap = new Map<string, Contact>();
    for (const row of contactRows) {
      if (row[9] === "TRUE") {
        const contact: Contact = {
          id: row[0] ?? "",
          companyId: row[1] ?? "",
          name: row[2] ?? "",
          role: row[3] ?? "",
          phone: row[4] ?? "",
          phone2: row[5] ?? "",
          lineId: row[6] ?? "",
          email: row[7] ?? "",
          businessCardUrl: row[8] ?? "",
          isPrimary: true,
          createdAt: row[10] ?? "",
          updatedAt: row[11] ?? "",
        };
        primaryContactMap.set(contact.companyId, contact);
      }
    }

    const companies: CompanyWithPrimaryContact[] = [];

    for (const row of rawRows) {
      // Detect schema: legacy has 21 columns, new has 16
      const isLegacy = row.length > 17;

      let company: Company;
      let inlineContact: Contact | null = null;

      if (isLegacy) {
        const parsed = legacyRowToCompanyAndContact(row);
        company = parsed.company;
        inlineContact = parsed.contact;
      } else {
        company = rowToCompany(row);
      }

      if (!company.isActive) continue;

      const primaryContact = primaryContactMap.get(company.id) ?? inlineContact ?? null;
      companies.push({ ...company, primaryContact });
    }

    const clients = companies.map((c) => companyToClient(c, c.primaryContact));

    return NextResponse.json({ companies, clients, source: "sheets" as const });
  } catch {
    return NextResponse.json({
      companies: [] as CompanyWithPrimaryContact[],
      clients: [] as Client[],
      source: "defaults" as const,
    });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Company;
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
      range: "客戶資料庫!A:Q",
      valueInputOption: "RAW",
      requestBody: { values: [companyToRow(payload)] },
    });
    return NextResponse.json({ ok: true, company: payload }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Company;
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
      return NextResponse.json({ ok: false, error: "company not found" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `客戶資料庫!A${sheetRow}:Q${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [companyToRow(payload)] },
    });

    return NextResponse.json({ ok: true, company: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
