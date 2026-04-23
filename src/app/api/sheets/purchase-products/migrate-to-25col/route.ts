import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

/**
 * One-shot migration: re-align legacy purchase-product rows to the 25-column
 * sheet schema (A:Y).
 *
 * Detection per row:
 *   - If H (row[7]) starts with "PS" AND V (row[21]) is "TRUE"/"FALSE" →
 *     already in 25-col format, skip.
 *   - If H starts with "PS" but V is empty → 21-col broken intermediate format
 *     (productName at D, unitPrice at K). Re-emit as 25-col.
 *   - Otherwise (H is numeric like a price) → legacy 13-col format
 *     (productName at C, unitPrice at H, isActive at K). Re-emit as 25-col.
 *
 * Usage:
 *   GET /api/sheets/purchase-products/migrate-to-25col?dryRun=true   (preview)
 *   GET /api/sheets/purchase-products/migrate-to-25col?dryRun=false  (apply)
 */

const SHEET = "採購商品";
const READ_RANGE = `${SHEET}!A2:Z`; // wide enough to capture all legacy formats
const WRITE_RANGE = (lastRow: number) => `${SHEET}!A2:Y${lastRow}`;

type Format = "already-25col" | "21col-broken" | "13col-legacy" | "empty";

interface Diagnostics {
  total: number;
  formatCounts: Record<Format, number>;
  samplesPerFormat: Partial<Record<Format, { sheetRow: number; before: string[]; after: string[] | null }>>;
}

function detectFormat(row: string[]): Format {
  const supplierIdLike = /^PS\d+$/i.test((row[7] ?? "").trim());
  const isActive21 = (row[21] ?? "").trim().toUpperCase();
  const hasAnyData = row.some((c) => (c ?? "").trim() !== "");

  if (!hasAnyData) return "empty";
  if (supplierIdLike && (isActive21 === "TRUE" || isActive21 === "FALSE")) {
    return "already-25col";
  }
  if (supplierIdLike) {
    return "21col-broken";
  }
  return "13col-legacy";
}

function migrateRow(row: string[]): string[] | null {
  const fmt = detectFormat(row);
  if (fmt === "empty" || fmt === "already-25col") return null;

  const minOrder = "";
  const leadTimeDays = "";
  const stockStatus = "";
  let id = "",
    productCode = "",
    supplierProductCode = "",
    productName = "",
    specification = "",
    category = "",
    unit = "",
    supplierId = "",
    supplierName = "",
    widthCm = "",
    unitPrice = "",
    listPrice = "",
    brand = "",
    series = "",
    colorCode = "",
    colorName = "",
    imageUrl = "",
    notes = "",
    isActive = "TRUE",
    createdAt = "",
    updatedAt = "";

  if (fmt === "21col-broken") {
    // Was written by code that thought sheet was 21-col, with this layout:
    // 0:id 1:code 2:supProdCode 3:name 4:spec 5:cat 6:unit 7:supId
    // 8:supName 9:width 10:unitPrice 11:listPrice 12:isActive 13:created 14:updated
    // 15:brand 16:series 17:colorCode 18:colorName 19:notes 20:imageUrl
    id = row[0] ?? "";
    productCode = row[1] ?? "";
    supplierProductCode = row[2] ?? productCode;
    productName = row[3] ?? "";
    specification = row[4] ?? "";
    category = row[5] ?? "其他";
    unit = row[6] ?? "碼";
    supplierId = row[7] ?? "";
    supplierName = row[8] ?? "";
    widthCm = row[9] ?? "";
    unitPrice = row[10] ?? "";
    listPrice = row[11] ?? "";
    isActive = (row[12] ?? "").trim().toUpperCase() === "FALSE" ? "FALSE" : "TRUE";
    createdAt = row[13] ?? "";
    updatedAt = row[14] ?? "";
    brand = row[15] ?? "";
    series = row[16] ?? "";
    colorCode = row[17] ?? "";
    colorName = row[18] ?? "";
    notes = row[19] ?? "";
    imageUrl = row[20] ?? "";
  } else {
    // 13-col legacy:
    // 0:id 1:code 2:name 3:spec 4:cat 5:unit 6:supId 7:unitPrice
    // 8:imageUrl 9:notes 10:isActive 11:created 12:updated
    id = row[0] ?? "";
    productCode = row[1] ?? "";
    productName = row[2] ?? "";
    specification = row[3] ?? "";
    category = row[4] ?? "其他";
    unit = row[5] ?? "碼";
    supplierId = row[6] ?? "";
    unitPrice = row[7] ?? "";
    imageUrl = row[8] ?? "";
    notes = row[9] ?? "";
    isActive = (row[10] ?? "").trim().toUpperCase() === "FALSE" ? "FALSE" : "TRUE";
    createdAt = row[11] ?? "";
    updatedAt = row[12] ?? "";
    supplierProductCode = productCode; // fallback when not stored separately
  }

  // Build 25-col output (A:Y)
  return [
    id, // A: ID
    productCode, // B: 商品編號
    supplierProductCode, // C: 廠商產品編號
    productName, // D: 商品名稱
    specification, // E: 規格
    category, // F: 分類
    unit, // G: 單位
    supplierId, // H: 廠商編號
    supplierName, // I: 廠商名稱
    widthCm, // J: 幅寬(cm)
    unitPrice, // K: 進價
    listPrice, // L: 牌價
    brand, // M: 品牌
    series, // N: 系列
    colorCode, // O: 色號
    colorName, // P: 色名
    imageUrl, // Q: 圖片URL
    notes, // R: 備註
    minOrder, // S: 最小訂量
    leadTimeDays, // T: 交期
    stockStatus, // U: 庫存狀態
    isActive, // V: 啟用
    createdAt, // W: 建立時間
    updatedAt, // X: 更新時間
    updatedAt, // Y: 更新時間 (duplicate header)
  ];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") !== "false"; // default to dry-run for safety

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: READ_RANGE,
    });
    const rows = (res.data.values ?? []) as string[][];

    const diagnostics: Diagnostics = {
      total: rows.length,
      formatCounts: {
        "already-25col": 0,
        "21col-broken": 0,
        "13col-legacy": 0,
        empty: 0,
      },
      samplesPerFormat: {},
    };

    const newRows: string[][] = [];
    let lastWrittenRow = 1; // header is row 1

    rows.forEach((row, idx) => {
      const fmt = detectFormat(row);
      diagnostics.formatCounts[fmt]++;

      const sheetRow = idx + 2;
      const after = migrateRow(row);

      if (!diagnostics.samplesPerFormat[fmt]) {
        diagnostics.samplesPerFormat[fmt] = {
          sheetRow,
          before: row.slice(0, 25),
          after,
        };
      }

      if (fmt === "already-25col") {
        // Keep original row as-is
        newRows.push(row.slice(0, 25));
        lastWrittenRow = sheetRow;
      } else if (fmt === "empty") {
        // Skip empty rows; they'll be left blank below
        newRows.push([]);
      } else {
        // Migrated
        newRows.push(after ?? []);
        lastWrittenRow = sheetRow;
      }
    });

    // Trim trailing empty rows from output (no need to write blank rows back)
    while (newRows.length > 0 && newRows[newRows.length - 1].length === 0) {
      newRows.pop();
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        diagnostics,
        wouldWriteRows: newRows.length,
        firstWriteRange: WRITE_RANGE(lastWrittenRow),
      });
    }

    // Apply migration: write back the entire data range in one update
    if (newRows.length === 0) {
      return NextResponse.json({
        ok: true,
        dryRun: false,
        message: "no rows to migrate",
        diagnostics,
      });
    }

    // Pad each row to exactly 25 columns to ensure consistent write
    const padded = newRows.map((r) => {
      const out = r.slice(0, 25);
      while (out.length < 25) out.push("");
      return out;
    });

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: WRITE_RANGE(lastWrittenRow),
      valueInputOption: "RAW",
      requestBody: { values: padded },
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      diagnostics,
      writtenRows: padded.length,
      writeRange: WRITE_RANGE(lastWrittenRow),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
