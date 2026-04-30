import { NextResponse } from "next/server";

import { generateEInvoiceId } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";
import type { EInvoiceRecord, EInvoiceBuyerType, EInvoiceCarrierType } from "@/lib/types";

import { getSession } from "../_auth";
import { appendEInvoiceRecord, getEInvoiceRecords, getEInvoiceRows } from "../_shared";

interface EinvoceImportItem {
  sourceType: string;
  sourceId: string;
  sourceSubId?: string;
  buyerName: string;
  buyerUbn: string;
  email: string;
  taxType: string;
  untaxedAmount: number;
  taxAmount: number;
  totalAmount: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  content?: string;
}

interface BatchImportRequest {
  mode: "preview" | "commit";
  invoices: EinvoceImportItem[];
}

/**
 * 批次匯入電子發票
 * 從前端接收發票資料陣列，寫入電子發票紀錄表
 */
export async function POST(request: Request) {
  const session = getSession(request as unknown as Request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  let body: BatchImportRequest;
  try {
    body = (await request.json()) as BatchImportRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "請求格式錯誤" },
      { status: 400 }
    );
  }

  if (!body.invoices || !Array.isArray(body.invoices)) {
    return NextResponse.json(
      { ok: false, error: "請提供 invoices 陣列" },
      { status: 400 }
    );
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 }
    );
  }

  try {
    // Validate each invoice entry
    const validationErrors: string[] = [];
    body.invoices.forEach((invoice, index) => {
      const lineNo = index + 1;
      if (!invoice.sourceType) {
        validationErrors.push(`第 ${lineNo} 筆: 缺少來源類型`);
      }
      if (!invoice.sourceId) {
        validationErrors.push(`第 ${lineNo} 筆: 缺少來源ID`);
      }
      if (!invoice.buyerName) {
        validationErrors.push(`第 ${lineNo} 筆: 缺少買方名稱`);
      }
      if (!invoice.buyerUbn) {
        validationErrors.push(`第 ${lineNo} 筆: 缺少買方統編`);
      }
      if (!invoice.email) {
        validationErrors.push(`第 ${lineNo} 筆: 缺少 Email`);
      }
      if (!invoice.taxType) {
        validationErrors.push(`第 ${lineNo} 筆: 缺少稅別`);
      }
      if (invoice.untaxedAmount < 0) {
        validationErrors.push(`第 ${lineNo} 筆: 未稅金額不能為負數`);
      }
      if (invoice.taxAmount < 0) {
        validationErrors.push(`第 ${lineNo} 筆: 稅額不能為負數`);
      }
      if (invoice.totalAmount < 0) {
        validationErrors.push(`第 ${lineNo} 筆: 總金額不能為負數`);
      }
      if (!invoice.items || invoice.items.length === 0) {
        validationErrors.push(`第 ${lineNo} 筆: 至少需要一個品項`);
      } else {
        invoice.items.forEach((item, itemIdx) => {
          if (!item.name) {
            validationErrors.push(`第 ${lineNo} 筆 品項 ${itemIdx + 1}: 缺少品項名稱`);
          }
          if (item.quantity <= 0) {
            validationErrors.push(`第 ${lineNo} 筆 品項 ${itemIdx + 1}: 數量必須大於零`);
          }
          if (item.unitPrice < 0) {
            validationErrors.push(`第 ${lineNo} 筆 品項 ${itemIdx + 1}: 單價不能為負數`);
          }
        });
      }
    });

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { ok: false, error: "資料驗證失敗", details: validationErrors },
        { status: 400 }
      );
    }

    if (body.mode === "preview") {
      return NextResponse.json({
        ok: true,
        mode: "preview",
        count: body.invoices.length,
        invoices: body.invoices.map((inv, idx) => ({
          index: idx + 1,
          sourceType: inv.sourceType,
          sourceId: inv.sourceId,
          buyerName: inv.buyerName,
          buyerUbn: inv.buyerUbn,
          totalAmount: inv.totalAmount,
          taxType: inv.taxType,
          itemCount: inv.items.length,
        }))
      });
    }

    if (body.mode !== "commit") {
      return NextResponse.json(
        { ok: false, error: "mode 必須是 preview 或 commit" },
        { status: 400 }
      );
    }

    // 重複開票守衛
    const existingRecords = await getEInvoiceRecords(client);
    const existingKeys = new Set(
      existingRecords
        .filter((r) => ["draft", "issuing", "issued", "needs_review"].includes(r.status))
        .map((r) => `${r.sourceType}:${r.sourceId}`)
    );
    const dupes = body.invoices.filter((inv) => existingKeys.has(`${inv.sourceType}:${inv.sourceId}`));
    if (dupes.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `${dupes.length} 筆來源已有現存發票，請先確認`,
          duplicates: dupes.map((d) => `${d.sourceType}:${d.sourceId}`),
        },
        { status: 409 }
      );
    }

    // 實際寫入發票紀錄
    const createdRecords = [];
    const failedRecords = [];

    // Read rows once; update in-memory after each write to keep IDs sequential
    const existingRows = await getEInvoiceRows(client);

    for (const invoice of body.invoices) {
      try {
        // Generate collision-free sequential ID (same logic as single-create path)
        const invoiceId = generateEInvoiceId(existingRows);
        // Push a stub row so the next iteration sees this ID when generating the next one
        existingRows.push([invoiceId]);

        // 準備發票紀錄
        const record: EInvoiceRecord = {
          invoiceId,
          retryOfInvoiceId: "",
          sourceType: invoice.sourceType as EInvoiceRecord["sourceType"],
          sourceId: invoice.sourceId,
          sourceSubId: invoice.sourceSubId ?? "",
          quoteId: "",
          versionId: "",
          caseId: "",
          clientId: "",
          buyerType: (invoice.buyerUbn ? "b2b" : "b2c") as EInvoiceBuyerType,
          buyerName: invoice.buyerName,
          buyerTaxId: invoice.buyerUbn,
          buyerAddress: "",
          email: invoice.email,
          carrierType: "none" as EInvoiceCarrierType,
          carrierValue: "",
          donationCode: "",
          invoiceDate: new Date().toISOString().slice(0, 10),
          taxType: (invoice.taxType === "零稅率" ? 1 : invoice.taxType === "免稅" ? 2 : 0) as 0 | 1 | 2 | 4,
          untaxedAmount: invoice.untaxedAmount,
          taxAmount: invoice.taxAmount,
          totalAmount: invoice.totalAmount,
          taxRate: invoice.untaxedAmount > 0 ? Math.round((invoice.taxAmount / invoice.untaxedAmount) * 1000) / 10 : 0,
          itemCount: invoice.items.length,
          itemsJson: JSON.stringify(invoice.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice }))),
          content: invoice.content ?? "",
          status: "draft" as const,
          providerName: "",
          providerInvoiceNo: "",
          providerTrackNo: "",
          providerResponseJson: "",
          requestPayloadJson: "",
          errorCode: "",
          errorMessage: "",
          cancelledAt: "",
          cancelReason: "",
          createdBy: "batch-import",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          internalNote: "",
          overallRemark: "",
        };

        // 寫入電子發票紀錄表
        await appendEInvoiceRecord(client, record);
        createdRecords.push({ ...record, invoiceId });
      } catch (error) {
        failedRecords.push({
          invoice,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "commit",
      created: createdRecords.length,
      failed: failedRecords.length,
      createdRecords: createdRecords.slice(0, 5), // 只返回前5筆作為樣本
      failedRecords: failedRecords.slice(0, 5),   // 只返回前5筆失敗記錄作為樣本
      message: `成功匯入 ${createdRecords.length} 筆電子發票，失敗 ${failedRecords.length} 筆`
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json(
      { ok: false, error: `批次匯入失敗: ${message}` },
      { status: 500 }
    );
  }
}
