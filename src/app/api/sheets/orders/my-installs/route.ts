import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";

// GET /api/sheets/orders/my-installs?assignee=<displayName>
//
// 給師傅看的「我的安裝」清單。刻意只回傳施工需要的欄位，
// 完全不含金額/成本（quotedAmount、materialCost… 都不回），
// 因此可以安全地列入 technician 白名單。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assignee = searchParams.get("assignee")?.trim() ?? "";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, installs: [], error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    const installs = rows
      .filter((r) => r[0])
      .map(orderRowToRecord)
      .filter(
        (o) =>
          o.installAssignedTo &&
          o.status !== "cancelled" &&
          !o.isArchived &&
          (!assignee || o.installAssignedTo === assignee),
      )
      .map((o) => ({
        // 安全投影：施工資訊 only，無任何金額欄位
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        clientName: o.clientName,
        orderTitle: o.orderTitle,
        itemCategory: o.itemCategory,
        deliveryMethod: o.deliveryMethod,
        status: o.status,
        installDate: o.installDate,
        extraInstallDates: o.extraInstallDates ?? [],
        shipDate: o.shipDate ?? "",
        installAssignedTo: o.installAssignedTo,
        installAddress: o.installAddress ?? "",
        installContactName: o.installContactName ?? "",
        installContactPhone: o.installContactPhone ?? "",
        materialName: o.materialName,
        materialCode: o.materialCode,
        materialImageUrl: o.materialImageUrl,
        workOrderPdfUrl: o.workOrderPdfUrl ?? "",
        items: o.items,
        notes: o.notes,
        internalNotes: o.internalNotes,
      }));

    return NextResponse.json({ ok: true, installs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, installs: [], error: message }, { status: 500 });
  }
}
