"use client";

import { Copy, Edit, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CHANNEL_LABELS } from "@/lib/constants";
import type { QuoteRecord, QuoteStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export function QuotesClient() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<QuoteStatus | "all">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

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
      if (filterDateFrom && q.quoteDate < filterDateFrom) return false;
      if (filterDateTo && q.quoteDate > filterDateTo) return false;
      return true;
    });
  }, [filterDateFrom, filterDateTo, filterStatus, quotes, searchText, showDeleted]);

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
                  <th className="w-32 px-4 py-2.5">操作</th>
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
    </div>
  );
}
