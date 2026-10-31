import crypto from "crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

const SECRET = "s".repeat(40);

let auth: typeof import("@/lib/auth");

beforeAll(async () => {
  // auth.ts 在載入時讀 AUTH_SECRET，要先設好再 import
  vi.stubEnv("AUTH_SECRET", SECRET);
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.resetModules();
  auth = await import("@/lib/auth");
});

function decode(state: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(state, "base64url").toString("utf-8")) as Record<string, unknown>;
}
function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function hmac(input: string): string {
  return crypto.createHmac("sha256", SECRET).update(input).digest("base64url");
}

describe("OAuth state — 登入流程維持原樣", () => {
  it("登入 state 解析為 login，returnTo 保留", () => {
    const state = auth.buildSignedState("/orders?x=1");
    expect(auth.verifySignedState(state)).toEqual({ returnTo: "/orders?x=1", purpose: "login", boundEmail: "" });
  });

  it("登入 state 的內容與改版前相同：沒有 purpose 欄位，簽章原文是 ts:nonce:returnTo", () => {
    const decoded = decode(auth.buildSignedState("/a"));
    expect(Object.keys(decoded)).toEqual(["nonce", "ts", "sig", "returnTo"]);
    expect(decoded.sig).toBe(hmac(`${decoded.ts}:${decoded.nonce}:/a`));
  });

  it("改版前格式手工簽的 state 仍可通過（已發出的登入連結不受影響）", () => {
    const ts = Math.floor(Date.now() / 1000);
    const state = encode({ nonce: "n1", ts, sig: hmac(`${ts}:n1:/x`), returnTo: "/x" });
    expect(auth.verifySignedState(state)).toEqual({ returnTo: "/x", purpose: "login", boundEmail: "" });
  });

  it("returnTo 被竄改就拒絕", () => {
    const decoded = decode(auth.buildSignedState("/a"));
    expect(auth.verifySignedState(encode({ ...decoded, returnTo: "/b" }))).toBeNull();
  });

  it("過期 state 拒絕", () => {
    const ts = Math.floor(Date.now() / 1000) - 601;
    const state = encode({ nonce: "n1", ts, sig: hmac(`${ts}:n1:/x`), returnTo: "/x" });
    expect(auth.verifySignedState(state)).toBeNull();
  });
});

describe("OAuth state — Drive 備份用途", () => {
  it("drive-backup state 解析為 drive-backup，並帶回綁定的發起者 email（小寫）", () => {
    const state = auth.buildSignedState("/settings?tab=maintenance", "drive-backup", "Boss@Example.com");
    expect(auth.verifySignedState(state)).toEqual({
      returnTo: "/settings?tab=maintenance",
      purpose: "drive-backup",
      boundEmail: "boss@example.com",
    });
  });

  it("drive-backup state 簽章原文含綁定 email", () => {
    const decoded = decode(auth.buildSignedState("/s", "drive-backup", "boss@example.com"));
    expect(decoded.sig).toBe(hmac(`purpose:drive-backup:boss@example.com:${decoded.ts}:${decoded.nonce}:/s`));
  });

  it("竄改綁定的 email 會讓簽章失效", () => {
    const decoded = decode(auth.buildSignedState("/s", "drive-backup", "boss@example.com"));
    expect(auth.verifySignedState(encode({ ...decoded, email: "attacker@example.com" }))).toBeNull();
    expect(auth.verifySignedState(encode({ ...decoded, email: "" }))).toBeNull();
  });

  it("drive-backup state 不綁 email 就不發", () => {
    expect(() => auth.buildSignedState("/s", "drive-backup")).toThrow();
  });

  it("把登入 state 加上 purpose 欄位不會變成 drive-backup（簽章不符）", () => {
    const decoded = decode(auth.buildSignedState("/a"));
    expect(auth.verifySignedState(encode({ ...decoded, purpose: "drive-backup" }))).toBeNull();
  });

  it("把 drive-backup state 的 purpose 拿掉不會變成登入", () => {
    const decoded = decode(auth.buildSignedState("/a", "drive-backup", "boss@example.com"));
    delete decoded.purpose;
    expect(auth.verifySignedState(encode(decoded))).toBeNull();
  });

  it("沒簽章／亂簽的 drive-backup state 拒絕", () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(auth.verifySignedState(encode({ nonce: "n", ts, returnTo: "/", purpose: "drive-backup" }))).toBeNull();
    expect(
      auth.verifySignedState(encode({ nonce: "n", ts, sig: "forged", returnTo: "/", purpose: "drive-backup" })),
    ).toBeNull();
    // 用登入格式的原文去簽，也不算 drive-backup 的簽章
    expect(
      auth.verifySignedState(
        encode({ nonce: "n", ts, sig: hmac(`${ts}:n:/`), returnTo: "/", purpose: "drive-backup", email: "boss@example.com" }),
      ),
    ).toBeNull();
  });

  it("別的密鑰簽的 drive-backup state 拒絕", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto
      .createHmac("sha256", "other".repeat(10))
      .update(`purpose:drive-backup:${ts}:n:/`)
      .digest("base64url");
    expect(auth.verifySignedState(encode({ nonce: "n", ts, sig, returnTo: "/", purpose: "drive-backup" }))).toBeNull();
  });

  it("認不得的 purpose 一律拒絕", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = hmac(`purpose:admin:${ts}:n:/`);
    expect(auth.verifySignedState(encode({ nonce: "n", ts, sig, returnTo: "/", purpose: "admin" }))).toBeNull();
  });

  it("Drive 連結 URL 只要 drive.file，且要長期授權", () => {
    const url = new URL(auth.buildGoogleDriveConnectUrl("st"));
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file openid email");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toContain("consent");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("state")).toBe("st");
  });

  it("登入 URL 不受影響：仍是 online、不含 Drive scope", () => {
    const url = new URL(auth.buildGoogleAuthUrl("st"));
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("access_type")).toBe("online");
  });
});
