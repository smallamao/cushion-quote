"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CONCRETE_DELIVERY_PERIODS,
  periodStartHour,
  type DeliveryPeriod,
  type MaterialConfirmStatus,
  type PreferredSlot,
} from "@/lib/material-confirm-types";

interface Info {
  address: string;
  notes: string[];
  primaryPhone: string;
  primaryName: string;
  secondaryPhone: string;
  secondaryName: string;
  items: string[];
}

interface Order {
  cardId: string;
  orderNumber: string;
  customerName: string;
  status: MaterialConfirmStatus;
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

export function DriverBatchClient({ token }: { token: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentMsg, setSentMsg] = useState("");

  // cardId → 選了第幾組；-1 代表「都不行」
  const [pick, setPick] = useState<Record<string, number>>({});
  // cardId → 客人寫「皆可」時司機指定的時段
  const [period, setPeriod] = useState<Record<string, DeliveryPeriod>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/delivery/batch/${token}`);
      const json = (await res.json()) as { ok: boolean; orders?: Order[] };
      if (!json.ok || !json.orders) { setFailed(true); return; }
      setOrders(json.orders);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const pending = useMemo(() => orders.filter((o) => o.status !== "scheduled"), [orders]);
  const pickedCount = useMemo(
    () => pending.filter((o) => pick[o.cardId] !== undefined).length,
    [pending, pick],
  );

  async function submit() {
    setError("");
    const picks: Array<{ cardId: string; chosenIndex: number; period?: string }> = [];
    const rejects: string[] = [];
    for (const o of pending) {
      const p = pick[o.cardId];
      if (p === undefined) continue;
      if (p === -1) { rejects.push(o.cardId); continue; }
      const slot = o.preferredSlots[p];
      const needConcrete = slot && periodStartHour(slot.period) === null;
      if (needConcrete && !period[o.cardId]) {
        setError(`#${o.orderNumber} 客人寫「皆可」，請幫忙指定一個時段`);
        return;
      }
      picks.push({ cardId: o.cardId, chosenIndex: p, ...(needConcrete ? { period: period[o.cardId] } : {}) });
    }
    if (picks.length === 0 && rejects.length === 0) { setError("請至少處理一筆"); return; }

    setBusy(true);
    try {
      const res = await fetch(`/api/public/delivery/batch/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks, rejects }),
      });
      const json = (await res.json()) as {
        ok: boolean; error?: string;
        done?: Array<{ orderNumber: string; text: string }>;
        failed?: Array<{ orderNumber: string; reason: string }>;
      };
      if (!json.ok) { setError(json.error ?? "送出失敗"); return; }
      const bad = json.failed ?? [];
      setSentMsg(
        `已送出 ${(json.done ?? []).length} 筆` +
        (rejects.length ? `，${rejects.length} 筆回報排不進` : "") +
        (bad.length ? `；${bad.length} 筆有問題：${bad.map((b) => `${b.orderNumber}(${b.reason})`).join("、")}` : ""),
      );
      setPick({});
      await load();
    } catch {
      setError("送出失敗，請檢查網路後再試一次");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Shell><p className="rounded-xl bg-white p-8 text-center text-gray-500">讀取中…</p></Shell>;
  }
  if (failed) {
    return (
      <Shell>
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-gray-800">找不到這批資料</p>
          <p className="mt-2 text-base text-gray-500">連結可能已失效，請聯絡馬鈴薯沙發。</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-lg font-semibold text-gray-800">
          共 {orders.length} 筆　
          <span className="text-emerald-700">已排定 {orders.length - pending.length}</span>
          {pending.length > 0 && <span className="ml-2 text-amber-700">待處理 {pending.length}</span>}
        </p>
        <p className="mt-1 text-base text-gray-500">每一筆挑一個時間，最後一次送出。</p>
      </div>

      {sentMsg && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-800">
          ✅ {sentMsg}
        </p>
      )}

      {orders.map((o, oi) => {
        const locked = o.status === "scheduled";
        const chosen = pick[o.cardId];
        const slot = chosen !== undefined && chosen >= 0 ? o.preferredSlots[chosen] : null;
        const needConcrete = slot ? periodStartHour(slot.period) === null : false;
        return (
          <div key={o.cardId} className={`mt-4 rounded-xl border bg-white p-4 ${locked ? "border-emerald-300" : "border-gray-200"}`}>
            <p className="text-sm text-gray-500">{oi + 1} / {orders.length}</p>
            <p className="text-xl font-bold text-gray-900">
              #{o.orderNumber}　{o.customerName}
            </p>

            {o.info?.notes && o.info.notes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {o.info.notes.map((n) => (
                  <span key={n} className="rounded bg-red-100 px-2 py-1 text-base font-semibold text-red-700">【{n}】</span>
                ))}
              </div>
            )}

            {o.info?.address && (
              <div className="mt-2">
                <p className="text-lg leading-relaxed text-gray-900">{o.info.address}</p>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(o.info.address)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-block rounded-lg bg-blue-600 px-4 py-2 text-base font-medium text-white"
                >
                  🧭 導航
                </a>
              </div>
            )}

            <div className="mt-2 space-y-2">
              {o.info?.primaryPhone && (
                <a href={`tel:${o.info.primaryPhone}`} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-3 text-lg">
                  📞 <span className="font-mono font-semibold">{o.info.primaryPhone}</span>
                  <span className="text-gray-600">{o.info.primaryName}</span>
                </a>
              )}
              {o.info?.secondaryPhone && (
                <a href={`tel:${o.info.secondaryPhone}`} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-3 text-lg">
                  📞 <span className="font-mono font-semibold">{o.info.secondaryPhone}</span>
                  <span className="text-gray-600">{o.info.secondaryName}</span>
                </a>
              )}
            </div>

            {o.info?.items && o.info.items.length > 0 && (
              <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
                {o.info.items.map((it, i) => <p key={i} className="text-base text-gray-800">{it}</p>)}
              </div>
            )}

            {locked ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-lg font-semibold text-emerald-800">
                ✅ 已確定：{fmtDate(o.chosenDate)}　{o.chosenPeriod}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {o.preferredSlots.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPick((p) => ({ ...p, [o.cardId]: i }))}
                    className={`flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left text-lg ${
                      chosen === i ? "border-emerald-600 bg-emerald-50 font-semibold" : "border-gray-300"
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                      chosen === i ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-400"
                    }`}>{chosen === i ? "✓" : ""}</span>
                    {fmtDate(s.date)}　{s.period}
                  </button>
                ))}

                {needConcrete && (
                  <div className="rounded-lg bg-amber-50 p-3">
                    <p className="text-base text-amber-900">客人寫「皆可」，請指定一個時段：</p>
                    <select
                      value={period[o.cardId] ?? ""}
                      onChange={(e) => setPeriod((p) => ({ ...p, [o.cardId]: e.target.value as DeliveryPeriod }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-3 text-lg"
                    >
                      <option value="">請選擇…</option>
                      {CONCRETE_DELIVERY_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setPick((p) => ({ ...p, [o.cardId]: -1 }))}
                  className={`w-full rounded-lg border-2 px-4 py-3 text-base ${
                    chosen === -1 ? "border-amber-600 bg-amber-50 font-semibold text-amber-800" : "border-gray-300 text-gray-600"
                  }`}
                >
                  {chosen === -1 ? "✓ " : ""}這筆三組都不行
                </button>
              </div>
            )}
          </div>
        );
      })}

      {pending.length > 0 && (
        <div className="sticky bottom-0 mt-4 border-t border-gray-200 bg-white p-3">
          {error && <p className="mb-2 text-base text-red-600">{error}</p>}
          <button
            type="button"
            disabled={busy || pickedCount === 0}
            onClick={submit}
            className="w-full rounded-lg bg-emerald-600 py-4 text-lg font-semibold text-white disabled:opacity-40"
          >
            {busy ? "送出中…" : `送出（${pending.length} 筆待處理，已選 ${pickedCount}）`}
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 pb-4">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-3 text-base font-semibold text-gray-800">
          馬鈴薯沙發 · 配送時段確認
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-4">{children}</div>
    </div>
  );
}
