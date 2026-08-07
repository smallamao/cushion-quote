// 線上簽署連結的純型別（client 與 server 共用，不含 server-only 依賴）。

export type SigningLinkStatus = "pending" | "signed" | "revoked" | "expired";

export interface SigningLink {
  token: string;
  versionId: string;
  quoteId: string;
  caseId: string;
  status: SigningLinkStatus;
  /** 待簽的報價單 PDF（Cloudinary 網址） */
  unsignedPdfUrl: string;
  createdAt: string;
  createdBy: string;
  /** ISO 到期時間；空字串＝不過期 */
  expiresAt: string;
  signedAt: string;
  signerName: string;
  signerIp: string;
  signerUserAgent: string;
  /** 已簽的合約 PDF（Cloudinary 網址） */
  signedPdfUrl: string;
}

/** pending 連結是否已過期（expiresAt 空字串視為不過期）。 */
export function isSigningLinkExpired(link: Pick<SigningLink, "expiresAt">, nowMs: number): boolean {
  if (!link.expiresAt) return false;
  const t = Date.parse(link.expiresAt);
  return Number.isFinite(t) && t < nowMs;
}

/** 客戶簽署頁只暴露這些欄位（不外洩成本/毛利等內部資料）。 */
export interface PublicSigningView {
  status: SigningLinkStatus;
  unsignedPdfUrl: string;
  quoteId: string;
  clientName: string;
  total: number;
  expiresAt: string;
  signedPdfUrl: string;
}
