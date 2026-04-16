import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import {
  findServiceById,
  listReplies,
  updateService,
} from "@/lib/after-sales-sheet";
import type { AfterSalesStatus } from "@/lib/types";

function getSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  return verifySession(token);
}

interface RouteContext {
  params: Promise<{ serviceId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  const { serviceId } = await context.params;
  const [service, replies] = await Promise.all([
    findServiceById(serviceId),
    listReplies(serviceId),
  ]);
  if (!service) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, service, replies });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
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
    dispatchNotes?: string;
    completedDate?: string;
    completionNotes?: string;
    completionPhotos?: string[];
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const service = await updateService(serviceId, body);
  if (!service) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, service });
}
