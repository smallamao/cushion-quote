import { NextResponse } from "next/server";

import { queryInvoice } from "@/lib/giveme-client";
import { isoNow } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";
import type { EInvoiceRecord } from "@/lib/types";

import { getSession } from "../_auth";
import { appendEInvoiceEvent, getEInvoiceRecords, updateEInvoiceRecord } from "../_shared";

// Process in batches to avoid hammering giveme
async function runConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });

  try {
    const records = await getEInvoiceRecords(client);
    const targets = records.filter(
      (r) =>
        r.providerInvoiceNo &&
        (r.status === "issued" ||
          r.status === "cancelled" ||
          r.status === "failed" ||
          r.status === "issuing"),
    );

    const cancelledRecords: EInvoiceRecord[] = [];
    const skipped: Array<{ invoiceId: string; reason: string }> = [];

    await runConcurrent(targets, 5, async (record) => {
      try {
        const result = await queryInvoice(record.providerInvoiceNo);
        if (!result.success) {
          skipped.push({ invoiceId: record.invoiceId, reason: `giveme 查詢失敗：${result.msg}` });
          return;
        }
        if (result.status !== "1") {
          // 孤兒恢復：giveme 顯示有效，但本地記錄為 failed/issuing → 標回 issued
          if (record.status === "failed" || record.status === "issuing") {
            const recovered = await updateEInvoiceRecord(client, record.invoiceId, (rec) => ({
              ...rec,
              status: "issued",
              errorMessage: "",
              updatedAt: isoNow(),
            }));
            if (recovered) {
              await appendEInvoiceEvent(client, {
                invoiceId: record.invoiceId,
                eventType: "orphan_recovered",
                fromStatus: record.status,
                toStatus: "issued",
                message: `孤兒記錄恢復：giveme 顯示發票有效（${record.providerInvoiceNo}）`,
                requestJson: "",
                responseJson: JSON.stringify(result),
                actor: session.displayName,
              });
              cancelledRecords.push(recovered);
            } else {
              skipped.push({ invoiceId: record.invoiceId, reason: "孤兒記錄恢復失敗：Sheets 未更新" });
            }
            return;
          }
          skipped.push({ invoiceId: record.invoiceId, reason: `giveme 狀態非作廢（status=${result.status ?? "未知"}）` });
          return;
        }

        const next = await updateEInvoiceRecord(client, record.invoiceId, (rec) => ({
          ...rec,
          status: "cancelled",
          cancelledAt: result.delTime ?? isoNow(),
          cancelReason: result.delRemark ?? "giveme 平台作廢",
          updatedAt: isoNow(),
        }));
        if (!next) {
          skipped.push({ invoiceId: record.invoiceId, reason: "Sheets 找不到該發票列（row 未更新）" });
          return;
        }
        await appendEInvoiceEvent(client, {
          invoiceId: record.invoiceId,
          eventType: "sync_succeeded",
          fromStatus: record.status,
          toStatus: "cancelled",
          message: `批次同步偵測到已在 giveme 作廢：${result.delRemark ?? ""}`,
          requestJson: JSON.stringify({ code: record.providerInvoiceNo }),
          responseJson: JSON.stringify({
            success: result.success,
            status: result.status,
            delRemark: result.delRemark ?? "",
            delTime: result.delTime ?? "",
          }),
          actor: session.displayName,
        });
        cancelledRecords.push(next);
      } catch (err) {
        skipped.push({ invoiceId: record.invoiceId, reason: `例外：${err instanceof Error ? err.message : String(err)}` });
      }
    });

    return NextResponse.json({
      ok: true,
      checked: targets.length,
      cancelled: cancelledRecords.length,
      skipped: skipped.length,
      cancelledRecords,
      skippedDetails: skipped,
      message: `同步完成：檢查 ${targets.length} 筆，發現 ${cancelledRecords.length} 筆已在 giveme 作廢`,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "批次同步失敗" }, { status: 500 });
  }
}
