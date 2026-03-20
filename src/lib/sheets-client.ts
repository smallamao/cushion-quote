import "server-only";

import { GoogleAuth } from "google-auth-library";
import { google, sheets_v4 } from "googleapis";

const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

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

  return {
    sheets: google.sheets({ version: "v4", auth }),
    spreadsheetId,
  };
}
