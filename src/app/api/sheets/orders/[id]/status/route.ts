import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { writeOrderStatus } from "@/lib/order-status-write";
import type { OrderStatus } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/sheets/orders/[id]/status
// Body: { status: OrderStatus }
export async function PATCH(request: Request, context: RouteContext) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const { id: orderId } = await context.params;
  const body = (await request.json()) as { status: OrderStatus };

  if (!body.status) {
    return NextResponse.json(
      { ok: false, error: "status is required" },
      { status: 400 },
    );
  }

  const VALID_ORDER_STATUSES = ["pending_setup", "production", "waiting", "completed", "cancelled"] as const;
  if (!VALID_ORDER_STATUSES.includes(body.status as (typeof VALID_ORDER_STATUSES)[number])) {
    return NextResponse.json({ ok: false, error: "invalid status value" }, { status: 400 });
  }

  try {
    // 寫入邏輯與師傅的生產訂單共用（lib/order-status-write.ts）
    const result = await writeOrderStatus(orderId, body.status);
    if (!result.ok) {
      if (result.error === "sheets_unavailable") {
        return NextResponse.json(
          { ok: false, error: "Google Sheets 未設定" },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { ok: false, error: result.error === "row_missing" ? "order row missing" : "order not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, notionUpdated: result.notionUpdated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
