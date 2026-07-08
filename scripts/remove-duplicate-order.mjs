#!/usr/bin/env node
/**
 * Safely remove duplicate stub order from Sheets.
 * Only removes if: orderId matches, clientName is empty, and createdAt matches expected stub timestamp.
 * Usage: node scripts/remove-duplicate-order.mjs ORD-2026-07-004 2026-07-06T09:01:37.847Z
 */

import { readFileSync } from "fs";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";

const args = process.argv.slice(2);
const [orderId, createdAtStr] = args;

if (!orderId || !createdAtStr) {
  console.error("Usage: node scripts/remove-duplicate-order.mjs <orderId> <createdAt>");
  console.error("Example: node scripts/remove-duplicate-order.mjs ORD-2026-07-004 2026-07-06T09:01:37.847Z");
  process.exit(1);
}

// Load .env.local
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
const auth = new GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

async function removeStubOrder() {
  try {
    // Find the row by orderId
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "訂製訂單!A2:AM10000",
    });
    const rows = res.data.values ?? [];
    const rowIndex = rows.findIndex((r) => r[0] === orderId && r[3] === "" && r[30] === createdAtStr);

    if (rowIndex === -1) {
      console.error(`❌ No matching stub found. Checked for: orderId=${orderId}, clientName=empty, createdAt=${createdAtStr}`);
      process.exit(1);
    }

    const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-indexed
    console.log(`✓ Found stub at row ${sheetRow}`);
    console.log(`  orderId: ${rows[rowIndex][0]}`);
    console.log(`  orderNumber: ${rows[rowIndex][4]}`);
    console.log(`  clientName: (empty)`);
    console.log(`  createdAt: ${rows[rowIndex][30]}`);

    // Delete the row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0, // "訂製訂單" is the first sheet (ID 0)
                dimension: "ROWS",
                startIndex: sheetRow - 1, // 0-indexed
                endIndex: sheetRow,
              },
            },
          },
        ],
      },
    });

    console.log(`✅ Deleted row ${sheetRow} (duplicate stub)`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

removeStubOrder();
