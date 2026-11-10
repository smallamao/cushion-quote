"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import type { OtdItem, OtdWeek } from "@/lib/otd";

/**
 * 交期達成率（OTD）：按生產週看「承諾區間內交付」的比例。
 *
 * 🔴 這一頁刻意把「未交付但承諾區間已過」算成逾期，並且把「還在區間內、
 *    尚未交付」單獨顯示成「進行中」而不是併進分母。
 *    2026-11-10 實測：只看已交付的單會系統性高估——同一批資料，
 *    錯算法畫出 45%→60%→88%→100% 的假改善，真實是 33%→60%→64%。
 *    看板給錯方向的好消息，比沒有看板更糟。
 */

interface Overall {
  onTime: number;
  judged: number;
  rate: number | null;
  settledWeeks: number;
  inFlightWeeks: number;
}

const OUTCOME_STYLE: Record<OtdItem["outcome"], { label: string; cls: string }> = {
  on_time: { label: "準時", cls: "bg-emerald-100 text-emerald-800" },
  late: { label: "逾期", cls: "bg-red-100 text-red-700" },
  late_undelivered: { label: "逾期・還沒交", cls: "bg-red-100 text-red-700" },
  pending: { label: "進行中", cls: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]" },
};

function rateBadge(rate: number | null): string {
  if (rate === null) return "bg-[var(--bg-subtle)] text-[var(--text-secondary)]";
  if (rate >= 90) return "bg-emerald-100 text-emerald-800";
  if (rate >= 70) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}

export function OtdClient() {
  const [weeks, setWeeks] = useState<OtdWeek[]>([]);
  const [overall, setOverall] = useState<Overall | null>(null);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openWeek, setOpenWeek] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/otd", { cache: "no-store" });
      const j = (await res.json()) as {
        ok: boolean; error?: string; weeks?: OtdWeek[]; overall?: Overall; today?: string;
      };
      if (!j.ok) { setError(j.error ?? "讀取失敗"); return; }
      setWeeks(j.weeks ?? []);
      setOverall(j.overall ?? null);
      setToday(j.today ?? "");
    } catch {
      setError("讀取失敗，請檢查網路");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> 載入中…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">交期達成率</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        比的是「客人訊息裡寫的製作完成區間」有沒有做到。今天 {today}。
      </p>

      {error && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ {error}
        </div>
      )}

      {overall && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-semibold text-[var(--text-primary)]">
              {overall.rate === null ? "—" : `${overall.rate}%`}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              {overall.onTime} / {overall.judged} 筆準時・{overall.settledWeeks} 個已結算的生產週
            </span>
          </div>
          {/*
            分母要講清楚。只給一個百分比的話，看的人不知道那是 3 筆算出來的
            還是 30 筆算出來的，也不知道有多少還沒判定。
          */}
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            只採計「已全部判定完畢」的生產週（{overall.inFlightWeeks} 個週還在進行中，不列入）。
            未交付但承諾區間已過的單<strong>算逾期</strong>——它不可能再準時了。
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {weeks.length === 0 && !error && (
          <div className="rounded-xl border border-[var(--border)] p-6 text-center text-sm text-[var(--text-tertiary)]">
            還沒有可統計的生產週
          </div>
        )}
        {[...weeks].reverse().map((w) => {
          const open = openWeek === w.weekMonday;
          return (
            <div key={w.weekMonday} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
              <button
                type="button"
                onClick={() => setOpenWeek(open ? null : w.weekMonday)}
                className="flex w-full flex-wrap items-center gap-2 p-3 text-left"
              >
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {w.weekMonday} 這批
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  承諾完工 {w.promisedEnd}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${rateBadge(w.rate)}`}>
                  {w.rate === null ? "尚無法判定" : `${w.rate}%`}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  準時 {w.onTime}・逾期 {w.late + w.lateUndelivered}
                  {w.pending > 0 && `・進行中 ${w.pending}`}
                </span>
                {!w.complete && (
                  <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                    還沒結算，別拿來看趨勢
                  </span>
                )}
                <span className="ml-auto text-xs text-[var(--text-tertiary)]">{open ? "收起" : "展開"}</span>
              </button>

              {open && (
                <div className="border-t border-[var(--border)] p-3">
                  {w.items.map((it) => (
                    <div key={it.orderNumber} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] ${OUTCOME_STYLE[it.outcome].cls}`}>
                        {OUTCOME_STYLE[it.outcome].label}
                      </span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {it.orderNumber} {it.customerName}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {it.chosenDate ? `實際 ${it.chosenDate}` : "還沒交付"}
                      </span>
                      {it.lateDays > 0 && (
                        <span className="text-xs font-medium text-red-700">晚 {it.lateDays} 天</span>
                      )}
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
