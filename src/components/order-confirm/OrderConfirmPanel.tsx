"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Loader2, Send } from "lucide-react";

import { buildPublicUrl } from "@/lib/dispatch-public-url";
import { getOrderDisclosure } from "@/lib/order-confirm-types";
import { splitOrderCardName } from "@/lib/material-confirm-types";

/**
 * 線上下訂確認：掛在「排程出貨」頁的可收合區塊。
 *
 * 客人填完 Google 表單會自動在 Trello「Request」清單建卡；內勤把訂貨單照片與
 * 顏色照片傳上那張卡之後，在這裡產生客人確認連結（含告知事項與訂金匯款），
 * 貼 LINE 給客人線上簽名。省掉「LINE 手傳一次 + 之後再上傳 Trello 一次」。
 *
 * 刻意做成獨立元件掛上去，不動排程出貨原有的出貨邏輯。
 */

interface Row {
  cardId: string;
  cardName: string;
  token: string | null;
  status: "sent" | "confirmed" | null;
  depositAmount: number;
  orderNo: string;
  payByDate: string;
  signerName: string;
  confirmedAt: string;
  notifiedAt: string;
  createdAt: string;
}

function daysSince(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function OrderConfirmPanel() {
  const disclosure = useMemo(() => getOrderDisclosure(), []);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // 展開中的那張卡（設定訂金與條款）
  const [editing, setEditing] = useState<string | null>(null);
  const [deposit, setDeposit] = useState(10000);
  const [checked, setChecked] = useState<number[]>([]);
  const [orderNo, setOrderNo] = useState("");
  const [payBy, setPayBy] = useState("");

  /** 預設匯款期限：今天 +2 天 */
  function defaultPayBy(): string {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** 展開某張卡的設定：訂單編號從卡名自動帶（卡名改成「P6275 王小明」就會抓到） */
  function openEditor(r: Row) {
    setEditing(r.cardId);
    setOrderNo(splitOrderCardName(r.cardName).orderNumber);
    setPayBy(defaultPayBy());
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/order-confirm", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean; error?: string; rows?: Row[]; defaultDeposit?: number; defaultChecked?: number[];
      };
      if (!json.ok) { setError(json.error ?? "讀取失敗"); return; }
      setRows(json.rows ?? []);
      setDeposit(json.defaultDeposit ?? 10000);
      setChecked(json.defaultChecked ?? []);
    } catch {
      setError("讀取失敗，請檢查網路");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && rows.length === 0 && !loading) void load();
  }, [open, rows.length, loading, load]);

  const visible = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter((r) => r.cardName.toLowerCase().includes(key));
  }, [rows, q]);

  const pendingCount = rows.filter((r) => r.status !== "confirmed").length;

  async function createLink(r: Row) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/order-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          cardId: r.cardId,
          cardName: r.cardName,
          depositAmount: deposit,
          checkedIndexes: checked,
          orderNo: orderNo.trim(),
          payByDate: payBy,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) { setError(json.error ?? "產生失敗"); return; }
      setEditing(null);
      await load();
    } catch {
      setError("產生失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  function copyLink(r: Row) {
    if (!r.token) return;
    const url = buildPublicUrl(`/od/${r.token}`);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(r.cardId);
      setTimeout(() => setCopied((c) => (c === r.cardId ? null : c)), 1800);
      // 複製等同要傳給客人了，順手記錄傳出時間
      void fetch("/api/sheets/order-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notified", token: r.token }),
      }).then(() => load());
    }).catch(() => setError("瀏覽器不允許複製，請手動複製連結"));
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronRight className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-sm font-medium">🆕 線上下訂確認</span>
        {rows.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {pendingCount} 筆待確認
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          Trello「Request」清單
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋客戶姓名或訂單編號…"
              className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "重新整理"}
            </button>
          </div>

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          <div className="mt-3 space-y-2">
            {!loading && visible.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-secondary)]">
                {rows.length === 0 ? "Request 清單目前沒有卡片。" : "沒有符合的項目。"}
              </p>
            )}

            {visible.map((r) => {
              const waited = r.status === "sent" ? daysSince(r.createdAt) : null;
              return (
                <div key={r.cardId} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{r.cardName}</span>
                    {r.status === "confirmed" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">
                        ✅ 已確認{r.signerName ? `・${r.signerName}` : ""}
                      </span>
                    )}
                    {r.status === "sent" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                        等客人確認{waited !== null && waited >= 2 ? `・已 ${waited} 天` : ""}
                      </span>
                    )}
                    {!r.status && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                        尚未產生連結
                      </span>
                    )}

                    <div className="ml-auto flex items-center gap-1.5">
                      {r.token ? (
                        <button
                          type="button"
                          onClick={() => copyLink(r)}
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-hover)]"
                        >
                          {copied === r.cardId
                            ? <><Check className="mr-0.5 inline h-3 w-3" />已複製</>
                            : <><Copy className="mr-0.5 inline h-3 w-3" />複製連結</>}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => (editing === r.cardId ? setEditing(null) : openEditor(r))}
                          className="rounded-md border border-[var(--accent)] px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--bg-hover)]"
                        >
                          <Send className="mr-0.5 inline h-3 w-3" />產生確認連結
                        </button>
                      )}
                    </div>
                  </div>

                  {editing === r.cardId && !r.token && (
                    <div className="mt-3 rounded-md bg-[var(--bg-subtle)] p-3">
                      <div className="mb-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)]">
                            訂單編號 <span className="text-red-600">必填</span>
                          </label>
                          <input
                            value={orderNo}
                            onChange={(e) => setOrderNo(e.target.value)}
                            placeholder="P6275"
                            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm"
                          />
                          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                            客人匯款備註要標這個；卡名改成「P6275 王小明」就會自動帶入
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)]">匯款期限</label>
                          <input
                            type="date"
                            value={payBy}
                            onChange={(e) => setPayBy(e.target.value)}
                            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm"
                          />
                          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">留空則不提期限</p>
                        </div>
                      </div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">應付訂金</label>
                      <input
                        type="number"
                        value={deposit}
                        min={0}
                        onChange={(e) => setDeposit(Number(e.target.value) || 0)}
                        className="mt-1 w-40 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm"
                      />

                      {disclosure && (
                        <>
                          <p className="mt-3 text-xs font-medium text-[var(--text-secondary)]">
                            這單適用的告知事項（勾選的才會顯示給客人）
                          </p>
                          <div className="mt-1 max-h-56 space-y-1 overflow-y-auto pr-1">
                            {disclosure.items.map((t, i) => (
                              <label key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                                <input
                                  type="checkbox"
                                  checked={checked.includes(i)}
                                  onChange={(e) =>
                                    setChecked((prev) =>
                                      e.target.checked ? [...prev, i].sort((a, b) => a - b) : prev.filter((x) => x !== i),
                                    )
                                  }
                                  className="mt-0.5 h-4 w-4 shrink-0"
                                />
                                <span className="text-[var(--text-secondary)]">{t}</span>
                              </label>
                            ))}
                          </div>
                        </>
                      )}

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void createLink(r)}
                          disabled={busy || !orderNo.trim()}
                          className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--text-inverse)] disabled:opacity-50"
                        >
                          {busy ? "產生中…" : "產生連結"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
