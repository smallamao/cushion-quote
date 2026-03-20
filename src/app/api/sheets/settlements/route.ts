import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { CommissionSettlement } from "@/lib/types";

import { isoDateNow, isoNow } from "../_v2-utils";

const SHEET_NAME = "佣金結算";
const SHEET_RANGE = `${SHEET_NAME}!A2:P`;

function toNumber(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rowToSettlement(row: string[]): CommissionSettlement {
  return {
    settlementId: row[0] ?? "",
    quoteId: row[1] ?? "",
    versionId: row[2] ?? "",
    caseId: row[3] ?? "",
    partnerName: row[4] ?? "",
    partnerId: row[5] ?? "",
    partnerRole: (row[6] as CommissionSettlement["partnerRole"]) ?? "other",
    commissionMode: (row[7] as CommissionSettlement["commissionMode"]) ?? "none",
    commissionRate: toNumber(row[8]),
    commissionAmount: toNumber(row[9]),
    settlementStatus: (row[10] as CommissionSettlement["settlementStatus"]) ?? "pending",
    paidAt: row[11] ?? "",
    paymentMethod: row[12] ?? "",
    receiptNotes: row[13] ?? "",
    createdAt: row[14] ?? "",
    updatedAt: row[15] ?? "",
  };
}

function settlementToRow(record: CommissionSettlement): string[] {
  return [
    record.settlementId,
    record.quoteId,
    record.versionId,
    record.caseId,
    record.partnerName,
    record.partnerId,
    record.partnerRole,
    record.commissionMode,
    String(record.commissionRate),
    String(record.commissionAmount),
    record.settlementStatus,
    record.paidAt,
    record.paymentMethod,
    record.receiptNotes,
    record.createdAt,
    record.updatedAt,
  ];
}

async function getSettlementRows(client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>): Promise<string[][]> {
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: SHEET_RANGE,
  });
  return response.data.values ?? [];
}

async function generateSettlementId(client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>, now = new Date()): Promise<string> {
  const dateToken = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `STL-${dateToken}-`;
  const rows = await getSettlementRows(client);
  const maxSeq = rows
    .map((row) => row[0] ?? "")
    .filter((id) => id.startsWith(prefix))
    .reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() ?? "";
  const partnerId = searchParams.get("partnerId")?.trim() ?? "";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ settlements: [] as CommissionSettlement[] });
  }

  try {
    const settlements = (await getSettlementRows(client))
      .map(rowToSettlement)
      .filter((item) => (!status || item.settlementStatus === status) && (!partnerId || item.partnerId === partnerId));
    return NextResponse.json({ settlements });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<CommissionSettlement>;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const now = isoNow();
    const record: CommissionSettlement = {
      settlementId: payload.settlementId?.trim() || (await generateSettlementId(client)),
      quoteId: payload.quoteId?.trim() ?? "",
      versionId: payload.versionId?.trim() ?? "",
      caseId: payload.caseId?.trim() ?? "",
      partnerName: payload.partnerName?.trim() ?? "",
      partnerId: payload.partnerId?.trim() ?? "",
      partnerRole: payload.partnerRole ?? "other",
      commissionMode: payload.commissionMode ?? "none",
      commissionRate: toNumber(String(payload.commissionRate ?? 0)),
      commissionAmount: toNumber(String(payload.commissionAmount ?? 0)),
      settlementStatus: payload.settlementStatus ?? "pending",
      paidAt: payload.paidAt?.trim() ?? "",
      paymentMethod: payload.paymentMethod?.trim() ?? "",
      receiptNotes: payload.receiptNotes?.trim() ?? "",
      createdAt: payload.createdAt?.trim() || now,
      updatedAt: now,
    };

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET_NAME}!A:P`,
      valueInputOption: "RAW",
      requestBody: { values: [settlementToRow(record)] },
    });

    return NextResponse.json({ ok: true, settlement: record }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Partial<CommissionSettlement> & { settlementId?: string };
  const settlementId = payload.settlementId?.trim() ?? "";
  if (!settlementId) {
    return NextResponse.json({ ok: false, error: "settlementId is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getSettlementRows(client);
    const rowIndex = rows.findIndex((row) => row[0] === settlementId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "settlement not found" }, { status: 404 });
    }

    const current = rowToSettlement(rows[rowIndex] ?? []);
    const merged: CommissionSettlement = {
      ...current,
      ...payload,
      settlementId: current.settlementId,
      createdAt: current.createdAt,
      updatedAt: isoNow(),
      paidAt:
        payload.settlementStatus === "paid"
          ? (payload.paidAt?.trim() || current.paidAt || isoDateNow())
          : (payload.paidAt ?? current.paidAt),
    };

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET_NAME}!A${sheetRow}:P${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [settlementToRow(merged)] },
    });

    return NextResponse.json({ ok: true, settlement: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
