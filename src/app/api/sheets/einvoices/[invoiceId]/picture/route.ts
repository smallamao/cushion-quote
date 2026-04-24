import { NextResponse } from "next/server";

import { getInvoicePicture } from "@/lib/giveme-client";
import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../../_auth";
import { getEInvoiceRecordById } from "../../_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const rawType = searchParams.get("type") ?? "1";
  const type = (rawType === "2" ? 2 : rawType === "3" ? 3 : 1) as 1 | 2 | 3;
  const directCode = searchParams.get("code")?.trim() ?? "";

  // If providerInvoiceNo was passed directly in the URL, skip Sheets lookup
  let invoiceNo = directCode;
  if (!invoiceNo) {
    const client = await getSheetsClient();
    if (!client) return NextResponse.json({ error: "Google Sheets 未設定" }, { status: 503 });
    const record = await getEInvoiceRecordById(client, invoiceId);
    if (!record) return NextResponse.json({ error: "invoice not found" }, { status: 404 });
    if (!record.providerInvoiceNo) return NextResponse.json({ error: "尚未取得發票號碼" }, { status: 400 });
    invoiceNo = record.providerInvoiceNo;
  }

  try {
    const { contentType, buffer } = await getInvoicePicture(invoiceNo, type);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="invoice-${invoiceNo}.png"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "下載失敗";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
