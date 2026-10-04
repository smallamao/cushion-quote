"use client";

import { useCallback, useEffect, useState } from "react";

import { SignatureModal } from "@/components/sign/SignatureModal";
import type { PublicOrderConfirmView } from "@/lib/order-confirm-types";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3 text-base font-semibold text-gray-800">
          馬鈴薯沙發 · 線上下訂確認
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-5">{children}</div>
    </div>
  );
}

function Notice({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
      <p className="text-lg font-semibold text-gray-800">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{desc}</p>
    </div>
  );
}

export function OrderConfirmClient({ token }: { token: string }) {
  // LINE 內建瀏覽器簽名容易失敗：偵測到就自動補 ?openExternalBrowser=1 重導。
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (/\bLine\//i.test(navigator.userAgent) && !window.location.search.includes("openExternalBrowser")) {
      const sep = window.location.search ? "&" : "?";
      window.location.replace(`${window.location.href}${sep}openExternalBrowser=1`);
    }
  }, []);

  const [view, setView] = useState<PublicOrderConfirmView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/order-confirm/${token}`);
      const json = (await res.json()) as { ok: boolean; view?: PublicOrderConfirmView };
      if (!json.ok || !json.view) {
        setLoadError(true);
        return;
      }
      setView(json.view);
      setSignerName(json.view.customerName || "");
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const name = signerName.trim();
    if (!name) return setError("請填寫您的姓名");
    if (!signature) return setError("請先簽名");
    if (!agreed) return setError("請勾選同意上方告知事項");
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/public/order-confirm/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: name, signatureDataUrl: signature }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error === "already_confirmed" ? "這筆訂單已經確認過了。" : (json.error ?? "送出失敗，請稍後再試"));
        return;
      }
      setDone(true);
    } catch {
      setError("送出失敗，請檢查網路後再試一次");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Shell><Notice title="讀取中…" desc="請稍候" /></Shell>;
  if (loadError || !view) {
    return (
      <Shell>
        <Notice title="找不到這筆資料" desc="連結可能已失效，請聯絡馬鈴薯沙發重新產生。" />
      </Shell>
    );
  }

  const money = `NT$ ${view.depositAmount.toLocaleString()}`;
  // 期限用「10/6」這種口語格式，和匯款訊息裡的寫法一致
  const payByLabel = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(view.payByDate ?? "");
    return m ? `${Number(m[2])}/${Number(m[3])}` : "";
  })();

  if (done || view.status === "confirmed") {
    return (
      <Shell>
        <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 text-lg font-semibold text-gray-800">已收到您的確認，謝謝！</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            接下來請依下方資訊匯款訂金 <span className="font-semibold text-gray-900">{money}</span>
            {payByLabel ? <>（請於 <span className="font-semibold text-gray-900">{payByLabel}</span> 前完成）</> : null}，
            我們確認收到款項後會安排叫料與排程。
          </p>
          <div className="mt-5 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-left text-sm leading-relaxed text-gray-700">
            {view.paymentInfo}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* 抬頭 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-lg font-bold text-gray-900">訂貨內容確認</p>
        {view.customerName && (
          <p className="mt-1 text-sm text-gray-600">{view.customerName} 您好 👋</p>
        )}
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          請確認下方<strong className="text-gray-900">訂貨單內容與顏色</strong>無誤後，
          於最下方簽名確認，並依指示匯款訂金。
        </p>
      </div>

      {/* 照片 */}
      {view.photoCount > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-2 text-base font-semibold text-gray-800">訂貨單與顏色</p>
          <p className="mb-3 text-xs text-gray-400">點圖可放大，看清手寫細節</p>
          {/* 🔴 單欄滿版、不固定高度：訂貨單是要「讀」的文件，之前 grid-cols-2 + h-40
                 把手寫單縮成半版小圖，客人根本看不清字，也就無法真的核對內容。
                 影像來源仍用 ?size=thumb——那不是縮圖，是 900px 目標寬的 preview
                 （約 280KB），手機上夠清楚；原圖動輒 1.9MB，內嵌會拖慢整頁，
                 留給點圖放大時再抓。改這段前請先讀 trello-server.ts 的尺寸註解。 */}
          <div className="flex flex-col gap-3">
            {Array.from({ length: view.photoCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setZoom(i)}
                className="block w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/public/order-confirm/${token}/photo/${i}?size=thumb`}
                  alt={`訂貨內容 ${i + 1}`}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="block h-auto w-full"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 告知事項 */}
      {view.disclosureItems.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-base font-semibold text-gray-800">告知事項</p>
          {view.disclosureHeader && (
            <p className="mt-1 text-sm font-medium leading-relaxed text-gray-700">
              {view.disclosureHeader}
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {view.disclosureItems.map((t, i) => (
              <li key={i} className="text-sm leading-relaxed text-gray-600">{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 訂金與匯款 */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-base font-semibold text-gray-800">訂金與匯款資訊</p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-base font-semibold text-amber-900">
          應付訂金：{money}
          {payByLabel && (
            <span className="mt-0.5 block text-sm font-medium">請於 {payByLabel} 前匯入</span>
          )}
        </p>
        <div className="mt-3 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">
          {view.paymentInfo}
        </div>
      </div>

      {/* 簽名 */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-base font-semibold text-gray-800">簽名確認</p>
        <label className="mt-3 block text-sm font-medium text-gray-600">姓名</label>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="您的姓名"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
        />

        <button
          type="button"
          onClick={() => setSignOpen(true)}
          className="mt-3 flex h-28 w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500"
        >
          {signature ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signature} alt="簽名" className="h-full object-contain" />
          ) : (
            "✍️ 點此開啟簽名板"
          )}
        </button>

        <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>我已確認訂貨內容與顏色無誤，並同意上方告知事項。</span>
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || !signature || !agreed || !signerName.trim()}
          className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-40"
        >
          {submitting ? "送出中…" : "確認並送出"}
        </button>
        <p className="mt-2 text-center text-[11px] text-gray-400">
          送出即完成確認，系統將記錄簽署時間與裝置資訊作為存證。
        </p>
      </div>

      {signOpen && (
        <SignatureModal
          onDone={(d) => {
            setSignature(d);
            setSignOpen(false);
          }}
          onClose={() => setSignOpen(false)}
        />
      )}

      {zoom !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/public/order-confirm/${token}/photo/${zoom}`}
            alt="放大檢視"
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
    </Shell>
  );
}
