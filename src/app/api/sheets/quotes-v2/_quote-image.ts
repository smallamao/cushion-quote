import { CLOUDINARY_FOLDERS, uploadBufferToCloudinary } from "@/lib/cloudinary-upload";
import { toFlexItemsFromVersion } from "@/lib/quote-mappers";
import { renderQuotePdfBuffer } from "@/lib/quote-pdf-server";
import { applyTaxModeToTerms } from "@/lib/quote-terms";
import { DEFAULT_TERMS } from "@/lib/constants";
import { loadSystemSettings } from "@/lib/settings-sheet";
import { getSheetsClient } from "@/lib/sheets-client";
import type { QuotePDFProps } from "@/components/pdf/QuotePDF";

import { getVersionLineRows, getVersionRows, lineRowToRecord, versionRowToRecord } from "../_v2-utils";

/**
 * 伺服器端產「報價單圖片」網址（Notion 同步用）：
 * 讀版本＋明細＋設定 → 組 QuotePDFProps（與預覽側欄同一套）→ renderToBuffer →
 * 以 image 資源型別上傳 Cloudinary（PDF 進 image pipeline）→ 回第 1 頁 JPG 轉檔網址。
 * 任一步失敗就 throw，由呼叫端 catch 後「無圖同步」，不影響報價與 Notion 文字欄位。
 */
export async function buildQuoteJpgUrl(versionId: string): Promise<string> {
  const client = await getSheetsClient();
  if (!client) throw new Error("Google Sheets 未設定");

  const row = (await getVersionRows(client)).find((r) => r[0] === versionId);
  if (!row) throw new Error("version not found");
  const version = versionRowToRecord(row);
  const lines = (await getVersionLineRows(client))
    .map(lineRowToRecord)
    .filter((l) => l.versionId === versionId)
    .sort((a, b) => a.lineNo - b.lineNo);
  const { settings } = await loadSystemSettings();

  const props: QuotePDFProps = {
    quoteId: version.quoteId,
    quoteDate: version.quoteDate || new Date().toISOString().slice(0, 10),
    validityDays: settings.quoteValidityDays,
    validUntil: version.validUntil || undefined,
    pdfMode: "a4",
    client: {
      companyName: version.clientNameSnapshot || "",
      contactName: version.contactNameSnapshot || "",
      phone: version.clientPhoneSnapshot || "",
      email: "",
      address: version.projectAddressSnapshot || "",
      taxId: "",
    },
    projectName: version.projectNameSnapshot || "",
    quoteName: version.quoteNameSnapshot || undefined,
    channel: version.channel || "retail",
    items: toFlexItemsFromVersion(lines),
    description: version.publicDescription || "",
    descriptionImageUrl: version.descriptionImageUrl || undefined,
    includeTax: (version.taxRate ?? 0) > 0,
    subtotal: version.subtotalBeforeTax,
    tax: version.taxAmount,
    total: version.totalAmount,
    multiOption: Boolean(version.isMultiOption),
    termsTemplate: (version.termsTemplate || applyTaxModeToTerms(DEFAULT_TERMS, version.taxRate > 0)).replace(/(\d+\.)\s/g, "$1 "),
    settings,
  };

  const pdf = await renderQuotePdfBuffer(props);
  const uploaded = await uploadBufferToCloudinary(pdf, "application/pdf", CLOUDINARY_FOLDERS.quoteAttachments, "image");
  // PDF 以 image 型別上傳後，用轉檔參數取第 1 頁 JPG
  const derived = uploaded.url.replace("/upload/", "/upload/pg_1,f_jpg,w_1400,q_auto/").replace(/\.pdf$/i, ".jpg");
  const derivedUrl = derived.endsWith(".jpg") ? derived : `${derived}.jpg`;
  // Notion 的圖片代理抓「即時轉檔網址」常在第一次轉檔時逾時並快取失敗（S962 事件）。
  // 自己先抓下衍生圖，再以靜態圖檔重新上傳（notion-quotes，與編輯器同資料夾），交給 Notion 的是純靜態資產。
  const res = await fetch(derivedUrl);
  if (!res.ok) throw new Error(`報價圖轉檔失敗（${res.status}）`);
  const jpgBuffer = Buffer.from(await res.arrayBuffer());
  const staticUpload = await uploadBufferToCloudinary(jpgBuffer, "image/jpeg", "notion-quotes");
  return staticUpload.url;
}
