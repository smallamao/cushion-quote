"use client";

import {
  ClipboardCheck,
  History,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInventory, useInventoryTransactions } from "@/hooks/useInventory";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePurchaseProducts } from "@/hooks/usePurchaseProducts";
import { useSuppliers } from "@/hooks/useSuppliers";
import type {
  CaseRecord,
  InventorySummary,
  InventoryTransactionType,
  PurchaseProductCategory,
} from "@/lib/types";

const CATEGORIES: PurchaseProductCategory[] = [
  "面料",
  "椅腳",
  "泡棉",
  "木料",
  "皮革",
  "五金",
  "其他",
];

const TRANSACTION_TYPE_LABEL: Record<InventoryTransactionType, string> = {
  opening: "開帳",
  purchase_receipt: "採購入庫",
  manual_adjustment: "人工調整",
  return_out: "退出",
  return_in: "退入",
  issue_out: "出料",
};

function fmtQty(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

function fmtMoney(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function InventoryClient() {
  const { inventory, loading, error, reload, adjust } = useInventory();
  const { products } = usePurchaseProducts();
  const { suppliers } = useSuppliers();
  const { user } = useCurrentUser();
  const isMobile = useIsMobile();
  const canAdjust = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<PurchaseProductCategory | "all">("all");
  const [supplierId, setSupplierId] = useState<string>("all");
  const [zeroOnly, setZeroOnly] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Adjustment dialog state
  const [adjustTarget, setAdjustTarget] = useState<InventorySummary | "new" | null>(null);
  const [adjDelta, setAdjDelta] = useState("");
  const [adjType, setAdjType] = useState<InventoryTransactionType>("manual_adjustment");
  const [adjNotes, setAdjNotes] = useState("");
  const [adjReferenceNumber, setAdjReferenceNumber] = useState("");
  const [adjProductId, setAdjProductId] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);

  // Remainder-report dialog state
  const [reportTarget, setReportTarget] = useState<InventorySummary | null>(null);
  const [reportRemaining, setReportRemaining] = useState("");
  const [reportCaseId, setReportCaseId] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [reportSaving, setReportSaving] = useState(false);
  const [activeCases, setActiveCases] = useState<CaseRecord[]>([]);

  // Lazy-load active cases for the 回報剩餘 dialog (so we don't hit API on
  // every page visit — only when the user actually opens the dialog).
  useEffect(() => {
    if (!reportTarget) return;
    if (activeCases.length > 0) return;
    fetch("/api/sheets/cases", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { cases?: CaseRecord[] }) => {
        const list = (json.cases ?? []).filter(
          (c) =>
            c.caseStatus !== "lost" &&
            c.caseStatus !== "closed" &&
            (c.caseName || c.clientNameSnapshot),
        );
        setActiveCases(list);
      })
      .catch(() => setActiveCases([]));
  }, [reportTarget, activeCases.length]);

  // Transaction history dialog
  const [historyTarget, setHistoryTarget] = useState<InventorySummary | null>(null);

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) m.set(s.supplierId, s.shortName || s.name);
    return m;
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory
      .filter((item) => {
        if (category !== "all" && item.productSnapshot.category !== category) return false;
        if (supplierId !== "all" && item.supplierId !== supplierId) return false;
        if (zeroOnly && item.quantityOnHand > 0) return false;
        if (!q) return true;
        const haystack = [
          item.productSnapshot.productCode,
          item.productSnapshot.productName,
          item.productSnapshot.specification,
          supplierMap.get(item.supplierId) ?? item.supplierId,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const aCode = a.productSnapshot.productCode || "";
        const bCode = b.productSnapshot.productCode || "";
        return aCode.localeCompare(bCode);
      });
  }, [inventory, search, category, supplierId, zeroOnly, supplierMap]);

  const totalValue = useMemo(
    () => filtered.reduce((sum, item) => sum + item.quantityOnHand * item.lastUnitCost, 0),
    [filtered],
  );
  const zeroCount = useMemo(
    () => inventory.filter((item) => item.quantityOnHand <= 0).length,
    [inventory],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = useMemo(
    () => filtered.slice(pageStart, pageStart + pageSize),
    [filtered, pageStart, pageSize],
  );

  function openAdjust(target: InventorySummary) {
    setAdjustTarget(target);
    setAdjProductId(target.productId);
    setAdjDelta("");
    setAdjType("manual_adjustment");
    setAdjNotes("");
    setAdjReferenceNumber("");
  }

  function openNewStock() {
    setAdjustTarget("new");
    setAdjProductId("");
    setAdjDelta("");
    setAdjType("opening");
    setAdjNotes("");
    setAdjReferenceNumber("");
  }

  function closeAdjust() {
    setAdjustTarget(null);
  }

  function openReport(target: InventorySummary) {
    setReportTarget(target);
    setReportRemaining("");
    setReportCaseId("");
    setReportNotes("");
  }

  function closeReport() {
    setReportTarget(null);
  }

  async function submitReport() {
    if (!reportTarget) return;
    const remaining = Number(reportRemaining);
    if (!Number.isFinite(remaining) || remaining < 0) {
      alert("請輸入合理的剩餘數量(0 以上)");
      return;
    }
    const delta = remaining - reportTarget.quantityOnHand;
    if (delta === 0) {
      alert("剩餘量跟系統現量一樣,沒有需要記錄的異動");
      return;
    }
    if (delta > 0) {
      const ok = confirm(
        `回報剩餘 ${remaining} 比系統現量 ${reportTarget.quantityOnHand} 多 ${delta}。\n代表系統現量偏低,會補回 +${delta}。是否繼續?`,
      );
      if (!ok) return;
    }
    // Build notes automatically with context
    const caseInfo = reportCaseId
      ? activeCases.find((c) => c.caseId === reportCaseId)
      : null;
    const noteParts: string[] = [];
    noteParts.push(`裁切回報,剩 ${remaining} ${reportTarget.productSnapshot.unit}`);
    if (caseInfo) {
      noteParts.push(`案件: ${caseInfo.caseName} (${caseInfo.caseId})`);
    }
    if (reportNotes.trim()) {
      noteParts.push(reportNotes.trim());
    }
    setReportSaving(true);
    try {
      await adjust({
        productId: reportTarget.productId,
        inventoryId: reportTarget.inventoryId,
        quantityDelta: delta,
        transactionType: delta < 0 ? "issue_out" : "manual_adjustment",
        notes: noteParts.join(" / "),
        referenceNumber: reportCaseId,
      });
      closeReport();
    } catch (err) {
      alert(err instanceof Error ? err.message : "回報失敗");
    } finally {
      setReportSaving(false);
    }
  }

  async function submitAdjust() {
    const delta = Number(adjDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      alert("請輸入合理的異動數量(非 0)");
      return;
    }
    if (!adjProductId) {
      alert("請選擇品項");
      return;
    }
    setAdjSaving(true);
    try {
      await adjust({
        productId: adjProductId,
        inventoryId: adjustTarget !== "new" ? adjustTarget?.inventoryId : undefined,
        quantityDelta: delta,
        transactionType: adjType,
        notes: adjNotes.trim(),
        referenceNumber: adjReferenceNumber.trim(),
      });
      closeAdjust();
    } catch (err) {
      alert(err instanceof Error ? err.message : "異動失敗");
    } finally {
      setAdjSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Package className="h-6 w-6" />
            庫存管理
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            目前 {inventory.length} 品項{" "}
            {zeroCount > 0 && (
              <span className="ml-1 text-amber-600">· {zeroCount} 品項缺貨</span>
            )}
          </p>
        </div>
        {canAdjust && (
          <Button size="sm" onClick={openNewStock} className="shrink-0">
            <Plus className="h-3.5 w-3.5" />
            手動建立 / 開帳
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">品項數</div>
          <div className="mt-1 text-lg font-semibold">{inventory.length}</div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">符合篩選</div>
          <div className="mt-1 text-lg font-semibold">{filtered.length}</div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">庫存總值(估算)</div>
          <div className="mt-1 text-lg font-semibold text-[var(--accent)]">
            NT$ {fmtMoney(totalValue)}
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">缺貨品項</div>
          <div className="mt-1 text-lg font-semibold text-amber-600">{zeroCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            placeholder="搜尋編號、名稱、規格、廠商"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v as PurchaseProductCategory | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="分類" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分類</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={supplierId}
          onValueChange={(v) => {
            setSupplierId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="廠商" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部廠商</SelectItem>
            {suppliers
              .filter((s) => s.isActive !== false)
              .map((s) => (
                <SelectItem key={s.supplierId} value={s.supplierId}>
                  {s.shortName || s.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={zeroOnly}
            onChange={(e) => {
              setZeroOnly(e.target.checked);
              setPage(1);
            }}
          />
          只看缺貨
        </label>
        <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          重新載入
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* List */}
      {isMobile ? (
        <div className="space-y-2">
          {!loading && pageRows.length === 0 && (
            <p className="py-6 text-center text-xs text-[var(--text-tertiary)]">
              尚無符合條件的庫存
            </p>
          )}
          {pageRows.map((item) => (
            <div
              key={item.inventoryId}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-[var(--accent)]">
                    {item.productSnapshot.productCode}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-medium">
                    {item.productSnapshot.productName}
                  </div>
                  <div className="truncate text-xs text-[var(--text-tertiary)]">
                    {item.productSnapshot.specification}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`font-mono text-lg font-semibold ${item.quantityOnHand <= 0 ? "text-amber-600" : ""}`}
                  >
                    {fmtQty(item.quantityOnHand)}
                    <span className="ml-1 text-xs font-normal text-[var(--text-tertiary)]">
                      {item.productSnapshot.unit}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
                <span>{supplierMap.get(item.supplierId) || item.supplierId}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="flex items-center gap-1 font-semibold text-green-700"
                    onClick={() => openReport(item)}
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    回報剩餘
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[var(--text-secondary)]"
                    onClick={() => setHistoryTarget(item)}
                  >
                    <History className="h-3 w-3" />
                    紀錄
                  </button>
                  {canAdjust && (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[var(--accent)]"
                      onClick={() => openAdjust(item)}
                    >
                      <Pencil className="h-3 w-3" />
                      調整
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">編號</th>
                <th className="px-3 py-2 text-left font-medium">品項</th>
                <th className="px-3 py-2 text-left font-medium">規格</th>
                <th className="px-3 py-2 text-left font-medium">分類</th>
                <th className="px-3 py-2 text-left font-medium">廠商</th>
                <th className="px-3 py-2 text-right font-medium">現量</th>
                <th className="px-3 py-2 text-right font-medium">最近成本</th>
                <th className="px-3 py-2 text-left font-medium">最後異動</th>
                <th className="w-28 px-3 py-2 text-center font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-xs text-[var(--text-tertiary)]"
                  >
                    載入中…
                  </td>
                </tr>
              )}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-xs text-[var(--text-tertiary)]"
                  >
                    尚無符合條件的庫存
                  </td>
                </tr>
              )}
              {pageRows.map((item) => {
                const low = item.quantityOnHand <= 0;
                return (
                  <tr key={item.inventoryId} className="hover:bg-[var(--bg-hover)]">
                    <td className="px-3 py-2 font-mono text-xs text-[var(--accent)]">
                      {item.productSnapshot.productCode || "—"}
                    </td>
                    <td className="px-3 py-2 text-sm font-medium">
                      {item.productSnapshot.productName}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {item.productSnapshot.specification}
                    </td>
                    <td className="px-3 py-2 text-xs">{item.productSnapshot.category}</td>
                    <td className="px-3 py-2 text-xs">
                      {supplierMap.get(item.supplierId) || item.supplierId}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${low ? "text-amber-600" : ""}`}
                    >
                      {low && (
                        <TriangleAlert className="mr-1 inline h-3 w-3 align-text-bottom" />
                      )}
                      {fmtQty(item.quantityOnHand)} {item.productSnapshot.unit}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmtMoney(item.lastUnitCost)}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {fmtDate(item.lastTransactionAt)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          className="flex items-center gap-0.5 text-xs font-semibold text-green-700 hover:underline"
                          onClick={() => openReport(item)}
                          title="裁切完畢,回報剩餘"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          回報
                        </button>
                        <button
                          type="button"
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          onClick={() => setHistoryTarget(item)}
                          title="異動紀錄"
                        >
                          <History className="h-3.5 w-3.5" />
                        </button>
                        {canAdjust && (
                          <button
                            type="button"
                            className="text-xs text-[var(--accent)] hover:underline"
                            onClick={() => openAdjust(item)}
                            title="人工調整"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
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

      {/* Adjustment dialog */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {adjustTarget === "new" ? "手動建立庫存 / 開帳" : "人工調整庫存"}
              </h2>
              <button type="button" onClick={closeAdjust}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {adjustTarget !== "new" && (
                <div className="rounded-md bg-[var(--bg-subtle)] p-3 text-xs">
                  <div className="font-mono text-[var(--accent)]">
                    {adjustTarget.productSnapshot.productCode}
                  </div>
                  <div className="mt-0.5">{adjustTarget.productSnapshot.productName}</div>
                  <div className="text-[var(--text-tertiary)]">
                    {adjustTarget.productSnapshot.specification} · 目前:{" "}
                    {fmtQty(adjustTarget.quantityOnHand)} {adjustTarget.productSnapshot.unit}
                  </div>
                </div>
              )}

              {adjustTarget === "new" && (
                <div>
                  <Label>選擇品項</Label>
                  <Select value={adjProductId} onValueChange={setAdjProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="搜尋/選擇採購商品" />
                    </SelectTrigger>
                    <SelectContent>
                      {products
                        .filter((p) => p.isActive)
                        .sort((a, b) => a.productCode.localeCompare(b.productCode))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.productCode} {p.productName} {p.specification}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>異動類型</Label>
                <Select
                  value={adjType}
                  onValueChange={(v) => setAdjType(v as InventoryTransactionType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opening">開帳(初始庫存)</SelectItem>
                    <SelectItem value="manual_adjustment">人工調整(盤盈/盤虧)</SelectItem>
                    <SelectItem value="return_in">退入(入庫)</SelectItem>
                    <SelectItem value="return_out">退出(出庫)</SelectItem>
                    <SelectItem value="issue_out">出料(扣庫存)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>異動數量 (+入庫 / -出庫)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adjDelta}
                  onChange={(e) => setAdjDelta(e.target.value)}
                  placeholder="例 +10 (入庫) 或 -3 (出庫)"
                />
              </div>

              <div>
                <Label>參考單號 (選填)</Label>
                <Input
                  value={adjReferenceNumber}
                  onChange={(e) => setAdjReferenceNumber(e.target.value)}
                  placeholder="例 對帳單號、退貨單號"
                />
              </div>

              <div>
                <Label>備註 (選填)</Label>
                <Textarea
                  rows={2}
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  placeholder="說明為何調整,以便日後追查"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={closeAdjust} disabled={adjSaving}>
                取消
              </Button>
              <Button size="sm" onClick={() => void submitAdjust()} disabled={adjSaving}>
                {adjSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                確認
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remainder-report dialog (師傅 main action) */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                <ClipboardCheck className="mr-2 inline h-4 w-4 text-green-700" />
                裁切完畢,回報剩餘
              </h2>
              <button type="button" onClick={closeReport}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="rounded-md bg-[var(--bg-subtle)] p-3 text-sm">
                <div className="font-mono text-xs text-[var(--accent)]">
                  {reportTarget.productSnapshot.productCode}
                </div>
                <div className="mt-0.5 font-medium">
                  {reportTarget.productSnapshot.productName}
                </div>
                <div className="text-xs text-[var(--text-tertiary)]">
                  {reportTarget.productSnapshot.specification}
                </div>
                <div className="mt-2 text-xs">
                  系統現量:{" "}
                  <span className="font-mono text-sm font-semibold">
                    {fmtQty(reportTarget.quantityOnHand)} {reportTarget.productSnapshot.unit}
                  </span>
                </div>
              </div>

              <div>
                <Label>
                  剩餘多少 {reportTarget.productSnapshot.unit}? *
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={reportRemaining}
                  onChange={(e) => setReportRemaining(e.target.value)}
                  placeholder="例如剩 3.5"
                  autoFocus
                  className="text-lg"
                />
                {reportRemaining !== "" &&
                  Number.isFinite(Number(reportRemaining)) && (
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {(() => {
                        const r = Number(reportRemaining);
                        const d = r - reportTarget.quantityOnHand;
                        if (d === 0) return "跟系統現量一樣,不會異動";
                        if (d < 0)
                          return `→ 系統將記錄本次用掉 ${fmtQty(-d)} ${reportTarget.productSnapshot.unit}`;
                        return `→ 回報量比系統多 ${fmtQty(d)} ${reportTarget.productSnapshot.unit}(系統會往上補)`;
                      })()}
                    </p>
                  )}
              </div>

              <div>
                <Label>用在哪個案件 (選填)</Label>
                <Select
                  value={reportCaseId || "__none__"}
                  onValueChange={(v) => setReportCaseId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選案件 (選填)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— 不指定 —</SelectItem>
                    {activeCases.map((c) => (
                      <SelectItem key={c.caseId} value={c.caseId}>
                        {c.caseName}{" "}
                        {c.clientNameSnapshot ? `（${c.clientNameSnapshot}）` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                  可略過。填了之後查得到這塊料是做哪張單用掉的。
                </p>
              </div>

              <div>
                <Label>備註 (選填)</Label>
                <Textarea
                  rows={2}
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  placeholder="例:剩的 3 碼有小瑕疵 / 師傅:阿明"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={closeReport}
                disabled={reportSaving}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={() => void submitReport()}
                disabled={reportSaving || reportRemaining === ""}
              >
                {reportSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                確認回報
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction history dialog */}
      {historyTarget && (
        <InventoryHistoryDialog
          summary={historyTarget}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}

function InventoryHistoryDialog({
  summary,
  onClose,
}: {
  summary: InventorySummary;
  onClose: () => void;
}) {
  const { transactions, loading } = useInventoryTransactions({
    inventoryId: summary.inventoryId,
  });
  const sorted = useMemo(
    () =>
      [...transactions].sort((a, b) =>
        (b.occurredAt || "").localeCompare(a.occurredAt || ""),
      ),
    [transactions],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              異動紀錄 ({sorted.length})
            </h2>
            <div className="text-xs text-[var(--text-tertiary)]">
              {summary.productSnapshot.productCode} {summary.productSnapshot.productName}
              {summary.productSnapshot.specification
                ? ` / ${summary.productSnapshot.specification}`
                : ""}
            </div>
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="py-6 text-center text-sm text-[var(--text-secondary)]">
              <Loader2 className="inline h-4 w-4 animate-spin" /> 載入中…
            </div>
          )}
          {!loading && sorted.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
              尚無異動紀錄
            </p>
          )}
          {sorted.length > 0 && (
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-subtle)]">
                <tr>
                  <th className="px-2 py-1.5 text-left">時間</th>
                  <th className="px-2 py-1.5 text-left">類型</th>
                  <th className="px-2 py-1.5 text-right">數量</th>
                  <th className="px-2 py-1.5 text-right">成本</th>
                  <th className="px-2 py-1.5 text-left">參考</th>
                  <th className="px-2 py-1.5 text-left">備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {sorted.map((tx) => (
                  <tr key={tx.transactionId}>
                    <td className="px-2 py-1.5 font-mono text-[var(--text-secondary)]">
                      {fmtDate(tx.occurredAt)}
                    </td>
                    <td className="px-2 py-1.5">
                      {TRANSACTION_TYPE_LABEL[tx.transactionType] || tx.transactionType}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-mono ${tx.quantityDelta >= 0 ? "text-green-700" : "text-red-700"}`}
                    >
                      {tx.quantityDelta >= 0 ? "+" : ""}
                      {fmtQty(tx.quantityDelta)} {tx.unit}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {fmtMoney(tx.unitCost)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[var(--text-tertiary)]">
                      {tx.orderId || tx.referenceNumber || "—"}
                    </td>
                    <td className="px-2 py-1.5 text-[var(--text-secondary)]">
                      {tx.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
