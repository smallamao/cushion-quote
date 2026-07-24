"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Copy, FileBarChart2, FileText, Loader2, Pencil, Plus, ReceiptText, RefreshCw, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { useDebounce } from "@/hooks/useDebounce";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MonthlyReportModal } from "@/components/orders/MonthlyReportModal";
import { StatementModal } from "@/components/orders/StatementModal";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import type { ARRecord, CustomOrder, OrderInvoiceStatus, OrderItemCategory, OrderStatus } from "@/lib/types";
import { compareOrders } from "@/lib/order-sort";

const STATUS_MAP: Record<OrderStatus, { label: string; className: string }> = {
  production: { label: "排程/生產中", className: "badge-sent" },
  waiting: { label: "待出貨", className: "badge-deleted" },
  completed: { label: "完成", className: "badge-accepted" },
  cancelled: { label: "取消", className: "badge-draft" },
};

const INVOICE_STATUS_MAP: Record<OrderInvoiceStatus, { label: string; className: string }> = {
  pending: { label: "待開票", className: "bg-amber-100 text-amber-800" },
  issued: { label: "已開票", className: "bg-green-100 text-green-800" },
  exempt: { label: "免開票", className: "bg-gray-100 text-gray-600" },
};

// AR 收款狀態徽章（依 arStatus；訂單無關聯 AR 時顯示「未建」）
const AR_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "待收款", className: "bg-amber-100 text-amber-800" },
  partial: { label: "部分收款", className: "bg-orange-100 text-orange-800" },
  paid: { label: "已收清", className: "bg-green-100 text-green-800" },
  overdue: { label: "逾期", className: "bg-red-100 text-red-700" },
  draft: { label: "草稿", className: "bg-gray-100 text-gray-600" },
};

const CATEGORY_OPTIONS: OrderItemCategory[] = [
  "坐/背墊",
  "臥榻墊",
  "繃布裱板",
  "到府清潔",
  "到府施工",
  "訂製沙發",
  "泡棉內裏",
  "皮/布套",
  "維修",
  "大和樂活",
];

function getLast12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
  }
  return months;
}

export function OrderListClient() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [categoryFilter, setCategoryFilter] = useState<OrderItemCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const [deleteTarget, setDeleteTarget] = useState<CustomOrder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);
  const [statusChanging, setStatusChanging] = useState<string | null>(null);
  // 直接查看已存工單 PDF
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState("工單.pdf");
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sheets/orders/${deleteTarget.orderId}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "刪除失敗");
      setOrders((prev) => prev.filter((o) => o.orderId !== deleteTarget.orderId));
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  // 直接開啟該訂單已產生的工單 PDF（存在 Cloudinary raw，需強制標回 application/pdf）
  const handleViewWorkOrder = useCallback(async (order: CustomOrder) => {
    if (!order.workOrderPdfUrl) return;
    setPdfLoadingId(order.orderId);
    setPdfFileName(`工單-${order.orderNumber || order.orderId}.pdf`);
    setPdfBlob(null);
    setPdfOpen(true);
    try {
      const res = await fetch(order.workOrderPdfUrl);
      if (!res.ok) throw new Error("此工單網址已失效，請進「編輯」按『重新產生並取代』後再查看");
      const buf = await res.arrayBuffer();
      setPdfBlob(new Blob([buf], { type: "application/pdf" }));
    } catch (err) {
      setPdfOpen(false);
      alert(err instanceof Error ? err.message : "讀取工單失敗");
    } finally {
      setPdfLoadingId(null);
    }
  }, []);

  const handleCopy = useCallback(async (order: CustomOrder) => {
    setCopying(order.orderId);
    try {
      const res = await fetch(`/api/sheets/orders/${order.orderId}`);
      const json = (await res.json()) as { ok: boolean; order?: CustomOrder; error?: string };
      if (!json.ok || !json.order) throw new Error(json.error ?? "讀取失敗");
      const src = json.order;
      const body: Partial<CustomOrder> = {
        clientName: src.clientName,
        orderTitle: `${src.orderTitle}（複製）`,
        itemCategory: src.itemCategory,
        orderDate: src.orderDate,
        quotedAmount: src.quotedAmount,
        materialCost: src.materialCost,
        laborCost: src.laborCost,
        shippingCost: src.shippingCost,
        otherCost: src.otherCost,
        materialName: src.materialName,
        materialCode: src.materialCode,
        materialImageUrl: src.materialImageUrl,
        items: src.items,
        notes: src.notes,
        internalNotes: src.internalNotes,
        photos: src.photos,
        deliveryMethod: src.deliveryMethod,
        sourceType: src.sourceType,
      };
      const createRes = await fetch("/api/sheets/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const createJson = (await createRes.json()) as { ok: boolean; orderId?: string; error?: string };
      if (!createJson.ok) throw new Error(createJson.error ?? "複製失敗");
      router.push(`/orders/${createJson.orderId}` as never);
    } catch (err) {
      alert(err instanceof Error ? err.message : "複製失敗");
    } finally {
      setCopying(null);
    }
  }, [router]);

  // 列表直接改安裝/出貨日：樂觀更新，失敗回滾（PUT 為部分更新，只送 installDate）
  const handleInstallDateChange = useCallback(async (order: CustomOrder, newDate: string) => {
    if (newDate === order.installDate) return;
    const prevDate = order.installDate;
    setOrders((cur) =>
      cur.map((o) => (o.orderId === order.orderId ? { ...o, installDate: newDate } : o)),
    );
    try {
      const res = await fetch(`/api/sheets/orders/${order.orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installDate: newDate }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "出貨日更新失敗");
    } catch (err) {
      setOrders((cur) =>
        cur.map((o) => (o.orderId === order.orderId ? { ...o, installDate: prevDate } : o)),
      );
      alert(err instanceof Error ? err.message : "出貨日更新失敗");
    }
  }, []);

  // 應收帳款對照（versionId → AR）：顯示每張訂單的收款狀態
  const [arByVersionId, setArByVersionId] = useState<Map<string, ARRecord>>(new Map());
  useEffect(() => {
    fetch("/api/sheets/ar", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { ars?: ARRecord[] }) => {
        const map = new Map<string, ARRecord>();
        for (const ar of json.ars ?? []) {
          if (ar.versionId && ar.arStatus !== "cancelled") map.set(ar.versionId, ar);
        }
        setArByVersionId(map);
      })
      .catch(() => {});
  }, []);

  // 列表直接改開票狀態：樂觀更新，失敗回滾（PUT 部分更新，只送 invoiceStatus）
  const handleInvoiceStatusChange = useCallback(
    async (order: CustomOrder, newStatus: OrderInvoiceStatus) => {
      if (newStatus === order.invoiceStatus) return;
      const prev = order.invoiceStatus;
      setOrders((cur) =>
        cur.map((o) => (o.orderId === order.orderId ? { ...o, invoiceStatus: newStatus } : o)),
      );
      try {
        const res = await fetch(`/api/sheets/orders/${order.orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceStatus: newStatus }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? "開票狀態更新失敗");
      } catch (err) {
        setOrders((cur) =>
          cur.map((o) => (o.orderId === order.orderId ? { ...o, invoiceStatus: prev } : o)),
        );
        alert(err instanceof Error ? err.message : "開票狀態更新失敗");
      }
    },
    [],
  );

  // 列表直接改狀態：樂觀更新，失敗回滾；後端會 best-effort 同步 Notion 既有頁面
  const handleStatusChange = useCallback(async (order: CustomOrder, newStatus: OrderStatus) => {
    if (newStatus === order.status) return;
    const prevStatus = order.status;
    setStatusChanging(order.orderId);
    setOrders((cur) =>
      cur.map((o) => (o.orderId === order.orderId ? { ...o, status: newStatus } : o)),
    );
    try {
      const res = await fetch(`/api/sheets/orders/${order.orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "狀態更新失敗");
    } catch (err) {
      setOrders((cur) =>
        cur.map((o) => (o.orderId === order.orderId ? { ...o, status: prevStatus } : o)),
      );
      alert(err instanceof Error ? err.message : "狀態更新失敗");
    } finally {
      setStatusChanging(null);
    }
  }, []);

  const months = useMemo(() => getLast12Months(), []);

  const fetchOrders = useCallback(async (archived: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const url = archived
        ? "/api/sheets/orders?archived=true"
        : "/api/sheets/orders";
      const res = await fetch(url);
      const json = (await res.json()) as { ok: boolean; orders?: CustomOrder[]; error?: string };
      if (!json.ok) {
        setError(json.error ?? "載入失敗");
        setOrders([]);
      } else {
        setOrders(json.orders ?? []);
      }
    } catch {
      setError("網路錯誤，請稍後再試");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders(showArchived);
  }, [showArchived, fetchOrders]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    // Defensive dedup by orderId (in case of race-condition duplicates in Sheets)
    const seen = new Set<string>();
    const filteredOrders = orders.filter((o) => {
      if (seen.has(o.orderId)) return false;
      seen.add(o.orderId);
      if (q) {
        const hit =
          o.clientName.toLowerCase().includes(q) ||
          o.orderNumber.toLowerCase().includes(q) ||
          o.orderTitle.toLowerCase().includes(q) ||
          o.materialCode.toLowerCase().includes(q) ||
          o.materialName.toLowerCase().includes(q) ||
          o.items.some(
            (it) =>
              it.colorCode?.toLowerCase().includes(q) ||
              it.name.toLowerCase().includes(q),
          );
        if (!hit) return false;
      }
      if (categoryFilter !== "all" && o.itemCategory !== categoryFilter) {
        return false;
      }
      if (statusFilter !== "all" && o.status !== statusFilter) {
        return false;
      }
      if (monthFilter !== "all") {
        const orderMonth = (o.orderDate ?? "").slice(0, 7);
        if (orderMonth !== monthFilter) return false;
      }
      return true;
    });
    filteredOrders.sort(compareOrders);
    return filteredOrders;
  }, [orders, debouncedSearch, categoryFilter, statusFilter, monthFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ClipboardList className="h-6 w-6" />
            訂製訂單
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            管理訂製訂單記錄 {orders.length} 筆
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchOrders(showArchived)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="ml-1 hidden sm:inline">重新整理</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReportOpen(true)}
          >
            <FileBarChart2 className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">月報</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatementOpen(true)}
            title="按客戶產出應收帳款對帳單（未收款訂單滾存），並可標記收款"
          >
            <ReceiptText className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">請款單</span>
          </Button>
          <Button onClick={() => router.push("/orders/new" as never)}>
            <Plus className="mr-1 h-4 w-4" />
            新增訂單
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋客戶、工單號、訂製內容..."
            className="pl-9"
          />
        </div>

        {/* Category filter */}
        <Select
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as OrderItemCategory | "all")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="品項分類" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分類</SelectItem>
            {CATEGORY_OPTIONS.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as OrderStatus | "all")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="訂單狀態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            {(Object.entries(STATUS_MAP) as [OrderStatus, { label: string; className: string }][]).map(
              ([key, { label }]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>

        {/* Month filter */}
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="月份" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部月份</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Archived checkbox */}
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          顯示已歸檔
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Mobile card list */}
      {isMobile ? (
        <div className="space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-secondary)]" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-[var(--text-tertiary)]">
              尚無符合的訂單
            </div>
          )}
          {!loading &&
            filtered.map((order) => {
              const statusInfo = STATUS_MAP[order.status] ?? STATUS_MAP.production;
              return (
                <div
                  key={order.orderId}
                  className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-sm active:opacity-80"
                  onClick={() => router.push(`/orders/${order.orderId}` as never)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[var(--accent)]">
                      {order.orderNumber || order.orderId}
                    </span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={order.status}
                        onValueChange={(v) => void handleStatusChange(order, v as OrderStatus)}
                        disabled={statusChanging === order.orderId}
                      >
                        <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-1 shadow-none">
                          {statusChanging === order.orderId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-secondary)]" />
                          ) : (
                            <span className={`badge ${statusInfo.className}`}>
                              {statusInfo.label}
                            </span>
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_MAP) as OrderStatus[]).map((st) => (
                            <SelectItem key={st} value={st}>
                              {STATUS_MAP[st].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium">{order.clientName}</div>
                  {order.orderTitle && (
                    <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                      {order.orderTitle}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
                    <span>{order.itemCategory || "—"}</span>
                    <span>下單：{order.orderDate || "—"}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1 border-t border-[var(--border)] pt-2">
                    {order.workOrderPdfUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-[var(--accent)]"
                        title="查看已產生的工單 PDF"
                        disabled={pdfLoadingId === order.orderId}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleViewWorkOrder(order);
                        }}
                      >
                        {pdfLoadingId === order.orderId ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}
                        工單
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-[var(--text-secondary)]"
                      title="複製訂單"
                      disabled={copying === order.orderId}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopy(order);
                      }}
                    >
                      {copying === order.orderId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-500"
                      title="刪除訂單"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(order);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        /* Desktop table */
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--text-secondary)]">
              <tr>
                <th className="w-px whitespace-nowrap px-3 py-2 text-left">工單編號</th>
                <th className="px-3 py-2 text-left">客戶</th>
                <th className="w-px whitespace-nowrap px-3 py-2 text-left hidden md:table-cell">品項分類</th>
                <th className="px-3 py-2 text-left">訂製內容</th>
                <th className="px-3 py-2 text-left hidden xl:table-cell">備注</th>
                <th className="w-px whitespace-nowrap px-3 py-2 text-left">狀態</th>
                <th className="w-px whitespace-nowrap px-3 py-2 text-left hidden md:table-cell">開票</th>
                <th className="w-px whitespace-nowrap px-3 py-2 text-left hidden md:table-cell">收款</th>
                <th className="w-px whitespace-nowrap px-3 py-2 text-left hidden lg:table-cell">下單日</th>
                <th className="w-px whitespace-nowrap px-3 py-2 text-left hidden lg:table-cell">安裝/出貨日</th>
                <th className="w-px whitespace-nowrap px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--text-secondary)]" />
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-3 py-12 text-center text-sm text-[var(--text-tertiary)]"
                  >
                    尚無符合的訂單
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((order) => {
                  const statusInfo = STATUS_MAP[order.status] ?? STATUS_MAP.production;
                  return (
                    <tr
                      key={order.orderId}
                      className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--bg-hover)]"
                      onClick={() => router.push(`/orders/${order.orderId}` as never)}
                    >
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="font-mono text-xs text-[var(--accent)]">
                          {order.orderNumber || order.orderId}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {order.clientName ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSearch(order.clientName);
                            }}
                            title={`篩選 ${order.clientName} 的全部訂單`}
                            className="text-left hover:text-[var(--accent)] hover:underline"
                          >
                            {order.clientName}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)] hidden md:table-cell">
                        {order.itemCategory || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-xs truncate text-xs text-[var(--text-secondary)]">
                          {order.orderTitle || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2 hidden xl:table-cell">
                        <div className="max-w-[180px] truncate text-xs text-[var(--text-secondary)]">
                          {order.internalNotes || "—"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={order.status}
                          onValueChange={(v) => void handleStatusChange(order, v as OrderStatus)}
                          disabled={statusChanging === order.orderId}
                        >
                          <SelectTrigger className="h-7 w-auto gap-1 whitespace-nowrap border-none bg-transparent px-1 shadow-none hover:bg-[var(--bg-hover)]">
                            {statusChanging === order.orderId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-secondary)]" />
                            ) : (
                              <span className={`badge ${statusInfo.className}`}>
                                {statusInfo.label}
                              </span>
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_MAP) as OrderStatus[]).map((st) => (
                              <SelectItem key={st} value={st}>
                                {STATUS_MAP[st].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-2 hidden md:table-cell"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Select
                          value={order.invoiceStatus}
                          onValueChange={(v) =>
                            void handleInvoiceStatusChange(order, v as OrderInvoiceStatus)
                          }
                        >
                          <SelectTrigger className="h-7 w-auto gap-1 whitespace-nowrap border-none bg-transparent px-1 shadow-none hover:bg-[var(--bg-hover)]">
                            <span
                              className={`badge ${INVOICE_STATUS_MAP[order.invoiceStatus]?.className ?? INVOICE_STATUS_MAP.pending.className}`}
                            >
                              {INVOICE_STATUS_MAP[order.invoiceStatus]?.label ?? "待開票"}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(INVOICE_STATUS_MAP) as OrderInvoiceStatus[]).map((st) => (
                              <SelectItem key={st} value={st}>
                                {INVOICE_STATUS_MAP[st].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-2 hidden md:table-cell"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const ar = order.versionId ? arByVersionId.get(order.versionId) : undefined;
                          if (!ar) {
                            return <span className="text-xs text-[var(--text-tertiary)]">未建</span>;
                          }
                          const badge = AR_BADGE[ar.arStatus] ?? AR_BADGE.active;
                          return (
                            <button
                              onClick={() => router.push(`/receivables/${ar.arId}`)}
                              title={`檢視應收帳款 ${ar.arId}`}
                              className={`badge transition-opacity hover:opacity-75 ${badge.className}`}
                            >
                              {badge.label}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs hidden lg:table-cell">
                        {order.orderDate || "—"}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-2 text-xs hidden lg:table-cell"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="date"
                          value={order.installDate || ""}
                          onChange={(e) => void handleInstallDateChange(order, e.target.value)}
                          className="w-32 cursor-pointer rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            title="查看訂單細節、編輯內容"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/orders/${order.orderId}` as never);
                            }}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            編輯
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[var(--accent)] disabled:text-[var(--text-tertiary)]"
                            title={order.workOrderPdfUrl ? "查看已產生的工單 PDF" : "尚未產生工單（進編輯頁產生）"}
                            disabled={!order.workOrderPdfUrl || pdfLoadingId === order.orderId}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleViewWorkOrder(order);
                            }}
                          >
                            {pdfLoadingId === order.orderId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[var(--text-secondary)]"
                            title="複製訂單"
                            disabled={copying === order.orderId}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleCopy(order);
                            }}
                          >
                            {copying === order.orderId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                            title="刪除訂單"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(order);
                            }}
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

      {/* Monthly report modal */}
      <MonthlyReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        orders={orders}
        selectedMonth={reportMonth}
        onMonthChange={setReportMonth}
        months={months}
      />

      <StatementModal
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
        orders={orders}
        onOrdersChanged={() => void fetchOrders(showArchived)}
      />

      <PDFPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        pdfBlob={pdfBlob}
        fileName={pdfFileName}
        loading={pdfBlob === null}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除</DialogTitle>
            <DialogDescription>
              確定要刪除訂單「{deleteTarget?.orderNumber || deleteTarget?.orderId}」（{deleteTarget?.clientName}）？此操作無法還原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "確認刪除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
