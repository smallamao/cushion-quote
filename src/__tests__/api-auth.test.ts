import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Session, UserRole } from "@/lib/types";

const verifySession = vi.hoisted(() => vi.fn<(t?: string | null) => Session | null>());
type Lookup = { unavailable: boolean; status?: { isActive: boolean; role: UserRole; displayName: string } };
const getUserStatus = vi.hoisted(() => vi.fn<(e: string) => Promise<Lookup>>());

vi.mock("@/lib/auth", () => ({ SESSION_COOKIE_NAME: "cq_session", verifySession }));
vi.mock("@/lib/user-status", () => ({ getUserStatus }));

const { getSession, requireAdmin, requireSession, denyIfNotAssignee } = await import(
  "@/lib/api-auth"
);

function req(cookie?: string): Request {
  return new Request("https://x.test/api/sheets/orders", {
    headers: cookie ? { cookie } : {},
  });
}

function session(over: Partial<Session> = {}): Session {
  return {
    userId: "U001",
    email: "boss@example.com",
    displayName: "老闆",
    role: "admin",
    iat: 0,
    exp: 9e9,
    ...over,
  };
}

beforeEach(() => {
  verifySession.mockReset();
  getUserStatus.mockReset();
  getUserStatus.mockResolvedValue({ unavailable: false, status: { isActive: true, role: "admin", displayName: "老闆" } });
});

describe("getSession — cookie 解析", () => {
  it("沒有 cookie header 回 null，不會丟錯", () => {
    expect(getSession(req())).toBeNull();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("有其他 cookie 時仍挑得出自己那個", () => {
    verifySession.mockReturnValue(session());
    getSession(req("_ga=123; cq_session=abc.def; other=x"));
    expect(verifySession).toHaveBeenCalledWith("abc.def");
  });

  it("憑證含 '=' 也不會被截斷（不是用 split(\"=\")[1]）", () => {
    verifySession.mockReturnValue(session());
    getSession(req("cq_session=aGVsbG8=.c2ln=="));
    expect(verifySession).toHaveBeenCalledWith("aGVsbG8=.c2ln==");
  });

  it("名稱前綴相似的 cookie 不會被誤認", () => {
    verifySession.mockReturnValue(session());
    expect(getSession(req("cq_session_old=zzz"))).toBeNull();
  });
});

describe("requireSession — 在職檢查", () => {
  it("未登入回 401", async () => {
    verifySession.mockReturnValue(null);
    const guard = await requireSession(req("cq_session=bad"));
    expect(guard.denied?.status).toBe(401);
  });

  it("已停用帳號回 401，即使憑證本身有效", async () => {
    verifySession.mockReturnValue(session());
    getUserStatus.mockResolvedValue({ unavailable: false, status: { isActive: false, role: "admin", displayName: "老闆" } });
    const guard = await requireSession(req("cq_session=ok"));
    expect(guard.denied?.status).toBe(401);
  });

  it("角色以使用者表為準，不信憑證裡的值（降權立刻生效）", async () => {
    verifySession.mockReturnValue(session({ role: "admin" }));
    getUserStatus.mockResolvedValue({ unavailable: false, status: { isActive: true, role: "technician", displayName: "老闆" } });
    const guard = await requireSession(req("cq_session=ok"));
    expect(guard.session?.role).toBe("technician");
  });

  it("帳號已從使用者表刪除 → 401（表讀得到，只是沒有這個人）", async () => {
    // 🔴 第二輪稽核抓到的缺陷：原本這裡期望「放行」，等於用測試把 bug 寫死。
    //    被刪掉的帳號能繼續用，前一天修的「停用立刻生效」在刪除這條路上沒生效。
    verifySession.mockReturnValue(session({ role: "admin" }));
    getUserStatus.mockResolvedValue({ unavailable: false });
    const guard = await requireSession(req("cq_session=ok"));
    expect(guard.denied?.status).toBe(401);
  });

  it("憑證裡沒有 email → 401（無法歸戶就不放行）", async () => {
    verifySession.mockReturnValue(session({ email: "" }));
    getUserStatus.mockResolvedValue({ unavailable: false });
    const guard = await requireSession(req("cq_session=ok"));
    expect(guard.denied?.status).toBe(401);
  });

  it("Sheets 整個讀不到時沿用憑證（故障不等於全公司停工）", async () => {
    verifySession.mockReturnValue(session({ role: "admin" }));
    getUserStatus.mockResolvedValue({ unavailable: true });
    const guard = await requireSession(req("cq_session=ok"));
    expect(guard.denied).toBeUndefined();
    expect(guard.session?.role).toBe("admin");
  });
});

describe("requireAdmin", () => {
  it("admin 通過", async () => {
    verifySession.mockReturnValue(session({ role: "admin" }));
    const guard = await requireAdmin(req("cq_session=ok"));
    expect(guard.denied).toBeUndefined();
  });

  it("技師回 403", async () => {
    verifySession.mockReturnValue(session({ role: "technician" }));
    getUserStatus.mockResolvedValue({ unavailable: false, status: { isActive: true, role: "technician", displayName: "師傅" } });
    const guard = await requireAdmin(req("cq_session=ok"));
    expect(guard.denied?.status).toBe(403);
  });

  it("憑證寫 admin 但表上已降為技師 → 403", async () => {
    verifySession.mockReturnValue(session({ role: "admin" }));
    getUserStatus.mockResolvedValue({ unavailable: false, status: { isActive: true, role: "technician", displayName: "師傅" } });
    const guard = await requireAdmin(req("cq_session=ok"));
    expect(guard.denied?.status).toBe(403);
  });

  it("未登入回 401 而不是 403", async () => {
    verifySession.mockReturnValue(null);
    const guard = await requireAdmin(req());
    expect(guard.denied?.status).toBe(401);
  });
});

describe("denyIfNotAssignee — 水平越權", () => {
  it("admin 一律通過", () => {
    expect(denyIfNotAssignee(session({ role: "admin" }), "別的師傅")).toBeNull();
  });

  it("師傅看自己的單通過", () => {
    expect(denyIfNotAssignee(session({ role: "technician", displayName: "阿明" }), "阿明")).toBeNull();
  });

  it("師傅看別人的單回 404（不是 403——403 等於確認單號存在）", () => {
    const res = denyIfNotAssignee(session({ role: "technician", displayName: "阿明" }), "阿華");
    expect(res?.status).toBe(404);
  });

  it("未指派的單師傅也看不到", () => {
    expect(denyIfNotAssignee(session({ role: "technician", displayName: "阿明" }), "")?.status).toBe(404);
    expect(denyIfNotAssignee(session({ role: "technician", displayName: "阿明" }), null)?.status).toBe(404);
  });

  it("師傅自己沒有名字時一律擋掉（不可變成「全部通過」）", () => {
    expect(denyIfNotAssignee(session({ role: "technician", displayName: "" }), "")?.status).toBe(404);
  });

  it("前後空白不影響比對", () => {
    expect(denyIfNotAssignee(session({ role: "technician", displayName: " 阿明 " }), "阿明 ")).toBeNull();
  });
});

describe("agent 身分 — x-api-key（2026-10-15 安全稽核後補）", () => {
  function agentReq(key?: string): Request {
    return new Request("https://x.test/api/sheets/cases", {
      headers: key ? { "x-api-key": key } : {},
    });
  }

  it("帶正確的 x-api-key 就放行，不需要 cookie", async () => {
    vi.stubEnv("AGENT_API_KEY", "secret-key");
    const guard = await requireAdmin(agentReq("secret-key"));
    expect(guard.denied).toBeUndefined();
    expect(guard.session?.email).toBe("agent@internal");
    expect(guard.session?.role).toBe("admin");
    vi.unstubAllEnvs();
  });

  it("agent 不查使用者表（它不在表裡，查了會被判 account_not_found）", async () => {
    vi.stubEnv("AGENT_API_KEY", "secret-key");
    getUserStatus.mockResolvedValue({ unavailable: false, status: undefined });
    const guard = await requireAdmin(agentReq("secret-key"));
    expect(guard.denied).toBeUndefined();
    expect(getUserStatus).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("key 不對就擋掉，不會退回成一般 session", async () => {
    vi.stubEnv("AGENT_API_KEY", "secret-key");
    verifySession.mockReturnValue(null);
    const guard = await requireAdmin(agentReq("wrong-key"));
    expect(guard.denied?.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("AGENT_API_KEY 沒設定時，x-api-key 一律無效", async () => {
    vi.stubEnv("AGENT_API_KEY", "");
    verifySession.mockReturnValue(null);
    const guard = await requireAdmin(agentReq("any-key"));
    expect(guard.denied?.status).toBe(401);
    vi.unstubAllEnvs();
  });
});
