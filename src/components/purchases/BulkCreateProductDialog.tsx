"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, MinusCircle } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type {
  PurchaseProduct,
  PurchaseProductCategory,
  PurchaseUnit,
  Supplier,
} from "@/lib/types";

const CATEGORY_OPTIONS: PurchaseProductCategory[] = [
  "面料",
  "椅腳",
  "泡棉",
  "木料",
  "皮革",
  "五金",
  "其他",
];

const UNIT_OPTIONS: PurchaseUnit[] = [
  "碼",
  "才",
  "米",
  "只",
  "片",
  "件",
  "組",
  "包",
  "個",
];

interface ParsedRow {
  productCode: string;
  /** 已存在於商品庫 (同 productCode + supplierId) 會被跳過 */
  duplicate: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 預填的編號清單 (例如從採購單未對應品項帶過來) */
  initialCodes?: readonly string[];
  /** 預選的廠商 */
  initialSupplierId?: string;
  /** 預填單位 (例如從採購單品項帶過來) */
  initialUnit?: PurchaseUnit;
  suppliers: Supplier[];
  /** 既有商品 (用來偵測重複) */
  existingProducts: PurchaseProduct[];
  /** 由父元件提供的儲存函式,通常是 usePurchaseProducts.addProduct */
  onSubmit: (products: PurchaseProduct[]) => Promise<PurchaseProduct[]>;
  /** 全部建立成功後的 callback (傳回新建的所有商品) */
  onCreated: (products: PurchaseProduct[]) => void;
}

export function BulkCreateProductDialog({
  open,
  onOpenChange,
  initialCodes,
  initialSupplierId,
  initialUnit,
  suppliers,
  existingProducts,
  onSubmit,
  onCreated,
}: Props) {
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "");
  const [category, setCategory] = useState<PurchaseProductCategory>("面料");
  const [unit, setUnit] = useState<PurchaseUnit>(initialUnit ?? "碼");
  const [productName, setProductName] = useState("");
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [codesText, setCodesText] = useState(
    (initialCodes ?? []).join("\n"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 每次重新打開都重置 (用最新的 initial)
  useEffect(() => {
    if (open) {
      setSupplierId(initialSupplierId ?? "");
      setCategory("面料");
      setUnit(initialUnit ?? "碼");
      setProductName("");
      setUnitPrice(0);
      setNotes("");
      setCodesText((initialCodes ?? []).join("\n"));
      setError(null);
    }
  }, [open, initialCodes, initialSupplierId, initialUnit]);

  /**
   * 解析 textarea 為編號陣列,去重 + 修剪。
   */
  const parsedRows: ParsedRow[] = useMemo(() => {
    const seen = new Set<string>();
    const rows: ParsedRow[] = [];
    for (const raw of codesText.split(/\r?\n/)) {
      const code = raw.trim();
      if (!code) continue;
      if (seen.has(code.toLowerCase())) continue;
      seen.add(code.toLowerCase());

      // 偵測重複: 同 productCode + supplierId 已存在
      const expectedId = supplierId ? `${code}-${supplierId}` : "";
      const duplicate = existingProducts.some((p) => {
        if (expectedId && p.id === expectedId) return true;
        if (
          supplierId &&
          p.supplierId === supplierId &&
          p.productCode.toLowerCase() === code.toLowerCase()
        )
          return true;
        return false;
      });

      rows.push({ productCode: code, duplicate });
    }
    return rows;
  }, [codesText, existingProducts, supplierId]);

  const newRows = parsedRows.filter((r) => !r.duplicate);
  const dupCount = parsedRows.length - newRows.length;

  const handleSubmit = async () => {
    setError(null);

    if (!supplierId) {
      setError("請選擇廠商");
      return;
    }
    if (!productName.trim()) {
      setError("商品名稱必填");
      return;
    }
    if (newRows.length === 0) {
      setError(
        parsedRows.length === 0
          ? "請至少貼上一個編號"
          : "全部編號都已存在,沒有需要建立的商品",
      );
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString().slice(0, 10);
      const drafts: PurchaseProduct[] = newRows.map((r) => ({
        id: `${r.productCode}-${supplierId}`,
        productCode: r.productCode,
        supplierProductCode: "",
        productName: productName.trim(),
        specification: r.productCode,
        category,
        unit,
        supplierId,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        imageUrl: "",
        notes: notes.trim(),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }));

      const created = await onSubmit(drafts);
      onCreated(created.length > 0 ? created : drafts);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批次建立失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>批次建立商品系列</DialogTitle>
          <DialogDescription>
            一次建立多個共用相同名稱、廠商、單價的商品 (例如同系列不同色號)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 共用資料 */}
          <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
            <div className="text-xs font-semibold text-[var(--text-secondary)]">
              共用資料 (所有編號共用)
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>廠商 *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
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
                <Label>商品名稱 (系列名) *</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="例如 LY97涼感抗菌貓抓布"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>類別</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as PurchaseProductCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>單位</Label>
                <Select value={unit} onValueChange={(v) => setUnit(v as PurchaseUnit)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
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
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Number(e.target.value))}
                  min={0}
                  step={1}
                />
              </div>
            </div>

            <div>
              <Label>備註 (可留空)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="所有商品共用的備註"
              />
            </div>
          </div>

          {/* 編號清單 */}
          <div>
            <Label>商品編號清單 (一行一筆,順序不限)</Label>
            <Textarea
              value={codesText}
              onChange={(e) => setCodesText(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder={`LY9701\nLY9703\nLY9705\nLY9707\nLY9712`}
            />
          </div>

          {/* 預覽 */}
          {parsedRows.length > 0 && (
            <div className="rounded-md border border-[var(--border)] bg-white">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 text-xs">
                <span className="font-semibold">
                  預覽 ({parsedRows.length} 筆,{newRows.length} 筆新增
                  {dupCount > 0 ? `, ${dupCount} 筆已存在` : ""})
                </span>
                {productName.trim() && supplierId && (
                  <span className="text-[var(--text-tertiary)]">
                    將寫入: {productName.trim()}
                  </span>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto">
                {parsedRows.map((r) => (
                  <div
                    key={r.productCode}
                    className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 text-xs last:border-b-0"
                  >
                    {r.duplicate ? (
                      <MinusCircle className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    <span className="font-mono">{r.productCode}</span>
                    {r.duplicate && (
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        已存在,跳過
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving || newRows.length === 0}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                建立中...
              </>
            ) : (
              `建立 ${newRows.length} 筆商品`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
