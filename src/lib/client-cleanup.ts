import type { getSheetsClient } from "@/lib/sheets-client";
import { getSheetId } from "@/app/api/sheets/_v2-utils";

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

// Sheet names + clientId column indices (0-based)
const CLIENTS_SHEET = "客戶資料庫";
const CONTACTS_SHEET = "聯絡人";
const CASES_SHEET = "案件";
const AR_SHEET = "應收帳款";
const AR_PAYMENTS_SHEET = "應收帳款付款紀錄";
const PENDING_MONTHLY_SHEET = "月結待出";

// FK column index in each sheet
const FK = {
  [CONTACTS_SHEET]: 1, // companyId = col B
  [CASES_SHEET]: 2, // clientId = col C
  [AR_SHEET]: 6, // clientId = col G
  [AR_PAYMENTS_SHEET]: 4, // clientId = col E
  [PENDING_MONTHLY_SHEET]: 4, // clientId = col E
} as const;

export interface ClientImpact {
  cases: number;
  ar: number;
  arPayments: number;
  pendingMonthly: number;
  contacts: number;
}

async function readSheet(client: SheetsClient, sheetName: string): Promise<string[][]> {
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `${sheetName}!A2:ZZ`,
  });
  return (res.data.values ?? []) as string[][];
}

function countMatches(rows: string[][], col: number, ids: Set<string>): number {
  let n = 0;
  for (const row of rows) {
    if (ids.has((row[col] ?? "").trim())) n++;
  }
  return n;
}

export async function scanClientImpact(
  client: SheetsClient,
  clientIds: string[],
): Promise<ClientImpact> {
  const ids = new Set(clientIds.map((id) => id.trim()).filter(Boolean));
  if (ids.size === 0) {
    return { cases: 0, ar: 0, arPayments: 0, pendingMonthly: 0, contacts: 0 };
  }

  const [cases, ar, arPayments, pending, contacts] = await Promise.all([
    readSheet(client, CASES_SHEET).catch(() => []),
    readSheet(client, AR_SHEET).catch(() => []),
    readSheet(client, AR_PAYMENTS_SHEET).catch(() => []),
    readSheet(client, PENDING_MONTHLY_SHEET).catch(() => []),
    readSheet(client, CONTACTS_SHEET).catch(() => []),
  ]);

  return {
    cases: countMatches(cases, FK[CASES_SHEET], ids),
    ar: countMatches(ar, FK[AR_SHEET], ids),
    arPayments: countMatches(arPayments, FK[AR_PAYMENTS_SHEET], ids),
    pendingMonthly: countMatches(pending, FK[PENDING_MONTHLY_SHEET], ids),
    contacts: countMatches(contacts, FK[CONTACTS_SHEET], ids),
  };
}

async function deleteRowsBySheet(
  client: SheetsClient,
  sheetName: string,
  rowIndices: number[], // 0-based data indices (0 = first data row = sheet row 2)
): Promise<void> {
  if (rowIndices.length === 0) return;
  const sheetId = await getSheetId(client, sheetName);
  if (sheetId === null) return;

  const requests = rowIndices
    .slice()
    .sort((a, b) => b - a)
    .map((idx) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: "ROWS" as const,
          startIndex: idx + 1, // +1 because sheet row 1 is header; data row 0 = sheet row 2 = startIndex 1 (0-based)
          endIndex: idx + 2,
        },
      },
    }));

  await client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: client.spreadsheetId,
    requestBody: { requests },
  });
}

export interface DeleteClientsResult {
  deletedClients: number;
  deletedContacts: number;
}

export async function hardDeleteClients(
  client: SheetsClient,
  clientIds: string[],
): Promise<DeleteClientsResult> {
  const ids = new Set(clientIds.map((id) => id.trim()).filter(Boolean));
  if (ids.size === 0) return { deletedClients: 0, deletedContacts: 0 };

  const [clientRows, contactRows] = await Promise.all([
    readSheet(client, CLIENTS_SHEET),
    readSheet(client, CONTACTS_SHEET),
  ]);

  const clientIndicesToDelete: number[] = [];
  clientRows.forEach((row, idx) => {
    if (ids.has((row[0] ?? "").trim())) clientIndicesToDelete.push(idx);
  });

  const contactIndicesToDelete: number[] = [];
  contactRows.forEach((row, idx) => {
    if (ids.has((row[FK[CONTACTS_SHEET]] ?? "").trim())) contactIndicesToDelete.push(idx);
  });

  // Delete contacts first, then clients (order doesn't really matter since they are separate sheets)
  await deleteRowsBySheet(client, CONTACTS_SHEET, contactIndicesToDelete);
  await deleteRowsBySheet(client, CLIENTS_SHEET, clientIndicesToDelete);

  return {
    deletedClients: clientIndicesToDelete.length,
    deletedContacts: contactIndicesToDelete.length,
  };
}

async function remapClientIdInSheet(
  client: SheetsClient,
  sheetName: string,
  col: number,
  sourceIds: Set<string>,
  targetId: string,
): Promise<number> {
  const rows = await readSheet(client, sheetName).catch(() => [] as string[][]);
  if (rows.length === 0) return 0;

  const updates: Array<{ range: string; values: string[][] }> = [];
  const colLetter = String.fromCharCode(65 + col); // works for A-Z (col 0-25), enough for our use

  rows.forEach((row, idx) => {
    const current = (row[col] ?? "").trim();
    if (sourceIds.has(current)) {
      const sheetRow = idx + 2;
      updates.push({
        range: `${sheetName}!${colLetter}${sheetRow}`,
        values: [[targetId]],
      });
    }
  });

  if (updates.length === 0) return 0;

  await client.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: client.spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  });

  return updates.length;
}

export interface MergeClientsResult {
  cases: number;
  ar: number;
  arPayments: number;
  pendingMonthly: number;
  contacts: number;
  deletedClients: number;
}

export async function mergeClients(
  client: SheetsClient,
  sourceIds: string[],
  targetId: string,
  moveContacts: boolean,
): Promise<MergeClientsResult> {
  const sources = new Set(sourceIds.map((id) => id.trim()).filter((id) => id && id !== targetId));
  const target = targetId.trim();
  if (sources.size === 0 || !target) {
    return { cases: 0, ar: 0, arPayments: 0, pendingMonthly: 0, contacts: 0, deletedClients: 0 };
  }

  // Remap FK columns in all downstream sheets
  const [cases, ar, arPayments, pendingMonthly] = await Promise.all([
    remapClientIdInSheet(client, CASES_SHEET, FK[CASES_SHEET], sources, target),
    remapClientIdInSheet(client, AR_SHEET, FK[AR_SHEET], sources, target),
    remapClientIdInSheet(client, AR_PAYMENTS_SHEET, FK[AR_PAYMENTS_SHEET], sources, target),
    remapClientIdInSheet(client, PENDING_MONTHLY_SHEET, FK[PENDING_MONTHLY_SHEET], sources, target),
  ]);

  let contacts = 0;
  if (moveContacts) {
    // Move contacts: update companyId column to targetId
    contacts = await remapClientIdInSheet(
      client,
      CONTACTS_SHEET,
      FK[CONTACTS_SHEET],
      sources,
      target,
    );
  }

  // Delete source companies (and any remaining contacts if we didn't move them)
  const deleteResult = await hardDeleteClients(client, [...sources]);

  return {
    cases,
    ar,
    arPayments,
    pendingMonthly,
    contacts: moveContacts ? contacts : deleteResult.deletedContacts,
    deletedClients: deleteResult.deletedClients,
  };
}
