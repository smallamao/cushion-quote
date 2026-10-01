"use client";

import { useCallback, useEffect, useState } from "react";

import {
  CONCRETE_DELIVERY_PERIODS,
  holidayName,
  isNonDeliveryDay,
  periodStartHour,
  type DeliveryPeriod,
  type MaterialConfirmStatus,
  type PreferredSlot,
} from "@/lib/material-confirm-types";

interface Info {
  orderNumber: string;
  customerName: string;
  address: string;
  notes: string[];
  primaryPhone: string;
  primaryName: string;
  secondaryPhone: string;
  secondaryName: string;
  items: string[];
}

interface View {
  status: MaterialConfirmStatus;
  orderNumber: string;
  customerName: string;
  preferredSlots: PreferredSlot[];
  chosenDate: string;
  chosenPeriod: DeliveryPeriod | "";
  info: Info | null;
}

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function fmtDate(ymd: string): string {
  const t = Date.parse(`${ymd}T00:00:00+08:00`);
  if (!Number.isFinite(t)) return ymd;
  const d = new Date(t + 8 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAY[d.getUTCDay()]}）`;
}

// 廠商與司機年紀偏大，字級一律放大（沿用給廠商單據的規矩）
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-3 text-base font-semibold text-gray-800">
          馬鈴薯沙發 · 配送時段確認
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-5">{children}</div>
    </div>
  );
}

export function DriverClient({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [periodFor皆可, setPeriodFor皆可] = useState<DeliveryPeriod>("上午 10:00-12:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/delivery/${token}`);
      const json = (await res.json()) as { ok: boolean; view?: View };
      if (!json.ok || !json.view) { setFailed(true); return; }
      setView(json.view);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function submit(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/public/delivery/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) { setError(json.error ?? "送出失敗，請再試一次"); return; }
      await load();
    } catch {
      setError("送出失敗，請檢查網路後再試一次");
    } finally {
      setBusy(false);
      setRejectOpen(false);
    }
  }

  if (loading) return <Shell><p className="rounded-xl bg-white p-8 text-center text-gray-500">讀取中…</p></Shell>;
  if (failed || !view) {
    return (
      <Shell>
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-gray-800">找不到這筆資料</p>
          <p className="mt-2 text-base text-gray-500">連結可能已失效，請聯絡馬鈴薯沙發。</p>
        </div>
      </Shell>
    );
  }

  const info = view.info;

  if (view.status === "scheduled") {
    return (
      <Shell>
        <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center">
          <p className="text-4xl">🚚</p>
          <p className="mt-3 text-xl font-semibold text-gray-800">已確認這一趟</p>
          <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-lg font-semibold text-emerald-800">
            {fmtDate(view.chosenDate)}　{view.chosenPeriod}
          </p>
          <p className="mt-3 text-base text-gray-600">{view.orderNumber} {view.customerName}</p>
        </div>
      </Shell>
    );
  }

  if (view.status === "driver_rejected") {
    return (
      <Shell>
        <div className="rounded-xl border border-amber-200 bg-white p-8 text-center">
          <p className="text-4xl">📩</p>
          <p className="mt-3 text-xl font-semibold text-gray-800">已回報三組都不行</p>
          <p className="mt-2 text-base text-gray-600">馬鈴薯沙發會直接跟客人另約時間。</p>
        </div>
      </Shell>
    );
  }

  if (view.preferredSlots.length === 0) {
    return (
      <Shell>
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-gray-800">客人還沒提供時間</p>
          <p className="mt-2 text-base text-gray-500">等客人回覆後再開這個連結。</p>
        </div>
      </Shell>
    );
  }

  const chosenSlot = picked === null ? null : view.preferredSlots[picked];
  const needsConcrete = chosenSlot ? periodStartHour(chosenSlot.period) === null : false;

  return (
    <Shell>
      {/* 訂單與地址 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xl font-bold text-gray-900">
          #{view.orderNumber}　{info?.customerName || view.customerName}
        </p>

        {info?.notes && info.notes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {info.notes.map((n) => (
              <span key={n} className="rounded bg-red-100 px-2 py-1 text-base font-semibold text-red-700">
                【{n}】
              </span>
            ))}
          </div>
        )}

        {info?.address && (
          <div className="mt-3">
            <p className="text-lg leading-relaxed text-gray-900">{info.address}</p>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(info.address)}`}
              target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-block rounded-lg bg-blue-600 px-4 py-2 text-base font-medium text-white"
            >
              🧭 導航
            </a>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {info?.primaryPhone && (
            <a href={`tel:${info.primaryPhone}`} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-3 text-lg">
              📞 <span className="font-mono font-semibold">{info.primaryPhone}</span>
              <span className="text-gray-600">{info.primaryName}</span>
            </a>
          )}
          {info?.secondaryPhone && (
            <a href={`tel:${info.secondaryPhone}`} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-3 text-lg">
              📞 <span className="font-mono font-semibold">{info.secondaryPhone}</span>
              <span className="text-gray-600">{info.secondaryName}</span>
            </a>
          )}
        </div>

        {info?.items && info.items.length > 0 && (
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-sm text-gray-500">品項</p>
            {info.items.map((it, i) => (
              <p key={i} className="text-base text-gray-800">{it}</p>
            ))}
          </div>
        )}
      </div>

      {/* 挑時段 */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-lg font-semibold text-gray-800">客人希望的時間，請挑一個</p>
        <div className="mt-3 space-y-2">
          {/* 週日不配送。2026-10-01 之前存的三組裡還有週日（P6259、P6262 的第二順位），
              所以這裡要畫成不能按，而不是假設資料一定乾淨。 */}
          {view.preferredSlots.map((s, i) => {
            const sunday = isNonDeliveryDay(s.date);
            return (
            <button
              key={i}
              type="button"
              disabled={sunday}
              onClick={() => { setPicked(i); setError(""); }}
              className={`flex w-full items-center gap-3 rounded-lg border-2 px-4 py-4 text-left text-lg ${
                sunday ? "border-gray-200 bg-gray-100 text-gray-400"
                : picked === i ? "border-emerald-600 bg-emerald-50 font-semibold" : "border-gray-300"
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                sunday ? "border-gray-300"
                : picked === i ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-400"
              }`}>
                {picked === i && !sunday ? "✓" : ""}
              </span>
              {fmtDate(s.date)}　{s.period}
              {sunday
                ? <span className="ml-auto text-base">週日不配送</span>
                : holidayName(s.date) && <span className="ml-auto text-base text-amber-700">{holidayName(s.date)}</span>}
            </button>
            );
          })}
        </div>

        {needsConcrete && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3">
            <p className="text-base text-amber-900">客人寫「皆可」，請幫忙指定一個時段：</p>
            <select
              value={periodFor皆可}
              onChange={(e) => setPeriodFor皆可(e.target.value as DeliveryPeriod)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-3 text-lg"
            >
              {CONCRETE_DELIVERY_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}

        {error && <p className="mt-3 text-base text-red-600">{error}</p>}

        <button
          type="button"
          disabled={busy || picked === null}
          onClick={() => submit({ chosenIndex: picked, ...(needsConcrete ? { period: periodFor皆可 } : {}) })}
          className="mt-4 w-full rounded-lg bg-emerald-600 py-4 text-lg font-semibold text-white disabled:opacity-40"
        >
          {busy ? "送出中…" : "✅ 確定這一趟"}
        </button>
        <button
          type="button"
          onClick={() => { setRejectOpen(true); setError(""); }}
          className="mt-2 w-full rounded-lg border border-gray-300 py-3 text-base text-gray-600"
        >
          三組都不行
        </button>
      </div>

      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <p className="text-lg font-semibold text-gray-800">確定三組時間都無法配合？</p>
            <p className="mt-2 text-base text-gray-600">送出後馬鈴薯沙發會直接跟客人另約時間。</p>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setRejectOpen(false)}
                className="flex-1 rounded-lg border border-gray-300 py-3 text-base text-gray-600">
                取消
              </button>
              <button type="button" disabled={busy} onClick={() => submit({ reject: true })}
                className="flex-1 rounded-lg bg-amber-600 py-3 text-base font-semibold text-white disabled:opacity-40">
                {busy ? "送出中…" : "確定回報"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
