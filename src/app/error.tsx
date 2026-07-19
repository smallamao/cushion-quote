"use client";

import { useEffect } from "react";

// App Router segment error boundary: catches render/runtime errors in any page
// and shows the actual message instead of Next.js' generic "Application error"
// white screen, so crashes can be diagnosed from a screenshot.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page crashed:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-lg border border-red-200 bg-red-50 p-5">
        <h2 className="text-base font-semibold text-red-700">頁面發生錯誤</h2>
        <p className="mt-2 break-all font-mono text-xs text-red-600">
          {error.message || "未知錯誤"}
          {error.digest ? `（digest: ${error.digest}）` : ""}
        </p>
        {error.stack && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-red-500">詳細堆疊</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-tight text-red-500">
              {error.stack}
            </pre>
          </details>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={reset}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
          >
            重試
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
          >
            重新載入頁面
          </button>
        </div>
        <p className="mt-3 text-[11px] text-red-400">
          請截圖此畫面（含錯誤訊息）回報，以便快速定位問題。
        </p>
      </div>
    </div>
  );
}
