"use client";

import { DollarSign, Layers, Pencil, Plus, Save, Trash2, TrendingUp, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { usePurchaseProducts } from "@/hooks/usePurchaseProducts";
import { useSuppliers } from "@/hooks/useSuppliers";
import type {
  PurchaseProduct,
  PurchaseProductCategory,
  PurchaseUnit,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BatchPriceUpdateModal } from "@/components/purchase-products/BatchPriceUpdateModal";

const CATEGORIES: PurchaseProductCategory[] = [
  "面料",
  "椅腳",
  "泡棉",
  "木料",
  "皮革",
  "五金",
  "其他",
];

const UNITS: PurchaseUnit[] = ["碼", "才", "米", "只", "片", "件", "組", "包", "個"];

const EMPTY_PRODUCT: PurchaseProduct = {
  id: "",
  productCode: "",
  productName: "",
  specification: "",
  category: "面料",
  unit: "碼",
  supplierId: "",
  unitPrice: 0,
  imageUrl: "",
  notes: "",
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

interface BulkRow {
  productCode: string;
  productName: string;
  specification: string;
  unitPrice: number;
}

function emptyBulkRow(): BulkRow {
  return { productCode: "", productName: "", specification: "", unitPrice: 0 };
}

interface BulkCommon {
  category: PurchaseProductCategory;
  supplierId: string;
  unit: PurchaseUnit;
  notes: string;
}

function defaultBulkCommon(): BulkCommon {
  return {
    category: "面料",
    supplierId: "",
    unit: "碼",
    notes: "",
  };
}

export function PurchaseProductsClient() {
  const { products, loading, addProduct, updateProduct, reload } = usePurchaseProducts();
  const { suppliers } = useSuppliers();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PurchaseProduct>(EMPTY_PRODUCT);
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | PurchaseProductCategory>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);

  // Bulk create modal state
  const [showBulk, setShowBulk] = useState(false);
  const [bulkCommon, setBulkCommon] = useState<BulkCommon>(defaultBulkCommon);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow()]);
  const [bulkSaving, setBulkSaving] = useState(false);
  // Series generator
  const [seriesBase, setSeriesBase] = useState("");
  const [seriesVariants, setSeriesVariants] = useState("");
  const [seriesName, setSeriesName] = useState("");

  // Batch price update modal state
  const [showBatchPrice, setShowBatchPrice] = useState(false);
  const [seriesPrice, setSeriesPrice] = useState<number>(0);

  const supplierMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of suppliers) {
      m[s.supplierId] = s.shortName || s.name;
    }
    return m;
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return products
      .filter((p) => showInactive || p.isActive)
      .filter((p) => categoryFilter === "all" || p.category === categoryFilter)
      .filter((p) => supplierFilter === "all" || p.supplierId === supplierFilter)
      .filter((p) => {
        if (!q) return true;
        return [p.productCode, p.productName, p.specification, p.notes].some((f) =>
          (f || "").toLowerCase().includes(q),
        );
      });
  }, [products, keyword, categoryFilter, supplierFilter, showInactive]);

  const batchFilterSummary = useMemo(() => {
    const summary: string[] = [];

    if (keyword.trim()) {
      summary.push(`搜尋：${keyword.trim()}`);
    }
    if (categoryFilter !== "all") {
      summary.push(`分類：${categoryFilter}`);
    }
    if (supplierFilter !== "all") {
      summary.push(`廠商：${supplierMap[supplierFilter] || supplierFilter}`);
    }
    if (showInactive) {
      summary.push("包含停用商品");
    }

    return summary;
  }, [categoryFilter, keyword, showInactive, supplierFilter, supplierMap]);

  function openNew() {
    setDraft({ ...EMPTY_PRODUCT });
    setEditing(false);
    setShowForm(true);
  }

  function openEdit(p: PurchaseProduct) {
    setDraft({ ...p });
    setEditing(true);
    setShowForm(true);
  }

  async function handleSave() {
    if (!draft.productCode.trim() || !draft.productName.trim()) {
      alert("請輸入商品編號與名稱");
      return;
    }
    if (!draft.supplierId) {
      alert("請選擇廠商");
      return;
    }
    const saveDraft = {
      ...draft,
      id: draft.id || `${draft.productCode}-${draft.supplierId}`,
    };
    if (editing) {
      await updateProduct(saveDraft);
    } else {
      await addProduct(saveDraft);
    }
    setShowForm(false);
  }

  function update<K extends keyof PurchaseProduct>(key: K, value: PurchaseProduct[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // ----------------------------------------------------------------
  // Bulk create handlers
  // ----------------------------------------------------------------
  function openBulk() {
    setBulkCommon(defaultBulkCommon());
    setBulkRows([emptyBulkRow()]);
    setSeriesBase("");
    setSeriesVariants("");
    setSeriesName("");
    setSeriesPrice(0);
    setShowBulk(true);
  }

  function updateBulkRow<K extends keyof BulkRow>(
    index: number,
    key: K,
    value: BulkRow[K],
  ) {
    setBulkRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    );
  }

  function addBulkRow() {
    setBulkRows((prev) => [...prev, emptyBulkRow()]);
  }

  function removeBulkRow(index: number) {
    setBulkRows((prev) =>
      prev.length === 1 ? [emptyBulkRow()] : prev.filter((_, i) => i !== index),
    );
  }

  function generateFromSeries() {
    const base = seriesBase.trim();
    if (!base) {
      alert("請輸入系列代號（例如：LY3139）");
      return;
    }
    const variants = seriesVariants
      .split(/[,，\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (variants.length === 0) {
      alert("請輸入色號清單（例如：1,2,3 或 -1,-2,-3）");
      return;
    }
    const generated: BulkRow[] = variants.map((v) => {
      // If variant already contains separator char, use as-is; else join with `-`
      const code =
        v.startsWith("-") || v.startsWith("_") || v.startsWith("/")
          ? `${base}${v}`
          : `${base}-${v}`;
      return {
        productCode: code,
        productName: seriesName || base,
        specification: v.replace(/^[-_/]/, ""),
        unitPrice: seriesPrice,
      };
    });

    // Replace existing rows if the only row is empty, else append
    const isEmpty =
      bulkRows.length === 1 &&
      !bulkRows[0].productCode &&
      !bulkRows[0].productName;
    setBulkRows(isEmpty ? generated : [...bulkRows, ...generated]);
  }

  async function handleBulkSave() {
    if (!bulkCommon.supplierId) {
      alert("請選擇廠商");
      return;
    }
    const validRows = bulkRows.filter(
      (r) => r.productCode.trim() && r.productName.trim(),
    );
    if (validRows.length === 0) {
      alert("請至少填寫一筆完整資料（商品編號與名稱）");
      return;
    }

    // Detect duplicates within this batch
    const codes = validRows.map((r) => r.productCode.trim());
    const duplicates = codes.filter((c, i) => codes.indexOf(c) !== i);
    if (duplicates.length > 0) {
      alert(`批次內有重複的商品編號：${Array.from(new Set(duplicates)).join(", ")}`);
      return;
    }

    // Detect collisions with existing products for the same supplier
    const existingIds = new Set(
      products
        .filter((p) => p.supplierId === bulkCommon.supplierId)
        .map((p) => `${p.productCode}-${p.supplierId}`),
    );
    const conflicts = validRows.filter((r) =>
      existingIds.has(`${r.productCode.trim()}-${bulkCommon.supplierId}`),
    );
    if (conflicts.length > 0) {
      const ok = confirm(
        `以下商品已存在（${conflicts.length} 筆），繼續會建立新的重複記錄：\n${conflicts
          .map((c) => c.productCode)
          .join(", ")}\n\n仍要新增嗎？`,
      );
      if (!ok) return;
    }

    const payload: PurchaseProduct[] = validRows.map((r) => ({
      id: `${r.productCode.trim()}-${bulkCommon.supplierId}`,
      productCode: r.productCode.trim(),
      productName: r.productName.trim(),
      specification: r.specification.trim(),
      category: bulkCommon.category,
      unit: bulkCommon.unit,
      supplierId: bulkCommon.supplierId,
      unitPrice: r.unitPrice,
      imageUrl: "",
      notes: bulkCommon.notes.trim(),
      isActive: true,
      createdAt: "",
      updatedAt: "",
    }));

    setBulkSaving(true);
    try {
      await addProduct(payload);
      setShowBulk(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "批量新增失敗";
      alert(msg);
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            採購商品管理
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {loading ? "載入中..." : `${filtered.length} / ${products.length} 筆商品`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowBatchPrice(true)}
            disabled={filtered.length === 0}
          >
            <DollarSign className="mr-1 h-4 w-4" /> 批量改價
          </Button>
          <Button variant="outline" onClick={openBulk}>
            <Layers className="mr-1 h-4 w-4" /> 批量新增
          </Button>
          <Button onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> 新增商品
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋編號 / 名稱 / 規格..."
            className="max-w-sm"
          />
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as "all" | PurchaseProductCategory)}
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
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="廠商" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部廠商</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.supplierId} value={s.supplierId}>
                  {s.shortName || s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            顯示停用
          </label>
          {(keyword || categoryFilter !== "all" || supplierFilter !== "all" || showInactive) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setKeyword("");
                setCategoryFilter("all");
                setSupplierFilter("all");
                setShowInactive(false);
              }}
              className="text-xs"
            >
              <X className="mr-1 h-3 w-3" />
              清除篩選
            </Button>
          )}
        </div>
        {(keyword || categoryFilter !== "all" || supplierFilter !== "all" || showInactive) && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span>
              符合 <span className="font-semibold text-[var(--accent)]">{filtered.length}</span> 筆，共{" "}
              <span className="font-semibold">{products.length}</span> 筆
            </span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--text-secondary)]">
            <tr>
              <th className="px-3 py-2 text-left">編號</th>
              <th className="px-3 py-2 text-left">名稱</th>
              <th className="px-3 py-2 text-left">規格</th>
              <th className="px-3 py-2 text-left">分類</th>
              <th className="px-3 py-2 text-left">廠商</th>
              <th className="px-3 py-2 text-right">單價</th>
              <th className="px-3 py-2 text-left">單位</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                className={`border-t border-[var(--border)] ${
                  p.isActive ? "" : "text-[var(--text-tertiary)]"
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs">{p.productCode}</td>
                <td className="px-3 py-2">{p.productName}</td>
                <td className="px-3 py-2 text-xs">{p.specification}</td>
                <td className="px-3 py-2 text-xs">{p.category}</td>
                <td className="px-3 py-2 text-xs">
                  {supplierMap[p.supplierId] || p.supplierId}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {p.unitPrice.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs">{p.unit}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/purchase-products/${p.id}/history`}>
                      <Button size="sm" variant="ghost" title="查看採購歷史">
                        <TrendingUp className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)} title="編輯商品">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-[var(--text-tertiary)]"
                >
                  {loading ? "載入中..." : "沒有符合條件的商品"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-[var(--bg-elevated)] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {editing ? "編輯商品" : "新增商品"}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>商品編號 *</Label>
                <Input
                  value={draft.productCode}
                  onChange={(e) => update("productCode", e.target.value)}
                />
              </div>
              <div>
                <Label>狀態</Label>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => update("isActive", e.target.checked)}
                  />
                  啟用中
                </label>
              </div>
              <div className="md:col-span-2">
                <Label>商品名稱 *</Label>
                <Input
                  value={draft.productName}
                  onChange={(e) => update("productName", e.target.value)}
                />
              </div>
              <div>
                <Label>規格</Label>
                <Input
                  value={draft.specification}
                  onChange={(e) => update("specification", e.target.value)}
                />
              </div>
              <div>
                <Label>分類</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => update("category", v as PurchaseProductCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>廠商 *</Label>
                <Select
                  value={draft.supplierId}
                  onValueChange={(v) => update("supplierId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇廠商" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.supplierId} value={s.supplierId}>
                        {s.shortName || s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>單位</Label>
                <Select
                  value={draft.unit}
                  onValueChange={(v) => update("unit", v as PurchaseUnit)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>單價</Label>
                <Input
                  type="number"
                  value={draft.unitPrice}
                  onChange={(e) => update("unitPrice", Number(e.target.value) || 0)}
                />
              </div>
              <div className="md:col-span-2">
                <Label>圖片 URL</Label>
                <Input
                  value={draft.imageUrl}
                  onChange={(e) => update("imageUrl", e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Label>備註</Label>
                <Textarea
                  value={draft.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                取消
              </Button>
              <Button onClick={handleSave}>
                <Save className="mr-1 h-4 w-4" /> 儲存
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk create modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-lg bg-[var(--bg-elevated)] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  批量新增商品
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  先設定共通欄位（分類 / 廠商 / 單位），再一次填入多筆商品
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBulk(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Common fields */}
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                共通欄位
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div>
                  <Label className="mb-1 block text-xs">分類 *</Label>
                  <Select
                    value={bulkCommon.category}
                    onValueChange={(v) =>
                      setBulkCommon((prev) => ({
                        ...prev,
                        category: v as PurchaseProductCategory,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">廠商 *</Label>
                  <Select
                    value={bulkCommon.supplierId}
                    onValueChange={(v) =>
                      setBulkCommon((prev) => ({ ...prev, supplierId: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇廠商" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers
                        .filter((s) => s.isActive)
                        .map((s) => (
                          <SelectItem key={s.supplierId} value={s.supplierId}>
                            {s.shortName || s.name} ({s.supplierId})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">單位 *</Label>
                  <Select
                    value={bulkCommon.unit}
                    onValueChange={(v) =>
                      setBulkCommon((prev) => ({
                        ...prev,
                        unit: v as PurchaseUnit,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">備註（套用全部）</Label>
                  <Input
                    value={bulkCommon.notes}
                    onChange={(e) =>
                      setBulkCommon((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="例：貓抓皮系列"
                  />
                </div>
              </div>
            </div>

            {/* Series generator */}
            <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--accent)] bg-[var(--accent-muted)]/20 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                <Wand2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                系列快速產生器
              </div>
              <p className="mb-3 text-[11px] text-[var(--text-tertiary)]">
                輸入系列代號 + 色號清單，一鍵產生多筆商品列。例如：系列
                <code className="mx-1 rounded bg-[var(--bg-subtle)] px-1">LY3139</code>
                ＋ 色號
                <code className="mx-1 rounded bg-[var(--bg-subtle)] px-1">1,2,3,4,5,6,7</code>
                → 自動產生 LY3139-1 ~ LY3139-7
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                <div>
                  <Label className="mb-1 block text-[11px]">系列代號</Label>
                  <Input
                    value={seriesBase}
                    onChange={(e) => setSeriesBase(e.target.value)}
                    placeholder="LY3139"
                    className="font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="mb-1 block text-[11px]">色號清單（逗號/空白分隔）</Label>
                  <Input
                    value={seriesVariants}
                    onChange={(e) => setSeriesVariants(e.target.value)}
                    placeholder="1,2,3,4,5,6,7"
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-[11px]">共同名稱</Label>
                  <Input
                    value={seriesName}
                    onChange={(e) => setSeriesName(e.target.value)}
                    placeholder="貓抓皮"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-[11px]">共同單價</Label>
                  <Input
                    type="number"
                    value={seriesPrice || ""}
                    onChange={(e) => setSeriesPrice(Number(e.target.value) || 0)}
                    placeholder="500"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="outline" onClick={generateFromSeries}>
                  <Wand2 className="mr-1 h-3.5 w-3.5" />
                  產生 {seriesVariants.split(/[,，\s]+/).filter(Boolean).length || 0} 筆列
                </Button>
              </div>
            </div>

            {/* Editable rows table */}
            <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                <div className="text-sm font-semibold">
                  商品列表 ({bulkRows.length})
                </div>
                <Button variant="ghost" size="sm" onClick={addBulkRow}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  新增空白列
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
                    <tr>
                      <th className="w-10 px-2 py-2 text-left font-medium">#</th>
                      <th className="px-2 py-2 text-left font-medium">商品編號 *</th>
                      <th className="px-2 py-2 text-left font-medium">商品名稱 *</th>
                      <th className="px-2 py-2 text-left font-medium">規格 / 色號</th>
                      <th className="w-28 px-2 py-2 text-right font-medium">單價</th>
                      <th className="w-8 px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {bulkRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
                          {idx + 1}
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={row.productCode}
                            onChange={(e) =>
                              updateBulkRow(idx, "productCode", e.target.value)
                            }
                            placeholder="LY3139-1"
                            className="h-8 font-mono text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={row.productName}
                            onChange={(e) =>
                              updateBulkRow(idx, "productName", e.target.value)
                            }
                            placeholder="貓抓皮"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={row.specification}
                            onChange={(e) =>
                              updateBulkRow(idx, "specification", e.target.value)
                            }
                            placeholder="3139-1"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            value={row.unitPrice || ""}
                            onChange={(e) =>
                              updateBulkRow(
                                idx,
                                "unitPrice",
                                Number(e.target.value) || 0,
                              )
                            }
                            className="h-8 text-right font-mono text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeBulkRow(idx)}
                            className="text-[var(--text-tertiary)] hover:text-red-500"
                            aria-label="刪除列"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {bulkRows.filter((r) => r.productCode && r.productName).length}{" "}
                筆有效資料 / 共 {bulkRows.length} 列
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowBulk(false)}>
                  取消
                </Button>
                <Button onClick={handleBulkSave} disabled={bulkSaving}>
                  <Save className="mr-1 h-4 w-4" />
                  {bulkSaving ? "儲存中…" : "儲存全部"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Price Update Modal */}
      <BatchPriceUpdateModal
        isOpen={showBatchPrice}
        onClose={() => setShowBatchPrice(false)}
        filteredProducts={filtered}
        activeFilters={batchFilterSummary}
        onSuccess={() => {
          void reload();
        }}
      />
    </div>
  );
}
