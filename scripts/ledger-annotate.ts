/**
 * 帳本註記：老闆每月把永豐往來明細併進 Numbers 帳本前，先替每一列算好 I／J／K 三欄。
 *
 * 用法：
 *   npx tsx --tsconfig tsconfig.json scripts/ledger-annotate.ts <往來明細.csv...> \
 *     --after "YYYY/MM/DD HH:MM" --out 註記.json
 *
 *   <csv...>  一個或多個永豐「往來明細」CSV（重疊的交易只留一筆）
 *   --after   只輸出交易日「嚴格晚於」這個時間的列（跟 CSV 第一欄去空白後做字串比較，
 *             所以格式要跟 CSV 一樣，例 "2026/11/04 09:52"）。通常填帳本最後一列的交易日。
 *   --out     輸出 JSON 檔
 *
 * 輸出（JSON 陣列，依交易時間排序；跨月份之間插一個 null 當分隔）：
 *   { raw: [A..H 八欄原始字串，原封不動], I: 訂製編號, J: 單號／名稱, K: 補充說明, category }
 *
 * 規則（實作在 src/lib/ledger-annotate.ts）：
 *   入帳 ✅／🔍 → I＝單號、J＝客戶名、K＝訂金／尾款／全額（看分期名稱）
 *   入帳 ⚠️ 金額不符 → 只填 I、J
 *   入帳 ❗／⚪ → 留白
 *   支出「單號＋運」 → I＝訂單上的單號、J 留白（司機名老闆自己填）、K＝運費
 *   支出備註有 L 單號 → I＝L 單號、K＝進貨款
 *
 * 🔴 唯讀：Sheets 用 spreadsheets.readonly 範圍，只讀應收帳款／應收分期／訂製訂單，不寫任何東西。
 *    憑證讀 .env.local 的 GOOGLE_SERVICE_ACCOUNT_KEY 與 GOOGLE_SHEETS_SPREADSHEET_ID。
 */

import fs from "fs";
import path from "path";

import { loadEnvConfig } from "@next/env";
import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";

import { AR_RANGE_DATA, AR_SCHEDULE_RANGE_DATA, arRowToRecord, arScheduleRowToRecord } from "@/lib/ar-utils";
import { parseSinopacCSV, parseSinopacFiles } from "@/lib/bank-csv-parser";
import { buildVerifySchedules, verifyBankTransactions } from "@/lib/bank-verify";
import { annotateLedger, type LedgerAnnotation } from "@/lib/ledger-annotate";
import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";
import type { ARWithSchedules, BankTransaction } from "@/lib/types";

loadEnvConfig(process.cwd());

interface Args {
  files: string[];
  after: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const files: string[] = [];
  let after = "";
  let out = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--after") after = (argv[++i] ?? "").trim();
    else if (a === "--out") out = argv[++i] ?? "";
    else files.push(a);
  }
  if (!files.length || !after || !out) {
    console.error('用法：npx tsx --tsconfig tsconfig.json scripts/ledger-annotate.ts <csv...> --after "YYYY/MM/DD HH:MM" --out file.json');
    process.exit(1);
  }
  return { files, after, out };
}

/**
 * 每個檔案的資料列原始八欄，按 parseSinopacCSV 產生交易的順序排好，用來跟交易一對一配對。
 * 篩選條件必須跟 parseSinopacCSV 一致（非空行、≥6 欄、交易日可解析）。
 */
function rawRowsByTxId(text: string): Map<string, string[]> {
  const lines = text.split(/\r?\n/);
  const header = lines.findIndex((l) => l.split(",")[0]?.trim() === "交易日");
  const raws: string[][] = [];
  if (header >= 0) {
    for (const line of lines.slice(header + 1)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const cols = trimmed.split(",");
      if (cols.length < 6) continue;
      const date = (cols[0] ?? "").trim().split(" ")[0] ?? "";
      if (date.length < 8) continue;
      raws.push(Array.from({ length: 8 }, (_, i) => cols[i] ?? ""));
    }
  }
  const txs = parseSinopacCSV(text).transactions;
  if (txs.length !== raws.length) {
    throw new Error(`原始列數 ${raws.length} 與解析出的交易數 ${txs.length} 對不上，無法逐列註記`);
  }
  return new Map(txs.map((t, i) => [t.txId, raws[i]]));
}

async function loadSheets() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!spreadsheetId || !key) throw new Error(".env.local 缺少 GOOGLE_SHEETS_SPREADSHEET_ID 或 GOOGLE_SERVICE_ACCOUNT_KEY");
  const credentials = JSON.parse(key) as { client_email: string; private_key: string };
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [AR_RANGE_DATA, AR_SCHEDULE_RANGE_DATA, ORDER_RANGE_DATA],
  });
  const [arRows, scheduleRows, orderRows] = (res.data.valueRanges ?? []).map(
    (v) => (v.values ?? []) as string[][],
  );
  const schedules = (scheduleRows ?? []).map(arScheduleRowToRecord);
  const ars: ARWithSchedules[] = (arRows ?? []).map(arRowToRecord).map((ar) => ({
    ...ar,
    schedules: schedules.filter((s) => s.arId === ar.arId).sort((a, b) => a.seq - b.seq),
  }));
  // 封存的訂單也要（同一張表，isArchived 只是旗標）
  const orders = (orderRows ?? []).filter((r) => r[0]).map(orderRowToRecord);
  return { ars, orders };
}

type OutRow = { raw: string[] } & LedgerAnnotation;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = args.files.map((f) => ({
    name: path.basename(f),
    text: fs.readFileSync(f, "utf-8").replace(/^﻿/, ""),
  }));
  const rawById = new Map<string, string[]>();
  for (const f of files) {
    for (const [id, raw] of rawRowsByTxId(f.text)) if (!rawById.has(id)) rawById.set(id, raw);
  }

  const parsed = parseSinopacFiles(files);
  for (const e of parsed.errors) console.warn(`⚠️ ${e}`);

  const { ars, orders } = await loadSheets();
  // 對帳用全部交易（分筆入帳需要前後文），輸出才套 --after
  const result = verifyBankTransactions(parsed.transactions, buildVerifySchedules(ars, orders), orders, {
    accountTexts: parsed.accountTexts,
    ranges: parsed.ranges,
  });
  const notes = annotateLedger(parsed.transactions, result, orders);

  const keep = (t: BankTransaction) => (rawById.get(t.txId)?.[0] ?? "").trim() > args.after;
  const selected = parsed.transactions.filter(keep);

  const output: Array<OutRow | null> = [];
  let month = "";
  for (const t of selected) {
    const m = t.txDate.slice(0, 7);
    if (month && m !== month) output.push(null);
    month = m;
    const note = notes.get(t.txId) ?? { I: "", J: "", K: "", category: "unknown" as const };
    output.push({ raw: rawById.get(t.txId) ?? [], ...note });
  }

  fs.writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`, "utf-8");

  // 只印統計，不印客戶資料
  const counts = new Map<string, number>();
  for (const r of output) if (r) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const filled = output.filter((r) => r && (r.I || r.J || r.K)).length;
  console.log(`輸出 ${selected.length} 列（${output.length - selected.length} 個月份分隔）→ ${args.out}`);
  console.log(`有填 I/J/K：${filled} 列`);
  for (const [k, v] of [...counts].sort()) console.log(`  ${k}: ${v}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
