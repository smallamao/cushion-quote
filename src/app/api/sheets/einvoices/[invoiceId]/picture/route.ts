import { NextResponse } from "next/server";

import { getInvoicePicture, queryInvoice } from "@/lib/giveme-client";
import { isoNow } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../../_auth";
import { appendEInvoiceEvent, getEInvoiceRecordById, updateEInvoiceRecord } from "../../_shared";

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
  const requestedType = (rawType === "2" ? 2 : rawType === "3" ? 3 : 1) as 1 | 2 | 3;
  const codeHint = searchParams.get("code")?.trim() ?? "";

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) return NextResponse.json({ error: "Google Sheets 未設定" }, { status: 503 });

  const record = await getEInvoiceRecordById(sheetsClient, invoiceId);
  if (!record) return NextResponse.json({ error: "invoice not found" }, { status: 404 });

  // Use record's providerInvoiceNo; fall back to URL hint only if record doesn't have one yet
  const invoiceNo = record.providerInvoiceNo || codeHint;
  if (!invoiceNo) return NextResponse.json({ error: "尚未取得發票號碼" }, { status: 400 });

  // Re-derive B2B from record fields + requestPayloadJson fallback.
  // Stubs from reconcile may have buyerType="b2c" and empty buyerTaxId even for B2B invoices.
  const resolvedRecord = record;
  function resolveType(): 1 | 2 | 3 {
    if (requestedType === 3) return 3;
    if (resolvedRecord.buyerType === "b2b" || resolvedRecord.buyerTaxId?.trim()) return 2;
    try {
      const payload = JSON.parse(resolvedRecord.requestPayloadJson || "{}") as Record<string, unknown>;
      if ((typeof payload.buyerTaxId === "string" && payload.buyerTaxId.trim()) ||
          (typeof payload.buyerType === "string" && payload.buyerType === "b2b")) return 2;
    } catch { /* ignore */ }
    return requestedType;
  }
  const type = resolveType();

  // Run status check and picture fetch in parallel — no serial latency penalty
  const [queryResult, pictureResult] = await Promise.allSettled([
    queryInvoice(invoiceNo),
    getInvoicePicture(invoiceNo, type),
  ]);

  // giveme status "1" = 作廢
  if (queryResult.status === "fulfilled" && queryResult.value.success && queryResult.value.status === "1") {
    await updateEInvoiceRecord(sheetsClient, invoiceId, (rec) => ({
      ...rec,
      status: "cancelled",
      cancelledAt: queryResult.value.delTime ?? isoNow(),
      cancelReason: queryResult.value.delRemark ?? "giveme 平台作廢",
      updatedAt: isoNow(),
    }));
    await appendEInvoiceEvent(sheetsClient, {
      invoiceId,
      eventType: "sync_succeeded",
      fromStatus: record.status,
      toStatus: "cancelled",
      message: `下載時偵測到已在 giveme 作廢：${queryResult.value.delRemark ?? ""}`,
      requestJson: JSON.stringify({ code: invoiceNo }),
      responseJson: JSON.stringify({
        success: queryResult.value.success,
        status: queryResult.value.status,
        delRemark: queryResult.value.delRemark ?? "",
        delTime: queryResult.value.delTime ?? "",
      }),
      actor: session.displayName,
    });
    return NextResponse.json({
      error: "此發票已在 giveme 平台作廢",
      cancelled: true,
      delRemark: queryResult.value.delRemark ?? "",
      delTime: queryResult.value.delTime ?? "",
    }, { status: 410 });
  }

  if (pictureResult.status === "fulfilled") {
    const { contentType, buffer } = pictureResult.value;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="invoice-${invoiceNo}.png"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  const message = pictureResult.reason instanceof Error ? pictureResult.reason.message : "下載失敗";
  return NextResponse.json({ error: message }, { status: 502 });
}
