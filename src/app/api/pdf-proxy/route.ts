import { NextResponse } from "next/server";

// 後台用 PDF 下載代理：把 Cloudinary raw 檔（無副檔名）補上 application/pdf
// 與 .pdf 檔名再吐出，讓後台合約歸檔點開/下載即為可直接開啟的 PDF。
// 僅登入者可用（middleware 守 /api/*），且只允許本專案 Cloudinary 資源避免 SSRF。
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("u") ?? "";
  if (!/^https:\/\/res\.cloudinary\.com\/[\w-]+\//.test(url)) {
    return NextResponse.json({ ok: false, error: "invalid_url" }, { status: 400 });
  }

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 502 });
  }
  const buf = await res.arrayBuffer();
  const base = (url.split("/").pop() || "file").replace(/\.[a-z0-9]+$/i, "");
  const fileName = `${base}.pdf`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
