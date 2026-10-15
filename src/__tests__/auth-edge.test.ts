import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { MIN_SECRET_LEN, verifySessionEdge } from "@/lib/auth-edge";

// 守門程式（Edge）與 API（Node）必須對同一個憑證做出相同判斷，
// 否則不是放行偽造憑證，就是把所有人鎖在外面。
const SECRET = "test-secret-for-session-signing-1234567890";

/** 與 lib/auth.ts 的 signSession 同一套格式 */
function sign(payload: Record<string, unknown>, secret = SECRET): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const future = () => Math.floor(Date.now() / 1000) + 3600;

describe("verifySessionEdge", () => {
  it("接受正確簽章的憑證", async () => {
    const s = await verifySessionEdge(sign({ role: "admin", exp: future() }), SECRET);
    expect(s?.role).toBe("admin");
  });

  it("🔴 擋下偽造的憑證——這就是修補前任何人都能變管理員的手法", async () => {
    // 自己手寫 payload、不附任何簽章
    const body = Buffer.from(JSON.stringify({ role: "admin", exp: future() })).toString("base64url");
    expect(await verifySessionEdge(body, SECRET)).toBeNull();                 // 沒有簽章
    expect(await verifySessionEdge(`${body}.`, SECRET)).toBeNull();           // 空簽章
    expect(await verifySessionEdge(`${body}.whatever`, SECRET)).toBeNull();   // 亂填簽章
  });

  it("擋下用別的密鑰簽的憑證", async () => {
    const t = sign({ role: "admin", exp: future() }, "another-secret");
    expect(await verifySessionEdge(t, SECRET)).toBeNull();
  });

  it("擋下內容被竄改的憑證（技師偷改成管理員）", async () => {
    const good = sign({ role: "technician", exp: future() });
    const [, sig] = good.split(".");
    const tampered =
      Buffer.from(JSON.stringify({ role: "admin", exp: future() })).toString("base64url") + "." + sig;
    expect(await verifySessionEdge(tampered, SECRET)).toBeNull();
  });

  it("擋下過期憑證", async () => {
    const t = sign({ role: "admin", exp: Math.floor(Date.now() / 1000) - 10 });
    expect(await verifySessionEdge(t, SECRET)).toBeNull();
  });

  it("沒有設定密鑰時一律擋下，不可無聲放行", async () => {
    const t = sign({ role: "admin", exp: future() });
    expect(await verifySessionEdge(t, undefined)).toBeNull();
    expect(await verifySessionEdge(t, "")).toBeNull();
  });

  it("格式不對一律擋下", async () => {
    for (const bad of ["", "abc", "a.b.c", "....", "不是憑證"]) {
      expect(await verifySessionEdge(bad, SECRET)).toBeNull();
    }
  });
});

describe("Edge 與 Node 兩邊判斷一致", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodeVerify: (t: string | undefined | null) => any;
  beforeAll(async () => {
    process.env.AUTH_SECRET = SECRET;
    nodeVerify = (await import("@/lib/auth")).verifySession;
  });

  it("同一批憑證，兩邊給出相同結論", async () => {
    const body = Buffer.from(JSON.stringify({ role: "admin", exp: future() })).toString("base64url");
    const cases: string[] = [
      sign({ userId: "u1", email: "a@b.c", role: "admin", exp: future() }),
      sign({ role: "technician", exp: future() }),
      sign({ role: "sales", exp: future() }),
      sign({ role: "admin", exp: Math.floor(Date.now() / 1000) - 1 }), // 過期
      sign({ role: "admin", exp: future() }, "wrong-secret"),           // 錯密鑰
      `${body}.forged`,                                                 // 偽造
      body,                                                             // 無簽章
    ];
    for (const t of cases) {
      const edgeOk = (await verifySessionEdge(t, SECRET)) !== null;
      const nodeOk = nodeVerify(t) !== null;
      expect(edgeOk, `判斷不一致：${t.slice(0, 40)}…`).toBe(nodeOk);
    }
  });
});

describe("AUTH_SECRET 強度", () => {
  // 程式原本只檢查密鑰非空，不阻止有人把它設成 "secret" 這種短字串。
  // 那種情況下只要一張 cookie 外流，離線就能把密鑰爆出來，然後自己簽一張
  // admin 憑證走正門進來。
  it("密鑰過短時一律拒絕，不論憑證本身是否有效", async () => {
    const shortSecret = "secret";
    expect(shortSecret.length).toBeLessThan(MIN_SECRET_LEN);

    // 用那把短密鑰「正確地」簽一張憑證——簽章本身是對的
    const body = btoa(
      JSON.stringify({ role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(shortSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const sig = btoa(String.fromCharCode(...new Uint8Array(mac)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // 簽章正確，但密鑰太短 → 還是回 null（fail-closed）
    expect(await verifySessionEdge(`${body}.${sig}`, shortSecret)).toBeNull();
  });

  it("剛好達到門檻的密鑰可以通行", () => {
    expect(MIN_SECRET_LEN).toBe(32);
  });
});
