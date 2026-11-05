import { describe, expect, it } from "vitest";

import {
  accountIdsForCsv,
  buildVerifySchedules,
  extractLast5,
  extractOrderNumber,
  maskMemo,
  scheduleRef,
  verifyBankTransactions,
  type VerifySchedule,
} from "@/lib/bank-verify";
import type { BankAccount } from "@/lib/remittance";
import type { ARScheduleRecord, ARWithSchedules, BankTransaction, CustomOrder } from "@/lib/types";

const OWN: BankAccount[] = [
  {
    id: "big_custom",
    buttonLabel: "大戶（訂製）",
    holderName: "周春懋",
    bankCode: "807",
    bankName: "永豐商業銀行",
    branchCode: "0168",
    branchName: "",
    accountNumber: "16801800085918",
    showBranch: true,
  },
  {
    id: "sinopac_custom",
    buttonLabel: "永豐",
    holderName: "陳涵儀",
    bankCode: "807",
    bankName: "永豐商業銀行",
    branchCode: "0068",
    branchName: "",
    accountNumber: "06801800918474",
    showBranch: true,
  },
];
const CSV_ACCOUNT = "168-018-0008591-8【大戶】新台幣";

let seq = 0;
function tx(over: Partial<BankTransaction>): BankTransaction {
  seq += 1;
  return {
    txId: `tx-${seq}`,
    txDate: "2026-10-10",
    txTime: "10:00",
    valueDate: "2026-10-10",
    description: "跨行轉帳",
    debit: null,
    credit: null,
    balance: 100000 + seq,
    memo: "",
    ...over,
  };
}

function sch(over: Partial<VerifySchedule>): VerifySchedule {
  seq += 1;
  return {
    scheduleId: `SCH-${seq}`,
    arId: "AR-1",
    caseId: "CA-202610-001",
    label: "訂金",
    receivedAmount: 0,
    receivedDate: "",
    paymentMethod: "transfer",
    receivingAccountId: "",
    ref: "",
    clientName: "王小明",
    orderNumbers: [],
    ...over,
  };
}

const ORDERS = [
  { orderId: "ORD-1", orderNumber: "S882", caseId: "CA-202610-001", clientName: "王小明" },
  { orderId: "ORD-2", orderNumber: "P6288", caseId: "CA-202610-002", clientName: "林大華" },
] satisfies Array<Pick<CustomOrder, "orderId" | "orderNumber" | "caseId" | "clientName">>;

const run = (txs: BankTransaction[], schedules: VerifySchedule[]) =>
  verifyBankTransactions(txs, schedules, ORDERS, { accountTexts: [CSV_ACCOUNT], ownAccounts: OWN });

describe("extractLast5", () => {
  it("取備註裡 10～19 位數帳號的末五碼", () => {
    expect(extractLast5("7000024411500765241")).toBe("65241");
  });
  it("全形數字也認得", () => {
    expect(extractLast5("７０００２４４１１５００７６５２４１ 訂金")).toBe("65241");
  });
  it("帳號中間夾空白", () => {
    expect(extractLast5("700 0024 4115 0076 5241")).toBe("65241");
  });
  it("沒有帳號回傳空字串", () => {
    expect(extractLast5("S882 尾款")).toBe("");
  });
});

describe("extractOrderNumber", () => {
  it.each([
    ["8080000174966010128 S 8 7 8", "S878"],
    ["0520004221000067521 Ｐ００１４５５", "P1455"],
    ["7000003111430221601 Ｌ０１９臥榻墊", "L019"],
    ["s0882 尾款", "S882"],
    ["8220000613540250150", ""],
  ])("%s → %s", (memo, expected) => {
    expect(extractOrderNumber(memo)).toBe(expected);
  });
});

describe("scheduleRef", () => {
  it("paymentRef 優先", () => {
    expect(scheduleRef("65241", "(18173)")).toBe("65241");
  });
  it("舊資料從備註找獨立 5 位數（含全形）", () => {
    expect(scheduleRef("", "王先生匯款（１８１７３）囉")).toBe("18173");
  });
  it("較長的數字不算", () => {
    expect(scheduleRef("", "電話 0912345678")).toBe("");
  });
});

describe("accountIdsForCsv", () => {
  it("CSV 帳號文字對到收款帳戶 id", () => {
    expect(accountIdsForCsv(CSV_ACCOUNT, OWN)).toEqual(["big_custom"]);
  });
  it("認不得回傳空陣列", () => {
    expect(accountIdsForCsv("999-999-9999999-9", OWN)).toEqual([]);
  });
});

describe("maskMemo", () => {
  it("長串數字只留末五碼", () => {
    expect(maskMemo("7000024411500765241 S882")).toBe("…65241 S882");
  });
});

describe("buildVerifySchedules", () => {
  it("客戶名從訂單補、單號靠 caseId 連、ref 從備註補", () => {
    const schedule = {
      scheduleId: "SCH-A",
      arId: "AR-9",
      label: "訂金",
      receivedAmount: 5000,
      receivedDate: "2026-10-01",
      paymentMethod: "transfer",
      paymentRef: "",
      receivingAccountId: "",
      notes: "(18173) 囉",
    } as ARScheduleRecord;
    const ar = { arId: "AR-9", caseId: "CA-202610-001", clientNameSnapshot: "", schedules: [schedule] } as ARWithSchedules;
    const [s] = buildVerifySchedules([ar], ORDERS);
    expect(s.clientName).toBe("王小明");
    expect(s.orderNumbers).toEqual(["S882"]);
    expect(s.ref).toBe("18173");
  });
});

describe("verifyBankTransactions", () => {
  it("✅ 末五碼＋金額一致，差額記為手續費", () => {
    const s = sch({ ref: "65241", receivedAmount: 10000, receivedDate: "2026-10-10" });
    const { rows } = run([tx({ credit: 9985, memo: "7000024411500765241" })], [s]);
    expect(rows[0].category).toBe("ok");
    expect(rows[0].reason).toBe("末五碼＋金額");
    expect(rows[0].note).toContain("手續費");
  });

  it("✅ 備註單號＋金額一致", () => {
    const s = sch({ receivedAmount: 8800, receivedDate: "2026-10-10", orderNumbers: ["S882"] });
    const { rows } = run([tx({ credit: 8800, memo: "S0882 尾款" })], [s]);
    expect(rows[0].category).toBe("ok");
    expect(rows[0].reason).toBe("備註單號＋金額");
  });

  it("⚠️ 末五碼對上但金額差超過 50", () => {
    const s = sch({ ref: "65241", receivedAmount: 10000, receivedDate: "2026-10-10" });
    const { rows } = run([tx({ credit: 9000, memo: "7000024411500765241" })], [s]);
    expect(rows[0].category).toBe("amount_mismatch");
    expect(rows[0].schedules[0].receivedAmount).toBe(10000);
  });

  it("✅ 分筆入帳：同末五碼兩筆加總等於一筆收款", () => {
    const s = sch({ ref: "65241", receivedAmount: 20000, receivedDate: "2026-10-12" });
    const { rows, systemOnly } = run(
      [
        tx({ credit: 10000, memo: "7000024411500765241", txDate: "2026-10-10" }),
        tx({ credit: 10000, memo: "7000024411500765241", txDate: "2026-10-15" }),
      ],
      [s],
    );
    expect(rows.map((r) => r.category)).toEqual(["ok", "ok"]);
    expect(rows[0].reason).toBe("分筆入帳");
    expect(systemOnly).toHaveLength(0);
  });

  it("分筆超過 14 天不合併", () => {
    const s = sch({ ref: "65241", receivedAmount: 20000, receivedDate: "2026-10-12" });
    const { rows } = run(
      [
        tx({ credit: 10000, memo: "7000024411500765241", txDate: "2026-10-01" }),
        tx({ credit: 10000, memo: "7000024411500765241", txDate: "2026-10-20" }),
      ],
      [s],
    );
    expect(rows.every((r) => r.category === "amount_mismatch")).toBe(true);
  });

  it("🔍 沒有末五碼佐證，只剩一筆金額相同、日期相近 → 可能是（不自動認定）", () => {
    const s = sch({ receivedAmount: 6000, receivedDate: "2026-10-08" });
    const { rows } = run([tx({ credit: 6000, memo: "現金存款" })], [s]);
    expect(rows[0].category).toBe("possible");
  });

  it("日期差超過 5 天就不算可能是 → ❗", () => {
    const s = sch({ receivedAmount: 6000, receivedDate: "2026-10-01" });
    const { rows } = run([tx({ credit: 6000, memo: "現金存款" })], [s]);
    expect(rows[0].category).toBe("missing_in_system");
  });

  it("❗ 什麼都對不到", () => {
    const { rows } = run([tx({ credit: 3210, memo: "8220000613540299999" })], []);
    expect(rows[0].category).toBe("missing_in_system");
  });

  it("⚪ 利息、大戶回饋收在非訂單款", () => {
    const { rows } = run(
      [tx({ credit: 562, description: "利息存入", memo: "168018000..." }), tx({ credit: 30, description: "大戶回饋" })],
      [],
    );
    expect(rows.map((r) => r.category)).toEqual(["non_order", "non_order"]);
  });

  it("自家帳戶的末五碼不當客人末五碼，標「內部帳戶轉入」", () => {
    // 剛好有一筆分期的 ref 是自家帳戶末五碼——不能因此認定一致
    const s = sch({ ref: "18474", receivedAmount: 50000, receivedDate: "2026-09-01" });
    const { rows } = run([tx({ credit: 50000, memo: "8070006801800918474" })], [s]);
    expect(rows[0].isInternal).toBe(true);
    expect(rows[0].category).toBe("non_order");
    expect(rows[0].reason).toBe("內部帳戶轉入");
  });

  it("自家帳戶轉入但備註有單號，仍照單號比對", () => {
    const s = sch({ receivedAmount: 8800, receivedDate: "2026-10-10", orderNumbers: ["S882"] });
    const { rows } = run([tx({ credit: 8800, memo: "8070006801800918474 S882" })], [s]);
    expect(rows[0].category).toBe("ok");
  });

  it("一筆收款只能被一筆入帳對走；第二筆同末五碼變 ❗ 並帶出應收", () => {
    const s = sch({ arId: "AR-7", ref: "65241", receivedAmount: 10000, receivedDate: "2026-10-10" });
    const { rows } = run(
      [
        tx({ credit: 10000, memo: "7000024411500765241", txTime: "09:00" }),
        tx({ credit: 10000, memo: "7000024411500765241", txTime: "10:00" }),
      ],
      [s],
    );
    expect(rows[0].category).toBe("ok");
    expect(rows[1].category).toBe("missing_in_system");
    expect(rows[1].arId).toBe("AR-7");
  });

  it("訂金與尾款同末五碼，各自對上自己那期", () => {
    const dep = sch({ ref: "65241", receivedAmount: 3000, receivedDate: "2026-10-01" });
    const bal = sch({ ref: "65241", receivedAmount: 7000, receivedDate: "2026-10-20" });
    const { rows } = run(
      [
        tx({ credit: 7000, memo: "7000024411500765241", txDate: "2026-10-20" }),
        tx({ credit: 3000, memo: "7000024411500765241", txDate: "2026-10-01" }),
      ],
      [dep, bal],
    );
    expect(rows.map((r) => r.schedules[0]?.scheduleId)).toEqual([dep.scheduleId, bal.scheduleId]);
  });

  it("支出只計數", () => {
    const { rows, debitCount } = run([tx({ debit: 11500, memo: "L587" })], []);
    expect(rows).toHaveLength(0);
    expect(debitCount).toBe(1);
  });

  describe("❌ 系統有記、銀行沒看到", () => {
    const txs = [
      tx({ credit: 999, memo: "現金", txDate: "2026-10-01" }),
      tx({ debit: 1, txDate: "2026-10-31" }),
    ];
    it("只列區間內、匯款、收款帳戶為空或等於本 CSV 帳戶、沒被對走的", () => {
      const inRange = sch({ receivedAmount: 5000, receivedDate: "2026-10-15" });
      const sameAcct = sch({ receivedAmount: 5000, receivedDate: "2026-10-16", receivingAccountId: "big_custom" });
      const otherAcct = sch({ receivedAmount: 5000, receivedDate: "2026-10-16", receivingAccountId: "sinopac_custom" });
      const cash = sch({ receivedAmount: 5000, receivedDate: "2026-10-16", paymentMethod: "cash" });
      const outOfRange = sch({ receivedAmount: 5000, receivedDate: "2026-11-02" });
      const unpaid = sch({ receivedAmount: 0, receivedDate: "" });
      const { systemOnly } = run(txs, [inRange, sameAcct, otherAcct, cash, outOfRange, unpaid]);
      expect(systemOnly.map((s) => s.scheduleId)).toEqual([inRange.scheduleId, sameAcct.scheduleId]);
    });
  });
});
