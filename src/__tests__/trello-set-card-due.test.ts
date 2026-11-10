import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 🔴 2026-11-09：setCardDue 原本只送 `{ due }`。
 *
 *    Trello 改 due 時若不一併送 dueComplete，會把它**自動清成 false**。官方 API
 *    文件沒有記載這個連動，是從卡片歷史查出來的——P6285 與 P6302 都出現
 *    「改 due」與「dueComplete true→false」同一秒的紀錄。
 *
 *    本系統用 dueComplete 代表「出貨通知已發」，被清掉就等於內勤看不出哪些客人
 *    已經通知過，只能重新問一輪。所以這個測試守的是：PUT 一定要帶 dueComplete，
 *    而且帶的是卡片的**現值**，不是字面值。
 *
 *    TRELLO_KEY／TRELLO_TOKEN 在模組載入時就被捕獲成 const，所以要先設環境變數
 *    再動態 import，不能在上面直接 import。
 */

interface Call {
  url: string;
  method: string;
}

async function loadWithStubs(cardResponse: unknown): Promise<{
  setCardDue: (cardId: string, dueIso: string) => Promise<void>;
  calls: Call[];
}> {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(url), method });
      const body = method === "GET" ? cardResponse : {};
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  vi.resetModules();
  process.env.TRELLO_KEY = "test-key";
  process.env.TRELLO_TOKEN = "test-token";
  const mod = await import("@/lib/trello-server");
  return { setCardDue: mod.setCardDue, calls };
}

describe("setCardDue 必須保留 dueComplete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("卡片已打勾（出貨通知已發）→ PUT 要把 dueComplete=true 送回去", async () => {
    const { setCardDue, calls } = await loadWithStubs({ dueComplete: true });
    await setCardDue("card1", "2026-11-20T08:00:00.000Z");

    const put = calls.find((c) => c.method === "PUT");
    expect(put, "必須發出 PUT").toBeDefined();
    expect(put?.url).toContain("dueComplete=true");
  });

  it("卡片沒打勾 → 送 false，不會意外幫它打勾", async () => {
    const { setCardDue, calls } = await loadWithStubs({ dueComplete: false });
    await setCardDue("card2", "2026-11-20T08:00:00.000Z");

    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toContain("dueComplete=false");
  });

  it("Trello 沒回 dueComplete 這個欄位 → 當 false，但參數不可省略", async () => {
    const { setCardDue, calls } = await loadWithStubs({});
    await setCardDue("card3", "2026-11-20T08:00:00.000Z");

    const put = calls.find((c) => c.method === "PUT");
    // 省略參數＝讓 Trello 自己清掉，那正是這次要修的 bug
    expect(put?.url).toContain("dueComplete=false");
  });

  it("會先讀現值再寫（順序不能顛倒，否則讀到的是自己剛寫的）", async () => {
    const { setCardDue, calls } = await loadWithStubs({ dueComplete: true });
    await setCardDue("card4", "2026-11-20T08:00:00.000Z");

    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT"]);
    expect(calls[0].url).toContain("fields=dueComplete");
  });

  it("出貨日本身要正確送出", async () => {
    const { setCardDue, calls } = await loadWithStubs({ dueComplete: false });
    await setCardDue("card5", "2026-11-20T08:00:00.000Z");

    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toContain(encodeURIComponent("2026-11-20T08:00:00.000Z"));
    expect(put?.url).toContain("/cards/card5");
  });
});

describe("setCardDue 的失敗路徑", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /**
   * 🔴 2026-11-09 審查指出的測試缺口：讀現值失敗時不該還去寫。
   *    硬寫下去等於用猜的 dueComplete 覆蓋真值——那正是這次要修的 bug。
   *    寧可整個失敗（呼叫端有 try/catch 會在卡片留言標註），也不要寫錯。
   */
  it("讀現值失敗時不送 PUT，整個丟錯讓呼叫端知道", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push(method);
        if (method === "GET") return new Response("boom", { status: 500 });
        return new Response("{}", { status: 200 });
      }),
    );
    vi.resetModules();
    process.env.TRELLO_KEY = "test-key";
    process.env.TRELLO_TOKEN = "test-token";
    const { setCardDue } = await import("@/lib/trello-server");

    await expect(setCardDue("card9", "2026-11-20T08:00:00.000Z")).rejects.toThrow();
    expect(calls).toEqual(["GET"]);          // ← 沒有 PUT
  });
});
