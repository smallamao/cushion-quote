import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api-auth";
import { getSheetsClient } from "@/lib/sheets-client";
import { ORDER_RANGE_DATA, orderRowToRecord, todayDateStr } from "@/lib/order-utils";
import { isVisibleOnProductionList, pickProductionOrderView } from "@/lib/production-orders";

// GET /api/sheets/production-orders
//
// 工廠師傅（craftsman）的「生產訂單」清單。只回製作中／待出貨，加上 7 天內完成的單，
// 每張單都經過 pickProductionOrderView 白名單投影——客戶姓名、地址電話、金額、
// 內部備註一律不出伺服器。只有 admin 與 craftsman 能叫（技師走自己的 my-installs）。
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (guard.denied) return guard.denied;
  const { role } = guard.session;
  if (role !== "admin" && role !== "craftsman") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, orders: [], error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    const today = todayDateStr();
    const orders = rows
      .filter((r) => r[0])
      .map(orderRowToRecord)
      .filter((o) => isVisibleOnProductionList(o, today))
      .map(pickProductionOrderView);

    return NextResponse.json({ ok: true, orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, orders: [], error: message }, { status: 500 });
  }
}
