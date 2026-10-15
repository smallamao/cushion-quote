import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api-auth";
import { createService, listServices } from "@/lib/after-sales-sheet";
import { buildDispatchPath } from "@/lib/dispatch-link";
import type { AfterSalesServiceType, AfterSalesStatus } from "@/lib/types";

export async function GET(request: Request) {
  const guard = requireSession(request);
  if (guard.denied) return guard.denied;
  const { session } = guard;
  const isAdmin = session.role === "admin";

  try {
    const all = await listServices();
    // 🔴 2026-10-15 修補：原本不分角色一律回傳全部售後單。任何一個師傅帳號
    //    因此等於整份客戶名冊（姓名、地址、電話）的讀取權限。
    //    前端本來就只顯示自己的（MyScheduleClient 的 isAdmin || assignedTo === myName），
    //    這裡只是把同一條規則搬到伺服器端真正執行。
    const me = session.displayName.trim();
    const services = isAdmin
      ? all
      : all.filter((s) => me && (s.assignedTo ?? "").trim() === me);

    // 一併回傳各單的派工連結路徑，讓列表「複製派工連結」不必再打一次 API
    // （同步複製才不會被 Safari 的「必須在點擊手勢內寫剪貼簿」擋掉）。
    // 已結案／已取消的單連結本來就停用，不必產。
    //
    // 🔴 只給 admin：派工連結是「免登入就能看客戶電話地址」的網址，
    //    師傅拿到可以轉傳給任何人。
    const dispatchPaths: Record<string, string> = {};
    if (isAdmin) {
      for (const s of services) {
        if (s.status === "completed" || s.status === "cancelled") continue;
        const path = buildDispatchPath(s.serviceId);
        if (path) dispatchPaths[s.serviceId] = path;
      }
    }
    return NextResponse.json({ ok: true, services, dispatchPaths });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "服務暫時無法使用";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = requireSession(request);
  if (guard.denied) return guard.denied;
  const { session } = guard;
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
