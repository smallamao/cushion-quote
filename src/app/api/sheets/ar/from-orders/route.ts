import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  AR_RANGE_DATA,
  AR_RANGE_FULL,
  AR_SCHEDULE_RANGE_FULL,
  arRecordToRow,
  arRowToRecord,
  arScheduleRecordToRow,
  generateArId,
  generateArScheduleId,
  isoDateNow,
  isoNow,
} from "@/lib/ar-utils";
import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";
import type { ARRecord, ARScheduleRecord } from "@/lib/types";

interface FromOrdersPayload {
  orderIds: string[];
  dueDate: string; // YYYY-MM-DD
  notes?: string;
}

// POST /api/sheets/ar/from-orders
// 無報價 B2B 合併請款：勾選多張訂製訂單 → 建立一張 AR（單期全額）。
// AR 以 relatedOrderIds 記住涵蓋的訂單，收款狀態由此對回訂單列表。
export async function POST(request: Request) {
  let payload: FromOrdersPayload;
  try {
    payload = (await request.json()) as FromOrdersPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "格式錯誤" }, { status: 400 });
  }

  const orderIds = Array.from(new Set((payload.orderIds ?? []).filter(Boolean)));
  if (orderIds.length === 0) {
    return NextResponse.json({ ok: false, error: "orderIds is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate ?? "")) {
    return NextResponse.json({ ok: false, error: "dueDate 格式須為 YYYY-MM-DD" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [orderRes, arRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: ORDER_RANGE_DATA,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_RANGE_DATA,
      }),
    ]);

    const allOrders = ((orderRes.data.values ?? []) as string[][]).map(orderRowToRecord);
    const targets = allOrders.filter((o) => orderIds.includes(o.orderId));
    if (targets.length !== orderIds.length) {
      return NextResponse.json({ ok: false, error: "部分訂單不存在" }, { status: 404 });
    }

    const clientNames = Array.from(new Set(targets.map((o) => o.clientName).filter(Boolean)));
    if (clientNames.length > 1) {
      return NextResponse.json(
        { ok: false, error: `訂單分屬不同客戶（${clientNames.join("、")}），無法合併請款` },
        { status: 400 },
      );
    }

    const existingArs = ((arRes.data.values ?? []) as string[][]).map(arRowToRecord);
    // 防重複：任一訂單已被其他未取消 AR 涵蓋就擋下
    const already = targets.find((o) =>
      existingArs.some(
        (ar) =>
          ar.arStatus !== "cancelled" &&
          ((o.versionId && ar.versionId === o.versionId) ||
            (ar.relatedOrderIds ?? []).includes(o.orderId)),
      ),
    );
    if (already) {
      return NextResponse.json(
        { ok: false, error: `訂單 ${already.orderNumber || already.orderId} 已有關聯的應收帳款` },
        { status: 409 },
      );
    }

    const totalAmount = targets.reduce((s, o) => s + (o.quotedAmount || 0), 0);
    if (totalAmount <= 0) {
      return NextResponse.json(
        { ok: false, error: "所選訂單金額合計為 0，請先在訂單財務頁填入報價金額" },
        { status: 400 },
      );
    }

    const now = isoNow();
    const today = isoDateNow();
    const arId = await generateArId(existingArs.map((ar) => ar.arId));
    const orderNumbers = targets.map((o) => o.orderNumber || o.orderId).join(", ");

    const schedule: ARScheduleRecord = {
      scheduleId: generateArScheduleId(arId, 1),
      arId,
      seq: 1,
      label: "全額",
      ratio: 100,
      amount: totalAmount,
      dueDate: payload.dueDate,
      receivedAmount: 0,
      receivedDate: "",
      paymentMethod: "",
      scheduleStatus: "pending",
      adjustmentAmount: 0,
      notes: `合併請款：${orderNumbers}`,
      createdAt: now,
      updatedAt: now,
    };

    const arRecord: ARRecord = {
      arId,
      issueDate: today,
      caseId: "",
      caseNameSnapshot: `合併請款 x${targets.length}`,
      quoteId: "",
      versionId: "",
      clientId: targets.find((o) => o.clientId)?.clientId ?? "",
      clientNameSnapshot: clientNames[0] ?? "",
      contactNameSnapshot: "",
      clientPhoneSnapshot: "",
      projectNameSnapshot: orderNumbers,
      totalAmount,
      receivedAmount: 0,
      outstandingAmount: totalAmount,
      scheduleCount: 1,
      arStatus: "active",
      hasOverdue: false,
      lastReceivedAt: "",
      notes: payload.notes ?? `合併請款：${orderNumbers}`,
      createdAt: now,
      updatedAt: now,
      createdBy: "",
      relatedOrderIds: orderIds,
    };

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: AR_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [arRecordToRow(arRecord)] },
    });
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: AR_SCHEDULE_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [arScheduleRecordToRow(schedule)] },
    });

    return NextResponse.json({ ok: true, ar: arRecord, schedules: [schedule] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
