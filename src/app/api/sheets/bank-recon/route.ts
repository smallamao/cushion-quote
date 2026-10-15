import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { getSheetsClient } from "@/lib/sheets-client";
import {
  BANK_RECON_RANGE_DATA,
  BANK_RECON_RANGE_FULL,
  BANK_RECON_SHEET,
  bankReconRecordToRow,
  bankReconRowToRecord,
  makeBankReconId,
} from "@/lib/bank-recon-utils";
import type { BankReconRecord } from "@/lib/types";

// GET /api/sheets/bank-recon?month=YYYY-MM
export async function GET(request: Request) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;


  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month")?.trim() ?? "";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ records: [] as BankReconRecord[] });
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: BANK_RECON_RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    let records = rows.filter((r) => r[0]).map(bankReconRowToRecord);
    if (month) {
      records = records.filter((r) => r.txDate.startsWith(month));
    }
    return NextResponse.json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ records: [], error: message }, { status: 500 });
  }
}

// POST /api/sheets/bank-recon
// Body: { entries: Array<{ txId, txDate, amount, description, memo, caseId, caseNameSnapshot, clientNameSnapshot, paymentType }> }
// Dedup by txId (skip if already exists)
export async function POST(request: Request) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;


  const body = (await request.json()) as {
    entries: Array<{
      txId: string;
      txDate: string;
      amount: number;
      description: string;
      memo: string;
      caseId: string;
      caseNameSnapshot: string;
      clientNameSnapshot: string;
      paymentType: BankReconRecord["paymentType"];
    }>;
  };

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ ok: false, written: 0 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Sheets unavailable" }, { status: 503 });
  }

  try {
    // 讀取現有 txId 做 dedup
    const existingRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${BANK_RECON_SHEET}!B2:B10000`,
    });
    const existingTxIds = new Set(
      ((existingRes.data.values ?? []) as string[][]).map((r) => r[0] ?? "").filter(Boolean),
    );

    const confirmedAt = new Date().toISOString();
    const newRows = body.entries
      .filter((e) => !existingTxIds.has(e.txId))
      .map((e): BankReconRecord => ({
        reconId: makeBankReconId(e.txId),
        txId: e.txId,
        txDate: e.txDate,
        amount: e.amount,
        description: e.description,
        memo: e.memo,
        caseId: e.caseId,
        caseNameSnapshot: e.caseNameSnapshot,
        clientNameSnapshot: e.clientNameSnapshot,
        paymentType: e.paymentType,
        confirmedAt,
      }))
      .map(bankReconRecordToRow);

    if (newRows.length > 0) {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: BANK_RECON_RANGE_FULL,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: newRows },
      });
    }

    return NextResponse.json({ ok: true, written: newRows.length, skipped: body.entries.length - newRows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
