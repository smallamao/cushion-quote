"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * 排車視圖：把客人給的希望時段攤成「一天一張卡」，供人工排車。
 *
 * 🔴 刻意不自動媒合（老闆 2026-10-31 定案）：每週只有 5～8 筆，
 *    第一志願散在 4～5 個日期，衝突很輕微。真正難的是「同一天順不順路」，
 *    而那取決於無電梯、客人難易度、司機熟哪一區——系統沒有這些資料。
 *    所以系統只負責攤平與示警，排車仍然是人決定。
 */

interface Slot { date: string; period: string }
interface Pending {
  token: string; cardId: string; orderNumber: string; customerName: string;
  dueDate: string; weekKey: string; slots: Slot[];
  region: string; city: string; isRemote: boolean; regionUnknown: boolean;
}
interface Scheduled {
  token: string; orderNumber: string; customerName: string;
  date: string; period: string; region: string; city: string; isRemote: boolean;
}

const WD = ["日", "一", "二", "三", "四", "五", "六"];
function fmtDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  const w = WD[new Date(`${ymd}T00:00:00+08:00`).getDay()];
  return `${Number(m)}/${Number(d)}(${w})`;
}

export function DispatchPlanClient() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [cap, setCap] = useState(4);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/dispatch-plan", { cache: "no-store" });
      const j = (await res.json()) as {
        ok: boolean; error?: string; pending?: Pending[]; scheduled?: Scheduled[]; dailySoftCap?: number;
      };
      if (!j.ok) { setError(j.error ?? "讀取失敗"); return; }
      setPending(j.pending ?? []);
      setScheduled(j.scheduled ?? []);
      setCap(j.dailySoftCap ?? 4);
    } catch {
      setError("讀取失敗，請檢查網路");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function assign(token: string, date: string, period: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/dispatch-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, date, period }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!j.ok) { setError(j.error ?? "指派失敗"); return; }
      await load();
    } catch { setError("指派失敗"); } finally { setBusy(false); }
  }

  async function unassign(token: string) {
    setBusy(true);
    try {
      await fetch("/api/sheets/dispatch-plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, clear: true }),
      });
      await load();
    } finally { setBusy(false); }
  }

  /** 把「候選」與「已排定」依日期攤平成一天一張卡 */
  const days = useMemo(() => {
    const map = new Map<string, {
      date: string;
      booked: Scheduled[];
      candidates: Array<{ p: Pending; period: string; rank: number }>;
    }>();
    const touch = (d: string) =>
      map.get(d) ?? (map.set(d, { date: d, booked: [], candidates: [] }), map.get(d)!);

    for (const s of scheduled) if (s.date) touch(s.date).booked.push(s);
    for (const p of pending) {
      p.slots.forEach((s, i) => {
        if (s.date) touch(s.date).candidates.push({ p, period: s.period, rank: i + 1 });
      });
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [pending, scheduled]);

  const assignedTokens = new Set(scheduled.map((s) => s.token));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">排車視圖</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        把客人給的希望時段按日期攤開，含配送區域。排車由你決定，系統只負責攤平與示警。
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-[var(--text-secondary)]">
          待排車 <strong className="text-[var(--text-primary)]">{pending.length}</strong> 筆
          ・已排定 <strong className="text-[var(--text-primary)]">{scheduled.length}</strong> 筆
        </span>
        <button
          type="button" onClick={() => void load()} disabled={loading}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--bg-hover)]"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "重新整理"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {!loading && days.length === 0 && (
        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">目前沒有待排車的訂單。</p>
      )}

      <div className="mt-4 space-y-3">
        {days.map((d) => {
          const cities = new Set(
            [...d.booked.map((b) => b.city), ...d.candidates.map((c) => c.p.city)].filter(Boolean),
          );
          const over = d.booked.length > cap;
          const mixed = cities.size > 1;
          const hasRemote = [...d.booked, ...d.candidates.map((c) => c.p)].some((x) => x.isRemote);
          return (
            <div key={d.date} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-[var(--text-primary)]">{fmtDate(d.date)}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  已排 {d.booked.length}・候選 {d.candidates.length}
                </span>
                {over && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">
                    ⚠️ 已排超過 {cap} 筆
                  </span>
                )}
                {mixed && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                    ⚠️ 跨 {cities.size} 個縣市
                  </span>
                )}
                {hasRemote && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] text-purple-800">
                    🚩 含遠程
                  </span>
                )}
              </div>

              {d.booked.length > 0 && (
                <div className="mt-2 rounded-lg bg-emerald-50 p-2">
                  {d.booked.map((b) => (
                    <div key={b.token} className="flex flex-wrap items-center gap-2 py-0.5 text-sm">
                      <span className="font-medium text-emerald-900">
                        ✅ {b.orderNumber} {b.customerName}
                      </span>
                      <span className="text-xs text-emerald-800">{b.period}・{b.region}</span>
                      <button
                        type="button" disabled={busy}
                        onClick={() => void unassign(b.token)}
                        className="ml-auto rounded border border-emerald-300 px-2 py-0.5 text-[11px] text-emerald-800 disabled:opacity-40"
                      >
                        取消指派
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {d.candidates.filter((c) => !assignedTokens.has(c.p.token)).length > 0 && (
                <div className="mt-2 space-y-1">
                  {d.candidates
                    .filter((c) => !assignedTokens.has(c.p.token))
                    .sort((a, b) => a.rank - b.rank)
                    .map((c) => (
                      <div
                        key={`${c.p.token}-${c.rank}`}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                      >
                        <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                          第 {c.rank} 志願
                        </span>
                        <span className="font-medium">{c.p.orderNumber} {c.p.customerName}</span>
                        <span className="text-xs text-[var(--text-secondary)]">{c.period}</span>
                        <span className={`text-xs ${c.p.isRemote ? "font-medium text-purple-700" : c.p.regionUnknown ? "text-red-600" : "text-[var(--text-secondary)]"}`}>
                          📍 {c.p.region}
                        </span>
                        <button
                          type="button" disabled={busy}
                          onClick={() => void assign(c.p.token, d.date, c.period)}
                          className="ml-auto rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                        >
                          排這天
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
