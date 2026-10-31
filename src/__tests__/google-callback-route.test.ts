import { NextResponse } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/lib/types";

const exchangeGoogleCode = vi.hoisted(() => vi.fn());
const exchangeGoogleCodeForDrive = vi.hoisted(() => vi.fn());
const requireAdmin = vi.hoisted(() => vi.fn());
const saveDriveConnection = vi.hoisted(() => vi.fn());
const appendAuditLog = vi.hoisted(() => vi.fn());
const findUserByEmail = vi.hoisted(() => vi.fn());
const countActiveAdmins = vi.hoisted(() => vi.fn());
const createUser = vi.hoisted(() => vi.fn());

// 簽 state／session 用真的實作，只把打 Google 的部分換掉
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, exchangeGoogleCode, exchangeGoogleCodeForDrive };
});
vi.mock("@/lib/api-auth", () => ({ requireAdmin }));
vi.mock("@/lib/drive-backup-auth", () => ({ saveDriveConnection }));
vi.mock("@/lib/audit-log", () => ({ appendAuditLog }));
vi.mock("@/lib/users-sheet", () => ({ findUserByEmail, countActiveAdmins, createUser }));

let GET: (request: Request) => Promise<Response>;
let auth: typeof import("@/lib/auth");

beforeAll(async () => {
  vi.stubEnv("AUTH_SECRET", "s".repeat(40));
  vi.resetModules();
  auth = await import("@/lib/auth");
  ({ GET } = await import("@/app/api/auth/callback/google/route"));
});

const ADMIN: Session = {
  userId: "U001",
  email: "boss@example.com",
  displayName: "老闆",
  role: "admin",
  iat: 0,
  exp: 9e9,
};

function callback(params: Record<string, string>, cookie = "cq_session=existing"): Request {
  const url = new URL("https://app.test/api/auth/callback/google");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { headers: { cookie } });
}

beforeEach(() => {
  for (const fn of [exchangeGoogleCode, exchangeGoogleCodeForDrive, requireAdmin, saveDriveConnection,
    appendAuditLog, findUserByEmail, countActiveAdmins, createUser]) fn.mockReset();
  requireAdmin.mockResolvedValue({ session: ADMIN });
  saveDriveConnection.mockResolvedValue(undefined);
});

describe("callback — 登入流程不變", () => {
  it("登入 state：換 code、查使用者、簽 session cookie、導回 returnTo", async () => {
    exchangeGoogleCode.mockResolvedValue({ email: "staff@example.com", name: "員工", picture: "" });
    findUserByEmail.mockResolvedValue({
      userId: "U002", email: "staff@example.com", displayName: "員工", role: "technician",
    });
    const state = auth.buildSignedState("/orders");
    const res = await GET(callback({ code: "c1", state }));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/orders");
    expect(res.headers.get("set-cookie")).toContain("cq_session=");
    expect(exchangeGoogleCode).toHaveBeenCalledWith("c1");
    expect(exchangeGoogleCodeForDrive).not.toHaveBeenCalled();
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(saveDriveConnection).not.toHaveBeenCalled();
  });

  it("沒有 code 時仍導去登入頁 missing_code", async () => {
    const res = await GET(callback({ state: auth.buildSignedState("/") }));
    expect(res.headers.get("location")).toBe("https://app.test/login?error=missing_code");
  });

  it("state 偽造時導去登入頁 invalid_state，什麼都不換", async () => {
    const res = await GET(callback({ code: "c", state: "garbage" }));
    expect(res.headers.get("location")).toBe("https://app.test/login?error=invalid_state");
    expect(exchangeGoogleCode).not.toHaveBeenCalled();
    expect(exchangeGoogleCodeForDrive).not.toHaveBeenCalled();
  });

  it("使用者表沒有這個人 → unauthorized", async () => {
    exchangeGoogleCode.mockResolvedValue({ email: "x@example.com", name: "", picture: "" });
    findUserByEmail.mockResolvedValue(null);
    countActiveAdmins.mockResolvedValue(1);
    const res = await GET(callback({ code: "c", state: auth.buildSignedState("/") }));
    expect(res.headers.get("location")).toBe("https://app.test/login?error=unauthorized");
  });
});

describe("callback — Drive 備份分支", () => {
  const driveState = (email = "boss@example.com") =>
    auth.buildSignedState("/settings?tab=maintenance", "drive-backup", email);

  it("state 綁定的 admin 與目前 session 不同人：forbidden，不換 code", async () => {
    const res = await GET(callback({ code: "c9", state: driveState("other-admin@example.com") }));
    expect(res.headers.get("location")).toBe("https://app.test/settings?tab=maintenance&drive=forbidden");
    expect(exchangeGoogleCodeForDrive).not.toHaveBeenCalled();
    expect(saveDriveConnection).not.toHaveBeenCalled();
  });

  it("email 大小寫不同仍視為同一人", async () => {
    exchangeGoogleCodeForDrive.mockResolvedValue({
      ok: true, email: "owner@gmail.com", refreshToken: "rt", refreshTokenExpiresIn: null,
    });
    requireAdmin.mockResolvedValue({ session: { ...ADMIN, email: "Boss@Example.com" } });
    const res = await GET(callback({ code: "c", state: driveState("boss@example.com") }));
    expect(res.headers.get("location")).toContain("drive=connected");
  });

  it("admin 連結成功：存授權、導回設定頁、不碰 session cookie、不走登入", async () => {
    exchangeGoogleCodeForDrive.mockResolvedValue({
      ok: true, email: "owner@gmail.com", refreshToken: "1//rt", refreshTokenExpiresIn: 604799,
    });
    const res = await GET(callback({ code: "c2", state: driveState() }));

    expect(res.headers.get("location")).toBe(
      "https://app.test/settings?tab=maintenance&drive=connected",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(saveDriveConnection).toHaveBeenCalledWith({
      email: "owner@gmail.com", refreshToken: "1//rt", refreshTokenExpiresIn: 604799,
    });
    expect(exchangeGoogleCode).not.toHaveBeenCalled();
    expect(findUserByEmail).not.toHaveBeenCalled();
    // 稽核紀錄不能出現 token
    expect(JSON.stringify(appendAuditLog.mock.calls)).not.toContain("1//rt");
  });

  it("目前 session 不是 admin：不換 code、不存，導回 forbidden", async () => {
    requireAdmin.mockResolvedValue({
      denied: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const res = await GET(callback({ code: "c3", state: driveState() }));
    expect(res.headers.get("location")).toBe("https://app.test/settings?tab=maintenance&drive=forbidden");
    expect(exchangeGoogleCodeForDrive).not.toHaveBeenCalled();
    expect(saveDriveConnection).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("Google 沒給 drive.file 權限：導回 scope_missing，不存", async () => {
    exchangeGoogleCodeForDrive.mockResolvedValue({ ok: false, reason: "scope_missing" });
    const res = await GET(callback({ code: "c", state: driveState() }));
    expect(res.headers.get("location")).toContain("drive=scope_missing");
    expect(saveDriveConnection).not.toHaveBeenCalled();
  });

  it("存檔失敗：導回 save_failed", async () => {
    exchangeGoogleCodeForDrive.mockResolvedValue({
      ok: true, email: "o@gmail.com", refreshToken: "rt", refreshTokenExpiresIn: null,
    });
    saveDriveConnection.mockRejectedValue(new Error("sheets down"));
    const res = await GET(callback({ code: "c", state: driveState() }));
    expect(res.headers.get("location")).toContain("drive=save_failed");
  });

  it("在同意畫面按取消（沒有 code）：導回設定頁 denied，不是登入頁", async () => {
    const res = await GET(callback({ error: "access_denied", state: driveState() }));
    expect(res.headers.get("location")).toBe("https://app.test/settings?tab=maintenance&drive=denied");
    expect(requireAdmin).not.toHaveBeenCalled();
  });
});
