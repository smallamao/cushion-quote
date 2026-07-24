import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import {
  ORDER_RANGE_DATA,
  ORDER_RANGE_FULL,
  ORDER_RANGE_IDS,
  generateOrderId,
  isoNow,
  todayDateStr,
  orderRecordToRow,
  orderRowToRecord,
} from "@/lib/order-utils";
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
export async function POST(request: Request) {
  type PostBody =
    | { sourceType: "quote"; versionId: string }
    | { sourceType: "direct"; clientName: string; orderNumber: string; itemCategory?: string; clientId?: string };

  const body = (await request.json()) as PostBody;

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
    // For quote sourceType: check if order already exists for this versionId (idempotency)
    if (body.sourceType === "quote" && body.versionId) {
      const checkRes = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: ORDER_RANGE_DATA,
      });
      const existingRows = (checkRes.data.values ?? []) as string[][];
      const existingOrder = existingRows.find((r) => r[2] === body.versionId);
      if (existingOrder) {
        return NextResponse.json({ ok: true, orderId: existingOrder[0], alreadyExists: true }, { status: 200 });
      }
    }

    // Read existing IDs for generateOrderId
    const idRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_IDS,
    });
    const existingIds = ((idRes.data.values ?? []) as string[][])
      .map((r) => r[0] ?? "")
      .filter(Boolean);

    const now = isoNow();
    const yearMonth = todayDateStr().slice(0, 7);
    const orderId = generateOrderId(existingIds, yearMonth);

    let clientName = "";
    let orderNumber = "";
    let orderTitle = "";
    let caseId = "";
    let versionId = "";
    let quotedAmount = 0;
    let directItemCategory = "";
    let clientId = "";
    let installAddress = "";
    let installContactName = "";
    let installContactPhone = "";
    let materialName = "";
    let materialCode = "";
    const materialImageUrl = "";
    let initialNotes: CustomOrder["notes"] = [];

    if (body.sourceType === "quote") {
      if (!body.versionId) {
        return NextResponse.json(
          { ok: false, error: "versionId is required for sourceType=quote" },
          { status: 400 },
        );
      }
      versionId = body.versionId;

      // 1. Find the version row
      const versionRes = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "報價版本!A2:AQ2000",
      });
      const versionRows = (versionRes.data.values ?? []) as string[][];
      const versionRow = versionRows.find((r) => r[0] === versionId);
      if (!versionRow) {
        return NextResponse.json(
          { ok: false, error: "version not found" },
          { status: 404 },
        );
      }
      // col[2]=caseId, col[18]=含稅總額, col[24]=對外說明, col[29]=clientNameSnapshot
      caseId = versionRow[2] ?? "";
      quotedAmount = parseFloat(versionRow[18] ?? "0") || 0;
      const scopeDescription = versionRow[24] ?? "";
      initialNotes = scopeDescription
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .map((text: string, i: number) => ({
          id: `note-${i + 1}`,
          text,
          color: "black" as const,
          isWarning: false,
        }));
      clientName = versionRow[29] ?? "";

      // 2. Find the case for caseName → orderTitle
      const caseRes = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "案件!A2:Z2000",
      });
      const caseRows = (caseRes.data.values ?? []) as string[][];
      const caseRow = caseRows.find((r) => r[0] === caseId);
      orderNumber = caseId;
      orderTitle = caseRow ? (caseRow[1] ?? "") : "";
      // 案場現場資訊帶入（案件：col4 聯絡人、col5 電話、col6 地址）→ 給師傅派工用
      if (caseRow) {
        installContactName = caseRow[4] ?? "";
        installContactPhone = caseRow[5] ?? "";
        installAddress = caseRow[6] ?? "";
      }

      // 3. Find first version line item to get materialId
      const lineRes = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "報價版本明細!A2:AJ2000",
      });
      const lineRows = (lineRes.data.values ?? []) as string[][];
      const lineRow = lineRows.find((r) => r[1] === versionId);
      const materialId = lineRow ? (lineRow[7] ?? "") : "";

      // 4. Look up material info
      if (materialId) {
        const matRes = await client.sheets.spreadsheets.values.get({
          spreadsheetId: client.spreadsheetId,
          range: "材質資料庫!A2:R2000",
        });
        const matRows = (matRes.data.values ?? []) as string[][];
        const matRow = matRows.find((r) => r[0] === materialId);
        if (matRow) {
          const brand = matRow[1] ?? "";
          const series = matRow[2] ?? "";
          const code = matRow[3] ?? "";
          // col[4]=colorName (not used in materialName per spec)
          materialName = `${brand} ${series} ${code}`.trim();
          materialCode = code;
        }
      }
    } else {
      // sourceType === "direct"
      const directBody = body as { sourceType: "direct"; clientName: string; orderNumber: string; itemCategory?: string; clientId?: string };
      clientName = directBody.clientName ?? "";
      orderNumber = directBody.orderNumber ?? "";
      directItemCategory = directBody.itemCategory ?? "";
      clientId = directBody.clientId ?? "";
    }

    // 報價端已設「不開發票」的版本（電子發票不開清單），建單直接標記免開票
    let invoiceStatus: CustomOrder["invoiceStatus"] = "pending";
    if (versionId) {
      try {
        const optOutRes = await client.sheets.spreadsheets.values.get({
          spreadsheetId: client.spreadsheetId,
          range: "電子發票不開清單!A:A",
        });
        const optOutIds = ((optOutRes.data.values ?? []) as string[][]).map((r) => r[0]);
        if (optOutIds.includes(versionId)) invoiceStatus = "exempt";
      } catch {
        // 清單讀取失敗時維持 pending，不擋建單
      }
    }

    const newOrder: CustomOrder = {
      orderId,
      caseId,
      versionId,
      clientName,
      orderNumber,
      orderTitle,
      itemCategory: (directItemCategory as import("@/lib/types").OrderItemCategory) || "",
      deliveryMethod: "",
      status: "production",
      sourceType: body.sourceType,
      orderDate: "",
      supplierOrderDate: "",
      productionDueDate: "",
      installDate: "",
      completedDate: "",
      quotedAmount,
      materialCost: 0,
      laborCost: 0,
      shippingCost: 0,
      otherCost: 0,
      materialName,
      materialCode,
      materialImageUrl,
      deadline: "",
      items: [],
      notes: initialNotes,
      photos: [],
      invoiceStatus,
      isArchived: false,
      internalNotes: "",
      createdAt: now,
      updatedAt: now,
      createdBy: "",
      materialPurchases: [],
      clientId,
      installAddress,
      installContactName,
      installContactPhone,
    };

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_FULL,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [orderRecordToRow(newOrder)] },
    });

    return NextResponse.json({ ok: true, orderId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
