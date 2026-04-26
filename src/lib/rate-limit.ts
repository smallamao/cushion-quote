const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * 簡易 in-memory rate limiter（process-level，適用於低流量內部系統）。
 * @returns true 表示允許通行，false 表示超出限制
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}
