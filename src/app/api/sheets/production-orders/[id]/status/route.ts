import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api-auth";
import { writeOrderStatus } from "@/lib/order-status-write";
import { todayDateStr } from "@/lib/order-utils";
import {
  canSetProductionStatus,
  isProductionSettableStatus,
  isVisibleOnProductionList,
  pickProductionOrderView,
} from "@/lib/production-orders";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/sheets/production-orders/[id]/status
// Body: { status: "production" | "completed" }
//
// 生產清單上的「製作中／已完成」按鈕。admin 與 craftsman 可用，規則一樣：
//   - 目標只能是製作中或已完成（已完成→製作中＝改正按錯）
//   - 只能改「生產清單上看得到」的單（製作中、待出貨、7 天內完成；未封存）
// 寫入與 admin 的訂單狀態端點共用同一份（lib/order-status-write.ts）。
// 回傳的是投影後的單，不是整張訂單。
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireSession(request);
  if (guard.denied) return guard.denied;
  const { role } = guard.session;
  if (role !== "admin" && role !== "craftsman") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id: orderId } = await context.params;
  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!isProductionSettableStatus(body?.status)) {
    return NextResponse.json({ ok: false, error: "invalid status value" }, { status: 400 });
  }
  const next = body.status;

  try {
    const today = todayDateStr();
    const result = await writeOrderStatus(
      orderId,
      next,
      (existing) => isVisibleOnProductionList(existing, today) && canSetProductionStatus(existing.status, next),
    );
    if (!result.ok) {
      if (result.error === "sheets_unavailable") {
        return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
      }
      // 不在生產清單上的單一律回 404（同 denyIfNotAssignee 的理由：不確認單號存在）
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, order: pickProductionOrderView(result.order) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
