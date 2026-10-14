import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { verifySessionEdge } from "@/lib/auth-edge";

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
