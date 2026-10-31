import { describe, expect, it } from "vitest";

import { buildSignShareMessage, DEPOSIT_PAYMENT_INFO } from "@/lib/deposit-payment";

const URL = "https://s.potatosofa.com/xDbemSbXMN";

describe("buildSignShareMessage", () => {
  const msg = buildSignShareMessage(URL);

  it("第一行就是要客人去簽，連結緊接在後", () => {
    const lines = msg.split("\n");
    expect(lines[0]).toContain("簽署報價單");
    expect(lines[1]).toBe(URL);
  });

  it("🔴 不可出現匯款帳號：客人會在簽核前就先匯款（2026-10-13 事故）", () => {
    expect(msg).not.toContain("16801800085918");
    expect(msg).not.toContain("永豐");
    expect(msg).not.toContain(DEPOSIT_PAYMENT_INFO);
  });

  it("講明簽署代表確認內容與金額（之後還有一份文件，價格不能被當成可再談）", () => {
    expect(msg).toContain("簽署代表確認這份報價的內容與金額");
  });

  it("預告後續會再有一份訂製訂單要核對", () => {
    expect(msg).toContain("訂製訂單");
    expect(msg).toContain("尺寸、布料、工法");
  });

  it("不寫死訂製訂單的發送時機（時機未定案，寫死會讓客人等錯東西）", () => {
    expect(msg).toContain("接下來");
    expect(msg).not.toContain("收到訂金後");
  });

  it("整段維持精簡：簽核那件事不可被後面的說明淹掉", () => {
    expect(msg.split("\n").length).toBeLessThanOrEqual(14);
  });
});
