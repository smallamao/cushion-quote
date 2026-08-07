import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

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
  const client = await getSheetsClient();
  if (client) {
    try {
      const version = (await getVersionRows(client))
        .map(versionRowToRecord)
        .find((v) => v.versionId === link.versionId);
      if (version) {
        clientName = version.clientNameSnapshot;
        total = version.totalAmount;
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
  };
  return NextResponse.json({ ok: true, view });
}

interface SignBody {
  signatureDataUrl: string;
  signerName: string;
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
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return NextResponse.json({ ok: false, error: "Cloudinary 未設定" }, { status: 503 });
  }
  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });

  try {
    const signaturePng = new Uint8Array(Buffer.from(body.signatureDataUrl.split(",")[1] ?? "", "base64"));

    const pdfRes = await fetch(link.unsignedPdfUrl);
    if (!pdfRes.ok) throw new Error("待簽 PDF 讀取失敗");
    const unsignedPdf = new Uint8Array(await pdfRes.arrayBuffer());

    const nowIso = isoNow();
    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent") ?? "";
    const signedAtDisplay = formatTaipei(nowIso);
    const signerName = (body.signerName ?? "").trim();

    const signedPdf = await bakeSignedPdf(unsignedPdf, signaturePng, {
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
    const noteLine = `[線上簽署] ${signerName || "客戶"} 於 ${signedAtDisplay} 簽署（IP ${ip || "—"}，驗證碼 ${link.token}）`;
    const updated: QuoteVersionRecord = {
      ...existing,
      versionStatus: "accepted",
      signedBack: true,
      signedBackDate: nowIso.slice(0, 10),
      signedContractUrls: [...(existing.signedContractUrls ?? []), signedPdfUrl],
      signedNotes: existing.signedNotes ? `${existing.signedNotes}\n${noteLine}` : noteLine,
      updatedAt: nowIso,
    };
    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價版本!A${sheetRow}:AU${sheetRow}`,
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
      body: `${signerName || "客戶"} 已簽署 ${link.quoteId}（NT$ ${(existing.totalAmount ?? 0).toLocaleString()}）`,
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
