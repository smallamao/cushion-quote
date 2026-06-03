import { describe, expect, it } from "vitest";
import {
  normalizeFullWidth,
  extractCaseIdFromMemo,
  parseSinopacCSV,
} from "@/lib/bank-csv-parser";

describe("normalizeFullWidth", () => {
  it("轉換全形英文", () => {
    expect(normalizeFullWidth("Ｌ５８７")).toBe("L587");
  });
  it("轉換全形數字", () => {
    expect(normalizeFullWidth("０１２")).toBe("012");
  });
  it("半形不變", () => {
    expect(normalizeFullWidth("L587")).toBe("L587");
  });
});

describe("extractCaseIdFromMemo", () => {
  it("擷取全形訂單號", () => {
    expect(extractCaseIdFromMemo("7000003111430221601 Ｌ０１９臥榻墊")).toBe(
      "L019"
    );
  });
  it("擷取半形帶空格訂單號", () => {
    expect(extractCaseIdFromMemo("8080000174966010128 S 8 7 8")).toBe("S878");
  });
  it("多餘前導零 P001455 → P1455", () => {
    expect(extractCaseIdFromMemo("0520004221000067521 Ｐ００１４５５")).toBe(
      "P1455"
    );
  });
  it("找不到訂單號回傳 null", () => {
    expect(extractCaseIdFromMemo("8220000613540250150")).toBeNull();
  });
  it("純帳號字串回傳 null", () => {
    expect(extractCaseIdFromMemo("永豐銀行-16625")).toBeNull();
  });
});

describe("parseSinopacCSV", () => {
  const HEADER = `帳號,168-018-0008591-8【TEST】新台幣,,,,,,,,,,
交易日, 計息日, 摘要, 支出, 存入, 餘額,匯率,備註/資金用途,`;

  it("解析標準存入行", () => {
    const csv = `${HEADER}
2026/05/20 16:52,2026/05/20,手機轉帳, ,24885,627297,,100018009897,`;
    const { transactions, errors } = parseSinopacCSV(csv);
    expect(errors).toHaveLength(0);
    expect(transactions).toHaveLength(1);
    const tx = transactions[0];
    expect(tx.txDate).toBe("2026-05-20");
    expect(tx.txTime).toBe("16:52");
    expect(tx.credit).toBe(24885);
    expect(tx.debit).toBeNull();
    expect(tx.balance).toBe(627297);
    expect(tx.memo).toBe("100018009897");
  });

  it("解析支出行", () => {
    const csv = `${HEADER}
2026/05/16 23:37,2026/05/17,手機轉帳,11500, ,573810,,7000003111430221601 Ｌ５８７南港床頭翻修,`;
    const { transactions } = parseSinopacCSV(csv);
    expect(transactions[0].debit).toBe(11500);
    expect(transactions[0].credit).toBeNull();
    expect(transactions[0].memo).toBe(
      "7000003111430221601 Ｌ５８７南港床頭翻修"
    );
  });

  it("忽略空白行", () => {
    const csv = `${HEADER}
2026/05/21 00:28,2026/05/21,利息存入, ,562,636659,,168018000...,

`;
    const { transactions } = parseSinopacCSV(csv);
    expect(transactions).toHaveLength(1);
  });

  it("Numbers 匯出的 11 欄格式（含使用者補充欄）也能解析", () => {
    const csv = `${HEADER}
2026/05/20 17:43,2026/05/20,跨行轉帳, ,8800,636097,,0090053145100792600,S879,張皓程,全額,`;
    const { transactions } = parseSinopacCSV(csv);
    expect(transactions[0].credit).toBe(8800);
    expect(transactions[0].memo).toBe("0090053145100792600");
  });

  it("CSV 行數不足回傳 error", () => {
    const { errors } = parseSinopacCSV("帳號,test");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("txId 對相同交易唯一且確定性", () => {
    const csv = `${HEADER}
2026/05/20 16:52,2026/05/20,手機轉帳, ,24885,627297,,test,`;
    const { transactions } = parseSinopacCSV(csv);
    const { transactions: transactions2 } = parseSinopacCSV(csv);
    expect(transactions[0].txId).toBe(transactions2[0].txId);
  });
});
