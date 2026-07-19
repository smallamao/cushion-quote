"use client";

// Root-layout error boundary. Must render its own <html>/<body> because the
// root layout itself has crashed. Kept dependency-free (inline styles) so it
// can never crash for the same reason as the page it replaces.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-TW">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 560,
              width: "100%",
              border: "1px solid #fecaca",
              background: "#fef2f2",
              borderRadius: 8,
              padding: 20,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, color: "#b91c1c" }}>系統發生錯誤</h2>
            <p
              style={{
                marginTop: 8,
                fontFamily: "monospace",
                fontSize: 12,
                color: "#dc2626",
                wordBreak: "break-all",
              }}
            >
              {error.message || "未知錯誤"}
              {error.digest ? `（digest: ${error.digest}）` : ""}
            </p>
            {error.stack && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#ef4444" }}>
                  詳細堆疊
                </summary>
                <pre
                  style={{
                    marginTop: 4,
                    maxHeight: 192,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    fontSize: 10,
                    lineHeight: 1.3,
                    color: "#ef4444",
                  }}
                >
                  {error.stack}
                </pre>
              </details>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button
                onClick={reset}
                style={{
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                重試
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: "transparent",
                  color: "#b91c1c",
                  border: "1px solid #fca5a5",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                重新載入頁面
              </button>
            </div>
            <p style={{ marginTop: 12, fontSize: 11, color: "#f87171" }}>
              請截圖此畫面（含錯誤訊息）回報，以便快速定位問題。
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
