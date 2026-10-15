import "server-only";

import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { getUserStatus } from "@/lib/user-status";
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

/**
 * 要求已登入，並且這個帳號「現在」還是在職狀態。未登入或已停用回 401。
 *
 * 🔴 2026-10-15 弱點分析第 2 項：憑證有效期 30 天，而簽發後系統再也不去查這個人
 *    還在不在職、角色有沒有變。師傅離職、老闆按下「停用」之後，他手機裡那張憑證
 *    照樣能登入最長 30 天，看得到客戶姓名電話地址。
 *
 *    現在每次驗證都查一次使用者表（60 秒快取），並且**用表上的角色覆蓋憑證裡的
 *    角色**——降權才會立刻生效，而不是等 30 天。
 *
 * 查不到這個 email 時的處理（刻意分兩種——2026-10-15 第二輪稽核抓到，原本兩種
 * 都回 null、都放行，等於帳號刪掉還能用；註解寫了一套、程式做的是另一套）：
 *   - 使用者表讀得到，但表上沒有這個人 → 拒絕。帳號被刪掉、email 被改掉就該進不來。
 *   - 使用者表整個讀不到（Sheets 故障且無快取）→ 放行，並在 log 留下記錄。
 *     理由：middleware 已經驗過 HMAC 簽章，這個人確實曾經正常登入過；
 *     這時候拒絕等於「Google 打嗝 = 全公司停工」，代價不對等。
 *     殘留風險只有「剛被停用的人」，而且只在 Sheets 故障期間。
 */
export async function requireSession(request: Request): Promise<Guard> {
  const session = getSession(request);
  if (!session) {
    return {
      denied: NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 }),
    };
  }

  const lookup = await getUserStatus(session.email);

  // Sheets 整個讀不到（且無快取）→ 沿用憑證放行。middleware 已驗過 HMAC 簽章，
  // 這人確實正常登入過；這時拒絕等於「Google 打嗝 = 全公司停工」，代價不對等。
  if (lookup.unavailable) return { session };

  // 表讀得到但沒有這個人 → 拒絕。帳號被刪掉、或 email 被改掉，就該進不來。
  if (!lookup.status) {
    return {
      denied: NextResponse.json({ ok: false, error: "account_not_found" }, { status: 401 }),
    };
  }

  if (!lookup.status.isActive) {
    return {
      denied: NextResponse.json({ ok: false, error: "account_disabled" }, { status: 401 }),
    };
  }

  // 角色以使用者表為準，不信憑證裡的值
  return { session: { ...session, role: lookup.status.role } };
}

/** 要求 admin。未登入／已停用回 401，角色不符回 403。角色取自使用者表。 */
export async function requireAdmin(request: Request): Promise<Guard> {
  const guard = await requireSession(request);
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

/**
 * 取得「現在仍然有效」的 session：驗簽章 ＋ 查使用者表的在職狀態，角色以表為準。
 * 已停用或表上查不到這個人時回 null。給那些自己判斷角色、不想用 Guard 的呼叫端用。
 */
export async function getActiveSession(request: Request): Promise<Session | null> {
  const guard = await requireSession(request);
  return guard.denied ? null : guard.session;
}
