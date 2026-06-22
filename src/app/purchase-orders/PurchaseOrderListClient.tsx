"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FabricPurchaseOrder, FabricPOStatus } from "@/lib/types";

const STATUS_LABEL: Record<FabricPOStatus, string> = {
  draft: "草稿",
  ordered: "已下單",
  received: "已到料",
  cancelled: "取消",
};

const STATUS_COLOR: Record<FabricPOStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  ordered: "bg-blue-100 text-blue-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function getSafeStatus(status: string | undefined): FabricPOStatus {
  if (status && status in STATUS_LABEL) return status as FabricPOStatus;
  return "draft";
}

export function PurchaseOrderListClient() {
  const router = useRouter();
  const [orders, setOrders] = useState<FabricPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FabricPOStatus | "all">("all");

  async function fetchOrders() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sheets/purchase-orders");
      const json = (await res.json()) as {
        ok: boolean;
        orders?: FabricPurchaseOrder[];
        error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? "載入失敗");
      setOrders(json.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchOrders();
  }, []);

  const filtered =
    statusFilter === "all"
      ? orders
      : orders.filter((o) => o.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">布料採購單</h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            管理布料採購單
            {!loading && (
              <span className="ml-2">{orders.length} 筆</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchOrders()}
            disabled={loading}
            title="重新整理"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => router.push("/purchase-orders/new" as never)}>
            <Plus className="h-3.5 w-3.5" />
            新增採購單
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--text-secondary)]">篩選狀態</span>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as FabricPOStatus | "all")}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="draft">草稿</SelectItem>
            <SelectItem value="ordered">已下單</SelectItem>
            <SelectItem value="received">已到料</SelectItem>
            <SelectItem value="cancelled">取消</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">採購單號</th>
              <th className="px-3 py-2 text-left font-medium">供應商</th>
              <th className="px-3 py-2 text-center font-medium">狀態</th>
              <th className="px-3 py-2 text-center font-medium">明細數</th>
              <th className="px-3 py-2 text-left font-medium">下單日</th>
              <th className="px-3 py-2 text-left font-medium">預計到料</th>
              <th className="px-3 py-2 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-xs text-[var(--text-tertiary)]"
                >
                  {statusFilter === "all" ? "尚無採購單" : "此狀態無採購單"}
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((o) => {
                const safeStatus = getSafeStatus(o.status);
                return (
                  <tr
                    key={o.poId}
                    className="cursor-pointer hover:bg-[var(--bg-hover)]"
                    onClick={() => router.push(`/purchase-orders/${o.poId}` as never)}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-[var(--accent)]">
                      {o.poId}
                    </td>
                    <td className="px-3 py-2 text-xs">{o.supplierName || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[safeStatus]}`}
                      >
                        {STATUS_LABEL[safeStatus]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-block rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                        {(o.lineItems ?? []).length}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {o.orderedAt || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {o.expectedAt || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/purchase-orders/${o.poId}` as never);
                        }}
                      >
                        檢視
                      </Button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
