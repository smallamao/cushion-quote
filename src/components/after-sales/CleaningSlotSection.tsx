"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Copy, Link2, Loader2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CleaningSlotSession } from "@/lib/types";

const WD = ["日", "一", "二", "三", "四", "五", "六"];
const fmtDate = (d: string) => (d ? `${d}（${WD[new Date(d + "T00:00:00").getDay()]}）` : "");

function CopyLink({ token, label }: { token: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/cleaning/${token}` : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 truncate rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-secondary)]">
        {url}
      </div>
      <Button size="sm" variant={copied ? "outline" : "default"} onClick={() => void copy()} className="shrink-0">
        {copied ? <><Check className="mr-1 h-3.5 w-3.5" />已複製</> : <><Copy className="mr-1 h-3.5 w-3.5" />複製{label}</>}
      </Button>
    </div>
  );
}

export function CleaningSlotSection({ serviceId }: { serviceId: string }) {
  const [session, setSession] = useState<CleaningSlotSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sheets/after-sales/${serviceId}/slot-session`, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; session?: CleaningSlotSession | null };
      setSession(json.session ?? null);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function createSession() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sheets/after-sales/${serviceId}/slot-session`, { method: "POST" });
      const json = (await res.json()) as { ok: boolean; session?: CleaningSlotSession; error?: string };
      if (!json.ok || !json.session) throw new Error(json.error ?? "產生失敗");
      setSession(json.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "產生失敗");
    } finally {
      setBusy(false);
    }
  }

  const card = "rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4";

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-[var(--accent)]" />
          到府清潔時段媒合
        </h3>
        {!loading && (
          <button type="button" onClick={() => void load()} title="重新整理" className="text-[var(--text-tertiary)] hover:text-[var(--accent)]">
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-[var(--text-tertiary)]">載入中…</div>
      ) : !session ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">產生連結給客人選方便的時段，師傅確認後自動回填日期／時段。</p>
          <Button size="sm" onClick={() => void createSession()} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
            產生客人選時段連結
          </Button>
        </div>
      ) : session.status === "confirmed" ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm dark:bg-emerald-900/30">
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">✓ 已確認</span>
          <span className="ml-2">{fmtDate(session.confirmedDate)} {session.confirmedPeriod}</span>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">已回填服務單日期／時段，可用下方「通知客人」發送。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Step 1: 客人連結 */}
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">① 貼給客人選時段</p>
            <CopyLink token={session.customerToken} label="客人連結" />
          </div>

          {/* Step 2: 客人已選 → 師傅連結 */}
          {session.status === "awaiting_tech" && (
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
                ② 客人已選，貼給師傅確認
              </p>
              <div className="mb-2 space-y-1 rounded-md bg-[var(--bg-subtle)] p-2 text-xs">
                {session.proposedSlots.map((s, i) => (
                  <div key={i}>· {fmtDate(s.date)}　{s.period}</div>
                ))}
              </div>
              <CopyLink token={session.techToken} label="師傅連結" />
            </div>
          )}

          {session.status === "tech_rejected" && (
            <div className="space-y-2">
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                師傅回報「都不行」，請客人重新提供時段。
              </p>
              <Button size="sm" variant="outline" onClick={() => void createSession()} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
                重發客人連結
              </Button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
