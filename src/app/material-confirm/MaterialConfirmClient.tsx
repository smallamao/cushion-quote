"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { MaterialConfirmStatus, PreferredSlot } from "@/lib/material-confirm-types";

interface WeekRow {
  cardId: string;
  orderNumber: string;
  customerName: string;
  scheduleDate: string;
  dueDate: string;
  token: string | null;
  status: MaterialConfirmStatus | "not_sent";
  preferredSlots: PreferredSlot[];
  signerName: string;
  confirmedAt: string;
  disputeNote: string;
  createdAt: string;
  staleDue: boolean;
}

interface Summary {
  total: number; confirmed: number; disputed: number; sent: number; notSent: number; staleDue: number;
}

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 下一個週一（今天就是週一則取今天）——每週叫料確認都是針對即將生產的那一週。 */
function defaultStart(): string {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const dow = now.getUTCDay();
  const add = dow === 1 ? 0 : (8 - dow) % 7;
  now.setUTCDate(now.getUTCDate() + add);
  return ymd(now);
}

function addDays(base: string, n: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

function fmtMd(s: string): string {
  if (!s) return "—";
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[d.getUTCDay()]})`;
}

function daysSince(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  not_sent:  { label: "尚未發送", cls: "bg-gray-100 text-gray-600" },
  sent:      { label: "已發送・等回覆", cls: "bg-amber-100 text-amber-800" },
  confirmed: { label: "已確認", cls: "bg-emerald-100 text-emerald-800" },
  disputed:  { label: "客戶回報有誤", cls: "bg-red-100 text-red-700" },
};

export function MaterialConfirmClient() {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => addDays(defaultStart(), 5));
  const [rows, setRows] = useState<WeekRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sheets/material-confirm?start=${start}&end=${end}`, { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean; error?: string; rows?: WeekRow[]; summary?: Summary; readyForMaterialCall?: boolean;
      };
      if (!json.ok) {
        setError(json.error ?? "讀取失敗");
        setRows([]); setSummary(null); setReady(false);
        return;
      }
      setRows(json.rows ?? []);
      setSummary(json.summary ?? null);
      setReady(Boolean(json.readyForMaterialCall));
    } catch {
      setError("讀取失敗，請檢查網路");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => { void load(); }, [load]);

  const notSentIds = useMemo(() => rows.filter((r) => !r.token).map((r) => r.cardId), [rows]);

  async function createLinks(cardIds: string[]) {
    if (cardIds.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/material-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds, weekKey: start }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) { setError(json.error ?? "建立失敗"); return; }
      await load();
    } catch {
      setError("建立失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  function linkOf(r: WeekRow): string {
    return r.token ? `${origin}/confirm/${r.token}` : "";
  }

  function lineMsgOf(r: WeekRow): string {
    return [
      "【馬鈴薯沙發】訂單內容確認",
      "",
      `${r.customerName}您好，您的訂單 ${r.orderNumber} 即將進入備料裁切。`,
      "麻煩您點下方連結核對訂貨單內容，並提供三組方便收件的日期時段：",
      "",
      linkOf(r),
      "",
      "確認後我們就會開始為您叫料，感謝您！",
    ].join("\n");
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      setError("複製失敗，請手動選取");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">叫料確認看板</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        全部客戶確認後才進行組件叫料。客戶確認即為訂貨單條款的不可取消時點，系統會留存簽名與時間。
      </p>

      {/* 週次 */}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-[var(--text-secondary)]">
          生產週起
          <input
            type="date" value={start}
            onChange={(e) => { setStart(e.target.value); setEnd(addDays(e.target.value, 5)); }}
            className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--text-secondary)]">
          迄
          <input
            type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button" onClick={() => void load()} disabled={loading}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40"
        >
          {loading ? "讀取中…" : "重新整理"}
        </button>
        {notSentIds.length > 0 && (
          <button
            type="button" onClick={() => void createLinks(notSentIds)} disabled={busy}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "建立中…" : `為 ${notSentIds.length} 筆尚未發送的訂單建立連結`}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* 統計 */}
      {summary && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="font-medium">共 {summary.total} 張</span>
            <span className="text-emerald-700">已確認 {summary.confirmed}</span>
            <span className="text-amber-700">等回覆 {summary.sent}</span>
            <span className="text-gray-500">未發送 {summary.notSent}</span>
            {summary.disputed > 0 && <span className="text-red-600">回報有誤 {summary.disputed} ⚠️</span>}
          </div>
          {summary.staleDue > 0 && (
            <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
              ⚠️ 有 {summary.staleDue} 張的出貨日比排程日早（還沒更新）。客人頁會改用排程日當預計完工日，
              但建議先在 Trello 更新出貨日再發連結。
            </p>
          )}
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
            ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
          }`}>
            {ready
              ? "✅ 全部客戶都已確認 — 可以進行組件叫料了"
              : `⛔ 還不能叫料：尚有 ${summary.total - summary.confirmed} 張未確認`}
          </p>
        </div>
      )}

      {/* 清單 */}
      <div className="mt-4 space-y-3">
        {rows.length === 0 && !loading && (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-secondary)]">
            這個區間沒有排程訂單。確認一下日期，或該週排程日還沒同步進 Trello。
          </p>
        )}

        {rows.map((r) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.not_sent;
          const waited = r.status === "sent" ? daysSince(r.createdAt) : null;
          return (
            <div key={r.cardId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold">{r.orderNumber} {r.customerName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                {r.staleDue && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                    出貨日未更新
                  </span>
                )}
                {waited !== null && waited >= 2 && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                    已等 {waited} 天，該催了
                  </span>
                )}
                <span className="ml-auto text-xs text-[var(--text-secondary)]">
                  排程 {fmtMd(r.scheduleDate)}　預計出貨 {fmtMd(r.dueDate)}
                </span>
              </div>

              {r.status === "confirmed" && (
                <div className="mt-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-[var(--text-primary)]">{r.signerName}</span> 已簽名確認
                  {r.preferredSlots.length > 0 && (
                    <>
                      　｜　希望收件：
                      {r.preferredSlots.map((s, i) => (
                        <span key={i} className="ml-1">{fmtMd(s.date)} {s.period}{i < r.preferredSlots.length - 1 ? "、" : ""}</span>
                      ))}
                    </>
                  )}
                </div>
              )}

              {r.status === "disputed" && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  客戶回報：{r.disputeNote}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {r.token ? (
                  <>
                    <button
                      type="button" onClick={() => void copy(lineMsgOf(r), `msg-${r.cardId}`)}
                      className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
                    >
                      {copied === `msg-${r.cardId}` ? "已複製 ✓" : "複製 LINE 訊息"}
                    </button>
                    <button
                      type="button" onClick={() => void copy(linkOf(r), `url-${r.cardId}`)}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
                    >
                      {copied === `url-${r.cardId}` ? "已複製 ✓" : "只複製連結"}
                    </button>
                    <a
                      href={linkOf(r)} target="_blank" rel="noopener noreferrer"
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
                    >
                      預覽客人看到的畫面
                    </a>
                  </>
                ) : (
                  <button
                    type="button" onClick={() => void createLinks([r.cardId])} disabled={busy}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    建立連結
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
