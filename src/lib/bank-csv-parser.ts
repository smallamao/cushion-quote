import type { BankTransaction } from "@/lib/types";

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

function parseDateTime(raw: string): { date: string; time: string } {
  const trimmed = raw.trim();
  const spaceIdx = trimmed.lastIndexOf(" ");
  if (spaceIdx < 0) {
    return { date: trimmed.replace(/\//g, "-"), time: "00:00" };
  }
  return {
    date: trimmed.slice(0, spaceIdx).replace(/\//g, "-"),
    time: trimmed.slice(spaceIdx + 1),
  };
}

function makeTxId(
  txDate: string,
  txTime: string,
  debit: number | null,
  credit: number | null,
  balance: number,
  description: string,
  memo: string,
): string {
  return `${txDate}T${txTime}|${debit ?? ""}|${credit ?? ""}|${balance}|${description}|${memo}`;
}

export interface ParseBankCSVResult {
  transactions: BankTransaction[];
  accountNumber: string;
  errors: string[];
}

export function parseSinopacCSV(csvText: string): ParseBankCSVResult {
  const errors: string[] = [];
  const transactions: BankTransaction[] = [];
  const lines = csvText.split(/\r?\n/);

  if (lines.length < 3) {
    return {
      transactions: [],
      accountNumber: "",
      errors: ["CSV 格式不正確：行數不足"],
    };
  }

  // 從第 1 行擷取帳號（第 2 個欄位）
  const accountNumber = (lines[0]?.split(",")[1] ?? "").trim();

  // 動態找「交易日」欄位標題行，相容各種永豐 CSV header 行數
  let dataStartIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const firstCol = lines[i]?.split(",")[0]?.trim() ?? "";
    if (firstCol === "交易日") {
      dataStartIndex = i + 1;
      break;
    }
  }
  if (dataStartIndex === -1) {
    return {
      transactions: [],
      accountNumber,
      errors: ["CSV 格式不正確：找不到欄位標題行（交易日）"],
    };
  }

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const cols = line.split(",");
    if (cols.length < 6) continue;

    const { date: txDate, time: txTime } = parseDateTime(cols[0] ?? "");
    if (!txDate || txDate.length < 8) {
      errors.push(`第 ${i + 1} 行：無法解析交易日（${cols[0]}）`);
      continue;
    }

    const valueDate = (cols[1]?.trim() ?? "").replace(/\//g, "-");
    const description = cols[2]?.trim() ?? "";
    const debit = parseAmount(cols[3] ?? "");
    const credit = parseAmount(cols[4] ?? "");
    const balance = parseAmount(cols[5] ?? "") ?? 0;
    // Col 6 = 匯率（略過），Col 7 = 備註
    const memo = cols[7]?.trim() ?? "";

    transactions.push({
      txId: makeTxId(txDate, txTime, debit, credit, balance, description, memo),
      txDate,
      txTime,
      valueDate,
      description,
      debit,
      credit,
      balance,
      memo,
    });
  }

  return { transactions, accountNumber, errors };
}

export interface ParseBankFilesResult {
  /** 合併後依交易時間排序；多個檔案重疊的同一筆交易只留一筆 */
  transactions: BankTransaction[];
  /** 各檔第 1 行的帳號文字（去重，保留出現順序） */
  accountTexts: string[];
  /** 各檔涵蓋的日期區間（YYYY-MM-DD）：有「查詢日期」行就用它，否則用該檔最早～最晚交易日 */
  ranges: Array<{ name: string; from: string; to: string }>;
  errors: string[];
}

const QUERY_RANGE_RE = /(\d{4})\/?(\d{2})\/?(\d{2})\s*[~～-]\s*(\d{4})\/?(\d{2})\/?(\d{2})/;

/** 第 2 行「查詢日期, 20261001~20261031」→ { from: "2026-10-01", to: "2026-10-31" } */
export function parseQueryRange(csvText: string): { from: string; to: string } | null {
  for (const line of csvText.split(/\r?\n/)) {
    if (line.split(",")[0]?.trim() === "交易日") break;
    if (!line.includes("查詢日期")) continue;
    const m = line.match(QUERY_RANGE_RE);
    if (m) return { from: `${m[1]}-${m[2]}-${m[3]}`, to: `${m[4]}-${m[5]}-${m[6]}` };
  }
  return null;
}

/**
 * 一次讀多個永豐往來明細（例如連續四個月各一份）。
 * 同一筆交易在兩份檔案都出現時（匯出區間重疊）以 txId 去重——txId 含餘額，
 * 所以同一天同金額的兩筆不同交易不會被誤併。
 */
export function parseSinopacFiles(files: Array<{ name: string; text: string }>): ParseBankFilesResult {
  const seen = new Set<string>();
  const transactions: BankTransaction[] = [];
  const accountTexts: string[] = [];
  const ranges: ParseBankFilesResult["ranges"] = [];
  const errors: string[] = [];

  for (const file of files) {
    const text = file.text.replace(/^\uFEFF/, "");
    const result = parseSinopacCSV(text);
    const txDates = result.transactions.map((t) => t.txDate).sort();
    const range =
      parseQueryRange(text) ??
      (txDates.length ? { from: txDates[0], to: txDates[txDates.length - 1] } : null);
    if (range) ranges.push({ name: file.name, ...range });
    for (const e of result.errors) errors.push(`${file.name}：${e}`);
    if (result.accountNumber && !accountTexts.includes(result.accountNumber)) {
      accountTexts.push(result.accountNumber);
    }
    for (const tx of result.transactions) {
      if (seen.has(tx.txId)) continue;
      seen.add(tx.txId);
      transactions.push(tx);
    }
  }

  const sorted = [...transactions].sort((a, b) =>
    `${a.txDate}T${a.txTime}`.localeCompare(`${b.txDate}T${b.txTime}`),
  );
  return { transactions: sorted, accountTexts, ranges, errors };
}
