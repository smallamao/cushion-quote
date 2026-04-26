import JSZip from "jszip";
import { NextResponse } from "next/server";

import { getInvoicePicture } from "@/lib/giveme-client";
import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../_auth";
import { getEInvoiceRecordById } from "../_shared";

export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { invoiceIds?: string[] };
  const invoiceIds = body.invoiceIds;
  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
    return NextResponse.json({ error: "invoiceIds 不可為空" }, { status: 400 });
  }

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) return NextResponse.json({ error: "Google Sheets 未設定" }, { status: 503 });

  const zip = new JSZip();
  let addedCount = 0;

  await Promise.all(
    invoiceIds.map(async (invoiceId) => {
      try {
        const record = await getEInvoiceRecordById(sheetsClient, invoiceId);
        if (!record?.providerInvoiceNo) return;

        const type: 1 | 2 | 3 = record.buyerType === "b2b" || Boolean(record.buyerTaxId?.trim()) ? 2 : 1;
        const { buffer } = await getInvoicePicture(record.providerInvoiceNo, type);

        const safeNo = record.providerInvoiceNo.replace(/[/\\?%*:|"<>]/g, "-");
        const safeName = (record.buyerName ?? "").replace(/[/\\?%*:|"<>（）]/g, "").trim();
        zip.file(`${safeNo} ${safeName}.png`, new Uint8Array(buffer));
        addedCount++;
      } catch {
        // Skip invoices that fail — partial zip is still returned
      }
    }),
  );

  if (addedCount === 0) {
    return NextResponse.json({ error: "所有發票圖片下載失敗" }, { status: 502 });
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
  const today = new Date().toISOString().slice(0, 10);
  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="invoices-${today}.zip"`,
    },
  });
}
