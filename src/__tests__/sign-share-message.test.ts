import { describe, expect, it } from "vitest";

import { buildSignShareMessage, DEPOSIT_PAYMENT_INFO } from "@/lib/deposit-payment";
import { DEFAULT_SETTINGS } from "@/lib/constants";

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

  it("講明簽署代表確認的範圍（用字與 FAQ 第一則相同）", () => {
    expect(msg).toContain("品項、尺寸、材質與金額都正確");
  });

  it("預告後續會再有一份訂製訂單要核對", () => {
    expect(msg).toContain("訂製訂單");
    expect(msg).toContain("尺寸、材質與配置");
  });

  it("講明時機是收到訂金之後（老闆 2026-11-01 確認的流程）", () => {
    expect(msg).toContain("收到訂金後");
  });

  it("整段維持精簡：簽核那件事不可被後面的說明淹掉", () => {
    expect(msg.split("\n").length).toBeLessThanOrEqual(14);
  });
});

describe("簽署訊息與簽署頁 FAQ 必須講同一套", () => {
  const msg = buildSignShareMessage(URL);
  const faq = DEFAULT_SETTINGS.signFaq;

  it("🔴 同一份文件只能有一個名字", () => {
    // 2026-11-01：FAQ 寫「訂製工單」、LINE 訊息寫「訂製訂單」，客人會以為是兩份東西。
    // 老闆說兩種叫法都通，所以問題不是用詞本身，是不一致。
    expect(msg).toContain("訂製訂單");
    expect(faq).toContain("訂製訂單");
    expect(faq).not.toContain("訂製工單");
  });

  it("「還能改到什麼時候」兩邊的界線要一致", () => {
    expect(msg).toContain("在您確認之前都還能調整");
    expect(faq).toContain("都還能調整");
  });

  it("兩邊都不可把界線寫成叫料（訂製品不會發叫料通知）", () => {
    expect(msg).not.toContain("叫料");
    expect(faq).not.toContain("叫料");
  });
});
