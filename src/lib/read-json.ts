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
  // Vercel 函式請求上限 4.5MB：超過時平台直接回純文字 413
  // 「Request Entity Too Large / FUNCTION_PAYLOAD_TOO_LARGE」，不是空 body（2026-11-08 實測）
  if (res.status === 413) {
    // 這支也用在訂單儲存等非上傳請求，訊息保持中性；上傳專用說明在 upload-client
    return { ok: false, error: "內容太大，超過系統單次上限（約 4.5MB）。請減少附圖或分批處理。" } as T;
  }
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
