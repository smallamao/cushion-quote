import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  signDispatchToken,
  verifyDispatchToken,
  buildDispatchPath,
} from "@/lib/dispatch-link";

/** 複製 lib 內的簽章算式，用來產生「舊版 32 字簽章」驗相容性。 */
function legacySig(serviceId: string, day: number, key: string): string {
  return crypto
    .createHmac("sha256", key)
    .update(`dispatch:${serviceId}:${day}`)
    .digest("base64url")
    .slice(0, 32);
}

// dispatch-link 在每次呼叫時讀 process.env，故測試直接改 env 即可。
const ORIG = { ...process.env };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 29); // 固定基準時間，避免跨日 flaky

describe("dispatch-link", () => {
  beforeEach(() => {
    delete process.env.DISPATCH_LINK_SECRET;
    process.env.AUTH_SECRET = "test-secret-abc";
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it("同一 serviceId 的 token 可被驗證通過（round-trip）", () => {
    const token = signDispatchToken("AS-20260925-01", NOW);
    expect(token).toBeTruthy();
    expect(verifyDispatchToken("AS-20260925-01", token as string, NOW)).toBe(true);
  });

  it("token 格式為 {day36}~{sig}，新簽章 16 字（網址更短）", () => {
    const token = signDispatchToken("AS-1", NOW) as string;
    expect(token).toMatch(/^[0-9a-z]+~[A-Za-z0-9_-]{16}$/);
  });

  it("舊版 32 字簽章仍可驗過（改版前發出的連結不斷線）", () => {
    const day = Math.floor(NOW / DAY);
    const old = `${day.toString(36)}~${legacySig("AS-1", day, "test-secret-abc")}`;
    expect(verifyDispatchToken("AS-1", old, NOW)).toBe(true);
  });

  it("長度非 16/32 的簽章一律拒絕（不可用超短簽章試猜）", () => {
    const token = signDispatchToken("AS-1", NOW) as string;
    const [d, sig] = token.split("~");
    expect(verifyDispatchToken("AS-1", `${d}~${sig.slice(0, 8)}`, NOW)).toBe(false);
    expect(verifyDispatchToken("AS-1", `${d}~${sig.slice(0, 4)}`, NOW)).toBe(false);
  });

  it("竄改簽章會被拒絕", () => {
    const token = signDispatchToken("AS-20260925-01", NOW) as string;
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(verifyDispatchToken("AS-20260925-01", tampered, NOW)).toBe(false);
  });

  it("換 serviceId 後舊 token 無效", () => {
    const token = signDispatchToken("AS-20260925-01", NOW) as string;
    expect(verifyDispatchToken("AS-20260925-02", token, NOW)).toBe(false);
  });

  it("30 天內仍有效", () => {
    const token = signDispatchToken("AS-1", NOW - 29 * DAY) as string;
    expect(verifyDispatchToken("AS-1", token, NOW)).toBe(true);
  });

  it("超過 30 天失效", () => {
    const token = signDispatchToken("AS-1", NOW - 40 * DAY) as string;
    expect(verifyDispatchToken("AS-1", token, NOW)).toBe(false);
  });

  it("未來日（時鐘偏移／竄改）失效", () => {
    const token = signDispatchToken("AS-1", NOW + 5 * DAY) as string;
    expect(verifyDispatchToken("AS-1", token, NOW)).toBe(false);
  });

  it("竄改時間戳（改成今天想續命）會驗不過", () => {
    const token = signDispatchToken("AS-1", NOW - 40 * DAY) as string;
    const today = Math.floor(NOW / DAY).toString(36);
    const forged = `${today}~${token.split("~")[1]}`;
    expect(verifyDispatchToken("AS-1", forged, NOW)).toBe(false);
  });

  it("長度不符 / 格式錯誤的 token 不會丟例外，回 false", () => {
    expect(() => verifyDispatchToken("AS-1", "short", NOW)).not.toThrow();
    expect(verifyDispatchToken("AS-1", "short", NOW)).toBe(false);
    expect(verifyDispatchToken("AS-1", "~abc", NOW)).toBe(false);
    expect(verifyDispatchToken("AS-1", "zz~", NOW)).toBe(false);
  });

  it("buildDispatchPath 產出短路徑 /w/{id}/{day36}~{sig}", () => {
    const path = buildDispatchPath("AS-20260925-01") as string;
    expect(path).toMatch(/^\/w\/AS-20260925-01\/[0-9a-z]+~[A-Za-z0-9_-]{16}$/);
  });

  it("DISPATCH_LINK_SECRET 優先於 AUTH_SECRET（兩者簽出不同值）", () => {
    const withAuth = signDispatchToken("AS-1", NOW);
    process.env.DISPATCH_LINK_SECRET = "dedicated-secret-xyz";
    const withDedicated = signDispatchToken("AS-1", NOW);
    expect(withDedicated).toBeTruthy();
    expect(withDedicated).not.toBe(withAuth);
    expect(verifyDispatchToken("AS-1", withDedicated as string, NOW)).toBe(true);
    expect(verifyDispatchToken("AS-1", withAuth as string, NOW)).toBe(false);
  });

  it("未設定任何密鑰時，一律回 null / false（fail-closed）", () => {
    delete process.env.AUTH_SECRET;
    delete process.env.DISPATCH_LINK_SECRET;
    expect(signDispatchToken("AS-1", NOW)).toBeNull();
    expect(buildDispatchPath("AS-1")).toBeNull();
    expect(verifyDispatchToken("AS-1", "whatever", NOW)).toBe(false);
  });
});
