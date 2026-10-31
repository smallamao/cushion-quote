import { NextResponse } from "next/server";

import { resolveIssuingUpdate, type ResolveIssuingRequest } from "@/lib/einvoice-issue";
import { getSheetsClient } from "@/lib/sheets-client";
import { SHEETS_NO_RETRY } from "@/lib/sheets-retry";

import { getSession } from "../../_auth";
import { appendEInvoiceEvent, updateEInvoiceRecord } from "../../_shared";

/**
 * 開立結果不明的發票（卡在開立中超過 5 分鐘，或 Giveme 回應不明）由人工到 giveme 後台查證後處理：
 * - mark_issued：giveme 有開出 → 填發票號碼，改為已開立（之後可按同步）
 * - mark_failed：確認 giveme 沒開出 → 改為失敗（之後才能重開）
 */
class ResolveRejectedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function parseRequest(body: unknown): ResolveIssuingRequest | null {
  if (!body || typeof body !== "object") return null;
  const { action, providerInvoiceNo } = body as { action?: unknown; providerInvoiceNo?: unknown };
  if (action === "mark_issued") return { action, providerInvoiceNo: typeof providerInvoiceNo === "string" ? providerInvoiceNo : "" };
  if (action === "mark_failed") return { action };
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const session = await getSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const resolveRequest = parseRequest(await request.json().catch(() => null));
  if (!resolveRequest) return NextResponse.json({ ok: false, error: "action 必須是 mark_issued 或 mark_failed" }, { status: 400 });

  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });

  try {
    let fromStatus = "";
    // 檢查與寫入在同一次讀取內完成，避免依據過期的狀態判斷
    const next = await updateEInvoiceRecord(client, invoiceId, (record) => {
      const result = resolveIssuingUpdate(record, resolveRequest);
      if (!result.ok) throw new ResolveRejectedError(result.error, result.reason === "status" ? 409 : 400);
      fromStatus = record.status;
      return result.record;
    });
    if (!next) return NextResponse.json({ ok: false, error: "invoice not found" }, { status: 404 });

    try {
      await appendEInvoiceEvent(client, {
        invoiceId,
        eventType: next.status === "issued" ? "review_confirmed" : "issue_failed",
        fromStatus,
        toStatus: next.status,
        message: next.status === "issued"
          ? `人工確認 giveme 已開立 ${next.providerInvoiceNo}`
          : "人工確認 giveme 沒有開出，改為失敗",
        requestJson: JSON.stringify(resolveRequest),
        responseJson: "",
        actor: session.displayName,
      }, SHEETS_NO_RETRY);
    } catch (err) {
      console.error("[einvoice resolve-issuing] 事件寫入失敗", invoiceId, err instanceof Error ? err.message : err);
    }

    return NextResponse.json({ ok: true, invoice: next });
  } catch (err) {
    if (err instanceof ResolveRejectedError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
