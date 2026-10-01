"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { SignatureModal } from "@/components/sign/SignatureModal";
import {
  DELIVERY_PERIODS,
  earliestDeliveryDate,
  isNonDeliveryDay,
  type DeliveryPeriod,
  type PublicMaterialConfirmView,
} from "@/lib/material-confirm-types";

type Slot = { date: string; period: DeliveryPeriod };

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function todayYmd(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function fmtMd(ymd: string): string {
  const t = Date.parse(`${ymd}T00:00:00+08:00`);
  if (!Number.isFinite(t)) return ymd;
  const d = new Date(t + 8 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
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
          馬鈴薯沙發 · 叫料前最後確認
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-5">{children}</div>
    </div>
  );
}

export function ConfirmClient({ token }: { token: string }) {
  // LINE 內建瀏覽器簽名容易失敗：偵測到就自動補 ?openExternalBrowser=1 重導。
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
  const [anytime, setAnytime] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([
    { date: "", period: "皆可" },
    { date: "", period: "皆可" },
    { date: "", period: "皆可" },
  ]);
  const [zoom, setZoom] = useState<number | null>(null);
  const [modal, setModal] = useState<null | "dispute" | "postpone">(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"confirmed" | "disputed" | "postponed" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/material-confirm/${token}`);
      const json = (await res.json()) as { ok: boolean; view?: PublicMaterialConfirmView };
      if (!json.ok || !json.view) { setLoadError(true); return; }
      setView(json.view);
      setSignerName(json.view.customerName || "");
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // 可選的最早日＝製作完成區間的**起日**。理由與回歸測試見 earliestDeliveryDate。
  const minDate = useMemo(
    () => earliestDeliveryDate(view?.productionStart ?? "", view?.estimatedDate ?? "", todayYmd()),
    [view?.productionStart, view?.estimatedDate],
  );

  async function post(payload: Record<string, unknown>, okState: typeof done) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/material-confirm/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error === "already_confirmed" ? "這筆訂單已經確認過了。" : (json.error ?? "送出失敗，請稍後再試"));
        return;
      }
      setModal(null);
      setDone(okState);
    } catch {
      setError("送出失敗，請檢查網路後再試一次");
    } finally {
      setSubmitting(false);
    }
  }

  function submitConfirm() {
    setError("");
    const name = signerName.trim();
    if (!name) return setError("請填寫您的姓名");
    if (!signature) return setError("請先簽名");
    const chosen = slots.filter((s) => s.date);
    if (chosen.length === 0 && !anytime) {
      return setError("請提供 2～3 組方便的日期時段，或勾選「隨時可配合」");
    }
    if (chosen.some((s) => isNonDeliveryDay(s.date))) {
      return setError("週日沒有配送，請改選其他日期");
    }
    void post({ action: "confirm", signerName: name, signatureDataUrl: signature, slots: chosen, anytime }, "confirmed");
  }

  if (loading) return <Shell><Notice title="讀取中…" desc="請稍候" /></Shell>;
  if (loadError || !view) {
    return <Shell><Notice title="找不到這筆資料" desc="連結可能已失效，請聯絡馬鈴薯沙發重新產生。" /></Shell>;
  }

  if (done === "confirmed" || view.status === "confirmed" || view.status === "scheduled") {
    return (
      <Shell>
        <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 text-lg font-semibold text-gray-800">已收到您的確認，謝謝！</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            我們會立即備料排程，並依您提供的時間安排配送，出貨前會再與您聯繫確定日期。
          </p>
          {view.preferredSlots.length > 0 && (
            <div className="mt-5 rounded-lg bg-gray-50 p-4 text-left">
              <p className="mb-2 text-xs font-medium text-gray-500">您提供的時間</p>
              {view.preferredSlots.map((s, i) => (
                <p key={i} className="text-sm text-gray-800">{fmtDate(s.date)}　{s.period}</p>
              ))}
            </div>
          )}
        </div>
      </Shell>
    );
  }

  if (done === "postponed" || view.status === "postponed") {
    return (
      <Shell>
        <div className="rounded-xl border border-amber-200 bg-white p-8 text-center">
          <p className="text-4xl">⏸</p>
          <p className="mt-3 text-lg font-semibold text-gray-800">已收到，我們會先暫緩備料</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            等您這邊方便了再通知我們，我們會協助重新安排製作與出貨時程。
          </p>
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

  const hasWindow = Boolean(view.productionStart && view.estimatedDate);

  return (
    <Shell>
      {/* 抬頭 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-lg font-bold text-gray-900">叫料前，最後確認通知</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          您好 👋 即將進行這筆訂單的備料作業。
          請先確認訂貨單上的<strong className="text-gray-900">款式、尺寸、顏色</strong>是否正確，
          後續製作將完全依照訂貨單內容進行。
        </p>
        <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-sm text-gray-500">訂單編號</p>
          <p className="text-lg font-semibold text-gray-900">{view.orderNumber}　{view.customerName}</p>
        </div>
        {hasWindow && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-center text-lg font-semibold text-emerald-800">
            🔻 預計 {fmtMd(view.productionStart)} ～ {fmtMd(view.estimatedDate)} 製作完成 🔻
          </p>
        )}
      </div>

      {/* ① 照片 */}
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

      {/* ② 可進沙發時段 */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-base font-semibold text-gray-800">② 可以進沙發的日期與時段</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          工廠空間有限，完成後需盡快出貨。請提供 <strong>2～3 組</strong>方便的時間，
          我們會依配送路線安排，出貨前再與您確認。
        </p>
        {/* 🔴 最早可選日原本只靠 min 靜默反灰，客人看不出為什麼點不下去，
            就會回頭問「X 號是不行的對嗎？」。這裡把日期與原因直接寫出來。 */}
        <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-600">
          📅 可選日期：<strong className="text-gray-800">{fmtDate(minDate)}</strong> 起
          <span className="text-gray-400">　※ 週日沒有配送</span>
          {hasWindow && (
            <>
              <br />
              <span className="text-xs text-gray-400">
                你的沙發預計 {fmtMd(view.productionStart)}～{fmtMd(view.estimatedDate)} 完成，完成後就能安排
              </span>
            </>
          )}
        </p>

        <label className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-3">
          <input
            type="checkbox"
            checked={anytime}
            onChange={(e) => setAnytime(e.target.checked)}
            className="h-5 w-5"
          />
          <span className="text-base text-gray-800">隨時可配合，由你們安排就好</span>
        </label>

        {!anytime && (
          <div className="mt-3 space-y-2">
            {slots.map((s, i) => (
              <div key={i}>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={s.date}
                  min={minDate}
                  onChange={(e) => setSlots((p) => p.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-base ${
                    isNonDeliveryDay(s.date) ? "border-red-400 bg-red-50" : "border-gray-300"
                  }`}
                />
                <select
                  value={s.period}
                  onChange={(e) => setSlots((p) => p.map((x, j) => (j === i ? { ...x, period: e.target.value as DeliveryPeriod } : x)))}
                  className="rounded-lg border border-gray-300 px-2 py-2.5 text-base"
                >
                  {DELIVERY_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {isNonDeliveryDay(s.date) && (
                <p className="mt-1 text-sm text-red-600">這天是週日，沒有配送，請改選其他日期</p>
              )}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => { setModal("postpone"); setNote(""); setError(""); }}
          className="mt-3 w-full rounded-lg border border-amber-300 bg-amber-50 py-3 text-sm font-medium text-amber-900"
        >
          ⚠️ 目前還無法安排進場，需要延後
        </button>
      </div>

      {/* ③ 簽名 */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-base font-semibold text-gray-800">③ 同意叫料製作</p>
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
              <button type="button" onClick={() => setSignOpen(true)}
                className="mt-2 w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-600">
                重新簽名
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setSignOpen(true)}
              className="w-full rounded-lg border-2 border-dashed border-gray-300 py-6 text-base text-gray-500">
              ✍️ 點此簽名
            </button>
          )}
        </div>

        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <p className="font-semibold">💡 重要提醒</p>
          <p className="mt-1">• 送出後我們會立即備料排程</p>
          <p>• 送出後將<strong>無法修改、取消訂單</strong>（訂金恕不退還）</p>
          <p>• 若有任何修改，請務必在送出前一次告知</p>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button" disabled={submitting} onClick={submitConfirm}
          className="mt-3 w-full rounded-lg bg-emerald-600 py-4 text-base font-semibold text-white disabled:opacity-40"
        >
          {submitting ? "送出中…" : "✅ 內容無誤，同意叫料製作"}
        </button>
        <button
          type="button" onClick={() => { setModal("dispute"); setNote(""); setError(""); }}
          className="mt-2 w-full rounded-lg border border-gray-300 py-3 text-sm text-gray-600"
        >
          內容有誤，我要反映
        </button>
      </div>

      {zoom !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/public/material-confirm/${token}/photo/${zoom}`} alt={`訂貨單照片 ${zoom + 1}`}
            className="max-h-full max-w-full object-contain" />
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-lg"
            onClick={() => setZoom(null)}>✕</button>
        </div>
      )}

      {signOpen && (
        <SignatureModal onDone={(d) => { setSignature(d); setSignOpen(false); }} onClose={() => setSignOpen(false)} />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <p className="text-base font-semibold text-gray-800">
              {modal === "dispute" ? "請說明哪裡不對" : "目前無法安排進場"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {modal === "dispute"
                ? "例如：顏色不是我選的、尺寸不對、少了抱枕…"
                : "我們會先暫緩備料。方便的話請說明大概什麼時候可以（例：裝潢預計月底完成）。"}
            </p>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} rows={4}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
              placeholder={modal === "dispute" ? "請簡單描述" : "可不填"}
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => { setModal(null); setError(""); }}
                className="flex-1 rounded-lg border border-gray-300 py-3 text-sm text-gray-600">
                取消
              </button>
              <button
                type="button" disabled={submitting}
                onClick={() => {
                  setError("");
                  if (modal === "dispute") {
                    if (!note.trim()) return setError("請簡單說明哪裡不對，我們才知道怎麼幫您處理");
                    void post({ action: "dispute", note: note.trim() }, "disputed");
                  } else {
                    void post({ action: "postpone", note: note.trim() }, "postponed");
                  }
                }}
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

function Notice({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
      <p className="text-lg font-semibold text-gray-800">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{desc}</p>
    </div>
  );
}
