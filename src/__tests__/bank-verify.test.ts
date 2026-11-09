import { describe, expect, it } from "vitest";

import {
  accountIdsForCsv,
  buildVerifySchedules,
  detectFreight,
  extractLast5,
  extractOrderNumber,
  freightOrderNumber,
  freightStatus,
  maskMemo,
  mergeRanges,
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
    ["CHANG PS 0912345678", ""],
    ["L12345678901", ""],
    ["王 P6288", "P6288"],
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
  it("認不得回傳空陣列（CSV 帳號不在收款帳戶清單內）", () => {
    expect(accountIdsForCsv("999-999-9999999-9", OWN)).toEqual([]);
  });
});

describe("maskMemo", () => {
  it("長串數字只留末五碼", () => {
    expect(maskMemo("7000024411500765241 S882")).toBe("…65241 S882");
  });
  it("夾空白／連字號、總共 ≥10 位也遮", () => {
    expect(maskMemo("700 0024 4115 0076 5241 訂金")).toBe("…65241 訂金");
    expect(maskMemo("168-018-0008591-8")).toBe("…85918");
  });
  it("帳號後面接其他數字時只遮帳號", () => {
    expect(maskMemo("7000024411500765241 2026")).toBe("…65241 2026");
  });
  it("短數字與空白隔開的單號不遮", () => {
    expect(maskMemo("S 8 7 8 尾款 3000")).toBe("S 8 7 8 尾款 3000");
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
    // 第一筆 ⚠️ 吃掉那筆收款；第二筆同末五碼只剩 ❗
    expect(rows.map((r) => r.category)).toEqual(["amount_mismatch", "missing_in_system"]);
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

  describe("自家帳戶轉入（客人先匯到老闆自己的帳戶再轉進來）", () => {
    const internal = (over: Partial<BankTransaction> = {}) =>
      tx({ credit: 50000, memo: "8070006801800918474", txDate: "2026-10-10", ...over });
    const end = tx({ debit: 1, txDate: "2026-10-31" });

    it("金額相同、日期相近只剩一筆 → 🔍 並吃掉那筆，標出是哪個自己帳戶", () => {
      // 分期記的是客人自己的末五碼——自家轉入看不出客人末五碼，不能因此排除
      const s = sch({ ref: "65241", receivedAmount: 50000, receivedDate: "2026-10-08" });
      const { rows, systemOnly } = run([internal(), end], [s]);
      expect(rows[0].category).toBe("possible");
      expect(rows[0].reason).toBe("可能是（自己帳戶轉入）");
      expect(rows[0].ownAccountId).toBe("sinopac_custom");
      expect(rows[0].schedules[0].scheduleId).toBe(s.scheduleId);
      expect(systemOnly).toHaveLength(0);
    });

    it("金額相同的不只一筆 → ⚪，不吃掉任何收款", () => {
      const a = sch({ receivedAmount: 50000, receivedDate: "2026-10-12" });
      const b = sch({ receivedAmount: 50000, receivedDate: "2026-10-14" });
      const { rows, systemOnly } = run([internal(), end], [a, b]);
      expect(rows[0].category).toBe("non_order");
      expect(rows[0].reason).toBe("內部帳戶轉入");
      expect(rows[0].note).toBe("金額相同 2 筆");
      expect(systemOnly.map((x) => x.scheduleId)).toEqual([a.scheduleId, b.scheduleId]);
    });

    it("金額差 $10 → ⚪，那筆收款仍列 ❌", () => {
      const s = sch({ receivedAmount: 50010, receivedDate: "2026-10-10" });
      const { rows, systemOnly } = run([internal(), end], [s]);
      expect(rows[0].category).toBe("non_order");
      expect(rows[0].schedules).toHaveLength(0);
      expect(systemOnly.map((x) => x.scheduleId)).toEqual([s.scheduleId]);
    });
  });

  it("🔍 分期記了別的末五碼就不算可能是", () => {
    const s = sch({ ref: "11111", receivedAmount: 6000, receivedDate: "2026-10-10" });
    const { rows } = run([tx({ credit: 6000, memo: "7000024411500765241" })], [s]);
    expect(rows[0].category).toBe("missing_in_system");
  });

  it("🔍 金額要完全相同；差 $30 不算", () => {
    const s = sch({ receivedAmount: 6030, receivedDate: "2026-10-10" });
    const { rows } = run([tx({ credit: 6000, memo: "現金存款" })], [s]);
    expect(rows[0].category).toBe("missing_in_system");
  });

  it("⚠️ 吃掉對到的收款，不會同時出現在 ❌", () => {
    const s = sch({ ref: "65241", receivedAmount: 10000, receivedDate: "2026-10-05" });
    const { rows, systemOnly } = run(
      [tx({ credit: 9000, memo: "7000024411500765241", txDate: "2026-10-05" }), tx({ debit: 1, txDate: "2026-10-31" })],
      [s],
    );
    expect(rows[0].category).toBe("amount_mismatch");
    expect(rows[0].note).toBe("銀行 少 $1,000");
    expect(systemOnly).toHaveLength(0);
  });

  it("兩筆分期競爭同一組分筆入帳：各自拿到不重複的兩筆", () => {
    const a = sch({ ref: "65241", receivedAmount: 15000, receivedDate: "2026-10-10" });
    const b = sch({ ref: "65241", receivedAmount: 15000, receivedDate: "2026-10-12" });
    const memo = "7000024411500765241";
    const { rows } = run(
      [
        tx({ credit: 10000, memo, txDate: "2026-10-09" }),
        tx({ credit: 5000, memo, txDate: "2026-10-10" }),
        tx({ credit: 10000, memo, txDate: "2026-10-11" }),
        tx({ credit: 5000, memo, txDate: "2026-10-12" }),
      ],
      [a, b],
    );
    expect(rows.every((r) => r.category === "ok" && r.reason === "分筆入帳")).toBe(true);
    const bySchedule = (id: string) => rows.filter((r) => r.schedules[0].scheduleId === id);
    expect(bySchedule(a.scheduleId).reduce((n, r) => n + (r.tx.credit ?? 0), 0)).toBe(15000);
    expect(bySchedule(b.scheduleId).reduce((n, r) => n + (r.tx.credit ?? 0), 0)).toBe(15000);
  });

  it("CSV 帳號不在收款帳戶清單內：❌ 只列沒指定收款帳戶的", () => {
    const blank = sch({ receivedAmount: 5000, receivedDate: "2026-10-15" });
    const assigned = sch({ receivedAmount: 5000, receivedDate: "2026-10-15", receivingAccountId: "big_custom" });
    const { systemOnly } = verifyBankTransactions(
      [tx({ debit: 1, txDate: "2026-10-01" }), tx({ debit: 1, txDate: "2026-10-31" })],
      [blank, assigned],
      ORDERS,
      { accountTexts: ["999-999-9999999-9【別家】新台幣"], ownAccounts: OWN },
    );
    expect(systemOnly.map((s) => s.scheduleId)).toEqual([blank.scheduleId]);
  });

  describe("明細涵蓋區間", () => {
    const ranges = [
      { from: "2026-08-01", to: "2026-08-31" },
      { from: "2026-10-01", to: "2026-10-31" },
    ];
    const verify = (schedules: VerifySchedule[]) =>
      verifyBankTransactions([], schedules, ORDERS, { accountTexts: [CSV_ACCOUNT], ownAccounts: OWN, ranges });

    it("缺月份的空檔不列 ❌，並回報空檔", () => {
      const sep = sch({ receivedAmount: 5000, receivedDate: "2026-09-15" });
      const oct = sch({ receivedAmount: 5000, receivedDate: "2026-10-15" });
      const result = verify([sep, oct]);
      expect(result.systemOnly.map((s) => s.scheduleId)).toEqual([oct.scheduleId]);
      expect(result.gaps).toEqual([{ from: "2026-09-01", to: "2026-09-30" }]);
    });

    it("區間最後 2 天的收款改列「可能跨月入帳」", () => {
      const endAug = sch({ receivedAmount: 5000, receivedDate: "2026-08-31" });
      const day30 = sch({ receivedAmount: 5000, receivedDate: "2026-08-30" });
      const day29 = sch({ receivedAmount: 5000, receivedDate: "2026-08-29" });
      const result = verify([endAug, day30, day29]);
      expect(result.systemOnly.map((s) => s.scheduleId)).toEqual([day29.scheduleId]);
      expect(result.crossPeriod.map((s) => s.scheduleId)).toEqual([day30.scheduleId, endAug.scheduleId]);
    });
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

describe("mergeRanges", () => {
  it("相連的月份合併成一段", () => {
    expect(
      mergeRanges([
        { from: "2026-09-01", to: "2026-09-30" },
        { from: "2026-08-01", to: "2026-08-31" },
      ]),
    ).toEqual({ coverage: [{ from: "2026-08-01", to: "2026-09-30" }], gaps: [] });
  });
});

describe("運費提領", () => {
  const FREIGHT_ORDERS = [
    { orderId: "ORD-997", orderNumber: "S997", caseId: "CA-1", clientName: "甲", shippingCost: 0 },
    { orderId: "ORD-1001", orderNumber: "S1001", caseId: "CA-2", clientName: "乙", shippingCost: 1500 },
    { orderId: "ORD-332", orderNumber: "P0332", caseId: "CA-3", clientName: "丙", shippingCost: 800 },
  ];
  const atm = (memo: string, debit: number, over: Partial<BankTransaction> = {}) =>
    tx({ description: "ATM現金", debit, memo, ...over });

  it("全形備註、「運費」與簡寫「運」都認得，前導零單號兩邊都對得上", () => {
    const { freightRows } = detectFreight(
      [atm("16667 Ｓ９９７運費", 1000), atm("16667 Ｓ１００１運", 1500), atm("16667 Ｐ０３３２運", 500)],
      FREIGHT_ORDERS,
    );
    expect(freightRows.map((r) => [r.orderNumber, r.orderId, r.amount])).toEqual([
      ["S997", "ORD-997", 1000],
      ["S1001", "ORD-1001", 1500],
      ["P0332", "ORD-332", 500],
    ]);
  });

  it("沒有「運」字、入帳、或 L 進貨單號都不算運費", () => {
    expect(freightOrderNumber(atm("16667 Ｓ９９７", 1000))).toBe("");
    expect(freightOrderNumber(tx({ credit: 1000, memo: "S997運費" }))).toBe("");
    expect(freightOrderNumber(atm("L019 運費", 1000))).toBe("");
    expect(freightOrderNumber(tx({ description: "運費", debit: 300, memo: "S997" }))).toBe("S997");
  });

  it("查不到的單號照樣列出，但沒有 orderId、不進訂單加總", () => {
    const { freightRows, freightByOrder } = detectFreight([atm("16667 Ｓ５５５運費", 900)], FREIGHT_ORDERS);
    expect(freightRows).toHaveLength(1);
    expect(freightRows[0]).toMatchObject({ orderNumber: "S555", orderId: "", amount: 900 });
    expect(freightByOrder).toEqual([]);
  });

  it("同一張單多筆提領加總，並判斷 same／empty／different", () => {
    const { freightByOrder } = detectFreight(
      [
        atm("16667 Ｓ９９７運費", 1000),
        atm("16667 Ｓ９９７運", 500),
        atm("16667 Ｓ１００１運", 1500),
        atm("16667 Ｐ０３３２運", 500),
      ],
      FREIGHT_ORDERS,
    );
    expect(freightByOrder.map((f) => [f.orderNumber, f.total, f.currentShippingCost, f.status, f.rows.length])).toEqual([
      ["S997", 1500, 0, "empty", 2],
      ["S1001", 1500, 1500, "same", 1],
      ["P0332", 500, 800, "different", 1],
    ]);
  });

  it("verifyBankTransactions 也回傳運費結果", () => {
    const r = verifyBankTransactions([atm("16667 Ｓ８８２運費", 600)], [], [{ ...ORDERS[0], shippingCost: 0 }], {
      ownAccounts: OWN,
    });
    expect(r.freightByOrder).toMatchObject([{ orderId: "ORD-1", total: 600, status: "empty" }]);
    expect(r.debitCount).toBe(1);
  });

  it("freightStatus", () => {
    expect(freightStatus(1000, 1000)).toBe("same");
    expect(freightStatus(1000, 0)).toBe("empty");
    expect(freightStatus(1000, 1200)).toBe("different");
  });
});
