import { NextResponse } from "next/server";

import { getSigningLinkByToken } from "@/lib/signing-links-sheet";

// 已簽合約 PDF 下載代理：Cloudinary raw 檔無副檔名，這裡補上 application/pdf
// 與正確檔名，讓客戶下載後能直接以 PDF 開啟（不依賴 Cloudinary 的 PDF 遞送設定）。
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await getSigningLinkByToken(token);
  if (!link || link.status !== "signed" || !link.signedPdfUrl) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const res = await fetch(link.signedPdfUrl);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 502 });
  }
  const buf = await res.arrayBuffer();
  const fileName = `signed_${link.quoteId}.pdf`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
