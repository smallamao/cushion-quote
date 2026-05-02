import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { updateDriver } from "@/lib/drivers-sheet";
import type { DriverRecord } from "@/lib/drivers-sheet";

function getSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  return verifySession(token);
}

interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { key } = await context.params;
  let body: Partial<Omit<DriverRecord, "key">>;
  try {
    body = (await request.json()) as Partial<Omit<DriverRecord, "key">>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const driver = await updateDriver(key, body);
  if (!driver) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, driver });
}
