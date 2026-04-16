import "server-only";

import { getSheetsClient } from "@/lib/sheets-client";
import type { User, UserRole } from "@/lib/types";

const SHEET = "使用者";
const RANGE_FULL = `${SHEET}!A:G`;
const RANGE_DATA = `${SHEET}!A2:G`;
const RANGE_IDS = `${SHEET}!A2:A`;

function rowToUser(row: string[]): User {
  return {
    userId: row[0] ?? "",
    email: (row[1] ?? "").toLowerCase(),
    displayName: row[2] ?? "",
    role: (row[3] as UserRole) ?? "technician",
    isActive: row[4] !== "FALSE",
    createdAt: row[5] ?? "",
    updatedAt: row[6] ?? "",
  };
}

function userToRow(u: User): string[] {
  return [
    u.userId,
    u.email.toLowerCase(),
    u.displayName,
    u.role,
    u.isActive ? "TRUE" : "FALSE",
    u.createdAt,
    u.updatedAt,
  ];
}

export async function listUsers(): Promise<User[]> {
  const client = await getSheetsClient();
  if (!client) return [];
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    return (res.data.values ?? []).map(rowToUser).filter((u) => u.userId);
  } catch {
    return [];
  }
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const users = await listUsers();
  const lower = email.trim().toLowerCase();
  return users.find((u) => u.email === lower && u.isActive) ?? null;
}

function generateUserId(existing: User[]): string {
  const nums = existing
    .map((u) => {
      const m = u.userId.match(/^U(\d+)$/);
      return m ? Number(m[1]) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const max = nums.length > 0 ? Math.max(...nums, 0) : 0;
  return `U${String(max + 1).padStart(3, "0")}`;
}

export async function createUser(input: {
  email: string;
  displayName: string;
  role: UserRole;
}): Promise<User | null> {
  const client = await getSheetsClient();
  if (!client) return null;

  const all = await listUsers();
  const email = input.email.trim().toLowerCase();
  if (all.some((u) => u.email === email)) {
    throw new Error("email 已存在");
  }
  const now = new Date().toISOString();
  const user: User = {
    userId: generateUserId(all),
    email,
    displayName: input.displayName.trim(),
    role: input.role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: [userToRow(user)] },
  });
  return user;
}

export async function updateUser(
  userId: string,
  patch: Partial<Pick<User, "displayName" | "email" | "role" | "isActive">>,
): Promise<User | null> {
  const client = await getSheetsClient();
  if (!client) return null;

  const idRes = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_IDS,
  });
  const ids = (idRes.data.values ?? []).flat();
  const rowIndex = ids.indexOf(userId);
  if (rowIndex === -1) return null;
  const sheetRow = rowIndex + 2;

  const all = await listUsers();
  const current = all.find((u) => u.userId === userId);
  if (!current) return null;

  if (patch.email) {
    const normalised = patch.email.trim().toLowerCase();
    if (all.some((u) => u.email === normalised && u.userId !== userId)) {
      throw new Error("email 已被其他使用者使用");
    }
    patch = { ...patch, email: normalised };
  }

  const updated: User = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${SHEET}!A${sheetRow}:G${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [userToRow(updated)] },
  });
  return updated;
}

export async function countActiveAdmins(): Promise<number> {
  const all = await listUsers();
  return all.filter((u) => u.isActive && u.role === "admin").length;
}
