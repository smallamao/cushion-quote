"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isCustomerConfirmed } from "@/lib/material-confirm-types";
import type { MaterialConfirmStatus, PreferredSlot } from "@/lib/material-confirm-types";
import { FUTURES_FABRIC_NOTICE } from "@/lib/material-confirm-types";

interface WeekRow {
  cardId: string;
  orderNumber: string;
  customerName: string;
  scheduleDate: string;
  /** 製作完成區間起日（伺服器算，＝該週週一+3）；{{完工}} 用 */
  productionStart: string;
  /** 製作完成區間迄日（＝起日+6）*/
  productionEnd: string;
  /** 色號欄原文 */
  colorCodes: string;
  /** 含期貨布（FG 安得利）→ 訊息要附告知 */
  isFutures: boolean;
  dueDate: string;
  token: string | null;
  notifiedAt: string;
  driverToken: string | null;
  chosenDate: string;
  chosenPeriod: string;
  status: MaterialConfirmStatus | "not_sent";
  preferredSlots: PreferredSlot[];
  signerName: string;
  confirmedAt: string;
  disputeNote: string;
  createdAt: string;
  staleDue: boolean;
  driftReasons: string[];
  /** 其中會擋住發送的那幾項（排程日／時段）；出貨日不算 */
  blockingDriftReasons: string[];
}

interface DriftStatus {
  checked: boolean;
  checkedAt: string;
  numbersSavedAt: string;
  error: string;
  totalRecords: number;
  /** 本週會擋住發送的差異（排程日／時段） */
  weekRecords: number;
  /** 本週只有出貨日不同的筆數 —— 顯示但不擋 */
  weekDueRecords: number;
  ageHours: number | null;
  stale: boolean;
  numbersNewer: boolean;
}

interface Summary {
  total: number; confirmed: number; disputed: number; sent: number; notSent: number;
  staleDue: number; scheduled: number; driverRejected: number; unsent: number; postponed: number;
}

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 今天之後的第 n 個週一（n=1 是最近的下一個週一；今天是週一則算第 1 個）。 */
function nthMonday(n: number): string {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const dow = now.getUTCDay();
  const toMonday = dow === 1 ? 0 : (8 - dow) % 7;
  now.setUTCDate(now.getUTCDate() + toMonday + (n - 1) * 7);
  return ymd(now);
}

/**
 * 預設打開第 3 個週一那一週。
 * 叫料實際落在生產週前 11～14 天（9/10 出 9/21 週、9/17 出 9/28 週、9/21 出 10/5 週），
 * 換算過來就是往後數第 3 個週一。
 * 🔴 舊版預設「下一個週一」，9/27 打開會停在 9/28 那週——那週的料 9/17 就叫完了，
 *    畫面卻寫「10 張全部未確認、還不能叫料」，看的人只會一頭霧水。
 * ⚠️ 這只是預設值，不保證每次都對（叫料提前幾天會變動）；上方四顆週次按鈕可一鍵切換。
 */
function defaultStart(): string {
  return nthMonday(3);
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
  confirmed: { label: "已確認・待排車", cls: "bg-emerald-100 text-emerald-800" },
  disputed:  { label: "客戶回報有誤", cls: "bg-red-100 text-red-700" },
  postponed: { label: "客戶要求延後備料", cls: "bg-amber-100 text-amber-800" },
  scheduled: { label: "配送已排定", cls: "bg-blue-100 text-blue-800" },
  driver_rejected: { label: "司機三組都不行", cls: "bg-red-100 text-red-700" },
};

export function MaterialConfirmClient() {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => addDays(defaultStart(), 5));
  const { user } = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const [rows, setRows] = useState<WeekRow[]>([]);
  const [view, setView] = useState<"all" | "pending" | "done">("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ready, setReady] = useState(false);
  const [drift, setDrift] = useState<DriftStatus | null>(null);
  const [safeToSend, setSafeToSend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [batchLink, setBatchLink] = useState<string>("");

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sheets/material-confirm?start=${start}&end=${end}`, { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean; error?: string; rows?: WeekRow[]; summary?: Summary;
        readyForMaterialCall?: boolean; driftStatus?: DriftStatus; safeToSend?: boolean;
      };
      if (!json.ok) {
        setError(json.error ?? "讀取失敗");
        setRows([]); setSummary(null); setReady(false); setDrift(null); setSafeToSend(false);
        return;
      }
      setRows(json.rows ?? []);
      setSummary(json.summary ?? null);
      setReady(Boolean(json.readyForMaterialCall));
      setDrift(json.driftStatus ?? null);
      setSafeToSend(Boolean(json.safeToSend));
    } catch {
      setError("讀取失敗，請檢查網路");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => { void load(); }, [load]);

  // 開啟時自動跳到「還沒全部確認完」的那一週。
  // 🔴 推算週次會猜錯（叫料提前天數浮動在 11~14 天）——老闆 2026-09-30 打開停在
  //    10/19、實際在處理 10/12，整頁紅字看不懂。改成看實際資料決定。
  const [jumped, setJumped] = useState(false);
  useEffect(() => {
    if (jumped) return;
    setJumped(true);
    void (async () => {
      try {
        const res = await fetch("/api/sheets/material-confirm/active-week", { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; weekKey?: string };
        if (json.ok && json.weekKey) {
          setStart(json.weekKey);
          setEnd(addDays(json.weekKey, 5));
        }
      } catch { /* 失敗就用推算的預設值 */ }
    })();
  }, [jumped]);

  // 看板最常要回答的是「還差哪幾張」。原本清單平鋪＋只靠狀態標籤，10 張要逐一掃。
  // 這裡提供：未確認置頂 + 可切換只看未確認（判準與上方「還差 N 張」共用 isCustomerConfirmed）。
  const pendingRows = useMemo(() => rows.filter((r) => !isCustomerConfirmed(r.status)), [rows]);
  const doneRows = useMemo(() => rows.filter((r) => isCustomerConfirmed(r.status)), [rows]);
  const visibleRows = useMemo(() => {
    const base =
      view === "pending" ? pendingRows : view === "done" ? doneRows : [...pendingRows, ...doneRows];
    return base; // 未確認永遠在前，後端既有的排程日排序在各組內維持不變
  }, [view, pendingRows, doneRows]);

  const notSentIds = useMemo(() => rows.filter((r) => !r.token).map((r) => r.cardId), [rows]);
  // 連結建好但還沒傳出去的
  const unsentRows = useMemo(() => rows.filter((r) => r.token && !r.notifiedAt && r.status === "sent"), [rows]);
  // 已標記「已傳送」但客人還沒確認的——複製過卻沒真的傳時（例如測試、或擴充功能擋下整批）
  // 就卡在這個狀態：不在批次清單裡、也不在「尚未發送」裡，等於消失。
  const markedRows = useMemo(
    () => rows.filter((r) => r.token && r.notifiedAt && r.status === "sent"), [rows]);
  // 客人確認完、等排車的（可以交給司機）
  const readyForDriver = useMemo(() => rows.filter((r) => r.status === "confirmed"), [rows]);

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

  /**
   * 退回「未傳送」——按過複製但其實沒傳出去時用（例如只是在測試）。
   *
   * 🔴 2026-10-07：複製就記 notifiedAt，而批次清單只收 `!notifiedAt` 的筆，
   *    所以「測試時複製過」會讓那一筆從批次清單消失，狀態卻停在「已傳送」
   *    ——不會出現在任何待辦欄位，那位客人就永遠收不到連結。
   *    原本完全沒有退路，只能靠自己記得。
   */
  async function postTokens(action: "unnotified" | "reopen", tokens: string[], failMsg: string) {
    if (tokens.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/material-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tokens }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; skipped?: string[] };
      if (!json.ok) { setError(json.error ?? failMsg); return; }
      if (json.skipped?.length) setError(`有 ${json.skipped.length} 筆沒處理：${json.skipped.join("、")}`);
      await load();
    } catch {
      setError(`${failMsg}，請稍後再試`);
    } finally {
      setBusy(false);
    }
  }

  const revertNotified = (tokens: string[]) => postTokens("unnotified", tokens, "退回失敗");

  /**
   * 客人回報有誤／要求延後 → 內容改好後放回「待確認」。
   *
   * 🔴 沒有這個動作的話那筆是死路：不在「尚未建連結」、也不在批次清單，
   *    客人點原連結只看到「已收到您的回報」。連結沿用原本那條，
   *    照片是開頁即時抓 Trello，改完就看得到。
   */
  const reopenConfirm = (tokens: string[]) => postTokens("reopen", tokens, "重開失敗");

  function linkOf(r: WeekRow): string {
    return r.token ? `${origin}/confirm/${r.token}` : "";
  }

  /** 沿用老闆現行的 LINE 文案，只把「回覆同意叫料製作」換成點連結。 */
  function lineMsgOf(r: WeekRow): string {
    return [
      "【叫料前，最後確認通知】",
      "",
      `${r.customerName}您好 👋`,
      "即將進行訂單的 備料作業",
      "請先確認 訂貨單上的款式、尺寸、顏色 是否正確！",
      "後續製作將完全依照訂貨單內容進行。",
      "",
      "請點下方連結，核對訂貨單照片並提供可進沙發的時間：",
      linkOf(r),
      "",
      "⚠️ 若目前尚無法安排進場，連結裡也可以直接告知，",
      "我們會協助延後備料或順延製作。",
      "",
      "💡 送出確認後我們會立即備料排程，",
      "　 屆時將無法修改、取消訂單（訂金恕不退還），",
      "　 若有任何修改請在送出前一次告知。",
      // 🔴 期貨布（FG 安得利）要在**客人確認前**就講清楚。
      //    老闆原本是在採購階段才用 LINE 告知，那時客人早已確認叫料，
      //    「不可更改與取消」講在後面等於沒講。同一段也會出現在客人確認頁，
      //    納入他簽名同意的範圍（頁面留存簽名圖、時間戳與 IP）。
      ...(r.isFutures
        ? ["", "━━━━━━━━━━━━", `📌 期貨布料告知（您選的面料：${r.colorCodes}）`, "",
           FUTURES_FABRIC_NOTICE]
        : []),
    ].join("\n");
  }

  function driverLinkOf(r: WeekRow): string {
    return r.driverToken ? `${origin}/d/${r.driverToken}` : "";
  }

  function driverMsgOf(r: WeekRow): string {
    const slots = r.preferredSlots.map((s, i) => `${i + 1}. ${fmtMd(s.date)} ${s.period}`).join("\n");
    return [
      `【馬鈴薯沙發】配送時段確認　#${r.orderNumber} ${r.customerName}`,
      "",
      "客人希望的時間：",
      slots,
      "",
      "麻煩點下方連結挑一個，地址電話都在裡面：",
      driverLinkOf(r),
    ].join("\n");
  }

  /**
   * 製作完成區間 → 「10/22~10/28」，給批次清單的 {{完工}} 用。
   *
   * 🔴 **不可用 fmtMd()**：它會加星期（`10/22(四)`），而擴充功能認的是
   *    `10/15~10/21` 這種乾淨格式，帶括號就解析不出來。
   * 🔴 中間不可有空白——整行會被 `\s+ → " "` 正規化，有空白就被切成兩欄。
   * 🔴 半形 `~`，不是全形 `～`（照擴充功能畫面上寫的範例）。
   */
  function windowOf(r: WeekRow): string {
    if (!r.productionStart || !r.productionEnd) return "";
    const md = (ymdStr: string) => {
      const d = new Date(`${ymdStr}T00:00:00Z`);
      return Number.isNaN(d.getTime()) ? ymdStr : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    };
    return `${md(r.productionStart)}~${md(r.productionEnd)}`;
  }

  /**
   * 產生「LINE 批次傳送」擴充功能的訂單編號欄內容：
   * 一行一筆「編號 姓名 完工 連結」——**順序照擴充功能自己寫的範例**：
   *     P6261 姓名 10/15~10/21 https://連結
   *
   * 擴充功能 v3.10.0 會把每行的值代進訊息的 {{連結}}、{{完工}}，一次發完整批，
   * 不用逐筆複製貼上——也就不會把 A 的連結貼到 B 的聊天室。
   *
   * 🔴 2026-10-07 補完工欄：原本只給三欄，擴充功能擋下整批並回報
   *    「8 筆代不出變數：缺 {{完工}}」。完工＝製作完成區間（該週週一+3 起算七天），
   *    就是客人頁上那行「🔻 預計 10/22 ～ 10/28 製作完成 🔻」。
   * 🔴 第一版把完工放在**連結後面**，還是被擋——擴充功能認的是
   *    「編號 姓名 日期 連結」，日期在連結**之前**。別再調換。
   * 🔴 欄位值本身不可含空白：整行會被 `\s+ → " "` 正規化，
   *    「10/22 ～ 10/28」會被切成三欄、把後面的欄位全部推移。
   */
  function batchListText(rows: WeekRow[]): string {
    return rows
      .filter((r) => r.token)
      .map((r) => `${r.orderNumber} ${r.customerName} ${windowOf(r)} ${linkOf(r)}`
        .replace(/\s+/g, " ").trim())
      .join("\n");
  }

  async function copyBatchAndMark(rows: WeekRow[]) {
    const text = batchListText(rows);
    if (!text) { setError("沒有可傳送的項目"); return; }
    await copy(text, "batch");
    // 複製＝準備要發了，順手記下來，否則看板永遠分不出「建好了」與「傳出去了」
    const tokens = rows.map((r) => r.token).filter(Boolean) as string[];
    try {
      await fetch("/api/sheets/material-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notified", tokens }),
      });
      await load();
    } catch {
      /* 標記失敗不影響已複製的內容 */
    }
  }

  async function makeDriverBatch() {
    const cardIds = Array.from(picked);
    if (cardIds.length === 0) { setError("請先勾選要交給司機的訂單"); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/material-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "driver_batch", cardIds }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; batchToken?: string; count?: number };
      if (!json.ok || !json.batchToken) { setError(json.error ?? "產生失敗"); return; }
      setBatchLink(`${origin}/d/b/${json.batchToken}`);
      await load();
    } catch {
      setError("產生失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
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
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">叫料確認看板</h1>
        {/* 低頻的測試工具：從側邊欄移到這裡（做出來的測試單就顯示在本頁，情境連貫）。
            維持 admin 限定，與原側邊欄項目的權限一致。 */}
        {isAdmin && (
          <a
            href="/material-confirm/test"
            className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="建立一筆測試用的叫料確認單，可完整走過客人簽名與司機挑日流程（不會動到真實訂單）"
          >
            🧪 做測試單
          </a>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        全部客戶確認後才進行組件叫料。客戶確認即為訂貨單條款的不可取消時點，系統會留存簽名與時間。
      </p>

      {/* 操作步驟 */}
      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          { n: 1, t: "建立連結", d: "為這週的訂單產生客人專屬連結" },
          { n: 2, t: "傳給客人", d: "複製批次清單，貼進 LINE 批次傳送" },
          { n: 3, t: "等全部確認", d: "全綠才能進行組件叫料" },
        ].map((x) => {
          const active =
            x.n === 1 ? notSentIds.length > 0
            : x.n === 2 ? notSentIds.length === 0 && unsentRows.length > 0
            : notSentIds.length === 0 && unsentRows.length === 0;
          return (
            <li key={x.n} className={`rounded-lg border px-3 py-2 ${
              active ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] bg-[var(--surface)] opacity-60"
            }`}>
              <p className="text-sm font-medium">
                {active ? "👉 " : ""}{x.n}. {x.t}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{x.d}</p>
            </li>
          );
        })}
      </ol>

      {/* 週次快選 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)]">
          生產週（今天 {fmtMd(ymd(new Date(Date.now() + 8 * 60 * 60 * 1000)))}）：
        </span>
        {[1, 2, 3, 4].map((n) => {
          const mon = nthMonday(n);
          const on = start === mon;
          return (
            <button
              key={n} type="button"
              onClick={() => { setStart(mon); setEnd(addDays(mon, 5)); }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                on ? "border-[var(--accent)] bg-[var(--accent)] font-medium text-white" : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              {fmtMd(mon)} 起
            </button>
          );
        })}
      </div>

      {/* 自訂區間 */}
      <div className="mt-2 flex flex-wrap items-end gap-2">
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
        {unsentRows.length > 0 && (
          <button
            type="button"
            disabled={!safeToSend}
            title={safeToSend ? "" : "要先通過 Numbers 對帳才能發給客人"}
            onClick={() => void copyBatchAndMark(unsentRows)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied === "batch" ? "已複製 ✓" : `📋 複製 ${unsentRows.length} 筆批次清單（貼 LINE 批次傳送）`}
          </button>
        )}
        {/* 🔴 2026-10-07：複製就記 notifiedAt，但擴充功能可能整批擋下（缺變數）、
            也可能只是在測試——那整批就一起卡在「已傳送」而實際沒傳。
            逐列退回要按 8 次，所以這裡給一顆整批的。 */}
        {markedRows.length > 0 && (
          <button
            type="button" disabled={busy}
            title="這些是按過複製、系統記成已傳送，但你其實沒傳出去的（例如批次被擋下或只是在測試）"
            onClick={() => void revertNotified(markedRows.map((r) => r.token).filter((t): t is string => Boolean(t)))}
            className="rounded-lg border border-amber-500 px-3 py-2 text-sm font-medium text-amber-700 disabled:opacity-40"
          >
            {busy ? "處理中…" : `↩︎ 退回全部 ${markedRows.length} 筆為未傳送`}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Numbers 對帳狀態 */}
      {drift && (
        <div className={`mt-4 rounded-xl border p-4 ${
          drift.error || drift.weekRecords > 0 ? "border-red-300 bg-red-50"
          : drift.stale ? "border-amber-300 bg-amber-50"
          : "border-emerald-300 bg-emerald-50"
        }`}>
          <p className="text-sm font-medium">
            {!drift.checked && "❔ 尚未對帳 — 還不知道 Trello 跟你的 Numbers 對不對得上"}
            {drift.checked && drift.error && `🔴 對帳失敗：${drift.error}`}
            {drift.checked && !drift.error && drift.numbersNewer &&
              "⚠️ 你在對帳之後又改過 Numbers — 請重跑對帳"}
            {drift.checked && !drift.error && !drift.numbersNewer && drift.stale &&
              `⚠️ 對帳結果已過期（${drift.ageHours} 小時前）— 請重跑`}
            {drift.checked && !drift.error && !drift.stale && drift.weekRecords > 0 &&
              `🔴 這週有 ${drift.weekRecords} 筆與 Numbers 不一致 — 修好才能發給客人`}
            {drift.checked && !drift.error && !drift.stale && drift.weekRecords === 0 &&
              "✅ 這週與 Numbers 一致，可以發給客人"}
          </p>
          {/* 出貨日不一致不擋發送：客人頁的完工日是從排程日算的，而且客人確認後
              Numbers 那格會被改寫成送貨日，本來就不等於 Trello 出貨日。 */}
          {drift.checked && !drift.error && !drift.stale && drift.weekDueRecords > 0 && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              另有 {drift.weekDueRecords} 筆出貨日與 Trello 不同（不影響發送，客人看到的完工日是從排程日算的）
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {drift.checkedAt
              ? `本機最後對帳 ${new Date(drift.checkedAt).toLocaleString("zh-TW", { hour12: false })}`
              : "本機從未推送過對帳結果"}
            {drift.totalRecords > 0 && `　全期間共 ${drift.totalRecords} 筆差異`}
          </p>
          {!safeToSend && (
            <p className="mt-2 rounded bg-white/70 px-3 py-2 text-xs leading-relaxed text-[var(--text-primary)]">
              {drift.weekRecords > 0 ? (
                <>
                  請先把上面標紅的那幾筆改成一致（改 Trello 或改 Numbers 都可以）。
                  <strong>存檔 Numbers 後約 20 秒會自動重新對帳</strong>，這裡就會跟著更新，
                  「複製批次清單」也會自動解鎖 —— 你不需要另外執行什麼。
                </>
              ) : (
                <>
                  對帳是<strong>存檔《馬鈴薯排程.numbers》時自動跑的</strong>（約 20 秒）。
                  這裡卡住通常代表你的電腦沒開機、或剛改完還沒跑完 —— 開著電腦等一下再重新整理。
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* 統計 */}
      {summary && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-base font-medium">
            這週 {summary.total} 張，已確認 <span className="text-emerald-700">{summary.confirmed}</span> 張，
            還差{" "}
            {summary.total - summary.confirmed > 0 ? (
              // 直接點數字就只看那幾張，不用自己在清單裡找
              <button
                type="button"
                onClick={() => setView("pending")}
                className="font-semibold text-amber-700 underline decoration-dotted underline-offset-2 hover:text-amber-800"
                title="只看還沒確認的那幾張"
              >
                {summary.total - summary.confirmed}
              </button>
            ) : (
              <span className="text-amber-700">0</span>
            )}{" "}
            張
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
            {summary.notSent > 0 && <span>· {summary.notSent} 張還沒建連結</span>}
            {summary.unsent > 0 && <span>· {summary.unsent} 張連結建好但還沒傳給客人</span>}
            {summary.sent - summary.unsent > 0 && <span>· {summary.sent - summary.unsent} 張已傳出，等客人回覆</span>}
            {summary.disputed > 0 && <span className="text-red-600">· {summary.disputed} 張客戶回報有誤</span>}
            {summary.postponed > 0 && <span className="text-amber-700">· {summary.postponed} 張要求延後</span>}
            {summary.scheduled > 0 && <span className="text-blue-700">· {summary.scheduled} 張配送已排定</span>}
            {summary.driverRejected > 0 && <span className="text-red-600">· {summary.driverRejected} 張司機排不進</span>}
          </div>
          {summary.staleDue > 0 && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              （另有 {summary.staleDue} 張的 Trello 出貨日還沒更新。不影響客人看到的完工日
              —— 那是從排程日算的 —— 有空再補即可。）
            </p>
          )}
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
            ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
          }`}>
            {ready
              ? "✅ 全部客戶都已確認 — 可以進行組件叫料了"
              : `⛔ 還不能叫料：尚有 ${summary.total - summary.confirmed} 張未確認`}
            {summary.postponed > 0 && (
              <span className="mt-1 block font-normal">
                其中 {summary.postponed} 張客戶要求延後備料 — 請先把那幾張移出本週（改排程日），本週才走得下去。
              </span>
            )}
          </p>
        </div>
      )}

      {/* 司機批次 */}
      {readyForDriver.length > 0 && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            🚚 交給司機排車（{readyForDriver.length} 筆客人已確認、等排車）
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            勾選同一位司機要跑的幾筆 → 產生一條連結，司機一頁全部挑完，不用開好幾次。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {readyForDriver.map((r) => (
              <button
                key={r.cardId}
                type="button"
                onClick={() => setPicked((p) => {
                  const n = new Set(p);
                  if (n.has(r.cardId)) n.delete(r.cardId); else n.add(r.cardId);
                  return n;
                })}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  picked.has(r.cardId)
                    ? "border-blue-600 bg-blue-600 font-medium text-white"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                {picked.has(r.cardId) ? "✓ " : ""}{r.orderNumber} {r.customerName}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button" onClick={() => void makeDriverBatch()} disabled={busy || picked.size === 0}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "產生中…" : `產生司機批次連結（已選 ${picked.size}）`}
            </button>
            {picked.size > 0 && (
              <button type="button" onClick={() => setPicked(new Set())}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs">
                清除勾選
              </button>
            )}
          </div>
          {batchLink && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
              <p className="text-xs text-[var(--text-secondary)]">司機連結（傳給司機這一條就好）</p>
              <p className="mt-1 break-all font-mono text-xs">{batchLink}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copy(`【馬鈴薯沙發】配送時段確認\n\n這批共 ${picked.size || ""} 筆，麻煩幫忙挑時間，地址電話都在裡面：\n${batchLink}`, "drvbatch")}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                >
                  {copied === "drvbatch" ? "已複製 ✓" : "複製司機訊息"}
                </button>
                <a href={batchLink} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs">
                  預覽司機看到的畫面
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 清單篩選：一眼切到「還沒確認的那幾張」 */}
      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {([
            { key: "all" as const, label: `全部 ${rows.length}`, cls: "border-[var(--border)]" },
            { key: "pending" as const, label: `⛔ 未確認 ${pendingRows.length}`, cls: "border-amber-300 text-amber-800" },
            { key: "done" as const, label: `✅ 已確認 ${doneRows.length}`, cls: "border-emerald-300 text-emerald-800" },
          ]).map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setView(c.key)}
              // 🔴 選中態的字色要用 --text-inverse（白）。先前誤寫 --surface，
              //    那個變數專案裡根本沒定義 → 字色無效、沿用深色 → 黑底黑字整顆看不見。
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                view === c.key
                  ? "border-transparent bg-[var(--text-primary)] text-[var(--text-inverse)]"
                  : `bg-[var(--bg-elevated)] ${c.cls}`
              }`}
            >
              {c.label}
            </button>
          ))}
          {view === "all" && pendingRows.length > 0 && (
            <span className="text-xs text-[var(--text-secondary)]">（未確認的已排到最前面）</span>
          )}
        </div>
      )}

      {/* 清單 */}
      <div className="mt-4 space-y-3">
        {rows.length === 0 && !loading && (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-secondary)]">
            這個區間沒有排程訂單。確認一下日期，或該週排程日還沒同步進 Trello。
          </p>
        )}

        {visibleRows.map((r) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.not_sent;
          const waited = r.status === "sent" ? daysSince(r.createdAt) : null;
          // 未確認的用左側琥珀色粗邊標出來，掃一眼就知道是哪幾張
          const pending = !isCustomerConfirmed(r.status);
          return (
            <div
              key={r.cardId}
              className={`rounded-xl border bg-[var(--surface)] p-4 ${
                pending
                  ? "border-amber-300 border-l-4 border-l-amber-500"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold">{r.orderNumber} {r.customerName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                {r.token && !r.notifiedAt && r.status === "sent" && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                    連結未傳出
                  </span>
                )}
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
                {r.isFutures && (
                  <span
                    title={`期貨布料（${r.colorCodes}）：交期依實際到料，訊息與客人確認頁都會附上告知`}
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                  >
                    📌 期貨布
                  </span>
                )}
                <span className="ml-auto text-xs text-[var(--text-secondary)]">
                  排程 {fmtMd(r.scheduleDate)}　預計出貨 {fmtMd(r.dueDate)}
                </span>
              </div>

              {r.status === "scheduled" && (
                <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
                  🚚 司機已確定：{fmtMd(r.chosenDate)} {r.chosenPeriod}（出貨日已寫回 Trello）
                </p>
              )}

              {r.status === "driver_rejected" && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  司機回報三組時段都無法配合，請直接跟客人另約時間。
                </p>
              )}

              {(r.status === "confirmed" || r.status === "scheduled" || r.status === "driver_rejected") && (
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

              {(r.status === "disputed" || r.status === "postponed") && (
                <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  <p>
                    {r.status === "postponed" ? "客戶要求延後" : "客戶回報"}
                    {r.disputeNote ? `：${r.disputeNote}` : ""}
                  </p>
                  <button
                    type="button" disabled={busy}
                    onClick={() => void reopenConfirm(r.token ? [r.token] : [])}
                    title="訂貨單內容／照片已修正 → 這筆回到「待確認」，用原本那條連結重發給客人"
                    className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {busy ? "處理中…" : "✅ 內容已修正，重發給客人"}
                  </button>
                </div>
              )}

              {/* 只有出貨日不同時用灰字：那不擋發送，印成紅的會讓人以為要先去修 */}
              {r.driftReasons.length > 0 && (
                <div className={`mt-2 rounded-lg px-3 py-2 text-sm ${
                  r.blockingDriftReasons.length > 0
                    ? "bg-red-50 text-red-800"
                    : "bg-[var(--surface-2)] text-[var(--text-secondary)]"
                }`}>
                  {r.blockingDriftReasons.length > 0 ? "🔴 與 Numbers 不一致：" : "與 Numbers 不同（不影響發送）："}
                  {r.driftReasons.map((x, i) => <span key={i} className="ml-1">{x}</span>)}
                </div>
              )}

              {r.status === "postponed" && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  ⏸ 客戶目前無法進場{r.disputeNote ? `：${r.disputeNote}` : ""}
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
                    {r.notifiedAt && r.status === "sent" && (
                      <button
                        type="button" disabled={busy}
                        onClick={() => void revertNotified(r.token ? [r.token] : [])}
                        title="按過複製但其實沒傳出去（例如只是在測試）→ 退回未傳送，這筆會回到批次清單"
                        className="rounded-lg border border-amber-500 px-3 py-1.5 text-xs text-amber-700 disabled:opacity-40"
                      >
                        ↩︎ 退回未傳送
                      </button>
                    )}
                    {r.driverToken && r.status !== "scheduled" && (
                      <>
                        <button
                          type="button" onClick={() => void copy(driverMsgOf(r), `drv-${r.cardId}`)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                        >
                          {copied === `drv-${r.cardId}` ? "已複製 ✓" : "🚚 複製司機訊息"}
                        </button>
                        <a
                          href={driverLinkOf(r)} target="_blank" rel="noopener noreferrer"
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
                        >
                          預覽司機看到的畫面
                        </a>
                      </>
                    )}
                  </>
                ) : (
                  <button
                    type="button" onClick={() => void createLinks([r.cardId])} disabled={busy}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:opacity-40"
                  >
                    只建這一筆
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
