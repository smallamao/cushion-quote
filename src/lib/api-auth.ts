import "server-only";

import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import type { Session } from "@/lib/types";

// API route 層的身分驗證「單一事實來源」。
//
// 為什麼需要它：middleware 是唯一一道門，/api/sheets 底下 118 支端點裡 80 支
// 自己完全不驗身分。2026-10-15 之前 middleware 根本不驗簽章，那個疏漏的影響
// 範圍因此是 80 支而不是 1 支。下一個 middleware 疏漏也會是同樣的規模，所以
// 碰錢、碰客戶資料的端點要自己再驗一次。
//
// 原本有兩份各自實作的 cookie 解析（api/sheets/users/route.ts 與
// api/sheets/einvoices/_auth.ts），這裡取代它們。

/** 從 request 的 cookie 取出並驗證 session。驗不過（含偽造、過期）回 null。 */
export function getSession(request: Request): Session | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  const prefix = `${SESSION_COOKIE_NAME}=`;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    // 用 slice 而不是 split("=")[1]：憑證本身含 "." 分隔符，若未來格式帶 "=" 也不會被截斷
    return verifySession(trimmed.slice(prefix.length));
  }
  return null;
}

export type Guard = { session: Session; denied?: never } | { denied: NextResponse; session?: never };

/** 要求已登入。未登入回 401。 */
export function requireSession(request: Request): Guard {
  const session = getSession(request);
  if (!session) {
    return {
      denied: NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 }),
    };
  }
  return { session };
}

/** 要求 admin。未登入回 401，角色不符回 403。 */
export function requireAdmin(request: Request): Guard {
  const guard = requireSession(request);
  if (guard.denied) return guard;
  if (guard.session.role !== "admin") {
    return {
      denied: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    };
  }
  return guard;
}

/**
 * 非 admin 時要求「這張單是指派給你的」。通過回 null，否則回 404。
 *
 * 🔴 2026-10-15 修補：售後單的端點原本只檢查「有沒有登入」，不檢查「這張單是不是
 *    你的」。任何一個師傅帳號因此等於整份客戶名冊的讀取權限（姓名、地址、電話），
 *    而且能把同事的單標成已完工，派工進度表就不可信了。
 *
 * 刻意回 404 而不是 403：403 等於確認「這個單號存在、只是不給你看」，
 * 會讓人可以逐號試出單號總量。師傅點自己的單永遠不會走到這裡。
 */
export function denyIfNotAssignee(
  session: Session,
  assignedTo: string | null | undefined,
): NextResponse | null {
  if (session.role === "admin") return null;
  const owner = (assignedTo ?? "").trim();
  const me = session.displayName.trim();
  // owner 為空（未指派）時也擋：未指派的單不屬於任何師傅
  if (owner && me && owner === me) return null;
  return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}
