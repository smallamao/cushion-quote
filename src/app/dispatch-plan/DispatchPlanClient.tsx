"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

// 🔴 門檻直接從 dispatch-rules import，不走 API 序列化（2026-11-09）：
//    先前 route 把 softCap/hardCap 包成 `rules` 傳過來，這裡又寫了一份預設值
//    當 fallback，等於三份真相。dispatch-rules 是純常數＋純函式、沒有
//    server-only，前端可以直接用——改常數兩邊一起動，fetch 失敗也不會
//    默默套到舊數字。
import { driverLoad, HARD_CAP, isStorageOverdue, SOFT_CAP } from "@/lib/dispatch-rules";

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
  driver: { name: string; note: string };
  /** 卡片上目前實際掛的司機標籤；空＝還沒指派。與 driver（建議）不同。 */
  assignedDriver: string;
  /** 只給一組時段＝沒有彈性（常見原因：舊沙發要配合清潔隊），要最先鎖定 */
  locked: boolean;
}
interface Scheduled {
  token: string; orderNumber: string; customerName: string;
  date: string; period: string; slots: Slot[]; dueDate: string;
  region: string; city: string; isRemote: boolean;
  /** 這一趟是誰跑；空＝卡上還沒掛司機標籤。容量按這個分組。 */
  assignedDriver: string;
}


const WD = ["日", "一", "二", "三", "四", "五", "六"];

/** 台灣時區的今天，YYYY-MM-DD。伺服器在 UTC，用本地時間會跨日偏一天。 */
function todayTw(): string {
  const d = new Date(Date.now() + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
/** YYYY-MM ± n 個月 */
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function fmtDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  const w = WD[new Date(`${ymd}T00:00:00+08:00`).getDay()];
  return `${Number(m)}/${Number(d)}(${w})`;
}

export function DispatchPlanClient() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // 月曆負責「看形狀、挑日子」，下方清單負責「做事」——一格塞不下
  // 訂單編號＋客戶＋時段＋區域＋建議司機＋按鈕這六樣，手機 7 欄更不可能。
  const [month, setMonth] = useState(() => todayTw().slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const [showExpired, setShowExpired] = useState(false);
  /** Trello 讀不到時，區域與司機資料都不完整，示警會失準——要明講不能靜默 */
  const [trelloOk, setTrelloOk] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/dispatch-plan", { cache: "no-store" });
      const j = (await res.json()) as {
        ok: boolean; error?: string; pending?: Pending[]; scheduled?: Scheduled[]; trelloOk?: boolean;
      };
      if (!j.ok) { setError(j.error ?? "讀取失敗"); return; }
      setPending(j.pending ?? []);
      setScheduled(j.scheduled ?? []);
      setTrelloOk(j.trelloOk !== false);
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
  const today = todayTw();

  /**
   * 🔴 三組日期全部過去的單要另外列，不能只是濾掉日期讓它消失。
   *    2026-11-03 實測 37 筆待排車有 17 筆屬於這類——多半是這個頁面上線前
   *    就已人工配送完成、系統沒留紀錄的舊單。無聲隱藏等於把問題藏起來。
   */
  const expired = useMemo(
    () => pending.filter((p) => p.slots.length > 0 && p.slots.every((s) => s.date < today)),
    [pending, today],
  );
  const expiredTokens = new Set(expired.map((p) => p.token));

  const days = useMemo(() => {
    const map = new Map<string, {
      date: string;
      booked: Scheduled[];
      candidates: Array<{ p: Pending; period: string; rank: number }>;
    }>();
    const inRange = (d: string) => d.slice(0, 7) === month;
    const touch = (d: string) =>
      map.get(d) ?? (map.set(d, { date: d, booked: [], candidates: [] }), map.get(d)!);

    for (const s of scheduled) if (s.date && inRange(s.date)) touch(s.date).booked.push(s);
    for (const p of pending) {
      if (expiredTokens.has(p.token)) continue;
      p.slots.forEach((s, i) => {
        // 過去的日期排不了，不列為候選
        if (s.date && s.date >= today && inRange(s.date)) {
          touch(s.date).candidates.push({ p, period: s.period, rank: i + 1 });
        }
      });
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, scheduled, month, today]);

  /** 月曆格子：補滿整週，開頭的空格用 null。WD 以週日起算，與 getDay() 一致。 */
  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: Array<string | null> = Array(first.getUTCDay()).fill(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push(`${month}-${String(d).padStart(2, "0")}`);
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  /** 每天的摘要，給月曆格子用——只放數字與警示，細節留給下方清單 */
  const dayInfo = useMemo(() => {
    const m = new Map<string, { booked: number; candidates: number; overSoft: boolean; overHard: boolean }>();
    for (const d of days) {
      // 門檻比的是「單一司機的最高趟數」，不是當天總數
      // 用最壞情況：未指派的趟最後可能全落在同一人身上，不能當成 0
      const peak = driverLoad(d.booked).worstCase;
      m.set(d.date, {
        booked: d.booked.length,
        candidates: d.candidates.filter((c) => !scheduled.some((s) => s.token === c.p.token)).length,
        overSoft: peak > SOFT_CAP && peak <= HARD_CAP,
        overHard: peak > HARD_CAP,
      });
    }
    return m;
  }, [days, scheduled]);

  const assignedTokens = new Set(scheduled.map((s) => s.token));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">排車視圖</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        把客人給的希望時段按日期攤開，含配送區域。排車由你決定，系統只負責攤平與示警。
      </p>

      {/*
        🔴 Trello 讀不到時一定要明講。區域會全變「需確認」、司機全變未指派，
           而容量示警是看司機趟數的，資料一空就什麼都不會亮——使用者會以為
           「今天沒有需要注意的日子」。資料不完整比沒有警示更危險。
      */}
      {!trelloOk && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ 讀不到 Trello，這一頁的**配送區域與司機**都不完整，容量示警會失準。
          請重新整理；一直失敗就先別照這頁排車。
        </div>
      )}

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

      {/* 月曆導覽：點一天就把下方清單收斂到那天，再點一次取消 */}
      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
        <div className="flex items-center gap-2">
          <button
            type="button" onClick={() => setMonth(shiftMonth(month, -1))}
            className="rounded-md border border-[var(--border)] px-2 py-0.5 text-sm hover:bg-[var(--bg-hover)]"
            aria-label="上個月"
          >
            ‹
          </button>
          <span className="text-sm font-semibold tabular-nums">{month.replace("-", " / ")}</span>
          <button
            type="button" onClick={() => setMonth(shiftMonth(month, 1))}
            className="rounded-md border border-[var(--border)] px-2 py-0.5 text-sm hover:bg-[var(--bg-hover)]"
            aria-label="下個月"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => { setMonth(todayTw().slice(0, 7)); setPicked(null); }}
            className="ml-auto rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--bg-hover)]"
          >
            回到本月
          </button>
          {picked && (
            <button
              type="button" onClick={() => setPicked(null)}
              className="rounded-md border border-[var(--accent)] px-2.5 py-1 text-xs text-[var(--accent)]"
            >
              顯示整月
            </button>
          )}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-[var(--text-tertiary)]">
          {WD.map((w) => <div key={w}>{w}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`b${i}`} />;
            const info = dayInfo.get(cell);
            const isToday = cell === today;
            const isPicked = cell === picked;
            const dim = cell < today;
            return (
              <button
                key={cell}
                type="button"
                onClick={() => setPicked(isPicked ? null : cell)}
                className={[
                  "min-h-[3.1rem] rounded-md border p-1 text-left transition-colors",
                  isPicked ? "border-[var(--accent)] bg-[var(--bg-subtle)]" : "border-[var(--border)]",
                  dim ? "opacity-40" : "hover:bg-[var(--bg-hover)]",
                ].join(" ")}
              >
                <div className={`text-[11px] tabular-nums ${isToday ? "font-bold text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>
                  {Number(cell.slice(8))}
                </div>
                {info && (
                  <div className="mt-0.5 space-y-0.5 leading-tight">
                    {info.booked > 0 && (
                      <div className={`rounded px-1 text-[10px] ${
                        info.overHard ? "bg-red-100 text-red-700"
                        : info.overSoft ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"}`}>
                        排 {info.booked}
                      </div>
                    )}
                    {info.candidates > 0 && (
                      <div className="text-[10px] text-[var(--text-tertiary)]">候 {info.candidates}</div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {!loading && days.length === 0 && (
        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">目前沒有待排車的訂單。</p>
      )}

      {expired.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <button
            type="button"
            onClick={() => setShowExpired((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className="text-sm font-semibold text-amber-900">
              ⏳ 客人給的時段都已過期（{expired.length} 筆）
            </span>
            <span className="ml-auto text-xs text-amber-800">{showExpired ? "收合" : "展開"}</span>
          </button>
          <p className="mt-1 text-xs text-amber-800">
            這些單排不進任何一天。多半是這個頁面上線前就已人工配送完成、系統沒留紀錄；
            也可能是客人拖太久。請逐筆確認後再處理。
          </p>
          {showExpired && (
            <div className="mt-2 space-y-1">
              {expired.map((p) => (
                <div key={p.token} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm">
                  <span className="font-medium">{p.orderNumber} {p.customerName}</span>
                  <span className="text-xs text-[var(--text-secondary)]">📍 {p.region}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    客人選了 {p.slots.map((s) => s.date.slice(5)).join("、")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {days.filter((d) => !picked || d.date === picked).map((d) => {
          // 🔴 只呈現「今天跨了哪些縣市」，**不給門檻**（2026-11-09 移除 MAX_ROUTES）。
          //    實測 219 個「司機×日」組合：只有 1 天跨到 4 市，門檻形同從不作用；
          //    而且跨縣市是常態（2 趟的日子跨 2 市 34 天 > 跨 1 市 30 天）。
          //    縣市數跟順不順路也沒有對應——三峽＋瑞芳同屬新北但很遠，
          //    2026-02-07 跨苗栗＋新北＋桃園卻跑了 7 趟。判斷留給人。
          const cities = [...new Set(d.booked.map((b) => b.city).filter(Boolean))];
          // 門檻比「單一司機的最高趟數」，不是當天總數——總數會把阿富的台東單
          // 算進台北的額度裡（老闆 2026-11-09）
          const load = driverLoad(d.booked);
          // 示警比「最忙的司機 ＋ 全部未指派」的上界。只看已指派會漏報：
          // 司機標籤是處理出貨通知時才掛的，未來的日子大多還沒掛。
          const peak = load.worstCase;
          const overHard = peak > HARD_CAP;
          const overSoft = !overHard && peak > SOFT_CAP;
          const peakLabel = load.unassigned > 0
            ? `最多 ${peak} 趟（含 ${load.unassigned} 趟未指派）`
            : `${load.peak?.name} 一天 ${peak} 趟`;
          return (
            <div key={d.date} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-[var(--text-primary)]">{fmtDate(d.date)}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  已排 {d.booked.length}・候選 {d.candidates.length}
                </span>
                {overHard && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">
                    🚨 {peakLabel}，超過上限 {HARD_CAP}
                  </span>
                )}
                {overSoft && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                    ⚠️ {peakLabel}，偏多（常態 {SOFT_CAP} 以內）
                  </span>
                )}
                {load.perDriver.length > 1 && (
                  <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                    🚚 {load.perDriver.map((x) => `${x.name} ${x.trips}`).join("・")}
                  </span>
                )}
                {load.unassigned > 0 && (
                  <span
                    className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                    title="卡片上還沒掛司機標籤，所以這幾趟沒有算進任何人的額度。系統不猜是誰。"
                  >
                    ❓ {load.unassigned} 趟未指派司機
                  </span>
                )}
                {cities.length > 0 && (
                  <span
                    className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                    title="這一天已排定的配送縣市。順不順路要看實際距離，系統不替你判斷。"
                  >
                    🗺️ {cities.join("・")}
                  </span>
                )}
              </div>

              {d.booked.length > 0 && (
                <div className="mt-2 rounded-lg bg-emerald-50 p-2">
                  {d.booked.map((b) => {
                    // 客人給的其他組——直接改排，不用先取消再回頭找那一天
                    const others = (b.slots ?? []).filter((s) => s.date && s.date !== b.date);
                    return (
                      <div key={b.token} className="py-1 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-emerald-900">
                            ✅ {b.orderNumber} {b.customerName}
                          </span>
                          <span className="text-xs text-emerald-800">{b.period}・{b.region}</span>
                          <button
                            type="button" disabled={busy}
                            onClick={() => void unassign(b.token)}
                            className="ml-auto rounded border border-emerald-300 px-2 py-0.5 text-[11px] text-emerald-800 disabled:opacity-40"
                          >
                            放回待排車
                          </button>
                        </div>
                        {others.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-emerald-800/80">改排到：</span>
                            {others.map((s, i) => (
                              <button
                                key={`${s.date}-${i}`}
                                type="button" disabled={busy}
                                onClick={() => void assign(b.token, s.date, s.period)}
                                title={`${fmtDate(s.date)} ${s.period}`}
                                className="rounded border border-emerald-300 bg-white/70 px-2 py-0.5 text-[11px] text-emerald-900 disabled:opacity-40"
                              >
                                {fmtDate(s.date)} {s.period}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {d.candidates.filter((c) => !assignedTokens.has(c.p.token)).length > 0 && (
                <div className="mt-2 space-y-1">
                  {d.candidates
                    .filter((c) => !assignedTokens.has(c.p.token))
                    // 只給一組時段的沒有退路，排在最前面
                    .sort((a, b) => Number(b.p.locked) - Number(a.p.locked) || a.rank - b.rank)
                    .map((c) => (
                      <div
                        key={`${c.p.token}-${c.rank}`}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                      >
                        {c.p.locked ? (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                            🔒 只給這一組
                          </span>
                        ) : (
                          <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                            第 {c.rank} 志願
                          </span>
                        )}
                        <span className="font-medium">{c.p.orderNumber} {c.p.customerName}</span>
                        <span className="text-xs text-[var(--text-secondary)]">{c.period}</span>
                        <span className={`text-xs ${c.p.isRemote ? "font-medium text-purple-700" : c.p.regionUnknown ? "text-red-600" : "text-[var(--text-secondary)]"}`}>
                          📍 {c.p.region}
                        </span>
                        {c.p.driver.name && (
                          <span className="text-xs text-[var(--text-secondary)]" title={c.p.driver.note}>
                            🚚 {c.p.driver.name}
                          </span>
                        )}
                        {isStorageOverdue(c.p.dueDate, d.date) && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">
                            ⚠️ 完工後逾兩週
                          </span>
                        )}
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
