import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";

import { denyIfNotAssignee, requireSession } from "@/lib/api-auth";
import {
  deleteService,
  findServiceById,
  listReplies,
  updateService,
} from "@/lib/after-sales-sheet";
import { filterTechnicianPatch } from "@/lib/schedule-utils";
import type { AfterSalesServiceType, AfterSalesStatus } from "@/lib/types";

interface RouteContext {
  params: Promise<{ serviceId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const guard = await requireSession(request);
  if (guard.denied) return guard.denied;
  const { serviceId } = await context.params;
  try {
    const [service, replies] = await Promise.all([
      findServiceById(serviceId),
      listReplies(serviceId),
    ]);
    if (!service) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  // 🔴 2026-10-15 修補：原本只檢查「有沒有登入」，不檢查「這張單是不是你的」。
    //    任何 serviceId 都讀得到——別人的單、別人客戶的電話地址。
    const notMine = denyIfNotAssignee(guard.session, service.assignedTo);
    if (notMine) return notMine;

    return NextResponse.json({ ok: true, service, replies });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "服務暫時無法使用";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireSession(request);
  if (guard.denied) return guard.denied;
  const { session } = guard;
  const { serviceId } = await context.params;

  interface PatchBody {
    receivedDate?: string;
    relatedOrderNo?: string;
    shipmentDate?: string;
    clientName?: string;
    clientPhone?: string;
    clientContact2?: string;
    clientPhone2?: string;
    deliveryAddress?: string;
    modelCode?: string;
    modelNameSnapshot?: string;
    issueDescription?: string;
    issuePhotos?: string[];
    status?: AfterSalesStatus;
    assignedTo?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    dispatchNotes?: string;
    completedDate?: string;
    completionNotes?: string;
    completionPhotos?: string[];
    customerSignature?: string;
    customerSignedAt?: string;
    serviceType?: AfterSalesServiceType;
    outsourcedVendor?: string;
    outsourcedNote?: string;
    itemLocation?: string;
    itemDescription?: string;
    issueCategories?: string[];
    dispatchOrder?: number;
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (session.role !== "admin") {
  // 🔴 2026-10-15 修補：原本只檢查「有沒有登入」，不檢查「這張單是不是你的」。
    //    filterTechnicianPatch 限制了「可改哪些欄位」，但完全沒限制「可改哪一張單」，
    //    所以師傅能把同事的單標成已完工，派工進度表就不可信了。
    const existing = await findServiceById(serviceId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const notMine = denyIfNotAssignee(session, existing.assignedTo);
    if (notMine) return notMine;
  }

  // 非 admin 一律只能改白名單欄位。原本只套在 technician，其他非 admin 角色
  // 走到下面會整包 body 寫進去——預設要收緊，不是預設放行。
  if (session.role !== "admin") {
    const check = filterTechnicianPatch(body as Record<string, unknown>);
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    // Use the sanitised subset so only allowed fields reach updateService
    const service = await updateService(serviceId, check.filtered as typeof body);
    if (!service) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, service });
  }

  try {
    const service = await updateService(serviceId, body);
    if (!service) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, service });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "儲存失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// DELETE /api/sheets/after-sales/[serviceId] — 實體刪除（僅 admin，供清除測試/建錯的單）
export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requireSession(request);
  if (guard.denied) return guard.denied;
  const { session } = guard;
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { serviceId } = await context.params;
  try {
    const done = await deleteService(serviceId);
    if (!done) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    appendAuditLog({
      actor: guard.session.email,
      action: "delete",
      targetType: "after_sales",
      targetId: serviceId,
      summary: undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "刪除失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
