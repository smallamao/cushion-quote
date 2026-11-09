import { describe, expect, it } from "vitest";

import type { BankVerifyRow, VerifySchedule } from "@/lib/bank-verify";
import {
  annotateLedger,
  buildLedgerOutput,
  minuteKey,
  parseAfter,
  parseCsvLine,
  paymentKind,
  rawRowsByTxId,
  type LedgerAnnotation,
} from "@/lib/ledger-annotate";
import { parseSinopacCSV } from "@/lib/bank-csv-parser";
import type { BankTransaction } from "@/lib/types";

let seq = 0;
function tx(over: Partial<BankTransaction>): BankTransaction {
  seq += 1;
  return {
    txId: `tx-${seq}`,
    txDate: "2026-11-05",
    txTime: "10:00",
    valueDate: "2026-11-05",
    description: "跨行轉帳",
    debit: null,
    credit: null,
    balance: 0,
    memo: "",
    ...over,
  };
}

function sch(over: Partial<VerifySchedule>): VerifySchedule {
  seq += 1;
  return {
    scheduleId: `SCH-${seq}`,
    arId: "AR-1",
    caseId: "CA-1",
    label: "訂金",
    receivedAmount: 1000,
    receivedDate: "2026-11-05",
    paymentMethod: "transfer",
    receivingAccountId: "",
    ref: "",
    clientName: "王小明",
    orderNumbers: ["P332"],
    ...over,
  };
}

function row(t: BankTransaction, category: BankVerifyRow["category"], schedules: VerifySchedule[], over: Partial<BankVerifyRow> = {}): BankVerifyRow {
  return {
    tx: t,
    category,
    reason: "",
    last5: "",
    isInternal: false,
    ownAccountId: "",
    orderNumber: "",
    orderClientName: "",
    schedules,
    arId: "",
    note: "",
    ...over,
  };
}

const ORDERS = [{ orderNumber: "P0332" }, { orderNumber: "S997" }];

describe("paymentKind", () => {
  it("訂→訂金、尾／餘→尾款、其他→全額", () => {
    expect(paymentKind("訂金")).toBe("訂金");
    expect(paymentKind("尾款")).toBe("尾款");
    expect(paymentKind("餘額")).toBe("尾款");
    expect(paymentKind("一次付清")).toBe("全額");
  });
});

describe("annotateLedger", () => {
  it("入帳 ✅／🔍 填單號（還原成訂單上的寫法）、客戶名、款別；⚠️ 只填 I／J；❗／⚪ 留白", () => {
    const ok = tx({ credit: 1000 });
    const possible = tx({ credit: 2000 });
    const mismatch = tx({ credit: 3000 });
    const missing = tx({ credit: 4000 });
    const nonOrder = tx({ credit: 5 });
    const ambiguous = tx({ credit: 3000 });
    const notes = annotateLedger(
      [ok, possible, mismatch, missing, nonOrder, ambiguous],
      {
        rows: [
          row(ok, "ok", [sch({})]),
          row(possible, "possible", [sch({ label: "尾款", orderNumbers: ["S997"], clientName: "林" })]),
          row(mismatch, "amount_mismatch", [sch({ label: "尾款" })]),
          row(missing, "missing_in_system", [], { orderNumber: "S997", orderClientName: "林" }),
          row(nonOrder, "non_order", []),
          row(ambiguous, "possible", [sch({}), sch({ clientName: "別人" })]),
        ],
      },
      ORDERS,
    );
    expect(notes.get(ok.txId)).toEqual({ I: "P0332", J: "王小明", K: "訂金", category: "ok" });
    expect(notes.get(possible.txId)).toEqual({ I: "S997", J: "林", K: "尾款", category: "possible" });
    expect(notes.get(mismatch.txId)).toEqual({ I: "P0332", J: "王小明", K: "", category: "amount_mismatch" });
    expect(notes.get(missing.txId)).toEqual({ I: "", J: "", K: "", category: "missing_in_system" });
    expect(notes.get(nonOrder.txId)).toEqual({ I: "", J: "", K: "", category: "non_order" });
    expect(notes.get(ambiguous.txId)).toEqual({ I: "", J: "", K: "", category: "possible" });
  });

  it("支出：運費 → 訂單上的單號＋運費（J 留白）；L 單號 → 進貨款；其他留白", () => {
    const freight = tx({ description: "ATM現金", debit: 1000, memo: "16667 Ｐ３３２運" });
    const purchase = tx({ debit: 5000, memo: "Ｌ０１９ 布料" });
    const other = tx({ debit: 300, memo: "電費" });
    const notes = annotateLedger([freight, purchase, other], { rows: [] }, ORDERS);
    expect(notes.get(freight.txId)).toEqual({ I: "P0332", J: "", K: "運費", category: "freight" });
    expect(notes.get(purchase.txId)).toEqual({ I: "L019", J: "", K: "進貨款", category: "purchase" });
    expect(notes.get(other.txId)).toEqual({ I: "", J: "", K: "", category: "debit" });
  });
});

const CSV = [
  "帳號,168-018-0008591-8【大戶】新台幣",
  "查詢日期,20261101~20261130",
  "交易日,計息日,摘要,支出,存入,餘額,匯率,備註",
  "2026/11/04 09:52:10,2026/11/04,跨行轉帳,,1000,5000,,S997 訂金",
  "",
  '2026/11/04 09:53,2026/11/04,ATM現金,600,,4400,,"16667 Ｓ９９７運費, 阿信"',
  "2026/12/01 10:00,2026/12/01,跨行轉帳,,2000,6400,,P0332",
  "合計,,,,,",
].join("\n");

describe("parseCsvLine", () => {
  it("雙引號欄位裡的逗號不拆、\"\" 還原成一個引號", () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(parseCsvLine('"x ""y""",')).toEqual(['x "y"', ""]);
  });
});

describe("rawRowsByTxId", () => {
  it("原始八欄跟解析出的交易一對一配對（空行、合計行略過）", () => {
    const txs = parseSinopacCSV(CSV).transactions;
    const raw = rawRowsByTxId(CSV);
    expect(raw.size).toBe(txs.length);
    expect(raw.get(txs[0].txId)).toEqual(["2026/11/04 09:52:10", "2026/11/04", "跨行轉帳", "", "1000", "5000", "", "S997 訂金"]);
    expect(raw.get(txs[1].txId)?.[7]).toBe("16667 Ｓ９９７運費, 阿信");
    expect(raw.get(txs[1].txId)).toHaveLength(8);
  });
  it("篩選條件跟 parseSinopacCSV 一致：交易日解析不了的行兩邊都略過，配對不錯位", () => {
    const bad = CSV.replace("2026/12/01 10:00", "壞掉");
    const txs = parseSinopacCSV(bad).transactions;
    const raw = rawRowsByTxId(bad);
    expect(raw.size).toBe(2);
    expect(txs.map((t) => raw.get(t.txId)?.[0])).toEqual(["2026/11/04 09:52:10", "2026/11/04 09:53"]);
  });
});

describe("parseAfter／minuteKey", () => {
  it("只比到分鐘，格式寬鬆（/ 或 -、補零）", () => {
    expect(parseAfter("2026/11/04 09:52")).toBe("2026-11-04 09:52");
    expect(parseAfter(" 2026-11-4 9:52 ")).toBe("2026-11-04 09:52");
    expect(minuteKey("2026-11-04", "09:52:59")).toBe("2026-11-04 09:52");
    expect(parseAfter("2026/11/04")).toBeNull();
    expect(parseAfter("昨天")).toBeNull();
  });
});

describe("buildLedgerOutput", () => {
  it("≤ --after 的列視為已併入；跨月份插 null 分隔", () => {
    const txs = parseSinopacCSV(CSV).transactions;
    const raw = rawRowsByTxId(CSV);
    const notes = new Map<string, LedgerAnnotation>(txs.map((t) => [t.txId, { I: "", J: "", K: "", category: "debit" }]));
    // 09:52:10 跟 --after 09:52 同一分鐘 → 視為已有
    const out = buildLedgerOutput(txs, notes, raw, "2026-11-04 09:52");
    expect(out.map((r) => (r ? r.raw[0] : null))).toEqual(["2026/11/04 09:53", null, "2026/12/01 10:00"]);
    expect(buildLedgerOutput(txs, notes, raw, "2026-11-04 09:51")).toHaveLength(4);
  });
});
