import type { BankTransaction } from "@/lib/types";

export function normalizeFullWidth(str: string): string {
  return str.replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

export function extractCaseIdFromMemo(memo: string): string | null {
  // 正規化全形 + 移除所有空白後，擷取 [LSP] + 3~6 位數字
  const normalized = normalizeFullWidth(memo).replace(/\s+/g, "");
  const match = normalized.match(/([LSP]\d{3,6})/);
  if (!match) return null;
  const raw = match[1];
  // 移除字母後的前導零（P001455 → P1455），但保留正常的 L019 不變
  return raw.replace(/^([A-Z]+)0+(\d{3,})$/, (_, prefix, num) => prefix + num);
}

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
