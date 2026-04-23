/**
 * Two-layer fetch cache:
 * 1. localStorage + TTL — survives reload, shared across tabs
 * 2. In-memory deduplication — collapses simultaneous identical requests
 *    into one network call (multiple hook instances mounting at the same time)
 */

const pending = new Map<string, Promise<unknown>>();

export async function cachedFetch<T>(
  cacheKey: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: T; ts: number };
      if (Date.now() - parsed.ts < ttlMs) return parsed.data;
      localStorage.removeItem(cacheKey);
    }
  } catch {
    localStorage.removeItem(cacheKey);
  }

  const inflight = pending.get(cacheKey);
  if (inflight) return inflight as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
      } catch {
        // localStorage full — skip, still return data
      }
      pending.delete(cacheKey);
      return data;
    })
    .catch((err: unknown) => {
      pending.delete(cacheKey);
      throw err;
    });

  pending.set(cacheKey, promise as Promise<unknown>);
  return promise;
}

export function invalidateCache(cacheKey: string): void {
  try {
    localStorage.removeItem(cacheKey);
  } catch {
    // ignore
  }
}
