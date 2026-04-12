import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseOrder, PurchaseOrderStatus, Supplier } from "@/lib/types";
import { SupplierStatementPDF } from "@/components/pdf/SupplierStatementPDF";

const SUPPLIER_SHEET = "廠商";
const PURCHASE_ORDER_SHEET = "採購單";

function toNumber(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function supplierFromRow(row: string[]): Supplier {
  return {
    supplierId: row[0] ?? "",
    name: row[1] ?? "",
    shortName: row[2] ?? "",
    contactPerson: row[3] ?? "",
    phone: row[4] ?? "",
    mobile: "",
    fax: row[5] ?? "",
    email: row[6] ?? "",
    taxId: row[7] ?? "",
    address: row[8] ?? "",
    paymentMethod: row[9] ?? "",
    paymentTerms: row[10] ?? "",
    notes: row[11] ?? "",
    isActive: (row[12] ?? "true") === "true",
    createdAt: row[13] ?? "",
    updatedAt: row[14] ?? "",
  };
}

function normalizeOrderMonth(orderDate: string): string {
  const normalized = orderDate.trim().replace(/\//g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

function mapStatusToSummaryKey(status: PurchaseOrderStatus): "draft" | "ordered" | "received" | "confirmed" | null {
  switch (status) {
    case "draft":
      return "draft";
    case "sent":
      return "ordered";
    case "received":
      return "received";
    case "confirmed":
      return "confirmed";
    case "cancelled":
      return null;
  }
}

function orderFromRow(row: string[]): PurchaseOrder {
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
    supplierSnapshot = { ...supplierSnapshot };
  }

  return {
    orderId: row[0] ?? "",
    orderDate: row[1] ?? "",
    supplierId: row[2] ?? "",
    caseId: row[3] ?? "",
    caseNameSnapshot: row[4] ?? "",
    supplierSnapshot,
    subtotal: toNumber(row[6]),
    shippingFee: toNumber(row[7]),
    taxAmount: toNumber(row[8]),
    totalAmount: toNumber(row[9]),
    notes: row[10] ?? "",
    status: (row[11] as PurchaseOrder["status"]) ?? "draft",
    deliveryAddress: row[12] ?? "",
    expectedDeliveryDate: row[13] ?? "",
    createdAt: row[14] ?? "",
    updatedAt: row[15] ?? "",
  };
}

/**
 * GET /api/sheets/suppliers/[supplierId]/statement?month=YYYY-MM
 *
 * Generates monthly statement PDF for a supplier
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ supplierId: string }> }
) {
  const { supplierId } = await params;
  const url = new URL(request.url);
  const month = url.searchParams.get("month");

  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json(
      { ok: false, error: "請提供有效的月份參數 (格式: YYYY-MM)" },
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
    // Fetch supplier and orders
    const [supplierRes, orderRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: `${SUPPLIER_SHEET}!A2:O`,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: `${PURCHASE_ORDER_SHEET}!A2:P`,
      }),
    ]);

    // Find supplier
    const supplierRows = supplierRes.data.values ?? [];
    const suppliers = supplierRows.map(supplierFromRow);
    const supplier = suppliers.find((s) => s.supplierId === supplierId);

    if (!supplier) {
      return NextResponse.json(
        { ok: false, error: "廠商不存在" },
        { status: 404 }
      );
    }

    // Filter orders by supplier and month
    const orderRows = orderRes.data.values ?? [];
    const allOrders = orderRows.map(orderFromRow);
     const monthOrders = allOrders.filter((order) => {
      return (
        order.supplierId === supplierId &&
        order.status !== "cancelled" &&
        normalizeOrderMonth(order.orderDate) === month
      );
     });

    // Sort by date
    monthOrders.sort((a, b) => a.orderDate.localeCompare(b.orderDate));

    // Calculate summary by status
    const summary = {
      draft: { count: 0, amount: 0 },
      ordered: { count: 0, amount: 0 },
      received: { count: 0, amount: 0 },
      confirmed: { count: 0, amount: 0 },
      total: { count: monthOrders.length, amount: 0 },
    };

    for (const order of monthOrders) {
      const status = order.status || "draft";
      const summaryKey = mapStatusToSummaryKey(status);
      if (summaryKey) {
        summary[summaryKey].count++;
        summary[summaryKey].amount += order.totalAmount;
      }
      summary.total.amount += order.totalAmount;
    }

    // Generate PDF
    const pdfDocument = SupplierStatementPDF({
      supplier: {
        supplierId: supplier.supplierId,
        name: supplier.name,
        shortName: supplier.shortName,
        contactPerson: supplier.contactPerson,
        phone: supplier.phone,
        address: supplier.address,
      },
      month,
      orders: monthOrders.map((order) => ({
        orderDate: order.orderDate,
        orderId: order.orderId,
        caseId: order.caseId || "",
        caseNameSnapshot: order.caseNameSnapshot || "",
        totalAmount: order.totalAmount,
        status: order.status,
      })),
      summary,
      generatedAt: new Date().toISOString(),
    });

    const pdfBuffer = await renderToBuffer(pdfDocument);

    // Return PDF
    const filename = `statement-${supplier.shortName || supplier.name}-${month}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "產生 PDF 失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
