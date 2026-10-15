import type { PublicSigningView, SigningLinkStatus } from "@/lib/signing-types";

/**
 * 組出要回給客人的簽署頁資料，並依連結狀態決定給多少。
 *
 * 🔴 2026-10-15 第二輪稽核發現：原本的實作只是把 status 算成 expired/revoked，
 *    然後把整包資料照樣回傳——客戶姓名、聯絡人、電話、地址、統編、發票抬頭、
 *    金額、未簽 PDF 與圖片網址全都在裡面。前端雖然只顯示一行「連結已失效」，
 *    但直接打那支 API 就拿得到全部內容。
 *    「前端顯示失效」不是授權保證；撤銷要真的撤得掉才有意義。
 *
 * 規則（預設拒絕，不是預設放行）：
 *   - pending  → 完整內容。客人要填訂貨人資訊與發票欄位，這些預填是刻意的設計。
 *   - signed   → 只給 quoteId 與已簽 PDF，讓客人回頭下載自己那份。
 *                預填用的個資與「未簽」文件都不再需要，一律不給。
 *   - 其他（expired／revoked／未知狀態）→ 只給狀態。
 */
export interface SigningViewInput {
  status: SigningLinkStatus;
  quoteId: string;
  unsignedPdfUrl: string;
  unsignedImageUrl: string;
  signedPdfUrl: string;
  expiresAt: string;
  clientName: string;
  contactName: string;
  contactPhone: string;
  contactAddress: string;
  total: number;
  subtotal: number;
  taxRate: number;
  taxId: string;
  invoiceTitle: string;
  faq: string;
}

/** 只有狀態、沒有任何內容的骨架 */
function emptyView(status: SigningLinkStatus): PublicSigningView {
  return {
    status,
    unsignedPdfUrl: "",
    unsignedImageUrl: "",
    quoteId: "",
    clientName: "",
    total: 0,
    expiresAt: "",
    signedPdfUrl: "",
  };
}

export function buildPublicSigningView(input: SigningViewInput): PublicSigningView {
  if (input.status === "pending") {
    return {
      status: input.status,
      unsignedPdfUrl: input.unsignedPdfUrl,
      unsignedImageUrl: input.unsignedImageUrl,
      quoteId: input.quoteId,
      clientName: input.clientName,
      total: input.total,
      expiresAt: input.expiresAt,
      signedPdfUrl: input.signedPdfUrl,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactAddress: input.contactAddress,
      subtotal: input.subtotal,
      taxRate: input.taxRate,
      taxId: input.taxId,
      invoiceTitle: input.invoiceTitle,
      faq: input.faq,
    };
  }

  if (input.status === "signed") {
    return {
      ...emptyView(input.status),
      quoteId: input.quoteId,
      signedPdfUrl: input.signedPdfUrl,
    };
  }

  return emptyView(input.status);
}
