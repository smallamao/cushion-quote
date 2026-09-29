import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  signDispatchToken,
  verifyDispatchToken,
  buildDispatchPath,
} from "@/lib/dispatch-link";

// dispatch-link 在每次呼叫時讀 process.env，故測試直接改 env 即可。
const ORIG = { ...process.env };

describe("dispatch-link", () => {
  beforeEach(() => {
    delete process.env.DISPATCH_LINK_SECRET;
    process.env.AUTH_SECRET = "test-secret-abc";
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it("同一 serviceId 的簽章可被驗證通過（round-trip）", () => {
    const sig = signDispatchToken("AS-20260925-01");
    expect(sig).toBeTruthy();
    expect(verifyDispatchToken("AS-20260925-01", sig as string)).toBe(true);
  });

  it("簽章長度為 32 字", () => {
    expect((signDispatchToken("AS-1") as string).length).toBe(32);
  });

  it("竄改簽章會被拒絕", () => {
    const sig = signDispatchToken("AS-20260925-01") as string;
    const tampered = `${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
    expect(verifyDispatchToken("AS-20260925-01", tampered)).toBe(false);
  });

  it("換 serviceId 後舊簽章無效", () => {
    const sig = signDispatchToken("AS-20260925-01") as string;
    expect(verifyDispatchToken("AS-20260925-02", sig)).toBe(false);
  });

  it("長度不符的簽章不會丟例外，回 false", () => {
    expect(() => verifyDispatchToken("AS-1", "short")).not.toThrow();
    expect(verifyDispatchToken("AS-1", "short")).toBe(false);
  });

  it("buildDispatchPath 產出 /dispatch/{id}/{sig}", () => {
    const path = buildDispatchPath("AS-20260925-01") as string;
    expect(path).toMatch(/^\/dispatch\/AS-20260925-01\/[A-Za-z0-9_-]{32}$/);
  });

  it("DISPATCH_LINK_SECRET 優先於 AUTH_SECRET（兩者簽出不同值）", () => {
    const withAuth = signDispatchToken("AS-1");
    process.env.DISPATCH_LINK_SECRET = "dedicated-secret-xyz";
    const withDedicated = signDispatchToken("AS-1");
    expect(withDedicated).toBeTruthy();
    expect(withDedicated).not.toBe(withAuth);
    expect(verifyDispatchToken("AS-1", withDedicated as string)).toBe(true);
    expect(verifyDispatchToken("AS-1", withAuth as string)).toBe(false);
  });

  it("未設定任何密鑰時，一律回 null / false（fail-closed）", () => {
    delete process.env.AUTH_SECRET;
    delete process.env.DISPATCH_LINK_SECRET;
    expect(signDispatchToken("AS-1")).toBeNull();
    expect(buildDispatchPath("AS-1")).toBeNull();
    expect(verifyDispatchToken("AS-1", "whatever")).toBe(false);
  });
});
