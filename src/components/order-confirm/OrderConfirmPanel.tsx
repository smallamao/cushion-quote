"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Loader2, Send } from "lucide-react";

import { buildPublicUrl } from "@/lib/dispatch-public-url";
import { getOrderDisclosure } from "@/lib/order-confirm-types";
import { buildOrderConfirmShareMessage } from "@/lib/order-deposit-payment";
import { splitOrderCardName } from "@/lib/material-confirm-types";

/**
 * 線上下訂確認：掛在「排程出貨」頁的可收合區塊。
 *
 * 分成兩區，資料來源刻意不同：
 *  - 追蹤中：來自「訂單確認表」。發出去的連結記在表裡，表才是事實來源。
 *  - 可產生連結：來自 Trello「Request」清單中還沒發過連結的卡。
 *
 * 🔴 不要把追蹤清單改回讀 Trello 清單。卡片做完訂單解析就會移到「Order 訂單」，
 *    一移走整筆就從畫面消失——2026-10-13 實測 12 筆連結 100% 看不到，
 *    包括一筆已經等了 7 天的。現場下單的卡不會進追蹤區（根本沒發過連結），
 *    所以也不會污染待辦數字。
 */

interface Tracking {
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
  cardExists: boolean;
  /** null＝卡片上找不到訂金項目。沒勾 ≠ 沒收，不可混為一談 */
  depositPaid: boolean | null;
  depositNote: string;
}

interface Available {
  cardId: string;
  cardName: string;
}

function daysSince(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** 「10/4 21:41」：內勤要對帳，看得到時間比看到 ISO 字串有用。 */
function shortTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function OrderConfirmPanel() {
  const disclosure = useMemo(() => getOrderDisclosure(), []);
  const [open, setOpen] = useState(false);
  const [tracking, setTracking] = useState<Tracking[]>([]);
  const [available, setAvailable] = useState<Available[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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

  function openEditor(a: Available) {
    setEditing(a.cardId);
    setOrderNo(splitOrderCardName(a.cardName).orderNumber);
    setPayBy(defaultPayBy());
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/order-confirm", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean; error?: string; tracking?: Tracking[]; available?: Available[];
        defaultDeposit?: number; defaultChecked?: number[];
      };
      if (!json.ok) { setError(json.error ?? "讀取失敗"); return; }
      setTracking(json.tracking ?? []);
      setAvailable(json.available ?? []);
      setDeposit(json.defaultDeposit ?? 10000);
      setChecked(json.defaultChecked ?? []);
    } catch {
      setError("讀取失敗，請檢查網路");
    } finally {
      setLoading(false);
    }
  }, []);

  // 展開就重抓，展開期間每 60 秒輪詢：客人簽完名後重開面板要看得到新狀態
  useEffect(() => {
    if (!open) return;
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  const key = q.trim().toLowerCase();
  const match = (s: string) => !key || s.toLowerCase().includes(key);

  const visibleTracking = useMemo(() => {
    const list = tracking.filter((r) => match(`${r.cardName} ${r.orderNo}`));
    // 最需要動作的排前面。訂金已收＝實質成交，不管簽了沒都不是待辦
    const rank = (r: Tracking) =>
      r.depositPaid === true ? 3 : r.status === "sent" ? 0 : r.depositPaid === false ? 1 : 2;
    return [...list].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (b.notifiedAt || b.createdAt).localeCompare(a.notifiedAt || a.createdAt),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking, key]);

  const visibleAvailable = useMemo(
    () => available.filter((a) => match(a.cardName)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [available, key],
  );

  // 🔴 訂金已收就不算「等客人簽」：P6283 林宏軒 10/6 就付款了，卻因為沒走線上
  //    簽核而一直停在 sent，催辦天天叫人去催一個已經付過錢的客人（2026-10-13 實測）。
  const waitingCount = tracking.filter(
    (r) => r.status === "sent" && r.depositPaid !== true,
  ).length;
  const unpaidCount = tracking.filter(
    (r) => r.status === "confirmed" && r.depositPaid === false,
  ).length;

  async function createLink(a: Available) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/order-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          cardId: a.cardId,
          cardName: a.cardName,
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

  function copyMessage(r: Tracking) {
    if (!r.token) return;
    const url = buildPublicUrl(`/od/${r.token}`);
    const message = buildOrderConfirmShareMessage(url, { orderNo: r.orderNo });
    navigator.clipboard.writeText(message).then(() => {
      setCopied(r.cardId);
      setTimeout(() => setCopied((c) => (c === r.cardId ? null : c)), 1800);
      // 複製等同要傳給客人了，順手記錄傳出時間
      void fetch("/api/sheets/order-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notified", token: r.token }),
      }).then(() => load());
    }).catch(() => setError("瀏覽器不允許複製，請手動複製"));
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronRight className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-sm font-medium">🆕 線上下訂確認</span>
        {waitingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {waitingCount} 筆等客人簽
          </span>
        )}
        {unpaidCount > 0 && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
            {unpaidCount} 筆已簽未收款
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          共 {tracking.length} 筆已發出
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

          {/* ── 追蹤中：已發出的連結（來源＝訂單確認表，不受卡片搬移影響）── */}
          <p className="mt-4 text-xs font-semibold text-[var(--text-secondary)]">
            已發出的連結
          </p>
          <div className="mt-2 space-y-2">
            {!loading && visibleTracking.length === 0 && (
              <p className="py-3 text-center text-sm text-[var(--text-secondary)]">
                {tracking.length === 0 ? "還沒有發出任何確認連結。" : "沒有符合的項目。"}
              </p>
            )}

            {visibleTracking.map((r) => {
              const waited = daysSince(r.notifiedAt || r.createdAt);
              return (
                <div key={r.cardId} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{r.cardName}</span>

                    {r.status === "confirmed" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">
                        ✅ 已簽{r.signerName ? `・${r.signerName}` : ""}
                        {r.confirmedAt ? `・${shortTime(r.confirmedAt)}` : ""}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                        ⏳ 等客人簽{waited !== null && waited >= 2 ? `・已 ${waited} 天` : ""}
                      </span>
                    )}

                    {/* 訂金狀態讀 Trello「待辦事項」的勾選，不自己記一份。
                        刻意不限定已簽核：沒簽但已付款的單最需要被看見。 */}
                    {r.depositPaid === true && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                        💰 訂金已收{r.status !== "confirmed" ? "（未經線上簽核）" : ""}
                      </span>
                    )}
                    {r.status === "confirmed" && r.depositPaid === false && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] text-rose-800">
                        💰 訂金未收
                      </span>
                    )}
                    {r.status === "confirmed" && r.depositPaid === null && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                        訂金狀態未知
                      </span>
                    )}

                    {!r.cardExists && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                        卡片已刪除
                      </span>
                    )}

                    <div className="ml-auto">
                      <button
                        type="button"
                        onClick={() => copyMessage(r)}
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-hover)]"
                      >
                        {copied === r.cardId
                          ? <><Check className="mr-0.5 inline h-3 w-3" />已複製訊息</>
                          : <><Copy className="mr-0.5 inline h-3 w-3" />複製訊息</>}
                      </button>
                    </div>
                  </div>

                  <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                    匯款備註編號 <span className="font-medium text-[var(--text-primary)]">{r.orderNo || "—"}</span>
                    ・訂金 NT$ {r.depositAmount.toLocaleString()}
                    {r.payByDate ? `・期限 ${r.payByDate.slice(5).replace("-", "/")}` : ""}
                  </p>
                  {r.depositNote && (
                    <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{r.depositNote}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── 可產生連結：Request 清單中還沒發過的卡 ───────────── */}
          <p className="mt-5 text-xs font-semibold text-[var(--text-secondary)]">
            可產生連結（Trello「Request」清單）
          </p>
          <p className="mb-2 text-[11px] text-[var(--text-tertiary)]">
            現場下單不需要簽核，放著不用理會
          </p>
          <div className="space-y-2">
            {!loading && visibleAvailable.length === 0 && (
              <p className="py-3 text-center text-sm text-[var(--text-secondary)]">
                沒有待處理的新卡片。
              </p>
            )}

            {visibleAvailable.map((a) => (
              <div key={a.cardId} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{a.cardName}</span>
                  <button
                    type="button"
                    onClick={() => (editing === a.cardId ? setEditing(null) : openEditor(a))}
                    className="ml-auto rounded-md border border-[var(--accent)] px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--bg-hover)]"
                  >
                    <Send className="mr-0.5 inline h-3 w-3" />產生確認連結
                  </button>
                </div>

                {editing === a.cardId && (
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
                                    e.target.checked ? [...prev, i].sort((x, y) => x - y) : prev.filter((x) => x !== i),
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
                        onClick={() => void createLink(a)}
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
