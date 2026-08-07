import "server-only";

import { PDFDocument } from "pdf-lib";

import {
  renderSignatureRecordPdf,
  type SignatureRecordProps,
} from "@/components/pdf/SignatureRecordPDF";

export type SignAuditInfo = SignatureRecordProps;

/**
 * 已簽 PDF = 待簽報價單 + 一頁「電子簽署存證」。
 * 存證頁改由 react-pdf 於伺服器端產生（中文字型嵌入正常，避開 pdf-lib 的
 * CJK subset bug），再用 pdf-lib 把兩份 PDF 合併。
 */
export async function bakeSignedPdf(
  unsignedPdf: Uint8Array,
  record: SignatureRecordProps,
): Promise<Uint8Array> {
  const recordPdf = await renderSignatureRecordPdf(record);

  const doc = await PDFDocument.load(unsignedPdf);
  const recordDoc = await PDFDocument.load(recordPdf);
  const pages = await doc.copyPages(recordDoc, recordDoc.getPageIndices());
  pages.forEach((p) => doc.addPage(p));

  return doc.save();
}
