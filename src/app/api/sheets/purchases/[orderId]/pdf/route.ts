import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { loadSystemSettings } from "@/lib/settings-sheet";
import { renderPurchaseOrderPdfBuffer } from "@/lib/purchase-order-pdf-server";

import { authorizeSchedulerRequest } from "../../_catalog";
import { rowToOrder, rowToItem } from "../../_order-parsers";

// react-pdf renderToBuffer + 字型檔讀取需要 Node runtime（非 Edge）。
export const runtime = "nodejs";
export const maxDuration = 60;

const ORDER_SHEET = "採購單";
const ITEM_SHEET = "採購單明細";
const ORDER_RANGE_DATA = `${ORDER_SHEET}!A2:Q`;
const ITEM_RANGE_DATA = `${ITEM_SHEET}!A2:J`;

type RouteContext = { params: Promise<{ orderId: string }> };

/** 檔名安全化：移除路徑分隔符與控制字元，避免 Content-Disposition 出錯。 */
function safeFilePart(s: string): string {
  return (s || "").replace(/[\\/:*?"<>|\r\n]+/g, "").trim();
}

/**
 * GET /api/sheets/purchases/[orderId]/pdf
 * 伺服器端把「現有採購單」渲染成 PDF 直接下載（Content-Type: application/pdf）。
 *
 * 為什麼要這支：採購單原本只在瀏覽器端（PDFPreviewModal + @react-pdf/renderer）
 * 產生，沒有可直接抓檔的伺服器路徑——想把單子傳給廠商時，手機或後端都拿不到檔案。
 * 這支讓「下載 / 轉傳採購單」變成一個 URL，桌機、手機、伺服器一致。
 */
export async function GET(_request: Request, context: RouteContext) {
  // 排程系統（server-to-server）用 x-api-key 取回已建好的採購單 PDF。
  // middleware 只確認「有帶 header」就放行，真正的 timing-safe 比對在這裡做——
  // 沒有這段就等於任何帶任意 header 的人都能讀全部採購單。
  // 瀏覽器（已登入、帶 cookie、不帶 x-api-key）維持原本行為，不受影響。
  if (_request.headers.get("x-api-key")) {
    const denied = authorizeSchedulerRequest(_request);
    if (denied) {
      return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });
    }
  }
  const { orderId } = await context.params;
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [orderRes, itemRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: ORDER_RANGE_DATA,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: ITEM_RANGE_DATA,
      }),
    ]);

    const order = (orderRes.data.values ?? [])
      .map(rowToOrder)
      .find((o) => o.orderId === orderId);
    if (!order) {
      return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
    }

    const items = (itemRes.data.values ?? [])
      .map(rowToItem)
      .filter((i) => i.orderId === orderId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const { settings } = await loadSystemSettings();
    const pdf = await renderPurchaseOrderPdfBuffer({ order, items, settings });

    const supplierPart = safeFilePart(order.supplierSnapshot?.shortName ?? "");
    const filename = `採購單_${safeFilePart(orderId)}${supplierPart ? `_${supplierPart}` : ""}.pdf`;
    // filename*（RFC 5987）帶 UTF-8 中文；filename= 給不支援的 client 一個 ASCII 後備。
    const asciiFallback = `purchase_${safeFilePart(orderId)}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
