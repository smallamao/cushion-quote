import "server-only";

import { getSheetsClient } from "@/lib/sheets-client";
import type { EquipmentModel } from "@/lib/types";

const SHEET = "設備型錄";
const RANGE_FULL = `${SHEET}!A:G`;
const RANGE_DATA = `${SHEET}!A2:G`;
const RANGE_IDS = `${SHEET}!A2:A`;

function rowToEquipment(row: string[]): EquipmentModel {
  return {
    modelCode: row[0] ?? "",
    modelName: row[1] ?? "",
    category: row[2] ?? "",
    notes: row[3] ?? "",
    isActive: row[4] !== "FALSE",
    createdAt: row[5] ?? "",
    updatedAt: row[6] ?? "",
  };
}

function equipmentToRow(e: EquipmentModel): string[] {
  return [
    e.modelCode,
    e.modelName,
    e.category,
    e.notes,
    e.isActive ? "TRUE" : "FALSE",
    e.createdAt,
    e.updatedAt,
  ];
}

export async function listEquipment(): Promise<EquipmentModel[]> {
  const client = await getSheetsClient();
  if (!client) return [];
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    return (res.data.values ?? []).map(rowToEquipment).filter((e) => e.modelCode);
  } catch {
    return [];
  }
}

export async function createEquipment(
  input: Pick<EquipmentModel, "modelCode" | "modelName" | "category" | "notes">,
): Promise<EquipmentModel | null> {
  const client = await getSheetsClient();
  if (!client) return null;
  const all = await listEquipment();
  if (all.some((e) => e.modelCode === input.modelCode)) {
    throw new Error("設備編號已存在");
  }
  const now = new Date().toISOString();
  const equipment: EquipmentModel = {
    modelCode: input.modelCode.trim(),
    modelName: input.modelName.trim(),
    category: input.category.trim(),
    notes: input.notes.trim(),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: [equipmentToRow(equipment)] },
  });
  return equipment;
}

export async function updateEquipment(
  modelCode: string,
  patch: Partial<Pick<EquipmentModel, "modelName" | "category" | "notes" | "isActive">>,
): Promise<EquipmentModel | null> {
  const client = await getSheetsClient();
  if (!client) return null;

  const idRes = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_IDS,
  });
  const ids = (idRes.data.values ?? []).flat();
  const rowIndex = ids.indexOf(modelCode);
  if (rowIndex === -1) return null;
  const sheetRow = rowIndex + 2;

  const all = await listEquipment();
  const current = all.find((e) => e.modelCode === modelCode);
  if (!current) return null;
  const updated: EquipmentModel = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${SHEET}!A${sheetRow}:G${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [equipmentToRow(updated)] },
  });
  return updated;
}
