"use client";

import { Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductCombobox } from "@/components/purchases/ProductCombobox";
import type { PurchaseProduct, PurchaseUnit } from "@/lib/types";

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

interface EditableItem {
  itemId: string;
  productId: string;
  productCode: string;
  productName: string;
  specification: string;
  unit: PurchaseUnit;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  notes: string;
  matched: boolean;
  warning?: string;
}

interface Props {
  index: number;
  item: EditableItem;
  supplierProducts: readonly PurchaseProduct[];
  inventoryByProductId?: Map<string, { qty: number; unit: string }>;
  loadingProducts?: boolean;
  onUpdate: (patch: Partial<EditableItem>) => void;
  onRemove: () => void;
  onSelectProduct: (productId: string) => void;
  onOpenQuickCreate: () => void;
}

export function MobilePurchaseItemCard({
  index,
  item,
  supplierProducts,
  inventoryByProductId,
  loadingProducts = false,
  onUpdate,
  onRemove,
  onSelectProduct,
  onOpenQuickCreate,
}: Props) {
  const subtotal = item.quantity * item.unitPrice;
  const isResolved =
    !!item.productId && supplierProducts.some((p) => p.id === item.productId);
  const hasSnapshot = !!(item.productCode || item.productName);
  const stillLoading = loadingProducts && !!item.productId;
  const showCombobox = isResolved || stillLoading;

  return (
    <div
      className={`rounded-[var(--radius-md)] border p-3 space-y-2.5 ${
        showCombobox
          ? "border-[var(--border)] bg-[var(--bg-elevated)]"
          : "border-amber-300 bg-amber-50/50"
      }`}
    >
      {/* Header: index + delete */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">
          #{index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--text-tertiary)] hover:text-red-500"
          aria-label="刪除品項"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Product combobox (full-width) */}
      {showCombobox ? (
        <div>
          <ProductCombobox
            value={item.productId}
            products={supplierProducts}
            onChange={onSelectProduct}
            placeholder="選擇商品..."
          />
          {item.productId && inventoryByProductId && !stillLoading && (
            <div
              className={`mt-1 text-[11px] ${
                (inventoryByProductId.get(item.productId)?.qty ?? 0) <= 0
                  ? "text-amber-600"
                  : "text-[var(--text-tertiary)]"
              }`}
            >
              {inventoryByProductId.has(item.productId) ? (
                <>
                  目前庫存:{" "}
                  {inventoryByProductId
                    .get(item.productId)
                    ?.qty.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}{" "}
                  {inventoryByProductId.get(item.productId)?.unit}
                </>
              ) : (
                "目前庫存: 無紀錄"
              )}
            </div>
          )}
        </div>
      ) : hasSnapshot ? (
        <div className="space-y-1.5">
          <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
            ⚠ 原商品「
            <span className="font-mono">{item.productCode || "（無編號）"}</span>
            {item.productName ? ` · ${item.productName}` : ""}
            {item.specification ? ` · ${item.specification}` : ""}
            」在商品庫找不到,請重新對應或新增
          </div>
          <ProductCombobox
            value=""
            products={supplierProducts}
            onChange={onSelectProduct}
            placeholder={
              item.productCode
                ? `重新對應「${item.productCode}」...`
                : "重新對應商品..."
            }
          />
          {item.productCode && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-[11px]"
              onClick={onOpenQuickCreate}
              title="把這筆商品新增到商品庫"
            >
              <Sparkles className="h-3 w-3" />
              新增「{item.productCode}」到商品庫
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Input
              placeholder="商品編號"
              value={item.productCode}
              onChange={(e) => onUpdate({ productCode: e.target.value })}
              className="h-8 flex-1 text-xs font-mono"
            />
            {item.productCode && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 px-2 text-[10px]"
                onClick={onOpenQuickCreate}
                title="新增到商品庫"
              >
                <Sparkles className="h-3 w-3" />
                新增
              </Button>
            )}
          </div>
          {item.warning && (
            <div className="text-[10px] text-amber-600">⚠ {item.warning}</div>
          )}
        </div>
      )}

      {/* 3-column grid: quantity, unit, unit price */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <span className="block text-[10px] text-[var(--text-tertiary)]">數量</span>
          <Input
            type="number"
            step="0.5"
            value={item.quantity || ""}
            onChange={(e) => onUpdate({ quantity: Number(e.target.value) || 0 })}
            className="h-8 text-right text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <span className="block text-[10px] text-[var(--text-tertiary)]">單位</span>
          <Select
            value={item.unit}
            onValueChange={(v) => onUpdate({ unit: v as PurchaseUnit })}
          >
            <SelectTrigger className="h-8 text-xs">
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
        <div className="space-y-1">
          <span className="block text-[10px] text-[var(--text-tertiary)]">單價</span>
          <Input
            type="number"
            step="1"
            value={item.unitPrice || ""}
            onChange={(e) => onUpdate({ unitPrice: Number(e.target.value) || 0 })}
            className="h-8 text-right text-xs font-mono"
          />
        </div>
      </div>

      {/* Notes (full-width) */}
      <Input
        placeholder="備註"
        value={item.notes}
        onChange={(e) => onUpdate({ notes: e.target.value })}
        className="h-8 text-xs"
      />

      {/* Footer: subtotal */}
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
        <span className="text-[10px] text-[var(--text-tertiary)]">小計</span>
        <span className="font-mono text-sm font-semibold text-[var(--accent)]">
          ${subtotal.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}
