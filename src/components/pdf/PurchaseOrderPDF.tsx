"use client";

import { Font, pdf } from "@react-pdf/renderer";

import {
  PurchaseOrderDocument,
  buildPurchasePdfFileName,
} from "./PurchaseOrderDocument";
import type { PurchaseOrderPDFProps } from "./PurchaseOrderDocument";

// 瀏覽器端字型註冊（以 URL 載入 public/fonts）。伺服器端另由
// lib/purchase-order-pdf-server.tsx 以檔案路徑註冊同一 family。
Font.register({
  family: "NotoSansTC",
  fonts: [
    { src: "/fonts/NotoSansTC-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/NotoSansTC-Bold.ttf", fontWeight: 700 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

export { buildPurchasePdfFileName };
export type { PurchaseOrderPDFProps };

export async function generatePurchasePdfBlob(
  props: PurchaseOrderPDFProps,
): Promise<Blob> {
  return pdf(<PurchaseOrderDocument {...props} />).toBlob();
}

export async function generateAndDownloadPurchasePdf(
  props: PurchaseOrderPDFProps,
): Promise<void> {
  const blob = await generatePurchasePdfBlob(props);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildPurchasePdfFileName(props.order);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
