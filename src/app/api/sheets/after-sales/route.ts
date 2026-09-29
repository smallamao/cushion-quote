import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { createService, listServices } from "@/lib/after-sales-sheet";
import { buildDispatchPath } from "@/lib/dispatch-link";
import type { AfterSalesServiceType, AfterSalesStatus } from "@/lib/types";

function getSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  return verifySession(token);
}

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  try {
    const services = await listServices();
    // 一併回傳各單的派工連結路徑，讓列表「複製派工連結」不必再打一次 API
    // （同步複製才不會被 Safari 的「必須在點擊手勢內寫剪貼簿」擋掉）。
    // 已結案／已取消的單連結本來就停用，不必產。
    const dispatchPaths: Record<string, string> = {};
    for (const s of services) {
      if (s.status === "completed" || s.status === "cancelled") continue;
      const path = buildDispatchPath(s.serviceId);
      if (path) dispatchPaths[s.serviceId] = path;
    }
    return NextResponse.json({ ok: true, services, dispatchPaths });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "服務暫時無法使用";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  if (session.role === "technician") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  interface CreateBody {
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
    serviceType?: AfterSalesServiceType;
    outsourcedVendor?: string;
    outsourcedNote?: string;
    itemLocation?: string;
    itemDescription?: string;
    issueCategories?: string[];
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  try {
    const service = await createService({
      service: {
        receivedDate: body.receivedDate || today,
        relatedOrderNo: body.relatedOrderNo ?? "",
        shipmentDate: body.shipmentDate ?? "",
        clientName: body.clientName ?? "",
        clientPhone: body.clientPhone ?? "",
        clientContact2: body.clientContact2 ?? "",
        clientPhone2: body.clientPhone2 ?? "",
        deliveryAddress: body.deliveryAddress ?? "",
        modelCode: body.modelCode ?? "",
        modelNameSnapshot: body.modelNameSnapshot ?? "",
        issueDescription: body.issueDescription ?? "",
        issuePhotos: body.issuePhotos ?? [],
        status: body.status ?? "pending",
        assignedTo: body.assignedTo ?? "",
        scheduledDate: body.scheduledDate ?? "",
        scheduledTime: body.scheduledTime ?? "",
        dispatchNotes: body.dispatchNotes ?? "",
        completedDate: body.completedDate ?? "",
        completionNotes: body.completionNotes ?? "",
        completionPhotos: body.completionPhotos ?? [],
        serviceType: body.serviceType,
        outsourcedVendor: body.outsourcedVendor,
        outsourcedNote: body.outsourcedNote,
        itemLocation: body.itemLocation,
        itemDescription: body.itemDescription,
        issueCategories: body.issueCategories ?? [],
        createdBy: session.displayName,
      },
    });
    if (!service) {
      return NextResponse.json({ ok: false, error: "建立失敗（資料庫連線問題）" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, service }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "建立失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
