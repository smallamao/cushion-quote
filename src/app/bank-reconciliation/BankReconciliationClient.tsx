"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ScanLine, Upload } from "lucide-react";
import { parseSinopacCSV } from "@/lib/bank-csv-parser";
import { matchAllTransactions } from "@/lib/bank-reconciliation-matcher";
import type {
  ARWithSchedules,
  BankPaymentType,
  BankReconRecord,
  ReconciliationEntry,
} from "@/lib/types";
import { Button } from "@/components/ui/button";

const PAYMENT_TYPE_OPTIONS: BankPaymentType[] = [
  "訂金",
  "尾款",
  "全額",
  "進貨款",
  "佣金",
  "雜項",
];

// ── UploadArea ──────────────────────────────────────────────

function UploadArea({ onFile }: { onFile: (text: string) => void }) {
  const [dragging, setDragging] = useState(false);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => onFile((e.target?.result as string) ?? "");
    reader.readAsText(file, "utf-8");
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
      }}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
        dragging
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border)] hover:border-[var(--accent)]/50"
      }`}
    >
      <Upload className="mb-3 h-8 w-8 text-[var(--text-tertiary)]" />
      <p className="text-sm font-medium text-[var(--text-primary)]">
        拖放永豐銀行 CSV 至此，或
      </p>
      <label className="mt-2 cursor-pointer text-sm text-[var(--accent)] underline">
        選擇檔案
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
          }}
        />
      </label>
      <p className="mt-2 text-xs text-[var(--text-tertiary)]">
        支援永豐銀行往來明細 CSV（UTF-8）
      </p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export function BankReconciliationClient() {
  const [entries, setEntries] = useState<ReconciliationEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(sessionStorage.getItem("recon_entries") ?? "[]") as ReconciliationEntry[]; } catch { return []; }
  });
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [accountNumber, setAccountNumber] = useState<string>(() =>
    typeof window === "undefined" ? "" : (sessionStorage.getItem("recon_account") ?? ""),
  );
  const [arList, setArList] = useState<ARWithSchedules[]>([]);
  const [arLoading, setArLoading] = useState(true);
  const [arError, setArError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResults, setSubmitResults] = useState<
    Record<string, "ok" | "error">
  >({});
  const [historyRecords, setHistoryRecords] = useState<BankReconRecord[]>([]);
  const [historyMonth, setHistoryMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load AR data on mount
  useEffect(() => {
    fetch("/api/sheets/ar?includeSchedules=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { ars: ARWithSchedules[] }) =>
        setArList(data.ars ?? []),
      )
      .catch(() => { setArError(true); })
      .finally(() => setArLoading(false));
  }, []);

  const updateEntry = useCallback(
    (txId: string, patch: Partial<ReconciliationEntry>) => {
      setEntries((prev) => {
        const next = prev.map((e) => (e.tx.txId === txId ? { ...e, ...patch } : e));
        try { sessionStorage.setItem("recon_entries", JSON.stringify(next)); } catch { /* quota */ }
        return next;
      });
    },
    [],
  );

  const loadHistory = useCallback(async (month: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/sheets/bank-recon?month=${month}`, { cache: "no-store" });
      const data = (await res.json()) as { records: BankReconRecord[] };
      setHistoryRecords(data.records ?? []);
    } catch {
      setHistoryRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleFile = useCallback(
    async (csvText: string) => {
      const result = parseSinopacCSV(csvText);
      setParseErrors(result.errors);
      setAccountNumber(result.accountNumber);
      sessionStorage.setItem("recon_account", result.accountNumber);
      setSubmitResults({});
      const matched = matchAllTransactions(result.transactions, arList);

      // 查歷史已確認的 txId，把重複出現的標為 confirmed，避免重複操作
      let confirmedTxIds = new Set<string>();
      try {
        const res = await fetch("/api/sheets/bank-recon", { cache: "no-store" });
        const data = (await res.json()) as { records: BankReconRecord[] };
        confirmedTxIds = new Set((data.records ?? []).map((r) => r.txId));
      } catch { /* 查不到就略過，不影響主流程 */ }

      const withConfirmed = matched.map((e) =>
        confirmedTxIds.has(e.tx.txId) ? { ...e, status: "confirmed" as const } : e,
      );
      setEntries(withConfirmed);
      try { sessionStorage.setItem("recon_entries", JSON.stringify(withConfirmed)); } catch { /* quota */ }
    },
    [arList],
  );

  // Entries eligible for AR write-back
  const confirmable = entries.filter(
    (e) =>
      e.status !== "ignored" &&
      e.status !== "confirmed" &&
      e.tx.credit !== null &&
      e.arId !== null &&
      e.scheduleId !== null &&
      e.paymentType !== null,
  );

  async function handleConfirmAll() {
    if (!confirmable.length) return;
    if (!confirm(`確定將 ${confirmable.length} 筆收款寫入應收帳款？`)) return;

    setSubmitting(true);
    const results: Record<string, "ok" | "error"> = {};

    for (const entry of confirmable) {
      try {
        // 小差額自動結清：實入比該期剩餘應收少 ≤50 元（例：客戶扣匯費 30），
        // 差額掛「調整金額」沖銷，該期直接變已收款；差額 >50 則登實收、留部分收款
        const schedule = arList
          .find((a) => a.arId === entry.arId)
          ?.schedules.find((s) => s.scheduleId === entry.scheduleId);
        const credit = entry.tx.credit ?? 0;
        let adjustmentAmount = 0;
        let adjustmentNote = "";
        if (schedule) {
          const remaining =
            schedule.amount + schedule.adjustmentAmount - schedule.receivedAmount;
          const diff = remaining - credit;
          if (diff > 0 && diff <= 50) {
            adjustmentAmount = -diff;
            adjustmentNote = `（差額 $${diff} 自動沖銷為手續費）`;
          }
        }
        const res = await fetch(
          `/api/sheets/ar/${entry.arId}/schedules/${entry.scheduleId}/receive`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scheduleId: entry.scheduleId,
              receivedAmount: entry.tx.credit,
              receivedDate: entry.tx.txDate,
              paymentMethod: "transfer",
              notes: `銀行核對：${entry.tx.memo}${adjustmentNote}`,
              ...(adjustmentAmount !== 0 ? { adjustmentAmount } : {}),
            }),
          },
        );
        const data = (await res.json()) as { ok: boolean };
        results[entry.tx.txId] = data.ok ? "ok" : "error";
        if (data.ok) {
          updateEntry(entry.tx.txId, { status: "confirmed" });
        }
      } catch {
        results[entry.tx.txId] = "error";
      }
    }

    setSubmitResults(results);

    // 把成功的 entry 存到歷史紀錄
    const successEntries = confirmable
      .filter((e) => results[e.tx.txId] === "ok")
      .map((e) => ({
        txId: e.tx.txId,
        txDate: e.tx.txDate,
        amount: e.tx.credit!,
        description: e.tx.description,
        memo: e.tx.memo,
        caseId: e.caseId!,
        caseNameSnapshot: e.caseNameSnapshot ?? "",
        clientNameSnapshot: e.clientNameSnapshot ?? "",
        paymentType: e.paymentType!,
      }));
    if (successEntries.length > 0) {
      void fetch("/api/sheets/bank-recon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: successEntries }),
      });
    }

    setSubmitting(false);
  }

  const creditCount = entries.filter((e) => e.tx.credit !== null).length;
  const debitCount = entries.filter((e) => e.tx.debit !== null).length;
  const highCount = entries.filter((e) => e.confidence === "high").length;
  const medCount = entries.filter((e) => e.confidence === "medium").length;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-2">
        <ScanLine className="h-5 w-5 shrink-0 text-[var(--accent)]" />
        <h1 className="text-xl font-bold">核對入帳</h1>
      </div>

      {/* History toggle */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (!showHistory) {
              void loadHistory(historyMonth);
            }
            setShowHistory((v) => !v);
          }}
          className="text-sm text-[var(--accent)] underline"
        >
          {showHistory ? "收起歷史紀錄" : "查看歷史紀錄"}
        </button>
      </div>

      {showHistory && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">歷史核對紀錄</h2>
            <input
              type="month"
              value={historyMonth}
              onChange={(e) => {
                setHistoryMonth(e.target.value);
                void loadHistory(e.target.value);
              }}
              className="h-7 rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs"
            />
          </div>
          {historyLoading && (
            <p className="text-center text-xs text-[var(--text-tertiary)]">載入中…</p>
          )}
          {!historyLoading && historyRecords.length === 0 && (
            <p className="text-center text-xs text-[var(--text-tertiary)]">
              {historyMonth} 無紀錄
            </p>
          )}
          {!historyLoading && historyRecords.length > 0 && (
            <div className="space-y-1.5">
              {historyRecords.map((r) => (
                <div
                  key={r.reconId}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs text-[var(--text-tertiary)]">
                      {r.txDate} · {r.description}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {r.caseId} {r.caseNameSnapshot} · {r.paymentType}
                    </span>
                  </div>
                  <span className="font-semibold text-green-700">
                    +${r.amount.toLocaleString("zh-TW")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <>
          <UploadArea onFile={handleFile} />
          {arLoading && (
            <p className="text-center text-xs text-[var(--text-tertiary)]">
              正在載入 AR 資料…
            </p>
          )}
          {arError && (
            <div className="flex gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>無法載入 AR 資料，請重新整理頁面。</p>
            </div>
          )}
          {!arLoading && !arError && (
            <p className="text-center text-xs text-[var(--text-tertiary)]">
              已載入 {arList.length} 筆 AR，上傳 CSV 後自動比對
            </p>
          )}
        </>
      ) : (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm">
            <span className="text-[var(--text-secondary)]">
              帳號：{accountNumber}
            </span>
            <span>
              共 <strong>{entries.length}</strong> 筆
            </span>
            <span className="text-green-700">存入 {creditCount} 筆</span>
            <span className="text-orange-600">支出 {debitCount} 筆</span>
            <span className="text-blue-700">高信心 {highCount} 筆</span>
            <span className="text-yellow-700">中信心 {medCount} 筆</span>
            <div className="ml-auto flex items-center gap-2">
              {confirmable.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => void handleConfirmAll()}
                  disabled={submitting}
                  className="text-xs"
                >
                  {submitting
                    ? "寫入中…"
                    : `確認已配對項目（${confirmable.length} 筆）`}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEntries([]);
                  setParseErrors([]);
                  setSubmitResults({});
                  setAccountNumber("");
                  sessionStorage.removeItem("recon_entries");
                  sessionStorage.removeItem("recon_account");
                }}
                className="text-xs"
              >
                重新上傳
              </Button>
            </div>
          </div>

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="flex gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                {parseErrors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            </div>
          )}

          {/* Transaction list */}
          <div className="space-y-2">
            {entries.map((entry) => {
              const { tx, confidence, caseId, caseNameSnapshot, paymentType } =
                entry;
              const hasFailed = submitResults[tx.txId] === "error";

              return (
                <div
                  key={tx.txId}
                  className={`rounded-lg border bg-[var(--bg-elevated)] px-4 py-3 text-sm transition-colors ${
                    entry.status === "confirmed"
                      ? "border-green-200 bg-green-50/30"
                      : entry.status === "ignored"
                        ? "border-[var(--border)] opacity-50"
                        : "border-[var(--border)]"
                  }`}
                >
                  {/* Row 1: date + amount */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[var(--text-tertiary)]">
                      {tx.txDate} {tx.txTime} · {tx.description}
                    </span>
                    {tx.credit !== null && (
                      <span className="font-semibold text-green-700">
                        +${tx.credit.toLocaleString("zh-TW")}
                      </span>
                    )}
                    {tx.debit !== null && (
                      <span className="font-semibold text-orange-600">
                        −${tx.debit.toLocaleString("zh-TW")}
                      </span>
                    )}
                  </div>

                  {/* Row 2: memo */}
                  {tx.memo && (
                    <div className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
                      {tx.memo}
                    </div>
                  )}

                  {/* Row 3: match badges */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {confidence === "high" && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                        ✓ 高信心
                      </span>
                    )}
                    {confidence === "medium" && (
                      <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                        ? 中信心
                      </span>
                    )}
                    {confidence === "none" && tx.credit !== null && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                        未配對
                      </span>
                    )}
                    {tx.debit !== null && (
                      <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-600">
                        支出
                      </span>
                    )}
                    {caseId && (
                      <span className="text-xs text-[var(--text-secondary)]">
                        {caseId} {caseNameSnapshot}
                      </span>
                    )}
                    {paymentType && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {paymentType}
                      </span>
                    )}
                    {entry.status === "confirmed" && (
                      <span className="text-xs text-green-600">✓ 已寫入 AR</span>
                    )}
                  </div>

                  {/* Row 4: manual controls */}
                  {entry.status !== "ignored" &&
                    entry.status !== "confirmed" &&
                    tx.credit !== null && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          placeholder="案件號（如 S879）"
                          defaultValue={entry.caseId ?? ""}
                          onBlur={(e) => {
                            const val = e.target.value.trim().toUpperCase();
                            const matched = arList.find(
                              (a) => a.caseId === val,
                            );
                            updateEntry(tx.txId, {
                              caseId: val || null,
                              arId: matched?.arId ?? null,
                              scheduleId: null,
                              caseNameSnapshot: matched?.caseNameSnapshot ?? null,
                              clientNameSnapshot: matched?.clientNameSnapshot ?? null,
                            });
                          }}
                          className="h-7 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                        />
                        <select
                          value={entry.paymentType ?? ""}
                          onChange={(e) =>
                            updateEntry(tx.txId, {
                              paymentType:
                                (e.target.value as BankPaymentType) || null,
                            })
                          }
                          className="h-7 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs"
                        >
                          <option value="">款項類型</option>
                          {PAYMENT_TYPE_OPTIONS.map((pt) => (
                            <option key={pt} value={pt}>
                              {pt}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            updateEntry(tx.txId, { status: "ignored" })
                          }
                          className="rounded px-2 py-0.5 text-xs text-[var(--text-tertiary)] hover:bg-[var(--surface-2)]"
                        >
                          略過
                        </button>
                      </div>
                    )}

                  {entry.status === "ignored" && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        已略過
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateEntry(tx.txId, { status: "pending" })
                        }
                        className="text-xs text-[var(--accent)] underline"
                      >
                        取消略過
                      </button>
                    </div>
                  )}

                  {/* Debit rows: only show ignore */}
                  {tx.debit !== null &&
                    entry.status !== "ignored" &&
                    entry.status !== "confirmed" && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateEntry(tx.txId, { status: "ignored" })
                          }
                          className="rounded px-2 py-0.5 text-xs text-[var(--text-tertiary)] hover:bg-[var(--surface-2)]"
                        >
                          略過（進貨款 / 不需核對）
                        </button>
                      </div>
                    )}

                  {/* Write-back results */}
                  {hasFailed && (
                    <p className="mt-1 text-xs text-red-600">
                      ✗ 寫入失敗，請手動更新
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
