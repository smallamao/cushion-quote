"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        <div className="overflow-x-auto flex-nowrap flex items-center gap-1.5">
          {(["all", "draft", "sent", "confirmed", "received", "cancelled"] as const).map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={[
                  "rounded-full px-3 py-1 text-xs transition-colors whitespace-nowrap",
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
          {filtered.map((o) => {
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
                  <td colSpan={6} className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]">
                    載入中…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]">
                    尚無採購單
                  </td>
                </tr>
              )}
              {filtered.map((o) => {
                const safeStatus = getSafeStatus(o.status);
                const isBusy = busyOrderId === o.orderId;
                return (
                  <tr key={o.orderId} className="hover:bg-[var(--bg-hover)]">
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
    </div>
  );
}
