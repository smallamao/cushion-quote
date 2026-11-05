import { describe, expect, it } from "vitest";
import { parseQueryRange, parseSinopacCSV, parseSinopacFiles } from "@/lib/bank-csv-parser";

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

  it("txId 對不同交易回傳不同值", () => {
    const csv = `${HEADER}
2026/05/20 16:52,2026/05/20,手機轉帳, ,24885,627297,,100018009897,
2026/05/20 16:52,2026/05/20,手機轉帳, ,24885,627297,,200018009898,`;
    const { transactions } = parseSinopacCSV(csv);
    expect(transactions).toHaveLength(2);
    expect(transactions[0].txId).not.toBe(transactions[1].txId);
  });
});

describe("parseSinopacFiles", () => {
  const file = (name: string, account: string, body: string) => ({
    name,
    text: `\uFEFF帳號,${account},,,,,,,,,,\r\n交易日, 計息日, 摘要, 支出, 存入, 餘額,匯率,備註/資金用途,\r\n${body}`,
  });

  it("多個檔案合併、重疊的同一筆交易只留一筆、依時間排序", () => {
    const sep = file(
      "m9.csv",
      "168-018-0008591-8【大戶】新台幣",
      "2026/09/30 10:00,2026/09/30,跨行轉帳, ,5000,105000,,7000024411500765241,\r\n" +
        "\t2026/10/01 13:05,2026/10/01,跨行轉帳, ,3000,108000,,\t7000024411500765241,\r\n",
    );
    const oct = file(
      "m10.csv",
      "168-018-0008591-8【大戶】新台幣",
      "2026/10/01 13:05,2026/10/01,跨行轉帳, ,3000,108000,,7000024411500765241,\r\n" +
        "2026/10/02 09:00,2026/10/02,利息存入, ,12,108012,,,\r\n",
    );
    const { transactions, accountTexts, errors } = parseSinopacFiles([oct, sep]);
    expect(errors).toHaveLength(0);
    expect(accountTexts).toEqual(["168-018-0008591-8【大戶】新台幣"]);
    expect(transactions.map((t) => `${t.txDate} ${t.credit}`)).toEqual([
      "2026-09-30 5000",
      "2026-10-01 3000",
      "2026-10-02 12",
    ]);
    expect(transactions[1].memo).toBe("7000024411500765241");
  });

  it("不同帳戶的檔案各自列出帳號", () => {
    const a = file("a.csv", "168-018-0008591-8【大戶】新台幣", "2026/10/01 10:00,2026/10/01,跨行轉帳, ,1,1,,x,\r\n");
    const b = file("b.csv", "030-018-0008106-1【馬鈴薯】新台幣", "2026/10/01 10:00,2026/10/01,跨行轉帳, ,1,1,,x,\r\n");
    expect(parseSinopacFiles([a, b]).accountTexts).toHaveLength(2);
  });
});

describe("parseQueryRange", () => {
  it("讀第 2 行的查詢日期", () => {
    const text = "帳號, 168-018-0008591-8【大戶】新台幣\r\n查詢日期, 20261001~20261031\r\n\r\n交易日,計息日\r\n";
    expect(parseQueryRange(text)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("沒有查詢日期回傳 null，parseSinopacFiles 改用交易日", () => {
    const text = "帳號,x\r\n交易日, 計息日, 摘要, 支出, 存入, 餘額,匯率,備註/資金用途,\r\n2026/10/03 10:00,2026/10/03,跨行轉帳, ,1,1,,x,\r\n";
    expect(parseQueryRange(text)).toBeNull();
    expect(parseSinopacFiles([{ name: "a.csv", text }]).ranges).toEqual([
      { name: "a.csv", from: "2026-10-03", to: "2026-10-03" },
    ]);
  });
});
