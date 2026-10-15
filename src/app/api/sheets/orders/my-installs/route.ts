import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getSheetsClient } from "@/lib/sheets-client";
import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";

// GET /api/sheets/orders/my-installs?assignee=<displayName>
//
// 給師傅看的「我的安裝」清單。刻意只回傳施工需要的欄位，
// 完全不含金額/成本（quotedAmount、materialCost… 都不回），
// 因此可以安全地列入 technician 白名單。
//
// 🔴 2026-10-15 修補：這支原本整支沒讀 session，而 assignee 是自由查詢參數，
//    過濾條件是 `!assignee || o.installAssignedTo === assignee`——不帶 assignee
//    就回傳**全部**訂單。任何一個師傅帳號（甚至只要 middleware 放行）都等於
//    整份客戶名冊的讀取權限：姓名、安裝地址、聯絡電話。
//    現在非 admin 一律用自己的 displayName 過濾，不接受前端指定。
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (guard.denied) return guard.denied;
  const { session } = guard;

  const { searchParams } = new URL(request.url);
  const isAdmin = session.role === "admin";
  // admin 可以看全部或指定某人；其他角色一律只能看自己的，參數無效
  const assignee = isAdmin ? (searchParams.get("assignee")?.trim() ?? "") : session.displayName.trim();
  // 非 admin 而拿不到自己的名字時回空清單。空字串會讓下面的過濾條件變成「全部」，
  // 那正是這次要堵的洞——寧可看不到自己的單，也不要看到全部人的單。
  if (!isAdmin && !assignee) {
    return NextResponse.json({ ok: true, installs: [] });
  }

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
