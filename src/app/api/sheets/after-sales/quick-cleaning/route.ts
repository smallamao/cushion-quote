import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
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
// 🔴 2026-10-15 修補：這支原本整支沒讀 session。`/api/sheets/after-sales` 整個
//    前綴在師傅白名單裡，所以任何登入者都打得到；middleware 一有疏漏就是全開。
//    這是「內勤產給客人／外部師傅的連結」的動作，限 admin。
export async function POST(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;

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
      // 原本寫空字串——「誰建的」查不出來，而這張表的 createdBy 本來就是為此而存在
      createdBy: guard.session.email,
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
