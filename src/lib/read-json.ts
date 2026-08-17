/**
 * 安全解析 fetch 回應。
 * 平台層截斷（Vercel 逾時 504／body 過大 413）會回「空 body」，直接 res.json()
 * 會拋 "Unexpected end of JSON input"，使用者只看到一串技術訊息。
 * 這裡把空／非 JSON 回應轉成 { ok:false, error } 的可讀結果。
 */
export async function readJson<T extends { ok?: boolean; error?: string }>(
  res: Response,
): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    const hint =
      res.status === 504 || res.status === 502
        ? "伺服器逾時，請稍後再試（資料可能已寫入，重新整理確認）"
        : res.status === 413
          ? "資料量過大，請減少附圖或分批儲存"
          : `伺服器沒有回應內容（HTTP ${res.status}），請稍後再試`;
    return { ok: false, error: hint } as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      ok: false,
      error: `伺服器回應格式異常（HTTP ${res.status}）：${text.slice(0, 120)}`,
    } as T;
  }
}
