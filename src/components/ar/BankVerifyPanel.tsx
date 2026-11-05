"use client";

// 應收帳款 →「銀行對帳」分頁：上傳永豐往來明細，逐筆核對入帳是否都已記進應收。
// 🔴 唯讀：這裡沒有任何寫回按鈕。收款一律在客人回報時從應收明細頁記錄，
//    這頁只負責找出「銀行有、系統沒有」與「系統有、銀行沒有」的落差。

import { AlertCircle, ExternalLink, Loader2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { parseSinopacFiles } from "@/lib/bank-csv-parser";
import {
  accountIdsForCsv,
  buildVerifySchedules,
  CROSS_PERIOD_DAYS,
  maskMemo,
  verifyBankTransactions,
  type BankVerifyRow,
  type VerifyCategory,
  type VerifySchedule,
} from "@/lib/bank-verify";
import { receivingAccountLabelById } from "@/lib/remittance";
import type { ARWithSchedules, CustomOrder } from "@/lib/types";

interface CsvFile {
  /** 名稱＋大小＋修改時間：同名但內容不同的檔案（例：兩個帳戶都叫「往來明細.csv」）不會互相覆蓋 */
  key: string;
  name: string;
  text: string;
}

const CATEGORY_META: Record<VerifyCategory, { icon: string; label: string; hint: string; tone: string }> = {
  missing_in_system: {
    icon: "❗",
    label: "銀行有入帳、系統沒記錄",
    hint: "到應收明細頁補記收款，或確認是不是別的款項",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
  amount_mismatch: {
    icon: "⚠️",
    label: "金額不符",
    hint: "末五碼或單號對上了，但金額差超過 $50",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  possible: {
    icon: "🔍",
    label: "可能是",
    hint: "沒有末五碼／單號佐證，只靠金額與日期推測，請人工確認",
    tone: "border-blue-200 bg-blue-50 text-blue-700",
  },
  ok: {
    icon: "✅",
    label: "一致",
    hint: "末五碼或單號＋金額都對上",
    tone: "border-green-200 bg-green-50 text-green-700",
  },
  non_order: {
    icon: "⚪",
    label: "非訂單款",
    hint: "利息、回饋、退款、自家帳戶互轉",
    tone: "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
  },
};

const SYSTEM_ONLY_META = {
  icon: "❌",
  label: "系統有記、銀行沒看到",
  hint: "明細期間內記為匯款、但這份明細找不到對應入帳（可能匯到別的帳戶，或記錯日期／金額）",
  tone: "border-red-200 bg-red-50 text-red-700",
};

const CROSS_PERIOD_META = {
  icon: "ℹ️",
  label: "可能跨月入帳",
  hint: `收款日在明細最後 ${CROSS_PERIOD_DAYS} 天、銀行還沒看到：多半隔個營業日才入帳，上傳下一期明細再看`,
};

function fmt(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

async function readCsvFiles(list: FileList | null): Promise<CsvFile[]> {
  const files = Array.from(list ?? []).filter((f) => f.name.toLowerCase().endsWith(".csv"));
  return Promise.all(
    files.map(async (f) => ({ key: `${f.name}|${f.size}|${f.lastModified}`, name: f.name, text: await f.text() })),
  );
}

function ArLink({ arId }: { arId: string }) {
  if (!arId) return null;
  return (
    <Link
      href={`/receivables/${encodeURIComponent(arId)}`}
      className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
    >
      應收明細 <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

function scheduleText(s: VerifySchedule): string {
  const parts = [s.label || "分期", `$${fmt(s.receivedAmount)}`];
  if (s.receivedDate) parts.push(s.receivedDate.slice(5));
  return parts.join(" · ");
}

function BankRow({ row }: { row: BankVerifyRow }) {
  const clientName = row.schedules[0]?.clientName || row.orderClientName;
  const orderNos = [...new Set([row.orderNumber, ...row.schedules.flatMap((s) => s.orderNumbers)].filter(Boolean))];
  const showArLink = row.category === "missing_in_system" || row.category === "amount_mismatch";
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm sm:flex-row sm:items-start sm:gap-4">
      <div className="w-28 shrink-0 font-mono text-xs text-[var(--text-tertiary)]">
        {row.tx.txDate.slice(5)} {row.tx.txTime}
      </div>
      <div className="w-24 shrink-0 font-semibold tabular-nums">${fmt(row.tx.credit ?? 0)}</div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="break-all text-xs text-[var(--text-secondary)]">
          {row.tx.description && <span className="mr-2">{row.tx.description}</span>}
          {maskMemo(row.tx.memo) || "（無備註）"}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {orderNos.length > 0 && <span className="font-medium">{orderNos.join(" ")}</span>}
          {clientName && <span>{clientName}</span>}
          {row.schedules.map((s) => (
            <span key={s.scheduleId} className="text-[var(--text-secondary)]">
              系統：{scheduleText(s)}
            </span>
          ))}
          <span className="text-[var(--text-tertiary)]">{row.reason}</span>
          {row.note && <span className="text-[var(--text-tertiary)]">{row.note}</span>}
          {showArLink && <ArLink arId={row.arId} />}
        </div>
      </div>
    </div>
  );
}

function SystemOnlyRow({ s }: { s: VerifySchedule }) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-4">
      <div className="w-28 shrink-0 font-mono text-xs text-[var(--text-tertiary)]">{s.receivedDate.slice(5)}</div>
      <div className="w-24 shrink-0 font-semibold tabular-nums">${fmt(s.receivedAmount)}</div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        {s.orderNumbers.length > 0 && <span className="font-medium">{s.orderNumbers.join(" ")}</span>}
        {s.clientName && <span>{s.clientName}</span>}
        <span className="text-[var(--text-secondary)]">{s.label}</span>
        {s.ref && <span className="text-[var(--text-tertiary)]">末五碼 {s.ref}</span>}
        {s.receivingAccountId && (
          <span className="text-[var(--text-tertiary)]">{receivingAccountLabelById(s.receivingAccountId)}</span>
        )}
        <ArLink arId={s.arId} />
      </div>
    </div>
  );
}

function Section({
  meta,
  count,
  defaultOpen,
  children,
}: {
  meta: { icon: string; label: string; hint: string };
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details open={defaultOpen} className="group space-y-2">
      <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--text-primary)]">
        {meta.icon} {meta.label}（{count}）
        <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">{meta.hint}</span>
      </summary>
      <div className="mt-2 space-y-1.5">{children}</div>
    </details>
  );
}

export function BankVerifyPanel() {
  const [ars, setArs] = useState<ARWithSchedules[]>([]);
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [files, setFiles] = useState<CsvFile[]>([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // 訂單要連封存的一起抓：完工封存的單仍可能在這期明細裡收到尾款
        const [arRes, activeRes, archivedRes] = await Promise.all([
          fetch("/api/sheets/ar?includeSchedules=true", { cache: "no-store" }),
          fetch("/api/sheets/orders", { cache: "no-store" }),
          fetch("/api/sheets/orders?archived=true", { cache: "no-store" }),
        ]);
        if (!arRes.ok || !activeRes.ok || !archivedRes.ok) throw new Error("載入應收或訂單失敗");
        const arJson = (await arRes.json()) as { ars?: ARWithSchedules[] };
        const activeJson = (await activeRes.json()) as { orders?: CustomOrder[] };
        const archivedJson = (await archivedRes.json()) as { orders?: CustomOrder[] };
        if (cancelled) return;
        setArs(arJson.ars ?? []);
        setOrders([...(activeJson.orders ?? []), ...(archivedJson.orders ?? [])]);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const parsed = useMemo(() => (files.length ? parseSinopacFiles(files) : null), [files]);
  const schedules = useMemo(() => buildVerifySchedules(ars, orders), [ars, orders]);
  const result = useMemo(
    () =>
      parsed && !loading
        ? verifyBankTransactions(parsed.transactions, schedules, orders, {
            accountTexts: parsed.accountTexts,
            ranges: parsed.ranges,
          })
        : null,
    [parsed, schedules, orders, loading],
  );

  const byCategory = useMemo(() => {
    const map: Record<VerifyCategory, BankVerifyRow[]> = {
      missing_in_system: [],
      amount_mismatch: [],
      possible: [],
      ok: [],
      non_order: [],
    };
    for (const row of result?.rows ?? []) map[row.category].push(row);
    return map;
  }, [result]);

  async function addFiles(list: FileList | null) {
    const incoming = await readCsvFiles(list);
    setFiles((prev) => [...prev, ...incoming.filter((f) => !prev.some((p) => p.key === f.key))]);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-secondary)]">
        上傳永豐「往來明細」CSV（可一次多個月），逐筆核對入帳是否都已記進應收帳款。這裡只核對、不會寫入任何資料。
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
          dragging ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] hover:border-[var(--accent)]/50"
        }`}
      >
        <Upload className="mb-2 h-7 w-7 text-[var(--text-tertiary)]" />
        <p className="text-sm font-medium text-[var(--text-primary)]">拖放永豐往來明細 CSV 至此，或</p>
        <label className="mt-1 cursor-pointer text-sm text-[var(--accent)] underline">
          選擇檔案（可多選）
          <input
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {files.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5"
            >
              {f.name}
              <button
                type="button"
                aria-label={`移除 ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((p) => p.key !== f.key))}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
            全部清除
          </Button>
        </div>
      )}

      {loadError && (
        <div className="flex gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {loadError}，無法核對。請重新整理頁面再試。
        </div>
      )}

      {parsed && parsed.errors.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {parsed.errors.slice(0, 5).map((e) => (
            <div key={e}>{e}</div>
          ))}
          {parsed.errors.length > 5 && <div>…另有 {parsed.errors.length - 5} 則</div>}
        </div>
      )}

      {parsed && loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> 載入應收帳款中…
        </div>
      )}

      {result && parsed && !loadError && (
        <div className="space-y-4">
          <div className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-sm">
            {parsed.accountTexts.map((t) => {
              const ids = accountIdsForCsv(t);
              return (
                <div key={t}>
                  帳戶：{t}
                  {ids.length > 0 ? (
                    <span className="ml-2 text-[var(--text-secondary)]">（{receivingAccountLabelById(ids[0])}）</span>
                  ) : (
                    <span className="ml-2 text-amber-700">（不在收款帳戶清單內，「系統有記、銀行沒看到」只看未指定帳戶的收款）</span>
                  )}
                </div>
              );
            })}
            <div className="text-[var(--text-secondary)]">
              期間：{result.coverage.map((r) => `${r.from} ～ ${r.to}`).join("、")}　入帳 {result.rows.length} 筆　支出 {result.debitCount} 筆（不核對）
            </div>
          </div>

          {result.gaps.length > 0 && (
            <div className="flex gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              上傳的明細中間有缺：{result.gaps.map((g) => `${g.from} ～ ${g.to}`).join("、")}。
              這段期間的收款不會列進「系統有記、銀行沒看到」，要核對請補上該月的明細。
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {[
              { key: "missing_in_system", meta: CATEGORY_META.missing_in_system, count: byCategory.missing_in_system.length },
              { key: "system_only", meta: SYSTEM_ONLY_META, count: result.systemOnly.length },
              { key: "amount_mismatch", meta: CATEGORY_META.amount_mismatch, count: byCategory.amount_mismatch.length },
              { key: "possible", meta: CATEGORY_META.possible, count: byCategory.possible.length },
              { key: "ok", meta: CATEGORY_META.ok, count: byCategory.ok.length },
              { key: "non_order", meta: CATEGORY_META.non_order, count: byCategory.non_order.length },
            ].map(({ key, meta, count }) => (
              <span key={key} className={`rounded-full border px-3 py-1 text-xs font-medium ${meta.tone}`}>
                {meta.icon} {meta.label} {count}
              </span>
            ))}
          </div>

          <Section meta={CATEGORY_META.missing_in_system} count={byCategory.missing_in_system.length} defaultOpen>
            {byCategory.missing_in_system.map((r) => (
              <BankRow key={r.tx.txId} row={r} />
            ))}
          </Section>
          <Section meta={SYSTEM_ONLY_META} count={result.systemOnly.length} defaultOpen>
            {result.systemOnly.map((s) => (
              <SystemOnlyRow key={s.scheduleId} s={s} />
            ))}
          </Section>
          <Section meta={CATEGORY_META.amount_mismatch} count={byCategory.amount_mismatch.length} defaultOpen>
            {byCategory.amount_mismatch.map((r) => (
              <BankRow key={r.tx.txId} row={r} />
            ))}
          </Section>
          <Section meta={CATEGORY_META.possible} count={byCategory.possible.length} defaultOpen>
            {byCategory.possible.map((r) => (
              <BankRow key={r.tx.txId} row={r} />
            ))}
          </Section>
          <Section meta={CROSS_PERIOD_META} count={result.crossPeriod.length} defaultOpen={false}>
            {result.crossPeriod.map((s) => (
              <SystemOnlyRow key={s.scheduleId} s={s} />
            ))}
          </Section>
          <Section meta={CATEGORY_META.ok} count={byCategory.ok.length} defaultOpen={false}>
            {byCategory.ok.map((r) => (
              <BankRow key={r.tx.txId} row={r} />
            ))}
          </Section>
          <Section meta={CATEGORY_META.non_order} count={byCategory.non_order.length} defaultOpen={false}>
            {byCategory.non_order.map((r) => (
              <BankRow key={r.tx.txId} row={r} />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
