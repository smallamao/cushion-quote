import type { getSheetsClient } from "@/lib/sheets-client";
import type { CommissionSettlement, PartnerRole, QuoteVersionRecord } from "@/lib/types";

import { isoNow } from "./_v2-utils";

const SHEET_NAME = "佣金結算";
const SHEET_RANGE = `${SHEET_NAME}!A2:P`;

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

interface PartnerSplit {
  name: string;
  partnerId: string;
  role: PartnerRole;
  amount: number;
}

function toNumber(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function settlementKey(versionId: string, split: Pick<PartnerSplit, "partnerId" | "name" | "role">): string {
  return `${versionId}::${split.partnerId || ""}::${split.name || ""}::${split.role}`;
}

export function rowToSettlement(row: string[]): CommissionSettlement {
  return {
    settlementId: row[0] ?? "",
    quoteId: row[1] ?? "",
    versionId: row[2] ?? "",
    caseId: row[3] ?? "",
    partnerName: row[4] ?? "",
    partnerId: row[5] ?? "",
    partnerRole: (row[6] as PartnerRole) ?? "other",
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

export function settlementToRow(record: CommissionSettlement): string[] {
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

async function getSettlementRows(client: SheetsClient): Promise<string[][]> {
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: SHEET_RANGE,
  });
  return response.data.values ?? [];
}

export function parseCommissionPartners(raw: string): PartnerSplit[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Partial<PartnerSplit>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        name: String(item.name ?? "").trim(),
        partnerId: String(item.partnerId ?? "").trim(),
        role: (item.role as PartnerRole) ?? "other",
        amount: Math.max(0, Math.round(Number(item.amount ?? 0) || 0)),
      }))
      .filter((item) => item.amount > 0 && item.name);
  } catch {
    return [];
  }
}

export function generateSettlementIdFromRows(rows: string[][], now = new Date()): string {
  const dateToken = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `STL-${dateToken}-`;
  const maxSeq = rows
    .map((row) => row[0] ?? "")
    .filter((id) => id.startsWith(prefix))
    .reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function syncAutoCommissionSettlements(client: SheetsClient, version: QuoteVersionRecord): Promise<void> {
  const splits = parseCommissionPartners(version.commissionPartners || "");
  if (splits.length === 0) return;

  const allRows = await getSettlementRows(client);
  const allSettlements = allRows.map(rowToSettlement);
  const existingIndexByKey = new Map<string, number>();

  allSettlements.forEach((item, index) => {
    const key = settlementKey(item.versionId, {
      partnerId: item.partnerId,
      name: item.partnerName,
      role: item.partnerRole,
    });
    if (!existingIndexByKey.has(key)) {
      existingIndexByKey.set(key, index);
    }
  });

  const now = isoNow();
  const updates: Array<{ row: number; record: CommissionSettlement }> = [];
  const appends: string[][] = [];
  let rowsForId = [...allRows];

  splits.forEach((split) => {
    const key = settlementKey(version.versionId, split);
    const existingIndex = existingIndexByKey.get(key);
    if (existingIndex == null) {
      const settlementId = generateSettlementIdFromRows(rowsForId);
      const record: CommissionSettlement = {
        settlementId,
        quoteId: version.quoteId,
        versionId: version.versionId,
        caseId: version.caseId,
        partnerName: split.name,
        partnerId: split.partnerId,
        partnerRole: split.role,
        commissionMode: version.commissionMode,
        commissionRate: version.commissionRate,
        commissionAmount: split.amount,
        settlementStatus: "pending",
        paidAt: "",
        paymentMethod: "",
        receiptNotes: "",
        createdAt: now,
        updatedAt: now,
      };
      const row = settlementToRow(record);
      appends.push(row);
      rowsForId = [...rowsForId, row];
      return;
    }

    const current = allSettlements[existingIndex];
    if (!current || current.settlementStatus !== "pending") return;
    updates.push({
      row: existingIndex + 2,
      record: {
        ...current,
        quoteId: version.quoteId,
        versionId: version.versionId,
        caseId: version.caseId,
        partnerName: split.name,
        partnerId: split.partnerId,
        partnerRole: split.role,
        commissionMode: version.commissionMode,
        commissionRate: version.commissionRate,
        commissionAmount: split.amount,
        updatedAt: now,
      },
    });
  });

  if (updates.length > 0) {
    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: updates.map((item) => ({
          range: `${SHEET_NAME}!A${item.row}:P${item.row}`,
          values: [settlementToRow(item.record)],
        })),
      },
    });
  }

  if (appends.length > 0) {
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET_NAME}!A:P`,
      valueInputOption: "RAW",
      requestBody: { values: appends },
    });
  }
}
