/**
 * Two-layer fetch cache:
 * 1. localStorage + TTL — survives reload, shared across tabs
 * 2. In-memory deduplication — collapses simultaneous identical requests
 *    into one network call (multiple hook instances mounting at the same time)
 */

const pending = new Map<string, Promise<unknown>>();

/**
 * 用過的快取鍵登記簿。
 *
 * 登出時要把這些快取全部清掉，否則下一個人在同一台電腦登入會看到上一個人的資料
 * ——2026-10-31 老闆在另一台電腦踩到：按了登出，右上角還是原本的使用者，因為
 * 身分被快取在 localStorage 五分鐘，期間連 /api/auth/me 都不會打。
 *
 * 用登記簿而不是「清掉所有 cq- 開頭的鍵」，是因為同前綴底下還有側欄收合之類的
 * 介面偏好，那些不該被登出清掉；用白名單又會在新增 hook 時漏掉。
 */
const REGISTRY_KEY = "cq-cache-registry";
/** 不是 fetch 快取，但同樣綁使用者：換人登入後必須重置，否則會沿用上一個人的已讀時間 */
const EXTRA_USER_SCOPED_KEYS = ["cq-notif-last-read"];

function registerKey(cacheKey: string): void {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const keys = raw ? (JSON.parse(raw) as string[]) : [];
    if (!keys.includes(cacheKey)) {
      localStorage.setItem(REGISTRY_KEY, JSON.stringify([...keys, cacheKey]));
    }
  } catch {
    // 登記失敗不影響取資料；最壞情況是登出時少清一個鍵
  }
}

/** 登出／換帳號時呼叫：清掉所有跟「目前這個人」有關的本機快取 */
export function clearCachedFetches(): void {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const keys = raw ? (JSON.parse(raw) as string[]) : [];
    for (const k of [...keys, ...EXTRA_USER_SCOPED_KEYS]) localStorage.removeItem(k);
    localStorage.removeItem(REGISTRY_KEY);
  } catch {
    // ignore
  }
}

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
        registerKey(cacheKey);
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
