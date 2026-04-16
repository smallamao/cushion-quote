import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import type { UserRole } from "@/lib/types";
import { createUser, listUsers, updateUser } from "@/lib/users-sheet";

/** 從 request 讀當前 session;非 admin 回 null */
function requireAdmin(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  const session = verifySession(token);
  if (!session) return { error: "not_authenticated" as const, status: 401 };
  if (session.role !== "admin") return { error: "forbidden" as const, status: 403 };
  return { session };
}

export async function GET(request: Request) {
  const guard = requireAdmin(request);
  if ("error" in guard) {
    return NextResponse.json(
      { ok: false, error: guard.error },
      { status: guard.status },
    );
  }
  const users = await listUsers();
  return NextResponse.json({ ok: true, users });
}

export async function POST(request: Request) {
  const guard = requireAdmin(request);
  if ("error" in guard) {
    return NextResponse.json(
      { ok: false, error: guard.error },
      { status: guard.status },
    );
  }
  let body: { email?: string; displayName?: string; role?: UserRole };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim();
  const role = body.role ?? "technician";
  if (!email || !displayName) {
    return NextResponse.json(
      { ok: false, error: "email 和顯示名稱必填" },
      { status: 400 },
    );
  }
  if (role !== "admin" && role !== "technician") {
    return NextResponse.json(
      { ok: false, error: "role 無效" },
      { status: 400 },
    );
  }
  try {
    const user = await createUser({ email, displayName, role });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "建立失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const guard = requireAdmin(request);
  if ("error" in guard) {
    return NextResponse.json(
      { ok: false, error: guard.error },
      { status: guard.status },
    );
  }
  let body: {
    userId?: string;
    displayName?: string;
    role?: UserRole;
    isActive?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!body.userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }
  // 防呆: 不能把自己改成 technician,或 deactivate 自己
  if (body.userId === guard.session.userId) {
    if (body.role === "technician") {
      return NextResponse.json(
        { ok: false, error: "不能把自己改成技師" },
        { status: 400 },
      );
    }
    if (body.isActive === false) {
      return NextResponse.json(
        { ok: false, error: "不能停用自己" },
        { status: 400 },
      );
    }
  }
  const patch: Partial<{
    displayName: string;
    role: UserRole;
    isActive: boolean;
  }> = {};
  if (body.displayName !== undefined) patch.displayName = body.displayName.trim();
  if (body.role !== undefined) patch.role = body.role;
  if (body.isActive !== undefined) patch.isActive = body.isActive;

  const user = await updateUser(body.userId, patch);
  if (!user) {
    return NextResponse.json({ ok: false, error: "使用者不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, user });
}
