import "server-only";

import { AR_RANGE_DATA, arRowToRecord } from "@/lib/ar-utils";
import { findArForOrder, summarizePayment } from "@/lib/ar-summary";
import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";
import { getSheetsClient } from "@/lib/sheets-client";

/**
 * 查某位客戶／某張訂單還差多少尾款。
 *
 * 老闆 2026-11-14：客戶自取帶現金到現場問尾款剩多少，手機上要開三個畫面、搜尋兩次。
 * 畫面已經補上顯示，這支是讓他用問的——走到櫃台的路上就問得到。
 *
 * 🔴 合併請款的未收金額屬於整批，不是單張訂單的尾款。這支會明講，不要讓人照著
 *    那個數字跟客人收錢。
 */

export async function queryReceivables(args: { query?: string }): Promise<string> {
  const client = await getSheetsClient();
  if (!client) return "❌ Google Sheets 未設定。";

  const q = (args.query ?? "").trim().toLowerCase();
  if (!q) return "請告訴我要查誰的尾款：客戶名、工單編號（S1119）或案件編號都可以。";

  const res = await client.sheets.spreadsheets.values.batchGet({
    spreadsheetId: client.spreadsheetId,
    ranges: [ORDER_RANGE_DATA, AR_RANGE_DATA],
  });
  const [orderRows, arRows] = (res.data.valueRanges ?? []).map((v) => (v.values ?? []) as string[][]);

  // 用共用 mapper，不要自己數欄位——應收帳款的欄位是往後加的
  const ars = (arRows ?? []).filter((r) => r[0]).map(arRowToRecord);
  const orders = (orderRows ?? [])
    .filter((r) => r[0])
    .map(orderRowToRecord)
    .filter((o) => !o.isArchived);

  const matched = orders.filter(
    (o) =>
      (o.orderNumber ?? "").toLowerCase().includes(q) ||
      o.orderId.toLowerCase().includes(q) ||
      (o.clientName ?? "").toLowerCase().includes(q) ||
      (o.caseId ?? "").toLowerCase().includes(q),
  );

  if (matched.length === 0) {
    // 訂單對不到，再試著直接從應收帳款的客戶名找（有些應收沒有對應的訂製訂單）
    const arOnly = ars.filter(
      (a) => a.arStatus !== "cancelled" && (a.clientNameSnapshot ?? "").toLowerCase().includes(q),
    );
    if (arOnly.length === 0) return `查不到符合「${args.query}」的訂單或應收帳款。`;
    const lines = arOnly.slice(0, 20).map((a) => {
      const pay = summarizePayment(a);
      return `${a.clientNameSnapshot || "(無名)"}　${a.arId}　應收 $${a.totalAmount.toLocaleString()}　${pay.label}`;
    });
    return `查不到對應的訂製訂單，但應收帳款裡有 ${arOnly.length} 筆：\n${lines.join("\n")}`;
  }

  const lines = matched.slice(0, 20).map((o) => {
    const resolved = findArForOrder(o, ars);
    const pay = summarizePayment(resolved?.ar, resolved?.merged);
    const head = `${o.orderNumber || o.orderId}　${o.clientName || "(未填客戶)"}　${o.orderTitle || ""}`.trimEnd();
    if (pay.tone === "none") return `${head}\n  未建應收帳款，查不到收款紀錄`;
    if (pay.tone === "merged") {
      return `${head}\n  ⚠️ 合併請款（${resolved?.ar.arId}）：整批應收 $${pay.total.toLocaleString()}、已收 $${pay.received.toLocaleString()}、未收 $${Math.round(pay.outstanding).toLocaleString()}。這個未收金額含其他訂單，不是這張的尾款，要看應收明細。`;
    }
    if (pay.tone === "paid") {
      return `${head}\n  已收清（應收 $${pay.total.toLocaleString()}）`;
    }
    return `${head}\n  應收 $${pay.total.toLocaleString()}　已收 $${pay.received.toLocaleString()}　尾款 $${Math.round(pay.outstanding).toLocaleString()}`;
  });

  const more = matched.length > 20 ? `（共 ${matched.length} 張，只列前 20 張）` : "";
  return `符合「${args.query}」的訂單 ${matched.length} 張${more}：\n\n${lines.join("\n\n")}`;
}
