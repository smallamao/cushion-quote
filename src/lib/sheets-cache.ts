// TTL cache + single-flight dedup for Sheets API calls.
// Runs server-side only; do not import from client components.

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry<unknown>>();
const _inflight = new Map<string, Promise<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = _cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    _cache.delete(key);
    return undefined;
  }
  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(key: string): void {
  _cache.delete(key);
}

export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) {
      _cache.delete(key);
    }
  }
}

export async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = _inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fn().finally(() => {
    _inflight.delete(key);
  });

  _inflight.set(key, promise as Promise<unknown>);
  return promise;
}

/**
 * 讀試算表的共用快取：TTL 內直接回上次的結果，同時進來的請求只讀一次，
 * 讀取失敗不快取（下一次重試）。寫入端要呼叫 cacheInvalidate(key)。
 *
 * 2026-11-10：Vercel Hobby 的 CPU 額度（每月 4 小時）用完被暫停到 12/9，
 * 大宗是頂端輪詢每次重讀整張表。快取在同一個伺服器實例內共用。
 */
export async function cachedRead<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  return singleFlight(key, async () => {
    const data = await fn();
    cacheSet(key, data, ttlMs);
    return data;
  });
}
