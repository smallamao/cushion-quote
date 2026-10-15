import { describe, it, expect } from "vitest";

import { buildPublicSigningView } from "@/lib/signing-view";

const FULL = {
  quoteId: "CA-202610-003-Q01",
  unsignedPdfUrl: "https://res.cloudinary.com/x/unsigned.pdf",
  unsignedImageUrl: "https://res.cloudinary.com/x/unsigned.jpg",
  signedPdfUrl: "https://res.cloudinary.com/x/signed.pdf",
  expiresAt: "2026-11-14T00:00:00Z",
  clientName: "雅帝室內裝修設計有限公司",
  contactName: "林季瑩",
  contactPhone: "0912345678",
  contactAddress: "桃園市觀音區…",
  total: 36800,
  subtotal: 35048,
  taxRate: 0.05,
  taxId: "12345678",
  invoiceTitle: "雅帝室內裝修設計有限公司",
  faq: "常見問題…",
};

/** 任何不該外流的欄位，一個都不能出現在回應裡 */
function assertNoPii(view: Record<string, unknown>) {
  const serialized = JSON.stringify(view);
  for (const secret of [
    FULL.clientName,
    FULL.contactName,
    FULL.contactPhone,
    FULL.contactAddress,
    FULL.taxId,
    FULL.invoiceTitle,
    FULL.unsignedPdfUrl,
    FULL.unsignedImageUrl,
    String(FULL.total),
    String(FULL.subtotal),
  ]) {
    expect(serialized).not.toContain(secret);
  }
}

describe("buildPublicSigningView — 撤銷／過期不可再回傳資料", () => {
  // 🔴 2026-10-15 第二輪稽核：原本只是把 status 標成 expired/revoked，
  //    客戶姓名、電話、地址、統編、金額、PDF 網址照樣整包回傳。
  //    「前端顯示失效」不是授權保證。
  it("過期：除了狀態什麼都不給", () => {
    const view = buildPublicSigningView({ status: "expired", ...FULL });
    expect(view.status).toBe("expired");
    assertNoPii(view as unknown as Record<string, unknown>);
  });

  it("撤銷：除了狀態什麼都不給", () => {
    const view = buildPublicSigningView({ status: "revoked", ...FULL });
    expect(view.status).toBe("revoked");
    assertNoPii(view as unknown as Record<string, unknown>);
  });

  it("已簽署：只給下載已簽文件所需的最小集合", () => {
    const view = buildPublicSigningView({ status: "signed", ...FULL });
    expect(view.status).toBe("signed");
    // 客人要能下載自己簽好的那份
    expect(view.signedPdfUrl).toBe(FULL.signedPdfUrl);
    expect(view.quoteId).toBe(FULL.quoteId);
    // 但預填用的個資與未簽文件都不該再給
    expect(view.contactPhone ?? "").toBe("");
    expect(view.contactAddress ?? "").toBe("");
    expect(view.taxId ?? "").toBe("");
    expect(view.clientName).toBe("");
    expect(view.unsignedPdfUrl).toBe("");
    expect(view.total).toBe(0);
  });

  it("有效（pending）：維持原本完整內容，客人才填得了表單", () => {
    const view = buildPublicSigningView({ status: "pending", ...FULL });
    expect(view.status).toBe("pending");
    expect(view.clientName).toBe(FULL.clientName);
    expect(view.contactPhone).toBe(FULL.contactPhone);
    expect(view.contactAddress).toBe(FULL.contactAddress);
    expect(view.total).toBe(FULL.total);
    expect(view.taxId).toBe(FULL.taxId);
    expect(view.unsignedPdfUrl).toBe(FULL.unsignedPdfUrl);
    expect(view.unsignedImageUrl).toBe(FULL.unsignedImageUrl);
    expect(view.faq).toBe(FULL.faq);
  });

  it("未知狀態一律當成不可讀（預設拒絕，不是預設放行）", () => {
    const view = buildPublicSigningView({
      status: "something_new" as never,
      ...FULL,
    });
    assertNoPii(view as unknown as Record<string, unknown>);
  });
});
