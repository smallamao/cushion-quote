import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import type { UserRole } from "@/lib/types";
import { createUser, listUsers, updateUser } from "@/lib/users-sheet";

/**
 * 可以指派給使用者的角色。
 *
 * types.ts 的 UserRole 還有 "sales"，但這套系統目前不建 sales 帳號
 * （middleware 把 sales 與 technician 同權看待）。要支援就在這裡加。
 */
const ASSIGNABLE_ROLES: readonly UserRole[] = ["admin", "technician"];

function isAssignableRole(role: unknown): role is UserRole {
  return typeof role === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;
  const users = await listUsers();
  return NextResponse.json({ ok: true, users });
}

export async function POST(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;
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
  if (!isAssignableRole(role)) {
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
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;
  let body: {
    userId?: string;
    email?: string;
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
    email: string;
    displayName: string;
    role: UserRole;
    isActive: boolean;
  }> = {};
  if (body.email !== undefined) patch.email = body.email.trim().toLowerCase();
  if (body.displayName !== undefined) patch.displayName = body.displayName.trim();
  // 🔴 2026-10-15 修補：PATCH 原本不驗角色值，POST 有驗。只有 admin 打得到這支，
  //    所以不是提權路徑，真正的風險是手滑：角色被寫成 "Admin"（大寫 A）時，
  //    middleware 的 `session.role !== "admin"` 就認不出來，那個人下次登入會被
  //    鎖在師傅白名單裡，而且完全看不出原因。
  if (body.role !== undefined) {
    if (!isAssignableRole(body.role)) {
      return NextResponse.json({ ok: false, error: "role 無效" }, { status: 400 });
    }
    patch.role = body.role;
  }
  if (body.isActive !== undefined) patch.isActive = body.isActive;

  try {
    const user = await updateUser(body.userId, patch);
    if (!user) {
      return NextResponse.json({ ok: false, error: "使用者不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "更新失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
