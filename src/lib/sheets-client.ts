import "server-only";

import { GoogleAuth } from "google-auth-library";
import { google, sheets_v4 } from "googleapis";

const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

type SheetsClient = { sheets: sheets_v4.Sheets; spreadsheetId: string };

let _cachedClient: SheetsClient | null = null;
let _cacheExpiresAt = 0;
const CLIENT_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCredentials() {
  if (!serviceAccountKey) {
    return null;
  }

  try {
    return JSON.parse(serviceAccountKey) as { client_email: string; private_key: string };
  } catch {
    return null;
  }
}

export async function getSheetsClient(): Promise<{ sheets: sheets_v4.Sheets; spreadsheetId: string } | null> {
  if (!spreadsheetId) {
    return null;
  }

  if (_cachedClient && Date.now() < _cacheExpiresAt) {
    return _cachedClient;
  }

  const credentials = getCredentials();
  if (!credentials) {
    return null;
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  const client: SheetsClient = {
    sheets: google.sheets({ version: "v4", auth }),
    spreadsheetId,
  };

  _cachedClient = client;
  _cacheExpiresAt = Date.now() + CLIENT_CACHE_TTL;

  return client;
}

export async function getDriveClient() {
  const credentials = getCredentials();
  if (!credentials) return null;

  const auth = new GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive",
    ],
  });

  return google.drive({ version: "v3", auth });
}
