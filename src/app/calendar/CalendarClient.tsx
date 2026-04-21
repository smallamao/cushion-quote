"use client";

import Link from "next/link";
import { Calendar, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type EventKind = "case_followup" | "quote_followup" | "dispatch" | "ar_due";

interface CalendarEvent {
  date: string; // YYYY-MM-DD
  kind: EventKind;
  label: string;
  sublabel?: string;
  href: string;
  overdue?: boolean;
}

const KIND_META: Record<EventKind, { label: string; color: string; dot: string }> = {
  case_followup: { label: "案件追蹤", color: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  quote_followup: { label: "報價追蹤", color: "bg-purple-100 text-purple-800", dot: "bg-purple-500" },
  dispatch: { label: "派工", color: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  ar_due: { label: "收款", color: "bg-green-100 text-green-800", dot: "bg-green-500" },
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function todayStr(): string {
  return dateKey(new Date());
}

export function CalendarClient() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Set<EventKind>>(
    new Set(["case_followup", "quote_followup", "dispatch", "ar_due"]),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const [casesRes, versionsRes, afterSalesRes, arRes] = await Promise.all([
          fetch("/api/sheets/cases", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/sheets/versions?includeLines=false", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/sheets/after-sales", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/sheets/ar?includeSchedules=true", { cache: "no-store" }).then((r) => r.json()),
        ]);

        const today = todayStr();
        const collected: CalendarEvent[] = [];

        // Case follow-ups
        for (const c of casesRes.cases ?? []) {
          if (!c.nextFollowUpDate) continue;
          if (c.caseStatus === "won" || c.caseStatus === "lost" || c.caseStatus === "closed") continue;
          collected.push({
            date: c.nextFollowUpDate,
            kind: "case_followup",
            label: c.caseName || c.caseId,
            sublabel: c.clientNameSnapshot,
            href: `/cases?caseId=${encodeURIComponent(c.caseId)}`,
            overdue: c.nextFollowUpDate < today,
          });
        }

        // Quote version follow-ups
        for (const v of versionsRes.versions ?? []) {
          if (!v.nextFollowUpDate) continue;
          if (v.versionStatus === "accepted" || v.versionStatus === "rejected" || v.versionStatus === "superseded") {
            continue;
          }
          collected.push({
            date: v.nextFollowUpDate,
            kind: "quote_followup",
            label: `${v.versionId} ${v.quoteNameSnapshot ?? ""}`.trim(),
            sublabel: v.clientNameSnapshot,
            href: `/quotes`,
            overdue: v.nextFollowUpDate < today,
          });
        }

        // After-sales dispatch
        for (const s of afterSalesRes.services ?? []) {
          if (!s.scheduledDate) continue;
          if (s.status === "completed" || s.status === "cancelled") continue;
          collected.push({
            date: s.scheduledDate,
            kind: "dispatch",
            label: `${s.clientName} ${s.modelNameSnapshot ?? ""}`.trim(),
            sublabel: s.assignedTo ? `負責: ${s.assignedTo}` : undefined,
            href: `/after-sales/${s.serviceId}`,
            overdue: s.scheduledDate < today,
          });
        }

        // AR schedule due dates
        for (const ar of arRes.ars ?? []) {
          for (const sched of ar.schedules ?? []) {
            if (!sched.dueDate) continue;
            if (sched.scheduleStatus === "received") continue;
            const outstanding =
              (sched.amount ?? 0) + (sched.adjustmentAmount ?? 0) - (sched.receivedAmount ?? 0);
            if (outstanding <= 0) continue;
            collected.push({
              date: sched.dueDate,
              kind: "ar_due",
              label: `${ar.clientNameSnapshot ?? ar.arId} · ${sched.label || "分期"}`,
              sublabel: `$${outstanding.toLocaleString("zh-TW")}`,
              href: `/receivables/${ar.arId}`,
              overdue: sched.dueDate < today,
            });
          }
        }

        if (!cancelled) setEvents(collected);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const monthEvents = useMemo(() => {
    const mk = monthKey(cursor);
    return events.filter((e) => e.date.startsWith(mk) && filter.has(e.kind));
  }, [events, cursor, filter]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of monthEvents) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [monthEvents]);

  const gridDays = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const firstDayOfWeek = first.getDay(); // 0 = Sunday
    const daysInMonth = last.getDate();
    const cells: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ date: null, key: `blank-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      cells.push({ date, key: dateKey(date) });
    }
    // Pad to full weeks
    while (cells.length % 7 !== 0) {
      cells.push({ date: null, key: `pad-${cells.length}` });
    }
    return cells;
  }, [cursor]);

  function toggleFilter(kind: EventKind) {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const today = todayStr();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Calendar className="h-6 w-6" />
            行事曆
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            案件追蹤、報價追蹤、派工與收款日期彙整
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[9rem] text-center font-mono text-sm">
            {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCursor(startOfMonth(new Date()))}
          >
            今天
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(Object.keys(KIND_META) as EventKind[]).map((kind) => {
          const meta = KIND_META[kind];
          const active = filter.has(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleFilter(kind)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${active ? "border-[var(--accent)] bg-[var(--bg-elevated)]" : "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"}`}
            >
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {meta.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          載入中…
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--bg-subtle)] text-center text-[11px] font-medium text-[var(--text-secondary)]">
          {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
            <div key={w} className="py-1.5">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((cell) => {
            if (!cell.date) {
              return (
                <div
                  key={cell.key}
                  className="min-h-[6rem] border-b border-r border-[var(--border)] bg-[var(--bg-subtle)]/40"
                />
              );
            }
            const key = dateKey(cell.date);
            const isToday = key === today;
            const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
            const dayEvents = eventsByDate.get(key) ?? [];
            return (
              <div
                key={key}
                className={`flex min-h-[6rem] flex-col border-b border-r border-[var(--border)] p-1 ${isToday ? "bg-blue-50" : isWeekend ? "bg-[var(--bg-subtle)]/40" : ""}`}
              >
                <div
                  className={`mb-1 text-right text-[11px] ${isToday ? "font-bold text-blue-700" : "text-[var(--text-tertiary)]"}`}
                >
                  {cell.date.getDate()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, 4).map((e, i) => {
                    const meta = KIND_META[e.kind];
                    return (
                      <Link
                        key={`${e.date}-${i}`}
                        href={e.href as never}
                        className={`truncate rounded px-1.5 py-0.5 text-[10px] ${meta.color} ${e.overdue ? "ring-1 ring-red-500" : ""}`}
                        title={`${meta.label}: ${e.label}${e.sublabel ? " — " + e.sublabel : ""}`}
                      >
                        {e.label}
                      </Link>
                    );
                  })}
                  {dayEvents.length > 4 && (
                    <span className="px-1.5 text-[10px] text-[var(--text-tertiary)]">
                      +{dayEvents.length - 4} 更多
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming list for mobile convenience */}
      <div className="rounded-lg border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-4 py-2 text-sm font-semibold">
          本月事件 ({monthEvents.length})
        </div>
        <div className="max-h-96 divide-y divide-[var(--border)] overflow-y-auto">
          {monthEvents
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((e, i) => {
              const meta = KIND_META[e.kind];
              return (
                <Link
                  key={`${e.date}-${i}`}
                  href={e.href as never}
                  className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--bg-subtle)]"
                >
                  <span className="w-20 font-mono text-xs text-[var(--text-secondary)]">
                    {e.date.slice(5)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${meta.color}`}
                  >
                    {meta.label}
                  </span>
                  <span className="truncate">{e.label}</span>
                  {e.sublabel && (
                    <span className="ml-auto truncate text-xs text-[var(--text-tertiary)]">
                      {e.sublabel}
                    </span>
                  )}
                  {e.overdue && (
                    <span className="text-[10px] font-semibold text-red-600">
                      逾期
                    </span>
                  )}
                </Link>
              );
            })}
          {monthEvents.length === 0 && !loading && (
            <div className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
              本月無事件
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
