"use client";

import Link from "next/link";
import { Loader2, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePurchases } from "@/hooks/usePurchases";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { PurchaseOrderStatus } from "@/lib/types";

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "草稿",
  sent: "已送出",
  confirmed: "已確認",
  received: "已到貨",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  confirmed: "bg-amber-100 text-amber-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_CHANGE_OPTIONS: PurchaseOrderStatus[] = [
  "draft",
  "sent",
  "confirmed",
  "received",
  "cancelled",
];

function fmtMoney(n: number | null | undefined): string {
  const safeNumber = Number(n ?? 0);
  return (Number.isFinite(safeNumber) ? safeNumber : 0).toLocaleString("zh-TW", {
    maximumFractionDigits: 0,
  });
}

function getSafeStatus(status: PurchaseOrderStatus | string | null | undefined): PurchaseOrderStatus {
  return status && status in STATUS_LABEL ? (status as PurchaseOrderStatus) : "draft";
}

export function PurchasesClient() {
  const { orders, loading, reload } = usePurchases();
  const { suppliers } = useSuppliers();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | "all">("all");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<PurchaseOrderStatus>("received");
  const [batchApplying, setBatchApplying] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) m.set(s.supplierId, s.shortName || s.name);
    return m;
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => statusFilter === "all" || o.status === statusFilter)
      .filter((o) => {
        if (!q) return true;
        return (
          o.orderId.toLowerCase().includes(q) ||
          (o.supplierSnapshot?.name ?? "").toLowerCase().includes(q) ||
          (o.supplierSnapshot?.shortName ?? "").toLowerCase().includes(q) ||
          o.notes.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.orderId.localeCompare(a.orderId));
  }, [orders, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = useMemo(
    () => filtered.slice(pageStart, pageStart + pageSize),
    [filtered, pageStart, pageSize],
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  async function handleStatusChange(orderId: string, newStatus: PurchaseOrderStatus) {
    setBusyOrderId(orderId);
    try {
      const res = await fetch(`/api/sheets/purchases/${encodeURIComponent(orderId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("更新狀態失敗");
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新狀態失敗");
    } finally {
      setBusyOrderId("");
    }
  }

  function toggleSelect(orderId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const filteredIds = filtered.map((o) => o.orderId);
      const allSelected = filteredIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBatchApply() {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`確定要將 ${count} 筆採購單狀態改為「${STATUS_LABEL[batchStatus]}」嗎？`)) {
      return;
    }
    setBatchApplying(true);
    const ids = Array.from(selectedIds);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    await Promise.all(
      ids.map(async (orderId) => {
        try {
          const res = await fetch(
            `/api/sheets/purchases/${encodeURIComponent(orderId)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: batchStatus }),
            },
          );
          if (!res.ok) throw new Error(`${orderId} 失敗`);
          success++;
        } catch (err) {
          failed++;
          errors.push(err instanceof Error ? err.message : `${orderId} 失敗`);
        }
      }),
    );

    await reload();
    clearSelection();
    setBatchApplying(false);

    if (failed > 0) {
      alert(`完成 ${success} 筆，失敗 ${failed} 筆\n\n${errors.slice(0, 5).join("\n")}`);
    } else {
      alert(`✓ 已更新 ${success} 筆採購單為「${STATUS_LABEL[batchStatus]}」`);
    }
  }

  const filteredIds = filtered.map((o) => o.orderId);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someFilteredSelected =
    !allFilteredSelected && filteredIds.some((id) => selectedIds.has(id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">採購單</h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            管理向廠商下的採購單
            {!loading && <span className="ml-2">{orders.length} 筆</span>}
          </p>
        </div>
        <Link href="/purchases/new">
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            新增採購單
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            placeholder="搜尋單號、廠商、附註"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="w-full lg:w-auto flex flex-wrap items-center gap-1.5 lg:flex-nowrap lg:overflow-x-auto">
          {(["all", "draft", "sent", "confirmed", "received", "cancelled"] as const).map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={[
                  "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs transition-colors whitespace-nowrap",
                  statusFilter === status
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
                ].join(" ")}
              >
                {status === "all" ? "全部" : STATUS_LABEL[status]}
              </button>
            )
          )}
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {loading && (
            <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">載入中…</p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">尚無採購單</p>
          )}
          {pageRows.map((o) => {
            const safeStatus = getSafeStatus(o.status);
            return (
              <Link
                key={o.orderId}
                href={`/purchases/${o.orderId}`}
                className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 active:bg-[var(--bg-hover)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-[var(--accent)]">{o.orderId}</span>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[safeStatus]}`}
                  >
                    {STATUS_LABEL[safeStatus]}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                  {supplierMap.get(o.supplierId) || o.supplierSnapshot?.shortName || o.supplierSnapshot?.name || o.supplierId}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span>{o.orderDate}</span>
                  <span className="font-mono font-medium text-[var(--text-primary)]">
                    ${fmtMoney(o.totalAmount)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="w-10 px-3 py-2 text-center font-medium">
                  <Checkbox
                    checked={
                      allFilteredSelected
                        ? true
                        : someFilteredSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={() => toggleSelectAllFiltered()}
                    aria-label="全選目前清單"
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">採購單號</th>
                <th className="px-3 py-2 text-left font-medium">日期</th>
                <th className="px-3 py-2 text-left font-medium">廠商</th>
                <th className="px-3 py-2 text-right font-medium">合計金額</th>
                <th className="w-28 px-3 py-2 text-left font-medium">狀態</th>
                <th className="px-3 py-2 text-left font-medium">附註</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]">
                    載入中…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]">
                    尚無採購單
                  </td>
                </tr>
              )}
              {pageRows.map((o) => {
                const safeStatus = getSafeStatus(o.status);
                const isBusy = busyOrderId === o.orderId;
                const isSelected = selectedIds.has(o.orderId);
                return (
                  <tr
                    key={o.orderId}
                    className={[
                      "hover:bg-[var(--bg-hover)]",
                      isSelected ? "bg-blue-50/50" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2 text-center">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(o.orderId)}
                        aria-label={`選取 ${o.orderId}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/purchases/${o.orderId}`}
                        className="block font-mono text-xs text-[var(--accent)] hover:underline"
                      >
                        {o.orderId}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Link href={`/purchases/${o.orderId}`} className="block">
                        {o.orderDate}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Link href={`/purchases/${o.orderId}`} className="block">
                        {supplierMap.get(o.supplierId) || o.supplierSnapshot?.shortName || o.supplierSnapshot?.name || o.supplierId}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      <Link href={`/purchases/${o.orderId}`} className="block">
                        ${fmtMoney(o.totalAmount)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={safeStatus}
                        disabled={isBusy}
                        onValueChange={(value) => void handleStatusChange(o.orderId, value as PurchaseOrderStatus)}
                      >
                        <SelectTrigger className="h-7 w-24 whitespace-nowrap text-xs">
                          <SelectValue>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[safeStatus]}`}>
                              {STATUS_LABEL[safeStatus]}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_CHANGE_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)] truncate max-w-[200px]">
                      <Link href={`/purchases/${o.orderId}`} className="block truncate">
                        {o.notes}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filtered.length}
        pageStart={pageStart}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        isMobile={isMobile}
      />

      {/* Batch action floating bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 shadow-lg">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">
              已選 <span className="text-[var(--accent)]">{selectedIds.size}</span> 筆
            </span>
            <span className="text-[var(--text-tertiary)]">|</span>
            <span className="text-xs text-[var(--text-secondary)]">變更為</span>
            <Select
              value={batchStatus}
              onValueChange={(v) => setBatchStatus(v as PurchaseOrderStatus)}
              disabled={batchApplying}
            >
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[batchStatus]}`}>
                    {STATUS_LABEL[batchStatus]}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_CHANGE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => void handleBatchApply()}
              disabled={batchApplying}
              className="h-8"
            >
              {batchApplying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  處理中…
                </>
              ) : (
                "套用"
              )}
            </Button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={batchApplying}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              title="取消選取"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
