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
