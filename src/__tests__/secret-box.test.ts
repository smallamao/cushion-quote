import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/secret-box";

const KEY = "k".repeat(40);

describe("secret-box — refresh token 加密", () => {
  it("加密後解得回原文", () => {
    const blob = encryptSecret("1//refresh-token-值", KEY);
    expect(decryptSecret(blob, KEY)).toBe("1//refresh-token-值");
  });

  it("密文裡看不到原文，且每次加密結果不同（隨機 IV）", () => {
    const a = encryptSecret("1//abc", KEY);
    const b = encryptSecret("1//abc", KEY);
    expect(a).not.toContain("1//abc");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
  });

  it("密文被改過一個字就解不開（回 null，不丟錯）", () => {
    const blob = encryptSecret("1//abc", KEY);
    const parts = blob.split(".");
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] ^= 0x01;
    parts[3] = ct.toString("base64url");
    expect(decryptSecret(parts.join("."), KEY)).toBeNull();
  });

  it("authTag 被換掉也解不開", () => {
    const blob = encryptSecret("1//abc", KEY);
    const parts = blob.split(".");
    parts[2] = Buffer.alloc(16).toString("base64url");
    expect(decryptSecret(parts.join("."), KEY)).toBeNull();
  });

  it("金鑰不對解不開（AUTH_SECRET 換過）", () => {
    const blob = encryptSecret("1//abc", KEY);
    expect(decryptSecret(blob, "z".repeat(40))).toBeNull();
  });

  it("格式不對（版本、段數）回 null", () => {
    expect(decryptSecret("", KEY)).toBeNull();
    expect(decryptSecret("plain-token", KEY)).toBeNull();
    const blob = encryptSecret("1//abc", KEY);
    expect(decryptSecret(blob.replace(/^v1/, "v9"), KEY)).toBeNull();
  });

  it("沒有金鑰時拒絕加密", () => {
    expect(() => encryptSecret("x", "")).toThrow();
  });
});
