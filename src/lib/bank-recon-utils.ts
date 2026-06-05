import type { BankReconRecord } from "@/lib/types";

export const BANK_RECON_SHEET = "銀行核對紀錄";
export const BANK_RECON_RANGE_FULL = `${BANK_RECON_SHEET}!A:L`;
export const BANK_RECON_RANGE_DATA = `${BANK_RECON_SHEET}!A2:L10000`;

// Headers 順序: reconId, txId, txDate, amount, description, memo, caseId, caseNameSnapshot, clientNameSnapshot, paymentType, confirmedAt
// (11 欄，A~K)

export function bankReconRowToRecord(row: string[]): BankReconRecord {
  return {
    reconId: row[0] ?? "",
    txId: row[1] ?? "",
    txDate: row[2] ?? "",
    amount: parseFloat(row[3] ?? "0") || 0,
    description: row[4] ?? "",
    memo: row[5] ?? "",
    caseId: row[6] ?? "",
    caseNameSnapshot: row[7] ?? "",
    clientNameSnapshot: row[8] ?? "",
    paymentType: (row[9] ?? "雜項") as BankReconRecord["paymentType"],
    confirmedAt: row[10] ?? "",
  };
}

export function bankReconRecordToRow(r: BankReconRecord): string[] {
  return [
    r.reconId,
    r.txId,
    r.txDate,
    String(r.amount),
    r.description,
    r.memo,
    r.caseId,
    r.caseNameSnapshot,
    r.clientNameSnapshot,
    r.paymentType,
    r.confirmedAt,
  ];
}

export function makeBankReconId(txId: string): string {
  return `BR-${txId.slice(0, 12).replace(/[^a-zA-Z0-9]/g, "-")}`;
}
