"use client";

import {
  ImagePlus,
  Loader2,
  MessageSquare,
  Trash2,
  X,
} from "lucide-react";
import React, { useRef } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FlexQuoteItem, ItemUnit } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const UNIT_OPTIONS: ItemUnit[] = ["只", "式", "件", "才", "組", "碼", "張", "片"];

export interface MobileQuoteItemCardProps {
  item: FlexQuoteItem;
  index: number;
  expanded: boolean;
  isImageUploading: boolean;
  isSpecImageUploading: boolean;
  imageUploadError?: string;
  specImageUploadError?: string;
  onToggleExpand: (id: string) => void;
  onUpdateItem: (id: string, patch: Partial<FlexQuoteItem>) => void;
  onRemoveItem: (id: string) => void;
  onHandleImageUpload: (id: string, file: File, field?: "imageUrl" | "specImageUrl") => void | Promise<void>;
}

export function MobileQuoteItemCard({
  item,
  index,
  expanded,
  isImageUploading,
  isSpecImageUploading,
  imageUploadError,
  specImageUploadError,
  onToggleExpand,
  onUpdateItem,
  onRemoveItem,
  onHandleImageUpload,
}: MobileQuoteItemCardProps) {
  const showManualCostInput = useRef(item.costPerUnit == null).current;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      {/* Header: index + actions */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          #{index + 1}
          {item.isCostItem && (
            <span className="ml-2 text-[11px] text-[var(--error)]">工本費支出</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleExpand(item.id)}
            className={`rounded-[var(--radius-sm)] p-1.5 transition-colors ${
              expanded || item.notes || item.imageUrl
                ? "text-[var(--accent)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onRemoveItem(item.id)}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--error-light)] hover:text-[var(--error)]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Name field */}
      <div className="mb-3">
        <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">商品名稱</div>
        <textarea
          rows={2}
          value={item.name}
          onChange={(e) => onUpdateItem(item.id, { name: e.target.value })}
          placeholder="商品名稱 / 描述"
          className="w-full resize-none rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1.5 text-sm leading-snug text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] hover:border-[var(--border)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Spec field */}
      <div className="mb-3">
        <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">規格 / 材質</div>
        <input
          value={item.spec}
          onChange={(e) => onUpdateItem(item.id, { spec: e.target.value })}
          placeholder="規格 / 材質"
          className="w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] hover:border-[var(--border)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* 3-column grid: qty / unit / unitPrice */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div>
          <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">數量</div>
          <input
            type="number"
            min={1}
            value={item.qty}
            onChange={(e) =>
              onUpdateItem(item.id, { qty: Math.max(1, Number(e.target.value)) })
            }
            className="w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1.5 text-right text-sm text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">單位</div>
          <Select
            value={item.unit}
            onValueChange={(v) => onUpdateItem(item.id, { unit: v as ItemUnit })}
          >
            <SelectTrigger className="h-8 border-transparent bg-transparent text-xs hover:border-[var(--border)]">
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
          <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">單價</div>
          <input
            type="number"
            min={0}
            value={item.unitPrice}
            onChange={(e) =>
              onUpdateItem(item.id, { unitPrice: Number(e.target.value) })
            }
            className="w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1.5 text-right text-sm text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      {/* Footer: subtotal */}
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
        <span className="text-[11px] text-[var(--text-tertiary)]">小計</span>
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {formatCurrency(item.amount)}
        </span>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
          {/* Notes */}
          <div>
            <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">備註</div>
            <textarea
              rows={2}
              value={item.notes}
              onChange={(e) => onUpdateItem(item.id, { notes: e.target.value })}
              placeholder="內部備註，不會顯示在報價單上..."
              className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>

          {/* Cost per unit */}
          {showManualCostInput && (
            <div>
              <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">成本/件（選填）</div>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={item.costPerUnit ?? ""}
                onChange={(e) =>
                  onUpdateItem(item.id, {
                    costPerUnit: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
          )}

          {/* Reference image */}
          <div>
            <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">參考圖片</div>
            {item.imageUrl ? (
              <div className="group relative">
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-24 w-full rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
                />
                {isImageUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-black/35">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onUpdateItem(item.id, { imageUrl: "" })}
                  disabled={isImageUploading}
                  className="absolute -right-1 -top-1 rounded-full bg-[var(--error)] p-0.5 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex h-20 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]">
                {isImageUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                ) : (
                  <ImagePlus className="h-4 w-4 text-[var(--text-tertiary)]" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isImageUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onHandleImageUpload(item.id, file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            )}
            {imageUploadError && (
              <div className="mt-1 text-[10px] text-[var(--error)]">{imageUploadError}</div>
            )}
          </div>

          {/* Spec image */}
          <div>
            <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">規格圖片</div>
            {item.specImageUrl ? (
              <div className="group relative">
                <img
                  src={item.specImageUrl}
                  alt=""
                  className="h-24 w-full rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
                />
                {isSpecImageUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-black/35">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onUpdateItem(item.id, { specImageUrl: "" })}
                  disabled={isSpecImageUploading}
                  className="absolute -right-1 -top-1 rounded-full bg-[var(--error)] p-0.5 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex h-20 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]">
                {isSpecImageUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                ) : (
                  <ImagePlus className="h-4 w-4 text-[var(--text-tertiary)]" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isSpecImageUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onHandleImageUpload(item.id, file, "specImageUrl");
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            )}
            {specImageUploadError && (
              <div className="mt-1 text-[10px] text-[var(--error)]">{specImageUploadError}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
