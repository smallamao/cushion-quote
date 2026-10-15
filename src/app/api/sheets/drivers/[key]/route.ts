import { NextResponse } from "next/server";

// 2026-10-15：原本自己解析 cookie 只驗簽章，不查這個帳號現在還在不在職——
// 停用帳號 30 天內照樣進得來。改用 lib/api-auth 的共用實作，停用與降權立刻生效。

import { getActiveSession } from "@/lib/api-auth";
import { updateDriver } from "@/lib/drivers-sheet";
import type { DriverRecord } from "@/lib/drivers-sheet";


interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getActiveSession(request);
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
