import "server-only";

import { getSheetsClient } from "@/lib/sheets-client";

const SHEET = "司機資料";

const DEFAULT_DRIVERS: DriverRecord[] = [
  { key: "shin", title: "阿信 (兩人）[BXH-6828]", confirmTitle: "阿信哥～",  phoneNumber: "0958640520",              labelId: "5ccbe7e691d0c2ddc5263071", active: true },
  { key: "ya",   title: "葉先生 (回頭車)",         confirmTitle: "葉先生",    phoneNumber: "0933468058 / 0928338272", labelId: "5d959bab4e385d7900fe6ac2", active: true },
  { key: "fu",   title: "阿富",                   confirmTitle: "阿富～",    phoneNumber: "0953123527",              labelId: "5f6aa9adc159722ed25e4708", active: true },
  { key: "hang", title: "志航",                   confirmTitle: "",          phoneNumber: "0922898816",              labelId: "5f7a80fb0496ea8a2d92b045", active: true },
  { key: "jian", title: "簡先生",                 confirmTitle: "簡大哥～",  phoneNumber: "0910347260",              labelId: "5fac0898ecc96e14517bbf8e", active: true },
];
const RANGE_FULL = `${SHEET}!A:F`;
const RANGE_DATA = `${SHEET}!A2:F`;
const RANGE_IDS  = `${SHEET}!A2:A`;

export interface DriverRecord {
  key: string;
  title: string;
  confirmTitle: string;
  phoneNumber: string;
  labelId: string;
  active: boolean;
}

function rowToDriver(row: string[]): DriverRecord {
  return {
    key:          row[0] ?? "",
    title:        row[1] ?? "",
    confirmTitle: row[2] ?? "",
    phoneNumber:  row[3] ?? "",
    labelId:      row[4] ?? "",
    active:       (row[5] ?? "TRUE") !== "FALSE",
  };
}

function driverToRow(d: DriverRecord): string[] {
  return [d.key, d.title, d.confirmTitle, d.phoneNumber, d.labelId, d.active ? "TRUE" : "FALSE"];
}

export async function listDrivers(): Promise<DriverRecord[]> {
  const client = await getSheetsClient();
  if (!client) return [];
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    return (res.data.values ?? []).map((r) => rowToDriver(r as string[])).filter((d) => d.key);
  } catch {
    return [];
  }
}

async function findRowIndex(key: string): Promise<{ client: Awaited<ReturnType<typeof getSheetsClient>>; rowIndex: number }> {
  const client = await getSheetsClient();
  if (!client) return { client: null, rowIndex: -1 };
  const idsRes = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_IDS,
  });
  const rowIndex = (idsRes.data.values ?? []).flat().indexOf(key);
  return { client, rowIndex };
}

export async function createDriver(driver: DriverRecord): Promise<DriverRecord | null> {
  const client = await getSheetsClient();
  if (!client) return null;
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: [driverToRow(driver)] },
  });
  return driver;
}

const SHEET_HEADERS = ["key", "title", "confirmTitle", "phoneNumber", "labelId", "active"];

async function ensureSheetExists(client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>) {
  const meta = await client.sheets.spreadsheets.get({ spreadsheetId: client.spreadsheetId });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === SHEET);
  if (!exists) {
    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET } } }] },
    });
  }
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${SHEET}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [SHEET_HEADERS] },
  });
}

export async function seedDriversIfEmpty(): Promise<{ seeded: boolean; count: number }> {
  const client = await getSheetsClient();
  if (!client) throw new Error("Sheets 未設定");
  await ensureSheetExists(client);
  const existing = await listDrivers();
  if (existing.length > 0) return { seeded: false, count: existing.length };
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: DEFAULT_DRIVERS.map((d) => driverToRow(d)) },
  });
  return { seeded: true, count: DEFAULT_DRIVERS.length };
}

export async function updateDriver(
  key: string,
  patch: Partial<Omit<DriverRecord, "key">>,
): Promise<DriverRecord | null> {
  const { client, rowIndex } = await findRowIndex(key);
  if (!client || rowIndex === -1) return null;
  const sheetRow = rowIndex + 2;

  const all = await listDrivers();
  const current = all.find((d) => d.key === key);
  if (!current) return null;

  const updated: DriverRecord = { ...current, ...patch };
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${SHEET}!A${sheetRow}:F${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [driverToRow(updated)] },
  });
  return updated;
}
