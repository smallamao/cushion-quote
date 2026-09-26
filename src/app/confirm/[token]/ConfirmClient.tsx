"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { SignatureModal } from "@/components/sign/SignatureModal";
import {
  DELIVERY_PERIODS,
  type DeliveryPeriod,
  type PublicMaterialConfirmView,
} from "@/lib/material-confirm-types";

type Slot = { date: string; period: DeliveryPeriod };

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function todayYmd(): string {
  const t = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return t.toISOString().slice(0, 10);
}

function fmtDate(ymd: string): string {
  const t = Date.parse(`${ymd}T00:00:00+08:00`);
  if (!Number.isFinite(t)) return ymd;
  const d = new Date(t + 8 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAY[d.getUTCDay()]}）`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3 text-base font-semibold text-gray-800">
          馬鈴薯沙發 · 訂單內容確認
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

export function ConfirmClient({ token }: { token: string }) {
  // LINE 內建瀏覽器簽名容易失敗：偵測到就自動補 ?openExternalBrowser=1 重導，
  // 讓 LINE 改用手機原生瀏覽器開啟。（沿用報價簽核頁踩過的坑）
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (/\bLine\//i.test(navigator.userAgent) && !window.location.search.includes("openExternalBrowser")) {
      const sep = window.location.search ? "&" : "?";
      window.location.replace(`${window.location.href}${sep}openExternalBrowser=1`);
    }
  }, []);

  const [view, setView] = useState<PublicMaterialConfirmView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([
    { date: "", period: "皆可" },
    { date: "", period: "皆可" },
    { date: "", period: "皆可" },
  ]);
  const [zoom, setZoom] = useState<number | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"confirmed" | "disputed" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/material-confirm/${token}`);
      const json = (await res.json()) as { ok: boolean; view?: PublicMaterialConfirmView };
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

  // 挑日期的下限：預計完工日與今天取晚的那個（完工前送不了）
  const minDate = useMemo(() => {
    const t = todayYmd();
    const est = view?.estimatedDate ?? "";
    return est && est > t ? est : t;
  }, [view?.estimatedDate]);

  async function submitConfirm() {
    setError("");
    const name = signerName.trim();
    if (!name) return setError("請填寫您的姓名");
    if (!signature) return setError("請先簽名");
    const chosen = slots.filter((s) => s.date);
    if (chosen.length === 0) return setError("請至少選一組希望收件的日期");

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/material-confirm/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          signerName: name,
          signatureDataUrl: signature,
          slots: chosen,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error === "already_confirmed" ? "這筆訂單已經確認過了。" : (json.error ?? "送出失敗，請稍後再試"));
        return;
      }
      setDone("confirmed");
    } catch {
      setError("送出失敗，請檢查網路後再試一次");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDispute() {
    setError("");
    const note = disputeNote.trim();
    if (!note) return setError("請簡單說明哪裡不對，我們才知道怎麼幫您處理");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/material-confirm/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispute", note }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "送出失敗，請稍後再試");
        return;
      }
      setDone("disputed");
    } catch {
      setError("送出失敗，請檢查網路後再試一次");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Shell><Notice title="讀取中…" desc="請稍候" /></Shell>;
  }
  if (loadError || !view) {
    return (
      <Shell>
        <Notice title="找不到這筆資料" desc="連結可能已失效，請聯絡馬鈴薯沙發重新產生。" />
      </Shell>
    );
  }

  if (done === "confirmed" || view.status === "confirmed") {
    return (
      <Shell>
        <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 text-lg font-semibold text-gray-800">已收到您的確認，謝謝！</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            我們會依您提供的時間安排配送，出貨前會再與您聯繫確定日期。
          </p>
          {view.preferredSlots.length > 0 && (
            <div className="mt-5 rounded-lg bg-gray-50 p-4 text-left">
              <p className="mb-2 text-xs font-medium text-gray-500">您希望的收件時間</p>
              {view.preferredSlots.map((s, i) => (
                <p key={i} className="text-sm text-gray-800">{fmtDate(s.date)}　{s.period}</p>
              ))}
            </div>
          )}
        </div>
      </Shell>
    );
  }

  if (done === "disputed" || view.status === "disputed") {
    return (
      <Shell>
        <div className="rounded-xl border border-amber-200 bg-white p-8 text-center">
          <p className="text-4xl">📩</p>
          <p className="mt-3 text-lg font-semibold text-gray-800">已收到您的回報</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            我們會盡快與您聯繫確認細節，確認後會再發一次新的連結給您。
          </p>
          {view.disputeNote && (
            <p className="mt-4 rounded-lg bg-gray-50 p-4 text-left text-sm text-gray-700">
              您的說明：{view.disputeNote}
            </p>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* 訂單抬頭 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">訂單編號</p>
        <p className="text-xl font-semibold text-gray-900">
          {view.orderNumber}　{view.customerName}
        </p>
        {view.estimatedDate && (
          <p className="mt-2 text-sm text-gray-600">
            預計完工：<span className="font-medium text-gray-900">{fmtDate(view.estimatedDate)}</span>
          </p>
        )}
      </div>

      {/* 訂貨單照片 */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-base font-semibold text-gray-800">① 請核對您的訂貨單內容</p>
        <p className="mt-1 text-sm text-gray-500">點照片可放大檢視</p>
        {view.photoCount === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            照片載入失敗，請聯絡我們，先不要送出確認。
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3">
            {Array.from({ length: view.photoCount }).map((_, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={`/api/public/material-confirm/${token}/photo/${i}?size=thumb`}
                alt={`訂貨單照片 ${i + 1}`}
                onClick={() => setZoom(i)}
                className="w-full cursor-zoom-in rounded-lg border border-gray-200"
              />
            ))}
          </div>
        )}
      </div>

      {/* 希望收件時間 */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-base font-semibold text-gray-800">② 希望收到的日期與時段</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          請提供三組方便的時間，我們會依配送路線安排，出貨前再與您確認。
        </p>
        <div className="mt-3 space-y-2">
          {slots.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="date"
                value={s.date}
                min={minDate}
                onChange={(e) =>
                  setSlots((p) => p.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))
                }
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
              <select
                value={s.period}
                onChange={(e) =>
                  setSlots((p) =>
                    p.map((x, j) => (j === i ? { ...x, period: e.target.value as DeliveryPeriod } : x)),
                  )
                }
                className="rounded-lg border border-gray-300 px-2 py-2.5 text-base"
              >
                {DELIVERY_PERIODS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* 簽名 */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-base font-semibold text-gray-800">③ 確認並簽名</p>
        <label className="mt-3 block text-sm text-gray-600">
          您的姓名
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            placeholder="請填寫姓名"
          />
        </label>
        <div className="mt-3">
          {signature ? (
            <div className="rounded-lg border border-gray-200 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={signature} alt="您的簽名" className="mx-auto h-24 object-contain" />
              <button
                type="button"
                onClick={() => setSignOpen(true)}
                className="mt-2 w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-600"
              >
                重新簽名
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSignOpen(true)}
              className="w-full rounded-lg border-2 border-dashed border-gray-300 py-6 text-base text-gray-500"
            >
              ✍️ 點此簽名
            </button>
          )}
        </div>

        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          送出確認後我們會開始為您叫料裁切，依訂貨單條款，此後將無法取消訂單或更換款式布料，
          還請您先仔細核對上方照片內容。
        </p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          disabled={submitting}
          onClick={submitConfirm}
          className="mt-3 w-full rounded-lg bg-emerald-600 py-4 text-base font-semibold text-white disabled:opacity-40"
        >
          {submitting ? "送出中…" : "✅ 內容無誤，確認送出"}
        </button>
        <button
          type="button"
          onClick={() => { setDisputeOpen(true); setError(""); }}
          className="mt-2 w-full rounded-lg border border-gray-300 py-3 text-sm text-gray-600"
        >
          ⚠️ 內容有誤，我要反映
        </button>
      </div>

      {/* 放大檢視 */}
      {zoom !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/public/material-confirm/${token}/photo/${zoom}`}
            alt={`訂貨單照片 ${zoom + 1}`}
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-lg"
            onClick={() => setZoom(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* 簽名板 */}
      {signOpen && (
        <SignatureModal
          onDone={(dataUrl) => { setSignature(dataUrl); setSignOpen(false); }}
          onClose={() => setSignOpen(false)}
        />
      )}

      {/* 內容有誤 */}
      {disputeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <p className="text-base font-semibold text-gray-800">請說明哪裡不對</p>
            <p className="mt-1 text-sm text-gray-500">例如：顏色不是我選的、尺寸不對、少了抱枕…</p>
            <textarea
              value={disputeNote}
              onChange={(e) => setDisputeNote(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
              placeholder="請簡單描述"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => { setDisputeOpen(false); setError(""); }}
                className="flex-1 rounded-lg border border-gray-300 py-3 text-sm text-gray-600"
              >
                取消
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submitDispute}
                className="flex-1 rounded-lg bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {submitting ? "送出中…" : "送出"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
