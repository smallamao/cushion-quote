"use client";

import { Copy, Edit, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CHANNEL_LABELS } from "@/lib/constants";
import type { QuoteRecord, QuoteStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
};

export function QuotesClient() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);

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

  const sorted = [...quotes].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  async function handleDelete(quoteId: string) {
    if (!confirm(`確定要刪除報價單 ${quoteId}？此操作無法復原。`)) return;
    try {
      const response = await fetch("/api/sheets/quotes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      if (!response.ok) throw new Error("刪除失敗");
      setQuotes((prev) => prev.filter((q) => q.quoteId !== quoteId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "刪除失敗");
    }
  }

  const acceptedCount = quotes.filter((q) => q.status === "accepted").length;
  const totalAmount = quotes.reduce((sum, q) => sum + q.total, 0);

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
              : `${quotes.length} 筆報價 · ${acceptedCount} 筆已接受 · 總額 ${formatCurrency(totalAmount)}`}
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
