import { NextResponse } from "next/server";

// 2026-10-15：原本自己解析 cookie 只驗簽章，不查這個帳號現在還在不在職——
// 停用帳號 30 天內照樣進得來。改用 lib/api-auth 的共用實作，停用與降權立刻生效。

import { getActiveSession } from "@/lib/api-auth";
import { createDriver, listDrivers } from "@/lib/drivers-sheet";
import type { DriverRecord } from "@/lib/drivers-sheet";


export async function GET(request: Request) {
  const session = await getActiveSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  try {
    const drivers = await listDrivers();
    return NextResponse.json({ ok: true, drivers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "載入失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getActiveSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: Partial<DriverRecord>;
  try {
    body = (await request.json()) as Partial<DriverRecord>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (!body.key?.trim()) return NextResponse.json({ ok: false, error: "key 必填" }, { status: 400 });
  if (!body.title?.trim()) return NextResponse.json({ ok: false, error: "title 必填" }, { status: 400 });

  const driver = await createDriver({
    key:          body.key.trim(),
    title:        body.title.trim(),
    confirmTitle: body.confirmTitle?.trim() ?? "",
    phoneNumber:  body.phoneNumber?.trim() ?? "",
    labelId:      body.labelId?.trim() ?? "",
    active:       body.active !== false,
  });

  if (!driver) return NextResponse.json({ ok: false, error: "建立失敗" }, { status: 500 });
  return NextResponse.json({ ok: true, driver }, { status: 201 });
}
