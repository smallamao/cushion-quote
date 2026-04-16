"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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

export interface QuickCreateProductInitial {
  productCode: string;
  supplierId: string;
  unit: PurchaseUnit;
  unitPrice?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: QuickCreateProductInitial;
  suppliers: Supplier[];
  /**
   * 由父元件提供的儲存函式 (通常是 usePurchaseProducts.addProduct)。
   * 必須回傳新建的 PurchaseProduct(s),這樣父元件才能拿到 id 回填採購單。
   */
  onSubmit: (product: PurchaseProduct) => Promise<PurchaseProduct[]>;
  /** 儲存成功後的 callback,父元件用來把 productId 回填到採購單品項 */
  onCreated: (product: PurchaseProduct) => void;
}

export function QuickCreateProductDialog({
  open,
  onOpenChange,
  initial,
  suppliers,
  onSubmit,
  onCreated,
}: Props) {
  const [productCode, setProductCode] = useState(initial.productCode);
  const [productName, setProductName] = useState("");
  const [specification, setSpecification] = useState("");
  const [category, setCategory] = useState<PurchaseProductCategory>("面料");
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [unit, setUnit] = useState<PurchaseUnit>(initial.unit);
  const [unitPrice, setUnitPrice] = useState<number>(initial.unitPrice ?? 0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 每次開啟對話框時用最新 initial 重新填入
  useEffect(() => {
    if (open) {
      setProductCode(initial.productCode);
      setProductName("");
      setSpecification("");
      setCategory("面料");
      setSupplierId(initial.supplierId);
      setUnit(initial.unit);
      setUnitPrice(initial.unitPrice ?? 0);
      setNotes("");
      setError(null);
    }
  }, [open, initial]);

  const handleSubmit = async () => {
    setError(null);

    if (!productCode.trim()) {
      setError("商品編號必填");
      return;
    }
    if (!productName.trim()) {
      setError("商品名稱必填");
      return;
    }
    if (!supplierId) {
      setError("請選擇廠商");
      return;
    }

    setSaving(true);
    try {
      const id = `${productCode.trim()}-${supplierId}`;
      const now = new Date().toISOString().slice(0, 10);
      const draft: PurchaseProduct = {
        id,
        productCode: productCode.trim(),
        supplierProductCode: "",
        productName: productName.trim(),
        specification: specification.trim(),
        category,
        unit,
        supplierId,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        imageUrl: "",
        notes: notes.trim(),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      const created = await onSubmit(draft);
      const final = created[0] ?? draft;
      onCreated(final);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增商品失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增到商品庫</DialogTitle>
          <DialogDescription>
            這筆商品庫沒有,建好後會自動對應到目前的採購單品項
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>商品編號 *</Label>
              <Input
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                className="font-mono"
                placeholder="例如 LY9805"
              />
            </div>
            <div>
              <Label>商品名稱 *</Label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="例如 蘭陽 LY9800 系列"
              />
            </div>
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
              <Label>規格 / 色號</Label>
              <Input
                value={specification}
                onChange={(e) => setSpecification(e.target.value)}
                placeholder="可留空"
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
            <Label>備註</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="可留空"
            />
          </div>

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
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                建立中...
              </>
            ) : (
              "建立並回填"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
