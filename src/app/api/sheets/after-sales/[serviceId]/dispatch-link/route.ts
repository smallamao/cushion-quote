import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { findServiceById } from "@/lib/after-sales-sheet";
import { buildDispatchPath } from "@/lib/dispatch-link";

// node:crypto 簽章需 Node runtime。
// 🔴 2026-10-15 修補：這支原本整支沒讀 session。`/api/sheets/after-sales` 整個
//    前綴在師傅白名單裡，所以任何登入者都打得到；middleware 一有疏漏就是全開。
//    這是「內勤產給客人／外部師傅的連結」的動作，限 admin。
//    派工連結是「免登入就能看客戶電話地址」的網址，師傅拿到可以轉傳給任何人。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sheets/after-sales/[serviceId]/dispatch-link
// 回傳給外部師傅的派工單站內路徑（前端自行接上 origin 組完整網址）。
export async function GET(request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;

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
