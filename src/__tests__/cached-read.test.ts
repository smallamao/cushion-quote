import { describe, it, expect, vi, beforeEach } from "vitest";

import { cacheInvalidate, cachedRead } from "@/lib/sheets-cache";

// 2026-11-10 Vercel CPU 額度用完被暫停：頂端輪詢每次都重讀整張試算表。
// 同一分鐘內多個請求共用一次讀取；寫入時立刻失效，不會看到舊資料。

describe("cachedRead", () => {
  beforeEach(() => cacheInvalidate("t:key"));

  it("TTL 內第二次不再讀試算表", async () => {
    const fn = vi.fn(async () => ["row"]);
    expect(await cachedRead("t:key", 60_000, fn)).toEqual(["row"]);
    expect(await cachedRead("t:key", 60_000, fn)).toEqual(["row"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("同時進來的請求只讀一次", async () => {
    let resolve!: (v: string[]) => void;
    const fn = vi.fn(() => new Promise<string[]>((r) => (resolve = r)));
    const a = cachedRead("t:key", 60_000, fn);
    const b = cachedRead("t:key", 60_000, fn);
    resolve(["x"]);
    expect(await a).toEqual(["x"]);
    expect(await b).toEqual(["x"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("失效後下一次重讀（寫入後要看到新資料）", async () => {
    const fn = vi.fn(async () => ["v"]);
    await cachedRead("t:key", 60_000, fn);
    cacheInvalidate("t:key");
    await cachedRead("t:key", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("讀取失敗不快取，下一次會重試", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("quota")).mockResolvedValueOnce(["ok"]);
    await expect(cachedRead("t:key", 60_000, fn)).rejects.toThrow("quota");
    expect(await cachedRead("t:key", 60_000, fn)).toEqual(["ok"]);
  });
});
