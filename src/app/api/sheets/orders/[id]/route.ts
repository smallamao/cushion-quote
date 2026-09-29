import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import {
  ORDER_RANGE_DATA,
  ORDER_RANGE_IDS,
  ORDER_ROW_RANGE,
  ORDER_SHEET,
  isoNow,
  orderRecordToRow,
  orderRowToRecord,
} from "@/lib/order-utils";
import { updateNotionPageIfExists } from "@/lib/notion-order";
import { appendNotification } from "@/lib/notifications-sheet";
import { getSignedQuoteAmount } from "@/lib/quote-signed-amount";
import type { CustomOrder } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/sheets/orders/[id]
export async function GET(_request: Request, context: RouteContext) {
  const { id: orderId } = await context.params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    // Step 1: find row index using IDs only (cheap)
    const idRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_IDS,
    });
    const idRows = (idRes.data.values ?? []) as string[][];
    const rowIndex = idRows.findIndex((r) => r[0] === orderId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
    }
    const sheetRow = rowIndex + 2;

    // Step 2: fetch single row
    const rowRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_ROW_RANGE(sheetRow),
    });
    const rowData = (rowRes.data.values ?? [])[0] as string[] | undefined;
    if (!rowData) {
      return NextResponse.json({ ok: false, error: "order row missing" }, { status: 404 });
    }
    const order = orderRowToRecord(rowData);
    // 一併回「客人簽署的金額」，讓訂單頁能在金額被改動時標示差額。
    // best-effort：查不到就不標，不影響訂單載入。
    let signedQuote = null;
    try {
      signedQuote = await getSignedQuoteAmount(client, order.versionId);
    } catch {
      signedQuote = null;
    }
    return NextResponse.json({ ok: true, order, signedQuote });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// PUT /api/sheets/orders/[id]
// Body: Partial<CustomOrder> — all fields except orderId, createdAt, createdBy
export async function PUT(request: Request, context: RouteContext) {
  const { id: orderId } = await context.params;
  const patch = (await request.json()) as Partial<CustomOrder>;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    // 一次讀完全部資料列，同時完成「找列」與「取既有值」——省掉一次 Sheets 往返，
    // 降低 Vercel 函式逾時（回空 body → 前端 JSON 解析失敗）的機率。
    const dataRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_DATA,
    });
    const dataRows = (dataRes.data.values ?? []) as string[][];
    const rowIndex = dataRows.findIndex((r) => r[0] === orderId);
    if (rowIndex === -1) {
      return NextResponse.json(
        { ok: false, error: "order not found" },
        { status: 404 },
      );
    }
    const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-indexed sheets
    const existing = orderRowToRecord(dataRows[rowIndex]);

    // Merge patch, preserving immutable fields
    const updated: CustomOrder = {
      ...existing,
      ...patch,
      // These fields must never be overwritten by the caller
      orderId: existing.orderId,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      updatedAt: isoNow(),
    };

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_ROW_RANGE(sheetRow),
      valueInputOption: "RAW",
      requestBody: { values: [orderRecordToRow(updated)] },
    });

    // 訂單金額被改成與「客人簽署金額」不同時主動通知。
    // 規格定案（選布、到府實量）後改價是常態，但差額不能默默吞掉——客人只同意過
    // 簽署當下那個金額，差額必須另外請客人確認（老闆 2026-09-29 指定要堵的洞）。
    // 只在本次真的改動金額時才發，避免每次存檔都洗通知。
    try {
      if (updated.versionId && updated.quotedAmount !== existing.quotedAmount) {
        const signed = await getSignedQuoteAmount(client, updated.versionId);
        if (
          signed?.signedBack &&
          signed.signedAmount > 0 &&
          updated.quotedAmount !== signed.signedAmount
        ) {
          const diff = updated.quotedAmount - signed.signedAmount;
          const arrow = diff > 0 ? "多" : "少";
          await appendNotification({
            type: "order_amount_mismatch",
            title: "訂單金額與客人簽署金額不符",
            body: `${updated.orderId}（${updated.clientName}）現在是 NT$ ${updated.quotedAmount.toLocaleString()}，客人簽的是 NT$ ${signed.signedAmount.toLocaleString()}，${arrow} NT$ ${Math.abs(diff).toLocaleString()}。差額請另外跟客人確認後再收款。`,
            link: `/orders/${updated.orderId}`,
          });
        }
      }
    } catch {
      // 通知失敗不影響存檔
    }

    // best-effort：Notion 已有此單頁面時同步更新屬性（含出貨日=installDate）；失敗不阻斷存檔、不建新頁
    let notionUpdated = false;
    try {
      notionUpdated = await updateNotionPageIfExists(updated);
    } catch {
      // Notion 同步失敗不影響主流程
    }

    return NextResponse.json({ ok: true, notionUpdated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// DELETE /api/sheets/orders/[id]
export async function DELETE(_request: Request, context: RouteContext) {
  const { id: orderId } = await context.params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Find row index
    const idRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_IDS,
    });
    const idRows = (idRes.data.values ?? []) as string[][];
    const rowIndex = idRows.findIndex((r) => r[0] === orderId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
    }
    const sheetRow = rowIndex + 2; // 1-indexed + header row

    // Get sheetId for the 訂製訂單 tab
    const meta = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
      fields: "sheets.properties",
    });
    const sheetId = meta.data.sheets?.find(
      (s) => s.properties?.title === ORDER_SHEET,
    )?.properties?.sheetId;
    if (sheetId == null) {
      return NextResponse.json({ ok: false, error: "sheet tab not found" }, { status: 500 });
    }

    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: { sheetId, dimension: "ROWS", startIndex: sheetRow - 1, endIndex: sheetRow },
            },
          },
        ],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
