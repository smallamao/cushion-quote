import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { createService } from "@/lib/after-sales-sheet";
import {
  RANGE_FULL,
  generateSessionId,
  generateToken,
  sessionToRow,
} from "@/lib/cleaning-slots-sheet";
import type { AfterSalesService, CleaningSlotSession } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST /api/sheets/after-sales/quick-cleaning
// 一鍵：建立空白到府清潔服務單 + 媒合 session，回傳客人選時段連結 token。
// 客人於連結填姓名/地址/電話/時段，內勤零登打。
export async function POST() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const shell: Omit<AfterSalesService, "serviceId" | "createdAt" | "updatedAt"> = {
      receivedDate: today,
      relatedOrderNo: "",
      shipmentDate: "",
      clientName: "",
      clientPhone: "",
      clientContact2: "",
      clientPhone2: "",
      deliveryAddress: "",
      modelCode: "",
      modelNameSnapshot: "",
      issueDescription: "到府清潔預約（客人填寫中）",
      issuePhotos: [],
      status: "pending",
      assignedTo: "",
      scheduledDate: "",
      scheduledTime: "",
      dispatchNotes: "",
      completedDate: "",
      completionNotes: "",
      completionPhotos: [],
      serviceType: "client",
      issueCategories: ["到府清潔"],
      createdBy: "",
    };
    const service = await createService({ service: shell });
    if (!service) {
      return NextResponse.json({ ok: false, error: "建立服務單失敗" }, { status: 500 });
    }

    const now = new Date().toISOString();
    const session: CleaningSlotSession = {
      sessionId: generateSessionId(),
      serviceId: service.serviceId,
      customerToken: generateToken(),
      techToken: "",
      proposedSlots: [],
      confirmedDate: "",
      confirmedPeriod: "",
      status: "awaiting_customer",
      customerAddress: "",
      customerPhone: "",
      createdAt: now,
      updatedAt: now,
    };
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_FULL,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [sessionToRow(session)] },
    });

    return NextResponse.json({ ok: true, serviceId: service.serviceId, customerToken: session.customerToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
