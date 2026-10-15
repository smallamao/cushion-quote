const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * 簡易 in-memory rate limiter（process-level，適用於低流量內部系統）。
 *
 * ⚠️ 限制：Vercel 為多實例 serverless，每個實例各自計數。
 * 此版本擋得住單機/單實例暴衝，但無法防止分散式的跨實例攻擊。
 * 若需真正全域計數（例如抵禦認真的分散式暴力攻擊），需接外部計數器（Upstash Redis 等）。
 *
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

/**
 * 從 Vercel/Cloudflare 環境的 Request 取出真實用戶端 IP。
 * x-forwarded-for 可能是逗號分隔的多個 IP，取第一段（最接近用戶端）。
 */
export function extractClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
