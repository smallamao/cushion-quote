"use client";

import { Clock, Copy, Edit, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useClients } from "@/hooks/useClients";
import { CHANNEL_LABELS } from "@/lib/constants";
import type { QuoteLineRecord, QuoteRecord, QuoteStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_MAP: Record<QuoteStatus, { label: string; className: string }> = {
  draft: { label: "草稿", className: "badge-draft" },
  sent: { label: "已發送", className: "badge-sent" },
  accepted: { label: "已接受", className: "badge-accepted" },
  rejected: { label: "已拒絕", className: "badge-rejected" },
  expired: { label: "已過期", className: "badge-expired" },
  deleted: { label: "已刪除", className: "badge-deleted" },
};

type RevisionChangeType = "create" | "update" | "status_change";

interface QuoteRevisionRecord {
  quoteId: string;
  revision: number;
  timestamp: string;
  changeType: RevisionChangeType;
  snapshot: string;
}

interface RevisionSnapshot {
  header: QuoteRecord;
  lines: QuoteLineRecord[];
}

function isRevisionSnapshot(value: unknown): value is RevisionSnapshot {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.header === "object" &&
    candidate.header !== null &&
    Array.isArray(candidate.lines)
  );
}

function parseRevisionSnapshot(snapshot: string): RevisionSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!isRevisionSnapshot(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function formatRevisionTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp || "—";
  }

  return date.toLocaleString("zh-TW", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function QuotesClient() {
  const router = useRouter();
  const { clients, loading: clientsLoading } = useClients();
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<QuoteStatus | "all">("all");
  const [filterClientId, setFilterClientId] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [historyQuote, setHistoryQuote] = useState<QuoteRecord | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [revisions, setRevisions] = useState<QuoteRevisionRecord[]>([]);
  const [expandedRevision, setExpandedRevision] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/sheets/quotes", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("load");
      const payload = (await response.json()) as { quotes: QuoteRecord[] };
      setQuotes(payload.quotes);
    } catch {
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(quoteId: string, status: QuoteStatus) {
    setQuotes((prev) =>
      prev.map((q) => (q.quoteId === quoteId ? { ...q, status } : q)),
    );
    try {
      const response = await fetch("/api/sheets/quotes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, status }),
      });
      if (!response.ok) throw new Error("更新失敗");
    } catch {
      void load();
    }
  }

  async function handleEdit(quoteId: string) {
    try {
      const response = await fetch(`/api/sheets/quotes/${quoteId}`);
      if (!response.ok) throw new Error("讀取失敗");
      const data = await response.json();
      sessionStorage.setItem("quote-to-load", JSON.stringify(data));
      router.push("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "讀取報價失敗");
    }
  }

  async function handleDuplicate(quoteId: string) {
    try {
      const response = await fetch(`/api/sheets/quotes/${quoteId}`);
      if (!response.ok) throw new Error("讀取失敗");
      const data = await response.json();
      sessionStorage.setItem("quote-to-load", JSON.stringify({ ...data, isDuplicate: true }));
      router.push("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "複製報價失敗");
    }
  }

  function closeHistoryModal() {
    setHistoryQuote(null);
    setHistoryLoading(false);
    setHistoryError("");
    setRevisions([]);
    setExpandedRevision(null);
  }

  async function handleOpenHistory(quote: QuoteRecord) {
    setHistoryQuote(quote);
    setHistoryLoading(true);
    setHistoryError("");
    setRevisions([]);
    setExpandedRevision(null);

    try {
      const response = await fetch(
        `/api/sheets/revisions?quoteId=${encodeURIComponent(quote.quoteId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("讀取歷史失敗");

      const payload = (await response.json()) as { revisions: QuoteRevisionRecord[] };
      setRevisions(
        [...payload.revisions].sort((a, b) => b.revision - a.revision),
      );
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "讀取歷史失敗");
    } finally {
      setHistoryLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      if (!showDeleted && q.status === "deleted") return false;

      if (searchText) {
        const s = searchText.toLowerCase();
        const match = [q.clientName, q.projectName, q.quoteId].some((field) =>
          field.toLowerCase().includes(s),
        );
        if (!match) return false;
      }

      if (filterStatus !== "all" && q.status !== filterStatus) return false;
      if (filterClientId !== "all" && q.clientId !== filterClientId) return false;
      if (filterDateFrom && q.quoteDate < filterDateFrom) return false;
      if (filterDateTo && q.quoteDate > filterDateTo) return false;
      return true;
    });
  }, [filterClientId, filterDateFrom, filterDateTo, filterStatus, quotes, searchText, showDeleted]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [filtered],
  );

  async function handleDelete(quoteId: string) {
    if (!confirm(`確定要刪除報價單 ${quoteId}？（可從已刪除中恢復）`)) return;
    try {
      const response = await fetch("/api/sheets/quotes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      if (!response.ok) throw new Error("刪除失敗");
      setQuotes((prev) =>
        prev.map((q) =>
          q.quoteId === quoteId ? { ...q, status: "deleted" } : q,
        ),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "刪除失敗");
    }
  }

  const summaryQuotes = filtered.filter((q) => q.status !== "deleted");
  const hasFilters =
    searchText !== "" ||
    filterStatus !== "all" ||
    filterClientId !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "" ||
    showDeleted;
  const acceptedCount = summaryQuotes.filter((q) => q.status === "accepted").length;
  const totalAmount = summaryQuotes.reduce((sum, q) => sum + q.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            報價紀錄
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {loading
              ? "載入中..."
              : `${hasFilters ? `顯示 ${filtered.length} / ${quotes.length} 筆` : `${quotes.length} 筆報價`} · ${acceptedCount} 筆已接受 · 總額 ${formatCurrency(totalAmount)}`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          重新載入
        </Button>
      </div>

      <div className="card-surface rounded-[var(--radius-lg)] px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜尋客戶、案場、單號..."
            className="lg:max-w-sm"
          />
          <Select
            value={filterStatus}
            onValueChange={(value) => setFilterStatus(value as QuoteStatus | "all")}
          >
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder="全部狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {Object.entries(STATUS_MAP).map(([key, info]) => (
                <SelectItem key={key} value={key}>
                  {info.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filterClientId}
            onValueChange={setFilterClientId}
          >
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue placeholder={clientsLoading ? "載入客戶中..." : "全部客戶"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部客戶</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="w-full lg:w-44"
          />
          <span className="hidden text-sm text-[var(--text-tertiary)] lg:inline">~</span>
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="w-full lg:w-44"
          />
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Checkbox
              checked={showDeleted}
              onCheckedChange={(checked) => setShowDeleted(checked === true)}
            />
            顯示已刪除
          </label>
        </div>
      </div>

      <div className="card-surface overflow-hidden rounded-[var(--radius-lg)]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            載入中...
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
            尚無報價紀錄
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-2.5">單號</th>
                  <th className="px-4 py-2.5">日期</th>
                  <th className="px-4 py-2.5">客戶</th>
                  <th className="px-4 py-2.5">案場</th>
                  <th className="px-4 py-2.5">通路</th>
                  <th className="px-4 py-2.5 text-right">含稅合計</th>
                  <th className="w-28 px-4 py-2.5">狀態</th>
                  <th className="w-40 px-4 py-2.5">操作</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((quote) => {
                  const statusInfo =
                    STATUS_MAP[quote.status] ?? STATUS_MAP.draft;
                  return (
                    <tr key={quote.quoteId}>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {quote.quoteId}
                      </td>
                      <td className="px-4 py-2.5 text-sm">{quote.quoteDate}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-sm font-medium">
                          {quote.clientName || "—"}
                        </div>
                        {quote.clientContact && (
                          <div className="text-xs text-[var(--text-secondary)]">
                            {quote.clientContact}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm">
                        {quote.projectName || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-sm">
                        {CHANNEL_LABELS[quote.channel]?.label ?? quote.channel}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium">
                        {formatCurrency(quote.total)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Select
                          value={quote.status}
                          onValueChange={(v) =>
                            updateStatus(quote.quoteId, v as QuoteStatus)
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue>
                              <span className={`badge ${statusInfo.className}`}>
                                {statusInfo.label}
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_MAP).map(([key, info]) => (
                              <SelectItem key={key} value={key}>
                                {info.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(quote.quoteId)}
                            className="h-7 px-2"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDuplicate(quote.quoteId)}
                            className="h-7 px-2"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleOpenHistory(quote)}
                            className="h-7 px-2"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(quote.quoteId)}
                            className="h-7 px-2 text-[var(--text-tertiary)] hover:text-[var(--error)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={historyQuote !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeHistoryModal();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle>
              報價版本歷史{historyQuote ? ` · ${historyQuote.quoteId}` : ""}
            </DialogTitle>
            <DialogDescription>
              查看報價更新前的完整快照，不提供還原功能。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[62vh] overflow-y-auto px-6 py-4">
            {historyLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                讀取版本歷史中...
              </div>
            ) : historyError ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--error)]/20 bg-[var(--error)]/5 px-4 py-3 text-sm text-[var(--error)]">
                {historyError}
              </div>
            ) : revisions.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
                尚無版本歷史
              </div>
            ) : (
              <div className="space-y-3">
                {revisions.map((revision) => {
                  const snapshot = parseRevisionSnapshot(revision.snapshot);
                  const isExpanded = expandedRevision === revision.revision;

                  return (
                    <div
                      key={`${revision.quoteId}-${revision.revision}`}
                      className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRevision((prev) =>
                            prev === revision.revision ? null : revision.revision,
                          )
                        }
                        className="flex w-full items-center justify-between gap-4 bg-[var(--bg-subtle)] px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                      >
                        <div>
                          <div className="text-sm font-medium text-[var(--text-primary)]">
                            版本 #{revision.revision} · {formatRevisionTimestamp(revision.timestamp)} · {revision.changeType}
                          </div>
                          <div className="mt-1 text-xs text-[var(--text-secondary)]">
                            {snapshot
                              ? `${snapshot.lines.length} 筆品項 · 含稅合計 ${formatCurrency(snapshot.header.total)}`
                              : "快照資料無法解析"}
                          </div>
                        </div>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {isExpanded ? "收合" : "展開"}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="space-y-4 px-4 py-4">
                          {snapshot ? (
                            <>
                              <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-[var(--radius-md)] bg-[var(--bg-subtle)] px-3 py-2">
                                  <div className="text-[11px] text-[var(--text-tertiary)]">
                                    狀態
                                  </div>
                                  <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                                    {STATUS_MAP[snapshot.header.status]?.label ?? snapshot.header.status}
                                  </div>
                                </div>
                                <div className="rounded-[var(--radius-md)] bg-[var(--bg-subtle)] px-3 py-2">
                                  <div className="text-[11px] text-[var(--text-tertiary)]">
                                    稅前合計
                                  </div>
                                  <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                                    {formatCurrency(snapshot.header.totalBeforeTax)}
                                  </div>
                                </div>
                                <div className="rounded-[var(--radius-md)] bg-[var(--bg-subtle)] px-3 py-2">
                                  <div className="text-[11px] text-[var(--text-tertiary)]">
                                    含稅合計
                                  </div>
                                  <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                                    {formatCurrency(snapshot.header.total)}
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-[var(--radius-md)] border border-[var(--border)]">
                                <div className="border-b border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)]">
                                  品項摘要
                                </div>
                                {snapshot.lines.length === 0 ? (
                                  <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                                    此版本沒有報價明細。
                                  </div>
                                ) : (
                                  <div className="divide-y divide-[var(--border)]">
                                    {snapshot.lines.map((line) => (
                                      <div
                                        key={`${revision.revision}-${line.lineNumber}`}
                                        className="flex items-start justify-between gap-4 px-4 py-3"
                                      >
                                        <div>
                                          <div className="text-sm font-medium text-[var(--text-primary)]">
                                            {line.itemName || `品項 ${line.lineNumber}`}
                                          </div>
                                          <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                            {line.materialDesc || "—"} · 數量 {line.qty} · 單價 {formatCurrency(line.unitPrice)}
                                          </div>
                                        </div>
                                        <div className="text-sm font-medium text-[var(--text-primary)]">
                                          {formatCurrency(line.subtotal)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                              此版本的 snapshot JSON 無法解析。
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeHistoryModal}>
              關閉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
