// 老闆每月把永豐往來明細併進 Numbers 帳本時，每列後面要補三欄：
//   I 訂製編號、J 單號／名稱（客戶名）、K 補充說明（訂金／尾款／全額／運費／進貨款）。
// 這裡是純規則（不碰 Sheets），scripts/ledger-annotate.ts 讀 CSV＋系統資料後呼叫它。

import {
  extractOrderNumber,
  freightOrderNumber,
  type BankVerifyResult,
  type BankVerifyRow,
} from "@/lib/bank-verify";
import { parseSinopacCSV } from "@/lib/bank-csv-parser";
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

// ── 腳本用的純函式（scripts/ledger-annotate.ts） ───────────────────

/** 一行 CSV 拆欄：支援雙引號包住的欄位（裡面可以有逗號、"" 代表一個引號） */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * 一個檔案的資料列原始八欄（CSV 拆欄後的欄位值，只去掉包欄位的引號，內容不改），
 * 跟 parseSinopacCSV 解析出的交易一對一配對 → txId → 八欄。
 * 「哪幾行算交易」的篩選必須跟 parseSinopacCSV 一致（非空行、≥6 欄、交易日可解析），
 * 配不起來（列數不同）就丟錯，不硬配。
 */
export function rawRowsByTxId(text: string): Map<string, string[]> {
  const lines = text.split(/\r?\n/);
  const header = lines.findIndex((l) => l.split(",")[0]?.trim() === "交易日");
  const raws: string[][] = [];
  if (header >= 0) {
    for (const line of lines.slice(header + 1)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.split(",").length < 6) continue;
      const first = (trimmed.split(",")[0] ?? "").trim();
      const space = first.lastIndexOf(" ");
      if ((space < 0 ? first : first.slice(0, space)).length < 8) continue;
      const cols = parseCsvLine(trimmed);
      raws.push(Array.from({ length: 8 }, (_, i) => cols[i] ?? ""));
    }
  }
  const txs = parseSinopacCSV(text).transactions;
  if (txs.length !== raws.length) {
    throw new Error(`原始列數 ${raws.length} 與解析出的交易數 ${txs.length} 對不上，無法逐列註記`);
  }
  return new Map(txs.map((t, i) => [t.txId, raws[i]]));
}

const pad2 = (s: string) => s.padStart(2, "0");

/** 日期＋時間 → 比較用的「YYYY-MM-DD HH:MM」（只到分鐘，秒數忽略）。格式不對回 null */
export function minuteKey(date: string, time: string): string | null {
  const d = date.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  const t = time.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!d || !t) return null;
  return `${d[1]}-${pad2(d[2])}-${pad2(d[3])} ${pad2(t[1])}:${t[2]}`;
}

/** --after 參數（例「2026/11/04 09:52」）→ minuteKey；格式不對回 null */
export function parseAfter(arg: string): string | null {
  const [date = "", time = ""] = arg.trim().split(/\s+/);
  return minuteKey(date, time);
}

export type LedgerOutRow = { raw: string[] } & LedgerAnnotation;

/**
 * 組輸出：只留晚於 afterKey 的交易（≤ afterKey 視為帳本已有），依交易順序排，
 * 跨月份之間插一個 null 當分隔。
 */
export function buildLedgerOutput(
  transactions: BankTransaction[],
  notes: Map<string, LedgerAnnotation>,
  rawById: Map<string, string[]>,
  afterKey: string,
): Array<LedgerOutRow | null> {
  const output: Array<LedgerOutRow | null> = [];
  let month = "";
  for (const t of transactions) {
    const key = minuteKey(t.txDate, t.txTime);
    if (!key || key <= afterKey) continue;
    const m = key.slice(0, 7);
    if (month && m !== month) output.push(null);
    month = m;
    output.push({ raw: rawById.get(t.txId) ?? [], ...(notes.get(t.txId) ?? { ...BLANK, category: "unknown" }) });
  }
  return output;
}
