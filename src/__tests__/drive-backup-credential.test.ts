import { describe, expect, it, vi } from "vitest";

import {
  DRIVE_AUTH_REVOKED_REASON,
  DRIVE_NOT_CONNECTED_REASON,
  DRIVE_TOKEN_UNREADABLE_REASON,
  KEEP_LAST_N,
  isInvalidGrantError,
  resolveDriveAccess,
  selectBackupsToPrune,
  type StoredDriveConnection,
} from "@/lib/drive-backup-credential";

function stored(over: Partial<StoredDriveConnection> = {}): StoredDriveConnection {
  return {
    status: "active",
    email: "owner@gmail.com",
    encryptedRefreshToken: "v1.enc",
    connectedAt: "2026-11-01T00:00:00.000Z",
    refreshTokenExpiresAt: "",
    invalidatedAt: "",
    invalidReason: "",
    ...over,
  };
}

function deps(over: Partial<Parameters<typeof resolveDriveAccess<string>>[0]> = {}) {
  return {
    load: vi.fn(async () => stored()),
    decrypt: vi.fn((): string | null => "1//rt"),
    refresh: vi.fn(async () => "drive-client"),
    markInvalid: vi.fn(async () => {}),
    ...over,
  };
}

describe("resolveDriveAccess — 用哪個身分上傳", () => {
  it("有有效授權：用解密後的 refresh token 換 client", async () => {
    const d = deps();
    const r = await resolveDriveAccess(d);
    expect(r).toEqual({ ok: true, auth: "drive-client", email: "owner@gmail.com" });
    expect(d.refresh).toHaveBeenCalledWith("1//rt");
    expect(d.markInvalid).not.toHaveBeenCalled();
  });

  it("尚未連結：回明確的中文原因，不打 Google", async () => {
    const d = deps({ load: vi.fn(async () => null) });
    const r = await resolveDriveAccess(d);
    expect(r).toEqual({ ok: false, code: "not_connected", reason: DRIVE_NOT_CONNECTED_REASON });
    expect(DRIVE_NOT_CONNECTED_REASON).toContain("連結 Google Drive");
    expect(d.refresh).not.toHaveBeenCalled();
  });

  it("Google 回 invalid_grant：標記失效並回「授權已失效」", async () => {
    const err = Object.assign(new Error("invalid_grant"), {
      response: { data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } },
    });
    const d = deps({ refresh: vi.fn(async () => { throw err; }) });
    const r = await resolveDriveAccess(d);
    expect(r).toEqual({ ok: false, code: "revoked", reason: DRIVE_AUTH_REVOKED_REASON });
    expect(d.markInvalid).toHaveBeenCalledWith(DRIVE_AUTH_REVOKED_REASON);
  });

  it("已標記失效：不再打 Google，直接請人重新連結", async () => {
    const d = deps({ load: vi.fn(async () => stored({ status: "invalid" })) });
    const r = await resolveDriveAccess(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(DRIVE_AUTH_REVOKED_REASON);
    expect(d.refresh).not.toHaveBeenCalled();
  });

  it("解不開（AUTH_SECRET 換過）：標記失效並說明原因", async () => {
    const d = deps({ decrypt: vi.fn(() => null) });
    const r = await resolveDriveAccess(d);
    expect(r).toEqual({ ok: false, code: "unreadable", reason: DRIVE_TOKEN_UNREADABLE_REASON });
    expect(d.markInvalid).toHaveBeenCalledWith(DRIVE_TOKEN_UNREADABLE_REASON);
    expect(d.refresh).not.toHaveBeenCalled();
  });

  it("暫時性錯誤（網路）：往外丟、不標失效，下次排程再試", async () => {
    const d = deps({ refresh: vi.fn(async () => { throw new Error("ECONNRESET"); }) });
    await expect(resolveDriveAccess(d)).rejects.toThrow("ECONNRESET");
    expect(d.markInvalid).not.toHaveBeenCalled();
  });
});

describe("isInvalidGrantError", () => {
  it("認得 gaxios 回應裡的 invalid_grant 與訊息字串", () => {
    expect(isInvalidGrantError({ response: { data: { error: "invalid_grant" } } })).toBe(true);
    expect(isInvalidGrantError(new Error("invalid_grant"))).toBe(true);
    expect(isInvalidGrantError(new Error("socket hang up"))).toBe(false);
    expect(isInvalidGrantError(null)).toBe(false);
  });
});

describe("selectBackupsToPrune — 保留份數不變", () => {
  it("保留最新 90 份，刪掉其餘", () => {
    expect(KEEP_LAST_N).toBe(90);
    const files = Array.from({ length: 95 }, (_, i) => ({ id: `f${i}` }));
    const pruned = selectBackupsToPrune(files);
    expect(pruned.map((f) => f.id)).toEqual(["f90", "f91", "f92", "f93", "f94"]);
  });

  it("不到 90 份時一份都不刪", () => {
    expect(selectBackupsToPrune([{ id: "a" }, { id: "b" }])).toEqual([]);
  });
});
