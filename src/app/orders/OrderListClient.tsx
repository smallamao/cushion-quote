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
import { useCompanies } from "@/hooks/useCompanies";
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

// 開票狀態燈號（dot：列表精簡顯示，label 進 tooltip 與下拉選項）
const INVOICE_STATUS_MAP: Record<OrderInvoiceStatus, { label: string; dot: string }> = {
  pending: { label: "待開票", dot: "bg-amber-500" },
  issued: { label: "已開票", dot: "bg-green-500" },
  exempt: { label: "免開票", dot: "bg-gray-300" },
};

// AR 收款狀態燈號（依 arStatus；訂單無關聯 AR 時顯示空心灰圈）
const AR_BADGE: Record<string, { label: string; dot: string }> = {
  active: { label: "待收款", dot: "bg-amber-500" },
  partial: { label: "部分收款", dot: "bg-orange-500" },
  paid: { label: "已收清", dot: "bg-green-500" },
  overdue: { label: "逾期", dot: "bg-red-500" },
  draft: { label: "草稿", dot: "bg-gray-300" },
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
  // LINE 對話直達：clientId → 客戶主檔主要聯絡人的 lineChatUrl
  const { companies } = useCompanies();
  const lineUrlByClientId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) {
      if (c.primaryContact?.lineChatUrl) m.set(c.id, c.primaryContact.lineChatUrl);
    }
    return m;
  }, [companies]);

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

  // 客戶彙總視窗：點客戶名開啟，彙整該客戶全部訂單＋總額/未收合計
  const [summaryClient, setSummaryClient] = useState<string | null>(null);
  // 合併請款（無報價 B2B）：勾選未建 AR 的訂單 → 一張 AR
  const [billingSelection, setBillingSelection] = useState<Set<string>>(new Set());
  const [billingDueDate, setBillingDueDate] = useState("");
  const [creatingBilling, setCreatingBilling] = useState(false);

  useEffect(() => {
    // 開啟彙總視窗時重置勾選；到期日預設次月月底（月結常態）
    setBillingSelection(new Set());
    const now = new Date();
    setBillingDueDate(new Date(now.getFullYear(), now.getMonth() + 2, 0).toLocaleDateString("sv-SE"));
  }, [summaryClient]);

  const handleCreateBilling = useCallback(async () => {
    if (billingSelection.size === 0 || !billingDueDate) return;
    setCreatingBilling(true);
    try {
      const res = await fetch("/api/sheets/ar/from-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: Array.from(billingSelection), dueDate: billingDueDate }),
      });
      const json = (await res.json()) as { ok: boolean; ar?: { arId: string }; error?: string };
      if (!json.ok || !json.ar) throw new Error(json.error ?? "建立合併請款失敗");
      alert(`已建立合併請款 ${json.ar.arId}（${billingSelection.size} 筆訂單）`);
      setBillingSelection(new Set());
      setArReloadTick((t) => t + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "建立合併請款失敗");
    } finally {
      setCreatingBilling(false);
    }
  }, [billingSelection, billingDueDate]);

  // 應收帳款對照：三層 join 用的索引
  //   1. versionId 直連（單筆報價 AR）
  //   2. versionId → 月結待出(已合併) → consolidatedArId（有報價的合併請款）
  //   3. relatedOrderIds 含 orderId（無報價 B2B 合併請款）
  const [arMaps, setArMaps] = useState<{
    byVersion: Map<string, ARRecord>;
    byId: Map<string, ARRecord>;
    byOrder: Map<string, ARRecord>;
    versionToConsolidated: Map<string, string>;
  }>({ byVersion: new Map(), byId: new Map(), byOrder: new Map(), versionToConsolidated: new Map() });
  const [arReloadTick, setArReloadTick] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/sheets/ar", { cache: "no-store" }).then((r) => r.json()) as Promise<{ ars?: ARRecord[] }>,
      fetch("/api/sheets/ar/pending-monthly", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({}))as Promise<{ pending?: Array<{ versionId: string; consolidatedArId: string; status: string }> }>,
    ])
      .then(([arJson, pendingJson]) => {
        const byVersion = new Map<string, ARRecord>();
        const byId = new Map<string, ARRecord>();
        const byOrder = new Map<string, ARRecord>();
        for (const ar of arJson.ars ?? []) {
          if (ar.arStatus === "cancelled") continue;
          byId.set(ar.arId, ar);
          if (ar.versionId) byVersion.set(ar.versionId, ar);
          for (const oid of ar.relatedOrderIds ?? []) byOrder.set(oid, ar);
        }
        const versionToConsolidated = new Map<string, string>();
        for (const p of pendingJson.pending ?? []) {
          if (p.status === "consolidated" && p.versionId && p.consolidatedArId) {
            versionToConsolidated.set(p.versionId, p.consolidatedArId);
          }
        }
        setArMaps({ byVersion, byId, byOrder, versionToConsolidated });
      })
      .catch(() => {});
  }, [arReloadTick]);

  // 訂單 → AR 解析（merged=true 表示合併請款，一張 AR 涵蓋多單）
  const resolveOrderAr = useCallback(
    (order: CustomOrder): { ar: ARRecord; merged: boolean } | null => {
      if (order.versionId) {
        const direct = arMaps.byVersion.get(order.versionId);
        if (direct) return { ar: direct, merged: false };
        const consolidatedId = arMaps.versionToConsolidated.get(order.versionId);
        const viaMonthly = consolidatedId ? arMaps.byId.get(consolidatedId) : undefined;
        if (viaMonthly) return { ar: viaMonthly, merged: true };
      }
      const viaOrders = arMaps.byOrder.get(order.orderId);
      if (viaOrders) return { ar: viaOrders, merged: true };
      return null;
    },
    [arMaps],
  );

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

  // 客戶彙總：該客戶全部訂單（目前載入範圍）＋總額/未收合計，全部由已載入資料計算。
  // 合併請款 AR 涵蓋多單，未收合計以「不重複的 AR」加總避免重複計算。
  const clientSummary = useMemo(() => {
    if (!summaryClient) return null;
    const list = orders.filter((o) => o.clientName === summaryClient && o.status !== "cancelled");
    const totalQuoted = list.reduce((s, o) => s + (o.quotedAmount || 0), 0);
    const seenArIds = new Set<string>();
    let outstanding = 0;
    for (const o of list) {
      const resolved = resolveOrderAr(o);
      if (resolved && !seenArIds.has(resolved.ar.arId)) {
        seenArIds.add(resolved.ar.arId);
        outstanding += resolved.ar.outstandingAmount;
      }
    }
    return { list, totalQuoted, outstanding };
  }, [summaryClient, orders, resolveOrderAr]);

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
      {/* 手機：標題與操作列上下分行；≥sm 恢復同列左右對齊 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                              setSummaryClient(order.clientName);
                            }}
                            title={`${order.clientName} — 檢視此客戶訂單彙總`}
                            className="block max-w-[10rem] truncate text-left hover:text-[var(--accent)] hover:underline"
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
                          <SelectTrigger
                            className="h-7 w-auto gap-1 border-none bg-transparent px-1.5 shadow-none hover:bg-[var(--bg-hover)]"
                            title={INVOICE_STATUS_MAP[order.invoiceStatus]?.label ?? "待開票"}
                          >
                            <span
                              className={`inline-block h-2.5 w-2.5 rounded-full ${INVOICE_STATUS_MAP[order.invoiceStatus]?.dot ?? INVOICE_STATUS_MAP.pending.dot}`}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(INVOICE_STATUS_MAP) as OrderInvoiceStatus[]).map((st) => (
                              <SelectItem key={st} value={st}>
                                <span className="flex items-center gap-2">
                                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${INVOICE_STATUS_MAP[st].dot}`} />
                                  {INVOICE_STATUS_MAP[st].label}
                                </span>
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
                          const resolved = resolveOrderAr(order);
                          if (!resolved) {
                            return (
                              <span
                                title="未建應收帳款"
                                className="inline-block h-2.5 w-2.5 rounded-full border-2 border-gray-300"
                              />
                            );
                          }
                          const { ar, merged } = resolved;
                          const badge = AR_BADGE[ar.arStatus] ?? AR_BADGE.active;
                          return (
                            <button
                              onClick={() => router.push(`/receivables/${ar.arId}`)}
                              title={`${badge.label}${merged ? "（合併請款）" : ""} · 檢視應收帳款 ${ar.arId}`}
                              className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)]"
                            >
                              <span className={`relative inline-block h-2.5 w-2.5 rounded-full ${badge.dot}`}>
                                {merged && (
                                  <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full border border-white bg-blue-500" />
                                )}
                              </span>
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
                          {(() => {
                            const lineUrl =
                              order.lineChatUrl?.trim() ||
                              (order.clientId ? lineUrlByClientId.get(order.clientId) : undefined);
                            return lineUrl ? (
                              <a
                                href={lineUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="開啟此客戶的 LINE 對話"
                                className="flex h-7 items-center rounded px-1.5 text-sm text-green-600 hover:bg-green-50 hover:text-green-700"
                              >
                                💬
                              </a>
                            ) : null;
                          })()}
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

      {/* 客戶訂單彙總視窗 */}
      <Dialog open={!!summaryClient} onOpenChange={(o) => { if (!o) setSummaryClient(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{summaryClient} · 訂單彙總</DialogTitle>
            <DialogDescription>
              共 {clientSummary?.list.length ?? 0} 筆（不含已取消）· 總額 NT$ {(clientSummary?.totalQuoted ?? 0).toLocaleString()} ·{" "}
              <span className={clientSummary && clientSummary.outstanding > 0 ? "font-medium text-amber-600" : ""}>
                未收 NT$ {(clientSummary?.outstanding ?? 0).toLocaleString()}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="w-px px-2 py-1.5" title="勾選未建 AR 的訂單以合併請款" />
                  <th className="px-3 py-1.5 text-left">工單編號</th>
                  <th className="px-3 py-1.5 text-left">訂製內容</th>
                  <th className="px-3 py-1.5 text-left">下單日</th>
                  <th className="px-3 py-1.5 text-right">金額</th>
                  <th className="px-3 py-1.5 text-center">開票</th>
                  <th className="px-3 py-1.5 text-center">收款</th>
                </tr>
              </thead>
              <tbody>
                {(clientSummary?.list ?? []).map((o) => {
                  const resolved = resolveOrderAr(o);
                  const arBadge = resolved ? (AR_BADGE[resolved.ar.arStatus] ?? AR_BADGE.active) : null;
                  const inv = INVOICE_STATUS_MAP[o.invoiceStatus] ?? INVOICE_STATUS_MAP.pending;
                  const eligible = !resolved;
                  return (
                    <tr
                      key={o.orderId}
                      className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--bg-hover)]"
                      onClick={() => router.push(`/orders/${o.orderId}` as never)}
                    >
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          disabled={!eligible}
                          checked={billingSelection.has(o.orderId)}
                          title={eligible ? "納入合併請款" : "已有關聯應收帳款"}
                          onChange={(e) => {
                            setBillingSelection((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(o.orderId);
                              else next.delete(o.orderId);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-[var(--accent)]">
                        {o.orderNumber || o.orderId}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="max-w-[14rem] truncate text-xs text-[var(--text-secondary)]">
                          {o.orderTitle || o.itemCategory || "—"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs">{o.orderDate || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs">
                        {o.quotedAmount ? `$${o.quotedAmount.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-center" title={inv.label}>
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${inv.dot}`} />
                      </td>
                      <td
                        className="px-3 py-1.5 text-center"
                        title={
                          arBadge
                            ? `${arBadge.label}${resolved?.merged ? "（合併請款）" : ""}`
                            : "未建應收帳款"
                        }
                      >
                        {arBadge ? (
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${arBadge.dot}`} />
                        ) : (
                          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-gray-300" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {billingSelection.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm">
              <span className="text-xs text-[var(--text-secondary)]">收款到期日</span>
              <Input
                type="date"
                value={billingDueDate}
                onChange={(e) => setBillingDueDate(e.target.value)}
                className="h-8 w-36"
              />
              <Button
                size="sm"
                onClick={() => void handleCreateBilling()}
                disabled={creatingBilling || !billingDueDate}
                className="ml-auto"
              >
                {creatingBilling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `建立合併請款（${billingSelection.size} 筆 · $${(clientSummary?.list ?? [])
                    .filter((o) => billingSelection.has(o.orderId))
                    .reduce((s, o) => s + (o.quotedAmount || 0), 0)
                    .toLocaleString()}）`
                )}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (summaryClient) setSearch(summaryClient);
                setSummaryClient(null);
              }}
            >
              在列表中篩選此客戶
            </Button>
            <Button variant="outline" onClick={() => setSummaryClient(null)}>
              關閉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
