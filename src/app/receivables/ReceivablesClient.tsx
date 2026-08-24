"use client";

import { ExternalLink, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PendingMonthlyPanel } from "@/components/ar/PendingMonthlyPanel";
import {
  AR_STATUS_COLOR,
  AR_STATUS_LABEL,
  isoDateNow,
} from "@/lib/ar-utils";
import { useARMonthlySummary, useReceivables } from "@/hooks/useReceivables";
import type { ARStatus } from "@/lib/types";

const STATUS_FILTER_OPTIONS: Array<{ value: ARStatus | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "active", label: "待收款" },
  { value: "partial", label: "部分收款" },
  { value: "overdue", label: "逾期" },
  { value: "paid", label: "已收清" },
];

function fmt(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

export function ReceivablesClient() {
  const { ars, loading, reload } = useReceivables();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ARStatus | "all">("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [month, setMonth] = useState(() => isoDateNow().slice(0, 7));
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(arId: string, receivedAmount: number) {
    const warn =
      receivedAmount > 0
        ? `此應收帳款已收 NT$ ${fmt(receivedAmount)}，刪除後收款記錄一併移除且無法復原。\n\n確定要刪除 ${arId}？`
        : `確定要刪除應收帳款 ${arId}？\n\n將一併移除所有收款分期，且無法復原。`;
    if (!confirm(warn)) return;
    setDeletingId(arId);
    try {
      const res = await fetch(`/api/sheets/ar/${encodeURIComponent(arId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "刪除失敗");
      }
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setDeletingId(null);
    }
  }

  const { summary } = useARMonthlySummary(month);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ars
      .filter((ar) => ar.arStatus !== "cancelled")
      .filter((ar) => statusFilter === "all" || ar.arStatus === statusFilter)
      .filter((ar) => !overdueOnly || ar.hasOverdue)
      .filter((ar) => {
        if (!q) return true;
        return [
          ar.arId,
          ar.clientNameSnapshot,
          ar.contactNameSnapshot,
          ar.projectNameSnapshot,
          ar.caseNameSnapshot,
          ar.quoteId,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  }, [ars, search, statusFilter, overdueOnly]);

  return (
    <div className="space-y-6">
      {/* 手機：標題與操作列上下分行；≥sm 恢復同列左右對齊 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">應收帳款</h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            追蹤成交報價的收款進度
            {!loading && <span className="ml-2">{ars.length} 筆</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          重新載入
        </Button>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">應收清單</TabsTrigger>
          <TabsTrigger value="pending-monthly">月結待出</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4 space-y-6">

      {/* Monthly summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">本月應收</div>
          <div className="mt-1 text-lg font-semibold">
            NT$ {summary ? fmt(summary.dueAmount) : "—"}
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">本月已收</div>
          <div className="mt-1 text-lg font-semibold text-green-600">
            NT$ {summary ? fmt(summary.receivedAmount) : "—"}
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">本月未收</div>
          <div className="mt-1 text-lg font-semibold text-amber-600">
            NT$ {summary ? fmt(summary.outstandingAmount) : "—"}
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">逾期</div>
          <div className="mt-1 text-lg font-semibold text-red-600">
            {summary?.overdueCount ?? 0} 筆 · NT$ {summary ? fmt(summary.overdueAmount) : "—"}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            placeholder="搜尋單號、客戶、專案"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ARStatus | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-40"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Checkbox
            checked={overdueOnly}
            onCheckedChange={(c) => setOverdueOnly(c === true)}
          />
          只看逾期
        </label>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">應收單號</th>
              <th className="px-3 py-2 text-left font-medium">建立日</th>
              <th className="px-3 py-2 text-left font-medium">客戶</th>
              <th className="px-3 py-2 text-left font-medium">專案</th>
              <th className="px-3 py-2 text-right font-medium">總額</th>
              <th className="px-3 py-2 text-right font-medium">已收</th>
              <th className="px-3 py-2 text-right font-medium">未收</th>
              <th className="px-3 py-2 text-left font-medium">狀態</th>
              <th className="px-3 py-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]">
                  載入中…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]">
                  尚無應收帳款
                </td>
              </tr>
            )}
            {filtered.map((ar) => (
              <tr
                key={ar.arId}
                className={[
                  "hover:bg-[var(--bg-hover)]",
                  ar.hasOverdue ? "bg-red-50/50" : "",
                ].join(" ")}
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/receivables/${ar.arId}`}
                    className="font-mono text-xs text-[var(--accent)] hover:underline"
                  >
                    {ar.arId}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs">{ar.issueDate}</td>
                <td className="px-3 py-2 text-xs">
                  <div className="font-medium">{ar.clientNameSnapshot || "—"}</div>
                  {ar.contactNameSnapshot && (
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {ar.contactNameSnapshot}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{ar.projectNameSnapshot || "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  NT$ {fmt(ar.totalAmount)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-green-700">
                  {fmt(ar.receivedAmount)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-amber-700">
                  {fmt(ar.outstandingAmount)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${AR_STATUS_COLOR[ar.arStatus]}`}
                  >
                    {AR_STATUS_LABEL[ar.arStatus]}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/receivables/${ar.arId}`}
                      className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                    >
                      檢視
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    <button
                      onClick={() => void handleDelete(ar.arId, ar.receivedAmount)}
                      disabled={deletingId === ar.arId}
                      className="text-[var(--text-tertiary)] transition-colors hover:text-red-600 disabled:opacity-50"
                      title="刪除應收帳款"
                    >
                      {deletingId === ar.arId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </TabsContent>

        <TabsContent value="pending-monthly" className="mt-4">
          <PendingMonthlyPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
