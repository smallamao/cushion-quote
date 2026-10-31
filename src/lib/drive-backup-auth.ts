import "server-only";

import { google, type drive_v3 } from "googleapis";

import {
  resolveDriveAccess,
  type DriveAccessResult,
  type StoredDriveConnection,
} from "@/lib/drive-backup-credential";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { getSheetsClient } from "@/lib/sheets-client";

// Drive 備份授權（老闆 Google 帳號的 refresh token）存放處。
//
// 刻意不放進「系統設定」：那張表是照 SETTINGS_MAP 的順序整段覆寫 A2:B24 的，
// 哪天在 SETTINGS_MAP 多加一個設定，就會把排在後面的授權列蓋掉，而且不會有人發現。
// 這裡獨立一張表、固定只用第 2 列。
//
// ⚠️ 加欄位時：HEADERS、RANGE_ROW 的結尾欄、rowToConnection / connectionToRow 要一起改。
export const DRIVE_AUTH_SHEET = "Drive備份授權";
const HEADERS = ["狀態", "Google帳號", "加密憑證", "連結時間", "授權到期", "失效時間", "失效原因"];
const RANGE_ROW = `${DRIVE_AUTH_SHEET}!A2:G2`;

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

function authSecret(): string {
  return process.env.AUTH_SECRET ?? "";
}

async function requireSheets(): Promise<SheetsClient> {
  const client = await getSheetsClient();
  if (!client) throw new Error("Google Sheets 尚未設定");
  return client;
}

function isSheetAlreadyExistsError(err: unknown): boolean {
  return err instanceof Error && /already exists/i.test(err.message);
}

async function ensureSheet(client: SheetsClient): Promise<void> {
  const meta = await client.sheets.spreadsheets.get({ spreadsheetId: client.spreadsheetId });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === DRIVE_AUTH_SHEET);
  if (exists) return;
  try {
    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: DRIVE_AUTH_SHEET } } }] },
    });
  } catch (err) {
    // 兩個請求同時第一次用到（例如排程備份與設定頁同時載入）時，晚到的那個 addSheet
    // 會被 Google 以「already exists」拒絕。表已經在了就照常往下走，其他錯誤照丟。
    if (!isSheetAlreadyExistsError(err)) throw err;
  }
  // 表頭重寫一次無害：先建表的那個請求若在寫表頭前失敗，這裡會補上
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${DRIVE_AUTH_SHEET}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });
}

function rowToConnection(row: string[] | undefined): StoredDriveConnection | null {
  if (!row || !row[2]) return null;
  return {
    status: row[0] === "invalid" ? "invalid" : "active",
    email: row[1] ?? "",
    encryptedRefreshToken: row[2] ?? "",
    connectedAt: row[3] ?? "",
    refreshTokenExpiresAt: row[4] ?? "",
    invalidatedAt: row[5] ?? "",
    invalidReason: row[6] ?? "",
  };
}

function connectionToRow(c: StoredDriveConnection): string[] {
  return [
    c.status,
    c.email,
    c.encryptedRefreshToken,
    c.connectedAt,
    c.refreshTokenExpiresAt,
    c.invalidatedAt,
    c.invalidReason,
  ];
}

async function writeConnection(client: SheetsClient, c: StoredDriveConnection): Promise<void> {
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_ROW,
    valueInputOption: "RAW",
    requestBody: { values: [connectionToRow(c)] },
  });
}

export async function loadDriveConnection(): Promise<StoredDriveConnection | null> {
  const client = await requireSheets();
  await ensureSheet(client);
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_ROW,
  });
  return rowToConnection(res.data.values?.[0] as string[] | undefined);
}

/** 存入新的授權（覆蓋舊的）。refresh token 只以加密後的形式落地。 */
export async function saveDriveConnection(input: {
  email: string;
  refreshToken: string;
  refreshTokenExpiresIn: number | null;
}): Promise<void> {
  const secret = authSecret();
  if (!secret) throw new Error("AUTH_SECRET 未設定，無法加密 Drive 授權");
  const client = await requireSheets();
  await ensureSheet(client);
  const now = Date.now();
  await writeConnection(client, {
    status: "active",
    email: input.email,
    encryptedRefreshToken: encryptSecret(input.refreshToken, secret),
    connectedAt: new Date(now).toISOString(),
    refreshTokenExpiresAt: input.refreshTokenExpiresIn
      ? new Date(now + input.refreshTokenExpiresIn * 1000).toISOString()
      : "",
    invalidatedAt: "",
    invalidReason: "",
  });
}

/** 標記授權失效（保留帳號，讓畫面知道要請誰重新連結） */
export async function markDriveConnectionInvalid(reason: string): Promise<void> {
  try {
    const client = await requireSheets();
    const current = await loadDriveConnection();
    if (!current) return;
    await writeConnection(client, {
      ...current,
      status: "invalid",
      invalidatedAt: new Date().toISOString(),
      invalidReason: reason,
    });
  } catch {
    // 標記失敗不影響「這次備份失敗」的判定與通知；下次還會再撞到同一個錯誤
  }
}

/** 給畫面看的連結狀態。不含 token（加密後的也不給）。 */
export interface DriveConnectionStatus {
  connected: boolean;
  status: "none" | "active" | "invalid";
  email: string;
  connectedAt: string;
  refreshTokenExpiresAt: string;
  invalidReason: string;
}

export function toPublicStatus(c: StoredDriveConnection | null): DriveConnectionStatus {
  if (!c) {
    return {
      connected: false,
      status: "none",
      email: "",
      connectedAt: "",
      refreshTokenExpiresAt: "",
      invalidReason: "",
    };
  }
  return {
    connected: c.status === "active",
    status: c.status,
    email: c.email,
    connectedAt: c.connectedAt,
    refreshTokenExpiresAt: c.refreshTokenExpiresAt,
    invalidReason: c.invalidReason,
  };
}

/**
 * 以老闆的 Google 帳號建立 Drive client。
 * 先主動換一次 access token：refresh token 已失效時在這裡就知道，
 * 不會等到上傳一半才失敗。
 */
export async function getUserDriveClient(): Promise<DriveAccessResult<drive_v3.Drive>> {
  return resolveDriveAccess<drive_v3.Drive>({
    load: loadDriveConnection,
    decrypt: (blob) => decryptSecret(blob, authSecret()),
    refresh: async (refreshToken) => {
      const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        process.env.GOOGLE_OAUTH_REDIRECT_URI,
      );
      oauth2.setCredentials({ refresh_token: refreshToken });
      await oauth2.getAccessToken();
      return google.drive({ version: "v3", auth: oauth2 });
    },
    markInvalid: markDriveConnectionInvalid,
  });
}
