import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

/**
 * 修復案件 + 報價版本欄位錯位問題
 *
 * 已知問題（從 diagnostic dump 確認）：
 *
 * 案件 CA-202603-001:
 *   col[3] clientNameSnapshot = ""           → 應為 "黃海龍"
 *   col[4] contactNameSnapshot = "黃海龍"    → 應為 ""
 *
 * 版本 CA-202603-001-Q01-V01:
 *   col[29] clientNameSnapshot    = "黃海龍"          → ✓ (已修正過)
 *   col[30] contactNameSnapshot   = "0939-243-035"    → 應為 "" (這是電話)
 *   col[31] clientPhoneSnapshot   = "土城牆面繃布翻修" → 應為 "0939-243-035" (這是案場名稱)
 *   col[32] projectNameSnapshot   = ""                → 應為 "土城牆面繃布翻修"
 *   col[33] projectAddressSnapshot= "luxury_retail"   → 應為 ""
 *   col[34] channelSnapshot       = "luxury_retail"   → ✓
 *   col[37] commissionMode        = "15"              → 應為 "price_gap" (這是 commissionRate)
 *   col[38] commissionRate        = "50"              → 應為 "15" 或 "0.15"
 *   col[39] commissionAmount      = "0"               → 應為 "50" 或重算
 *
 * GET  = 預覽修復內容
 * POST = 執行修復
 */

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [caseRes, versionRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "案件!A2:W",
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "報價版本!A2:AP",
      }),
    ]);

    const caseRows = caseRes.data.values ?? [];
    const versionRows = versionRes.data.values ?? [];
    const repairs: Array<{ sheet: string; row: number; field: string; from: string; to: string }> = [];

    for (let i = 0; i < caseRows.length; i++) {
      const row = caseRows[i]!;
      // 偵測：clientNameSnapshot 空 + contactNameSnapshot 看起來像人名（不含 - 或 @ 等電話/email 特徵）
      const clientName = row[3] ?? "";
      const contactName = row[4] ?? "";
      if (!clientName && contactName && !/[-@\d]{6,}/.test(contactName)) {
        repairs.push({ sheet: "案件", row: i + 2, field: "clientNameSnapshot [3]", from: clientName, to: contactName });
        repairs.push({ sheet: "案件", row: i + 2, field: "contactNameSnapshot [4]", from: contactName, to: "" });
      }
    }

    for (let i = 0; i < versionRows.length; i++) {
      const row = versionRows[i]!;
      const contact = row[30] ?? "";
      const phone = row[31] ?? "";
      const project = row[32] ?? "";
      const address = row[33] ?? "";
      const channelSnap = row[34] ?? "";
      const commMode = row[37] ?? "";

      // 偵測：contactNameSnapshot 是電話格式 + clientPhoneSnapshot 不是電話格式
      const isPhonePattern = /^[\d\-+()]{7,}$/.test(contact);
      const phoneNotPhone = phone.length > 0 && !/^[\d\-+()]{7,}$/.test(phone);

      if (isPhonePattern && phoneNotPhone) {
        repairs.push({ sheet: "報價版本", row: i + 2, field: "contactNameSnapshot [30]", from: contact, to: "" });
        repairs.push({ sheet: "報價版本", row: i + 2, field: "clientPhoneSnapshot [31]", from: phone, to: contact });
        repairs.push({ sheet: "報價版本", row: i + 2, field: "projectNameSnapshot [32]", from: project, to: phone });
        repairs.push({ sheet: "報價版本", row: i + 2, field: "projectAddressSnapshot [33]", from: address, to: project || "" });
        // channelSnapshot [34] 保持不變
      }

      // 偵測：commissionMode 是數字而非有效模式
      const validModes = ["price_gap", "percentage", "fixed", "none"];
      if (commMode && !validModes.includes(commMode) && /^\d+(\.\d+)?$/.test(commMode)) {
        repairs.push({ sheet: "報價版本", row: i + 2, field: "commissionMode [37]", from: commMode, to: "price_gap" });
        repairs.push({ sheet: "報價版本", row: i + 2, field: "commissionRate [38]", from: row[38] ?? "", to: commMode });
        repairs.push({ sheet: "報價版本", row: i + 2, field: "commissionAmount [39]", from: row[39] ?? "", to: row[38] ?? "0" });
        repairs.push({ sheet: "報價版本", row: i + 2, field: "commissionFixedAmount [40]", from: row[40] ?? "", to: row[39] ?? "0" });
        repairs.push({ sheet: "報價版本", row: i + 2, field: "commissionPartners [41]", from: row[41] ?? "", to: row[40] ?? "" });
      }
    }

    return NextResponse.json({ ok: true, mode: "preview", repairCount: repairs.length, repairs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [caseRes, versionRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "案件!A2:W",
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "報價版本!A2:AP",
      }),
    ]);

    const caseRows = caseRes.data.values ?? [];
    const versionRows = versionRes.data.values ?? [];
    const fixed: string[] = [];

    // Fix case rows
    for (let i = 0; i < caseRows.length; i++) {
      const row = [...caseRows[i]!];
      const clientName = row[3] ?? "";
      const contactName = row[4] ?? "";

      if (!clientName && contactName && !/[-@\d]{6,}/.test(contactName)) {
        row[3] = contactName;  // clientNameSnapshot = 原 contactNameSnapshot
        row[4] = "";           // contactNameSnapshot = 空
        // Pad to 23 columns
        while (row.length < 23) row.push("");

        const sheetRow = i + 2;
        await client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: `案件!A${sheetRow}:W${sheetRow}`,
          valueInputOption: "RAW",
          requestBody: { values: [row] },
        });
        fixed.push(`案件 row ${sheetRow}: clientNameSnapshot = "${contactName}"`);
      }
    }

    // Fix version rows
    for (let i = 0; i < versionRows.length; i++) {
      const row = [...versionRows[i]!];
      let changed = false;

      const contact = row[30] ?? "";
      const phone = row[31] ?? "";
      const project = row[32] ?? "";
      const address = row[33] ?? "";

      // Fix snapshot shift: contactNameSnapshot has phone, clientPhoneSnapshot has project name
      const isPhonePattern = /^[\d\-+()]{7,}$/.test(contact);
      const phoneNotPhone = phone.length > 0 && !/^[\d\-+()]{7,}$/.test(phone);

      if (isPhonePattern && phoneNotPhone) {
        row[30] = "";        // contactNameSnapshot = 空
        row[31] = contact;   // clientPhoneSnapshot = 電話
        row[32] = phone;     // projectNameSnapshot = 案場名稱
        row[33] = project;   // projectAddressSnapshot = 原 projectNameSnapshot（通常為空）
        // row[34] channelSnapshot 不動
        changed = true;
      }

      // Fix commission shift: commissionMode is a number instead of mode string
      const commMode = row[37] ?? "";
      const validModes = ["price_gap", "percentage", "fixed", "none"];
      if (commMode && !validModes.includes(commMode) && /^\d+(\.\d+)?$/.test(commMode)) {
        const oldRate = row[38] ?? "0";
        const oldAmount = row[39] ?? "0";
        const oldFixed = row[40] ?? "0";
        const oldPartners = row[41] ?? "";
        row[37] = "price_gap";  // commissionMode = 系統預設
        row[38] = commMode;     // commissionRate = 原 [37] 的數字
        row[39] = oldRate;      // commissionAmount = 原 [38]
        row[40] = oldAmount;    // commissionFixedAmount = 原 [39]
        row[41] = "[]";         // commissionPartners = 空陣列
        changed = true;
      }

      if (changed) {
        // Pad to 42 columns
        while (row.length < 42) row.push("");

        const sheetRow = i + 2;
        await client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: `報價版本!A${sheetRow}:AP${sheetRow}`,
          valueInputOption: "RAW",
          requestBody: { values: [row.slice(0, 42)] },
        });
        fixed.push(`報價版本 row ${sheetRow}: snapshot + commission fields corrected`);
      }
    }

    return NextResponse.json({ ok: true, mode: "executed", fixedCount: fixed.length, fixed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
