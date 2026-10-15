import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseOrder } from "@/lib/types";

const PURCHASE_SHEET = "採購單";

/**
 * GET /api/sheets/cases/[caseId]/purchases
 *
 * Returns all purchase orders linked to this case and calculates total cost.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;


  const { caseId } = await params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 }
    );
  }

  try {
    // Fetch all purchase orders
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${PURCHASE_SHEET}!A2:Q`,
    });

    const rows = response.data.values ?? [];

    // Parse and filter by caseId (column mapping from purchases/route.ts rowToOrder)
    const orders: PurchaseOrder[] = rows
      .map((row: string[]) => {
        let supplierSnapshot: PurchaseOrder["supplierSnapshot"] = {
          name: "",
          shortName: "",
          contactPerson: "",
          phone: "",
          fax: "",
          email: "",
          taxId: "",
          address: "",
          paymentMethod: "",
          paymentTerms: "",
        };
        try {
          if (row[5]) {
            supplierSnapshot = { ...supplierSnapshot, ...JSON.parse(row[5]) };
          }
        } catch {
          /* ignore */
        }

        return {
          orderId: row[0] ?? "",
          orderDate: row[1] ?? "",
          supplierId: row[2] ?? "",
          caseId: row[3] ?? "",
          caseNameSnapshot: row[4] ?? "",
          supplierSnapshot,
          subtotal: Number(row[6]) || 0,
          shippingFee: Number(row[7]) || 0,
          taxAmount: Number(row[8]) || 0,
          totalAmount: Number(row[9]) || 0,
          notes: row[10] ?? "",
          status: (row[11] || "draft") as PurchaseOrder["status"],
          deliveryAddress: row[12] ?? "",
          expectedDeliveryDate: row[13] ?? "",
          createdAt: row[14] ?? "",
          updatedAt: row[15] ?? "",
          relatedOrderId: row[16] ?? "",
        };
      })
      .filter((order) => order.caseId === caseId);

    const totalPurchaseCost = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const orderCount = orders.length;

    return NextResponse.json({
      ok: true,
      caseId,
      totalPurchaseCost,
      orderCount,
      orders: orders.map((o: PurchaseOrder) => ({
        orderId: o.orderId,
        orderDate: o.orderDate,
        supplierName: o.supplierSnapshot?.shortName || o.supplierSnapshot?.name || "",
        totalAmount: o.totalAmount,
        status: o.status,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "查詢失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
