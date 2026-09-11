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
import { lineRowToRecord } from "@/app/api/sheets/_v2-utils";
import { versionLinesToOrderItems } from "@/lib/quote-mappers";
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
    let versionTaxRate = 0;
    let directItemCategory = "";
    let clientId = "";
    let installAddress = "";
    let installContactName = "";
    let installContactPhone = "";
    let materialName = "";
    let materialCode = "";
    const materialImageUrl = "";
    let initialNotes: CustomOrder["notes"] = [];
    let orderItems: CustomOrder["items"] = [];

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
        range: "報價版本!A2:AW2000",
      });
      const versionRows = (versionRes.data.values ?? []) as string[][];
      const versionRow = versionRows.find((r) => r[0] === versionId);
      if (!versionRow) {
        return NextResponse.json(
          { ok: false, error: "version not found" },
          { status: 404 },
        );
      }
      // col[2]=caseId, col[16]=稅率, col[18]=含稅總額, col[24]=對外說明, col[29]=clientNameSnapshot
      caseId = versionRow[2] ?? "";
      quotedAmount = parseFloat(versionRow[18] ?? "0") || 0;
      versionTaxRate = parseFloat(versionRow[16] ?? "0") || 0;
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
      // 訂貨人／現場資訊帶入：
      // 只有「客人有線上簽署」(signedBack col43=TRUE) 時，才優先取簽署時回寫於
      // 報價版本的訂貨人快照（col30 聯絡人 / col31 電話 / col33 地址）；
      // 否則一律讀「當前案件」現場資訊（col4/5/6），避免用到凍結的舊快照或
      // 未修復的舊格式欄位（legacy 欄位位移）。→ 給出貨與師傅派工用。
      const versionSigned = String(versionRow[43] ?? "").toUpperCase() === "TRUE";
      if (versionSigned) {
        installContactName = versionRow[30] || (caseRow?.[4] ?? "");
        installContactPhone = versionRow[31] || (caseRow?.[5] ?? "");
        installAddress = versionRow[33] || (caseRow?.[6] ?? "");
      } else {
        installContactName = caseRow?.[4] ?? "";
        installContactPhone = caseRow?.[5] ?? "";
        installAddress = caseRow?.[6] ?? "";
      }

      // 3. 讀本版本所有明細（帶入訂單品項用）
      const lineRes = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "報價版本明細!A2:AJ2000",
      });
      const lineRecords = ((lineRes.data.values ?? []) as string[][])
        .filter((r) => r[1] === versionId)
        .map(lineRowToRecord);

      // 4. 讀材質資料庫，建 id→{name, code} 對照（給訂單主布料＋各品項色號）
      const materialNameById = new Map<string, string>();
      const materialCodeById = new Map<string, string>();
      const neededMaterialIds = new Set(
        lineRecords.map((l) => l.materialId).filter(Boolean),
      );
      if (neededMaterialIds.size > 0) {
        const matRes = await client.sheets.spreadsheets.values.get({
          spreadsheetId: client.spreadsheetId,
          range: "材質資料庫!A2:R2000",
        });
        const matRows = (matRes.data.values ?? []) as string[][];
        for (const r of matRows) {
          const id = r[0];
          if (!id || !neededMaterialIds.has(id)) continue;
          const brand = r[1] ?? "";
          const series = r[2] ?? "";
          const code = r[3] ?? "";
          // col[4]=colorName (not used in materialName per spec)
          materialNameById.set(id, `${brand} ${series} ${code}`.trim());
          materialCodeById.set(id, code);
        }
      }

      // 訂單主布料：取第一筆（依 lineNo）有材質的明細
      const firstWithMaterial = lineRecords
        .slice()
        .sort((a, b) => a.lineNo - b.lineNo)
        .find((l) => l.materialId && materialNameById.has(l.materialId));
      if (firstWithMaterial) {
        materialName = materialNameById.get(firstWithMaterial.materialId) ?? "";
        materialCode = materialCodeById.get(firstWithMaterial.materialId) ?? "";
      }

      // 5. 報價明細 → 訂單品項（含名稱、尺寸規格、數量、色號、備註）
      orderItems = versionLinesToOrderItems(lineRecords, materialCodeById);
    } else {
      // sourceType === "direct"
      const directBody = body as { sourceType: "direct"; clientName: string; orderNumber: string; itemCategory?: string; clientId?: string };
      clientName = directBody.clientName ?? "";
      orderNumber = directBody.orderNumber ?? "";
      directItemCategory = directBody.itemCategory ?? "";
      clientId = directBody.clientId ?? "";
    }

    // 免開票判定：未稅報價（稅率 0）本身即代表不開發票；或已列入電子發票不開清單
    let invoiceStatus: CustomOrder["invoiceStatus"] = "pending";
    if (versionId && versionTaxRate === 0) invoiceStatus = "exempt";
    if (versionId && invoiceStatus === "pending") {
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
      items: orderItems,
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
