import { beforeEach, describe, expect, it, vi } from "vitest";

import { cachedFetch, clearCachedFetches, invalidateCache } from "@/lib/fetch-cache";

// vitest 預設跑在 node 環境，沒有 localStorage，這裡給一個最小替身
function installFakeStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  return store;
}

describe("fetch-cache 登出清除", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installFakeStorage();
  });

  it("cachedFetch 會把用過的鍵登記起來", async () => {
    await cachedFetch("cq-users-cache", 60_000, async () => ["a"]);
    expect(JSON.parse(store.get("cq-cache-registry")!)).toEqual(["cq-users-cache"]);
  });

  it("登出清掉所有登記過的快取與登記簿本身", async () => {
    await cachedFetch("cq-users-cache", 60_000, async () => ["a"]);
    await cachedFetch("cq-after-sales-cache-v2", 60_000, async () => ["b"]);
    clearCachedFetches();
    expect(store.get("cq-users-cache")).toBeUndefined();
    expect(store.get("cq-after-sales-cache-v2")).toBeUndefined();
    expect(store.get("cq-cache-registry")).toBeUndefined();
  });

  it("通知已讀時間也要重置——否則換人登入會沿用上一個人的已讀", () => {
    store.set("cq-notif-last-read", "2026-10-31T00:00:00Z");
    clearCachedFetches();
    expect(store.get("cq-notif-last-read")).toBeUndefined();
  });

  it("🔴 介面偏好不可被登出清掉（側欄收合、欄寬）", async () => {
    store.set("cq-sidebar-collapsed", "true");
    store.set("quote-table-column-widths", "{}");
    await cachedFetch("cq-users-cache", 60_000, async () => ["a"]);
    clearCachedFetches();
    expect(store.get("cq-sidebar-collapsed")).toBe("true");
    expect(store.get("quote-table-column-widths")).toBe("{}");
  });

  it("TTL 內重複呼叫不會再打一次網路", async () => {
    const fetcher = vi.fn(async () => ["a"]);
    await cachedFetch("cq-users-cache", 60_000, fetcher);
    await cachedFetch("cq-users-cache", 60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("清掉之後會重新打一次網路", async () => {
    const fetcher = vi.fn(async () => ["a"]);
    await cachedFetch("cq-users-cache", 60_000, fetcher);
    clearCachedFetches();
    await cachedFetch("cq-users-cache", 60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidateCache 只清單一把鍵", async () => {
    await cachedFetch("cq-users-cache", 60_000, async () => ["a"]);
    await cachedFetch("cq-drivers-cache", 60_000, async () => ["b"]);
    invalidateCache("cq-users-cache");
    expect(store.get("cq-users-cache")).toBeUndefined();
    expect(store.get("cq-drivers-cache")).toBeDefined();
  });
});
