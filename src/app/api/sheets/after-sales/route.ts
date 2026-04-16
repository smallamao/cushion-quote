import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { createService, listServices } from "@/lib/after-sales-sheet";
import type { AfterSalesStatus } from "@/lib/types";

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
  const services = await listServices();
  return NextResponse.json({ ok: true, services });
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
    dispatchNotes?: string;
    completedDate?: string;
    completionNotes?: string;
    completionPhotos?: string[];
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
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
      dispatchNotes: body.dispatchNotes ?? "",
      completedDate: body.completedDate ?? "",
      completionNotes: body.completionNotes ?? "",
      completionPhotos: body.completionPhotos ?? [],
      createdBy: session.displayName,
    },
  });
  if (!service) {
    return NextResponse.json({ ok: false, error: "建立失敗" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, service }, { status: 201 });
}
