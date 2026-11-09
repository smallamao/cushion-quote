// 老闆每月把永豐往來明細併進 Numbers 帳本時，每列後面要補三欄：
//   I 訂製編號、J 單號／名稱（客戶名）、K 補充說明（訂金／尾款／全額／運費／進貨款）。
// 這裡是純規則（不碰 Sheets），scripts/ledger-annotate.ts 讀 CSV＋系統資料後呼叫它。

import {
  extractOrderNumber,
  freightOrderNumber,
  type BankVerifyResult,
  type BankVerifyRow,
} from "@/lib/bank-verify";
import type { BankTransaction, CustomOrder } from "@/lib/types";

export type LedgerCategory =
  | BankVerifyRow["category"]
  | "freight" // 🚚 運費提領
  | "purchase" // 進貨款（支出備註有 L 單號）
  | "debit" // 其他支出
  | "unknown"; // 對帳結果裡找不到這筆（理論上不會發生）

export interface LedgerAnnotation {
  /** I 訂製編號 */
  I: string;
  /** J 單號／名稱 */
  J: string;
  /** K 補充說明 */
  K: string;
  category: LedgerCategory;
}

type OrderNumberLite = Pick<CustomOrder, "orderNumber">;

/** 分期名稱 → 帳本上的款別：含「訂」→ 訂金；含「尾／餘」→ 尾款；其他（一次付清等）→ 全額 */
export function paymentKind(label: string): "訂金" | "尾款" | "全額" {
  if (label.includes("訂")) return "訂金";
  if (/[尾餘]/.test(label)) return "尾款";
  return "全額";
}

/** 去前導零的單號 → 訂單上存的寫法（P332 → P0332）；查不到就用原值 */
function storedNumberMap(orders: OrderNumberLite[]): (no: string) => string {
  const map = new Map<string, string>();
  for (const o of orders) {
    const no = extractOrderNumber(o.orderNumber);
    if (no && !map.has(no)) map.set(no, o.orderNumber);
  }
  return (no) => map.get(no) ?? no;
}

const BLANK = { I: "", J: "", K: "" };

function annotateCredit(row: BankVerifyRow, stored: (no: string) => string): LedgerAnnotation {
  const { category } = row;
  // 🔍 金額相同好幾筆（需人工判斷）時候選分期不只一筆，填了就可能填錯 → 留白
  const single = row.schedules.length <= 1;
  if (!single || (category !== "ok" && category !== "possible" && category !== "amount_mismatch")) {
    return { ...BLANK, category };
  }
  const numbers = [...new Set([row.orderNumber, ...row.schedules.flatMap((s) => s.orderNumbers)].filter(Boolean))];
  const I = numbers.map(stored).join(" ");
  const J = row.schedules[0]?.clientName || row.orderClientName;
  const K = category === "amount_mismatch" || !row.schedules[0] ? "" : paymentKind(row.schedules[0].label);
  return { I, J, K, category };
}

function annotateDebit(tx: BankTransaction, stored: (no: string) => string): LedgerAnnotation {
  const freightNo = freightOrderNumber(tx);
  if (freightNo) return { I: stored(freightNo), J: "", K: "運費", category: "freight" };
  const no = extractOrderNumber(tx.memo);
  if (no.startsWith("L")) return { I: no, J: "", K: "進貨款", category: "purchase" };
  return { ...BLANK, category: "debit" };
}

/**
 * 依對帳結果替每筆交易產生 I／J／K。J 在運費列刻意留白：司機名由老闆自己填。
 * 回傳 txId → 註記。
 */
export function annotateLedger(
  transactions: BankTransaction[],
  result: Pick<BankVerifyResult, "rows">,
  orders: OrderNumberLite[],
): Map<string, LedgerAnnotation> {
  const stored = storedNumberMap(orders);
  const rowByTx = new Map(result.rows.map((r) => [r.tx.txId, r]));
  const out = new Map<string, LedgerAnnotation>();
  for (const tx of transactions) {
    if (tx.credit && tx.credit > 0) {
      const row = rowByTx.get(tx.txId);
      out.set(tx.txId, row ? annotateCredit(row, stored) : { ...BLANK, category: "unknown" });
    } else if (tx.debit && tx.debit > 0) {
      out.set(tx.txId, annotateDebit(tx, stored));
    } else {
      out.set(tx.txId, { ...BLANK, category: "unknown" });
    }
  }
  return out;
}
