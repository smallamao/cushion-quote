import { NextResponse } from "next/server";

import { findServiceById } from "@/lib/after-sales-sheet";
import { buildDispatchPath } from "@/lib/dispatch-link";

// node:crypto 簽章需 Node runtime。此路由在 /api/sheets/* 底下，由 middleware
// 的 session 守門（僅內勤登入者可取得連結）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sheets/after-sales/[serviceId]/dispatch-link
// 回傳給外部師傅的派工單站內路徑（前端自行接上 origin 組完整網址）。
export async function GET(_req: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;

  let service;
  try {
    service = await findServiceById(serviceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "sheets_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  if (!service) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const path = buildDispatchPath(serviceId);
  if (!path) {
    return NextResponse.json({ ok: false, error: "AUTH_SECRET 未設定，無法產生派工連結" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, path });
}
