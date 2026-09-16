import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

import { findCompanyIdentityForCase } from "@/lib/company-lookup";
import { getSheetsClient } from "@/lib/sheets-client";
import { bakeSignedPdf } from "@/lib/signing-pdf";
import { getSigningLinkByToken, updateSigningLink } from "@/lib/signing-links-sheet";
import { appendNotification } from "@/lib/notifications-sheet";
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

  const view: PublicSigningView = {
    status,
    unsignedPdfUrl: link.unsignedPdfUrl,
    unsignedImageUrl: link.unsignedImageUrl,
    quoteId: link.quoteId,
    clientName,
    total,
    expiresAt: link.expiresAt,
    signedPdfUrl: link.signedPdfUrl,
    contactPhone,
    contactAddress,
    subtotal,
    taxRate,
    taxId,
    invoiceTitle,
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
    const updated: QuoteVersionRecord = {
      ...existing,
      versionStatus: "accepted",
      ...taxFields,
      // 訂貨人資訊：客人簽署時填寫，寫回報價版本聯絡人/電話/地址快照，
      // 供之後從此報價開訂製訂單時自動帶入（開單邏輯優先讀這三欄）。
      contactNameSnapshot: signerName,
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

    // 後台通知鈴鐺（best-effort，不影響簽署結果）
    await appendNotification({
      type: "quote_signed",
      title: "報價單已線上簽署",
      body: `${signerName || "客戶"} 已簽署 ${link.quoteId}（NT$ ${(updated.totalAmount ?? 0).toLocaleString()}）`,
      link: "/quotes",
    });

    return NextResponse.json({ ok: true, signedPdfUrl });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
