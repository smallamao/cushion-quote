import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";
import { createOrder, OrderCreateError, type CreateOrderInput } from "@/lib/order-create";
import type { CustomOrder, OrderStatus } from "@/lib/types";

// GET /api/sheets/orders
// Query params:
//   ?caseId=          filter by caseId
//   ?status=          filter by OrderStatus
//   ?category=        filter by itemCategory
//   ?month=YYYY-MM    filter by orderDate starting with month
//   ?q=               search in clientName | orderNumber | orderTitle (case-insensitive)
//   ?archived=true|false  filter by isArchived (default: non-archived only when absent)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("caseId")?.trim() ?? "";
  const status = (searchParams.get("status")?.trim() ?? "") as OrderStatus | "";
  const category = searchParams.get("category")?.trim() ?? "";
  const month = searchParams.get("month")?.trim() ?? "";
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const archivedParam = searchParams.get("archived");

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, orders: [] as CustomOrder[], error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    let orders = rows.filter((r) => r[0]).map(orderRowToRecord);

    // Default: show non-archived only unless ?archived param is provided
    if (archivedParam === null) {
      orders = orders.filter((o) => !o.isArchived);
    } else {
      const wantArchived = archivedParam === "true";
      orders = orders.filter((o) => o.isArchived === wantArchived);
    }

    if (caseId) orders = orders.filter((o) => o.caseId === caseId);
    if (status) orders = orders.filter((o) => o.status === status);
    if (category) orders = orders.filter((o) => o.itemCategory === category);
    if (month) orders = orders.filter((o) => o.orderDate.startsWith(month));
    if (q) {
      orders = orders.filter(
        (o) =>
          o.clientName.toLowerCase().includes(q) ||
          o.orderNumber.toLowerCase().includes(q) ||
          o.orderTitle.toLowerCase().includes(q) ||
          o.materialCode.toLowerCase().includes(q) ||
          o.materialName.toLowerCase().includes(q) ||
          o.items.some(
            (it) =>
              it.colorCode?.toLowerCase().includes(q) ||
              it.name.toLowerCase().includes(q),
          ),
      );
    }

    return NextResponse.json({ ok: true, orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, orders: [], error: message }, { status: 500 });
  }
}

// POST /api/sheets/orders
// Body type A (from quote): { sourceType: "quote", versionId: string }
// Body type B (direct/B2B): { sourceType: "direct", clientName: string, orderNumber: string }
//
// 實作在 @/lib/order-create，與「客人簽署完成自動開單」共用同一份邏輯。
export async function POST(request: Request) {
  const body = (await request.json()) as CreateOrderInput;

  if (!body.sourceType) {
    return NextResponse.json(
      { ok: false, error: "sourceType is required" },
      { status: 400 },
    );
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const result = await createOrder(client, body);
    if (result.alreadyExists) {
      return NextResponse.json(
        { ok: true, orderId: result.orderId, alreadyExists: true },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, orderId: result.orderId }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderCreateError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
