import { v2 as cloudinary } from "cloudinary";
import { NextResponse, after } from "next/server";

import { findCompanyIdentityForCase } from "@/lib/company-lookup";
import { loadSystemSettings } from "@/lib/settings-sheet";
import { getSheetsClient } from "@/lib/sheets-client";
import { bakeSignedPdf } from "@/lib/signing-pdf";
import { getSigningLinkByToken, updateSigningLink } from "@/lib/signing-links-sheet";
import { appendNotification } from "@/lib/notifications-sheet";
import { createOrder } from "@/lib/order-create";
import { isSigningLinkExpired, type PublicSigningView } from "@/lib/signing-types";
import type { QuoteVersionRecord } from "@/lib/types";

import {
  getVersionRows,
  isoNow,
  versionRecordToRow,
  versionRowToRecord,
} from "@/app/api/sheets/_v2-utils";
import { syncVersionToParents } from "@/app/api/sheets/_version-sync-utils";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function formatTaipei(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} (UTC+8)`;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "";
  return request.headers.get("x-real-ip") ?? "";
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await getSigningLinkByToken(token);
  if (!link) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const status =
    link.status === "pending" && isSigningLinkExpired(link, Date.now()) ? "expired" : link.status;

  let clientName = "";
  let contactName = "";
  let total = 0;
  let contactPhone = "";
  let contactAddress = "";
  let subtotal = 0;
  let taxRate = 0;
  let taxId = "";
  let invoiceTitle = "";
  const client = await getSheetsClient();
  if (client) {
    try {
      const version = (await getVersionRows(client))
        .map(versionRowToRecord)
        .find((v) => v.versionId === link.versionId);
      if (version) {
        clientName = version.clientNameSnapshot;
        // 姓名預填讀「聯絡人」快照（散客的公司名 clientNameSnapshot 為空，
        // 報價單上顯示與訂貨人姓名都是 contactNameSnapshot）。
        contactName = version.contactNameSnapshot;
        total = version.totalAmount;
        contactPhone = version.clientPhoneSnapshot;
        contactAddress = version.projectAddressSnapshot;
        // 未稅小計與稅率：供客戶端計算勾選開發票時的 5% 加稅（未稅→含稅）
        subtotal = version.subtotalBeforeTax;
        taxRate = version.taxRate;
        // 長期配合的 B2B 客戶不該每次簽核都重打統編——主檔有就帶進來。
        // 散客查不到（公司名稱是空的），維持原本自行輸入的流程。
        const identity = await findCompanyIdentityForCase(
          client,
          version.caseId,
          version.clientNameSnapshot,
        );
        if (identity?.taxId) {
          taxId = identity.taxId;
          invoiceTitle = identity.companyName || version.clientNameSnapshot;
        }
      }
    } catch {
      /* display-only, tolerate */
    }
  }

  // 常見問題文案存在系統設定，讓老闆自己改；讀不到就當作沒有，不影響簽署流程。
  let faq = "";
  try {
    faq = (await loadSystemSettings()).settings.signFaq ?? "";
  } catch {
    /* display-only, tolerate */
  }

  const view: PublicSigningView = {
    status,
    unsignedPdfUrl: link.unsignedPdfUrl,
    unsignedImageUrl: link.unsignedImageUrl,
    quoteId: link.quoteId,
    clientName,
    contactName,
    total,
    expiresAt: link.expiresAt,
    signedPdfUrl: link.signedPdfUrl,
    contactPhone,
    contactAddress,
    subtotal,
    taxRate,
    taxId,
    invoiceTitle,
    faq,
  };
  return NextResponse.json({ ok: true, view });
}

interface SignBody {
  signatureDataUrl: string;
  signerName: string;
  /** 訂貨人資訊（簽署人＝訂貨人）；電話、地址為必填 */
  ordererPhone?: string;
  ordererAddress?: string;
  /** 是否開立統一發票：勾選時未稅報價會另加 5% 營業稅並轉為含稅 */
  issueInvoice?: boolean;
  /** 開發票時必填：統一編號、發票抬頭 */
  taxId?: string;
  invoiceTitle?: string;
}

async function uploadSignedPdf(bytes: Uint8Array, quoteId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: "signed-contracts",
        // 不帶 .pdf 副檔名：Cloudinary 預設封鎖 .pdf raw 遞送（回 401）。
        // 下載改走本站 /download 代理，補上正確檔名與 application/pdf。
        public_id: `signed_${quoteId}_${Date.now()}`,
      },
      (err, result) => {
        if (err || !result) reject(err ?? new Error("上傳失敗"));
        else resolve(result.secure_url);
      },
    );
    stream.end(Buffer.from(bytes));
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await request.json()) as SignBody;

  const link = await getSigningLinkByToken(token);
  if (!link) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (link.status !== "pending") {
    return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
  }
  if (isSigningLinkExpired(link, Date.now())) {
    return NextResponse.json({ ok: false, error: "expired" }, { status: 409 });
  }
  if (!body?.signatureDataUrl?.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }
  // 訂貨人資訊：姓名（＝簽署人）、電話、地址皆必填（前端已擋，後端再驗一次）
  const signerName = (body.signerName ?? "").trim();
  const ordererPhone = (body.ordererPhone ?? "").trim();
  const ordererAddress = (body.ordererAddress ?? "").trim();
  if (!signerName || !ordererPhone || !ordererAddress) {
    return NextResponse.json({ ok: false, error: "missing_orderer_info" }, { status: 400 });
  }
  // 開立統一發票：勾選時統編與抬頭皆必填（前端已擋，後端再驗一次）
  const issueInvoice = body.issueInvoice === true;
  const taxId = (body.taxId ?? "").trim();
  const invoiceTitle = (body.invoiceTitle ?? "").trim();
  if (issueInvoice && (!taxId || !invoiceTitle)) {
    return NextResponse.json({ ok: false, error: "missing_invoice_info" }, { status: 400 });
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return NextResponse.json({ ok: false, error: "Cloudinary 未設定" }, { status: 503 });
  }
  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });

  try {
    const pdfRes = await fetch(link.unsignedPdfUrl);
    if (!pdfRes.ok) throw new Error("待簽 PDF 讀取失敗");
    const unsignedPdf = new Uint8Array(await pdfRes.arrayBuffer());

    const nowIso = isoNow();
    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent") ?? "";
    const signedAtDisplay = formatTaipei(nowIso);

    const signedPdf = await bakeSignedPdf(unsignedPdf, {
      signatureDataUrl: body.signatureDataUrl,
      signerName,
      signedAtDisplay,
      ip,
      userAgent,
      token: link.token,
      quoteId: link.quoteId,
    });

    const signedPdfUrl = await uploadSignedPdf(signedPdf, link.quoteId);

    // 寫回版本：勾已回簽、加入合約 URL、鎖定（已接受），並連動報價/案件/應收
    const rows = await getVersionRows(client);
    const rowIndex = rows.findIndex((r) => r[0] === link.versionId);
    if (rowIndex === -1) throw new Error("version not found");
    const existing = versionRowToRecord(rows[rowIndex] ?? []);

    // 開立統一發票：只對「未稅」報價（taxRate 0/falsy 且 taxAmount 0）另加 5% 營業稅，
    // 避免對已含稅報價重複課稅（double-tax）。加稅只動 taxRate/taxAmount/totalAmount，
    // subtotalBeforeTax（未稅）維持不變，故毛利不受影響（稅為代收代付）。含稅後的
    // totalAmount 由下方既有的 syncVersionToParents 自動連動到應收/訂單/發票。
    const isCurrentlyUntaxed = !existing.taxRate && !existing.taxAmount;
    const addTax = issueInvoice && isCurrentlyUntaxed;
    const addedTaxAmount = addTax ? Math.round(existing.subtotalBeforeTax * 0.05) : 0;
    const taxFields: Partial<Pick<QuoteVersionRecord, "taxRate" | "taxAmount" | "totalAmount">> =
      addTax
        ? {
            taxRate: 5,
            taxAmount: addedTaxAmount,
            totalAmount: existing.subtotalBeforeTax + addedTaxAmount,
          }
        : {};

    // 統編／抬頭無對應 schema 欄位，發票為人工開立，故僅存進 signedNotes 作存證與開票依據。
    const invoiceNote = issueInvoice
      ? addTax
        ? `｜開立統一發票：統編 ${taxId}、抬頭 ${invoiceTitle}（未稅 ${existing.subtotalBeforeTax} ＋5%稅 ${addedTaxAmount} ＝含稅 ${existing.subtotalBeforeTax + addedTaxAmount}）`
        : `｜開立統一發票：統編 ${taxId}、抬頭 ${invoiceTitle}`
      : "";
    const noteLine = `[線上簽署] ${signerName || "客戶"} 於 ${signedAtDisplay} 簽署（電話 ${ordererPhone}，地址 ${ordererAddress}，IP ${ip || "—"}，驗證碼 ${link.token}）${invoiceNote}`;
    // 保留原聯絡人開頭的散客編號（S/P/L### 等），避免被客戶簽核填的姓名整個洗掉，
    // 導致報價紀錄找不到 S 編號（老闆 2026-09 回報：S997、S970 簽核後編號消失）。
    const idPrefix = (existing.contactNameSnapshot ?? "").match(/^([A-Za-z]{1,2}\d{3,})\b/)?.[1] ?? "";
    const mergedContactName =
      idPrefix && !signerName.toUpperCase().startsWith(idPrefix.toUpperCase())
        ? `${idPrefix} ${signerName}`
        : signerName;
    const updated: QuoteVersionRecord = {
      ...existing,
      versionStatus: "accepted",
      ...taxFields,
      // 訂貨人資訊：客人簽署時填寫，寫回報價版本聯絡人/電話/地址快照，
      // 供之後從此報價開訂製訂單時自動帶入（開單邏輯優先讀這三欄）。
      // 聯絡人保留原本 S 編號前綴 + 客戶簽的姓名，不整個覆蓋。
      contactNameSnapshot: mergedContactName,
      clientPhoneSnapshot: ordererPhone,
      projectAddressSnapshot: ordererAddress,
      signedBack: true,
      signedBackDate: nowIso.slice(0, 10),
      signedContractUrls: [...(existing.signedContractUrls ?? []), signedPdfUrl],
      signedNotes: existing.signedNotes ? `${existing.signedNotes}\n${noteLine}` : noteLine,
      updatedAt: nowIso,
    };
    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價版本!A${sheetRow}:AW${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [versionRecordToRow(updated)] },
    });
    await syncVersionToParents(client, updated);

    await updateSigningLink(link.token, {
      status: "signed",
      signedAt: nowIso,
      signerName,
      signerIp: ip,
      signerUserAgent: userAgent,
      signedPdfUrl,
    });

    // 簽署完成即自動建立訂製訂單。客人一簽完就會匯訂金，訂單若沒開就不會進排程、
    // 不會叫料，等於「收了錢卻沒人在做」（老闆 2026-09-29 指定要堵的洞）。
    //
    // 放在 after()：簽署本身已經要產 PDF、上傳 Cloudinary、寫多張表，再串上建單的
    // 數次 Sheets 讀取有機會撞到 Vercel 函式逾時，而逾時會讓「客人簽不成」——
    // 那比晚幾秒開單嚴重得多。改成回應送出後才跑，客人端速度完全不受影響。
    // createOrder 內建同版本去重，與報價列表的手動開單按鈕不會重複建單。
    const signedAmountText = `NT$ ${(updated.totalAmount ?? 0).toLocaleString()}`;
    after(async () => {
      let autoOrderId = "";
      try {
        const created = await createOrder(client, {
          sourceType: "quote",
          versionId: link.versionId,
        });
        autoOrderId = created.orderId;
      } catch {
        autoOrderId = "";
      }
      try {
        await appendNotification({
          type: "quote_signed",
          title: autoOrderId ? "報價單已簽署，訂單已自動建立" : "報價單已簽署（訂單未建立）",
          body: autoOrderId
            ? `${signerName || "客戶"} 已簽署 ${link.quoteId}（${signedAmountText}），已自動開立訂單 ${autoOrderId}，請補上交期與排程`
            : `${signerName || "客戶"} 已簽署 ${link.quoteId}（${signedAmountText}）。自動開單未成功，請到報價紀錄手動建立訂製訂單`,
          link: autoOrderId ? `/orders/${autoOrderId}` : "/quotes",
        });
      } catch {
        // 通知失敗不影響已完成的簽署與開單
      }
    });

    return NextResponse.json({ ok: true, signedPdfUrl });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
