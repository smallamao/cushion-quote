"use client";

/**
 * 「做一筆測試單」頁。老闆改完東西想自己走一次流程時用。
 *
 * 為什麼要有：以前的測試單是我手動建的，他刪掉之後就不知道怎麼重做
 * （2026-10-01 原話：「測試案例那筆被我移除了！而且我測試之後不知道怎麼重製」）。
 */
import { useCallback, useEffect, useState } from "react";

interface Row {
  cardId: string;
  orderNumber: string;
  customerName: string;
  scheduleDate: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function TestLinkClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<{ token: string; orderNumber: string; reset: boolean } | null>(null);
  const [copied, setCopied] = useState("");

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    // 往前後各抓四週，手上有照片的單都找得到
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const from = new Date(now); from.setUTCDate(from.getUTCDate() - 28);
    const to = new Date(now); to.setUTCDate(to.getUTCDate() + 28);
    try {
      const res = await fetch(`/api/sheets/material-confirm?start=${ymd(from)}&end=${ymd(to)}`, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; rows?: Row[]; error?: string };
      if (!json.ok) { setError(json.error ?? "讀取失敗"); return; }
      setRows(json.rows ?? []);
    } catch {
      setError("讀取失敗，請檢查網路");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function make(cardId: string) {
    setBusy(true); setError(""); setMade(null);
    try {
      const res = await fetch("/api/sheets/material-confirm/test-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; token?: string; orderNumber?: string; reset?: boolean };
      if (!json.ok || !json.token) { setError(json.error ?? "建立失敗"); return; }
      setMade({ token: json.token, orderNumber: json.orderNumber ?? "", reset: Boolean(json.reset) });
    } catch {
      setError("建立失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  const link = made ? `${origin}/confirm/${made.token}` : "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900">做一筆測試單</h1>
      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
        <p className="font-medium">這是給你自己試走流程用的，不會動到真實訂單。</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>挑一筆訂單「借照片」來看，<strong>不會</strong>在那張 Trello 卡片留言、打勾或改出貨日。</li>
          <li>測試單<strong>不會</strong>出現在叫料確認看板的任何一週，也不影響「還差幾張」的統計。</li>
          <li>同一筆重按＝重設成未確認，<strong>可以一直重測</strong>，不會越積越多。</li>
          <li>簽完名之後會長出司機連結，第二段（司機挑日）也能一起試。</li>
        </ul>
      </div>

      {made && (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            ✅ 測試單好了（{made.orderNumber}）{made.reset && "．已重設成未確認"}
          </p>
          <p className="mt-2 break-all rounded bg-white px-3 py-2 font-mono text-sm">{link}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(link); setCopied(link); }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
            >
              {copied === link ? "已複製" : "複製連結"}
            </button>
            <a
              href={link} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700"
            >
              直接打開
            </a>
          </div>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <p className="mt-5 text-sm font-medium text-gray-700">要借哪一筆的訂單照片？</p>
      {loading ? (
        <p className="mt-2 text-sm text-gray-500">讀取中…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">前後四週都沒有訂單，請先在 Trello 排好排程日。</p>
      ) : (
        <div className="mt-2 divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {rows.map((r) => (
            <div key={r.cardId} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {r.orderNumber}　{r.customerName}
                </p>
                <p className="text-xs text-gray-500">排程日 {r.scheduleDate || "—"}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void make(r.cardId)}
                className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
              >
                用這筆測試
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
