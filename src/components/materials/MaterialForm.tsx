"use client";

import { Loader2, Save, X } from "lucide-react";
import { useState } from "react";

import { CATEGORY_LABELS } from "@/lib/constants";
import { caiToYard, formatCurrency, yardToCai } from "@/lib/utils";
import type { Category, Material, StockStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_MATERIAL: Material = {
  id: "",
  brand: "",
  series: "",
  colorCode: "",
  colorName: "",
  category: "fabric",
  costPerCai: 0,
  listPricePerCai: 0,
  supplier: "",
  widthCm: 150,
  minOrder: "1碼",
  leadTimeDays: 3,
  stockStatus: "in_stock",
  features: [],
  notes: "",
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

interface MaterialFormProps {
  initial?: Material;
  onSave: (material: Material) => Promise<void>;
  onCancel: () => void;
}

export function MaterialForm({ initial, onSave, onCancel }: MaterialFormProps) {
  const isEdit = Boolean(initial);
  const [draft, setDraft] = useState<Material>(
    initial ?? { ...EMPTY_MATERIAL, id: `MAT-${Date.now()}` },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<Material>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit() {
    if (!draft.brand.trim() || !draft.colorCode.trim()) {
      setError("品牌和色號為必填");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-surface rounded-[var(--radius-lg)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {isEdit ? "編輯材質" : "新增材質"}
        </span>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-4 px-6 py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>品牌 *</Label>
            <Input
              value={draft.brand}
              onChange={(e) => update({ brand: e.target.value })}
            />
          </div>
          <div>
            <Label>系列</Label>
            <Input
              value={draft.series}
              onChange={(e) => update({ series: e.target.value })}
            />
          </div>
          <div>
            <Label>分類</Label>
            <Select
              value={draft.category}
              onValueChange={(v) => update({ category: v as Category })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>色號 *</Label>
            <Input
              value={draft.colorCode}
              onChange={(e) => update({ colorCode: e.target.value })}
            />
          </div>
          <div>
            <Label>色名</Label>
            <Input
              value={draft.colorName}
              onChange={(e) => update({ colorName: e.target.value })}
            />
          </div>
          <div>
            <Label>供應商</Label>
            <Input
              value={draft.supplier}
              onChange={(e) => update({ supplier: e.target.value })}
            />
          </div>
          <div>
            <Label>門幅 cm</Label>
            <Input
              type="number"
              value={draft.widthCm}
              onChange={(e) => update({ widthCm: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>進價（元/碼）</Label>
            <Input
              type="number"
              value={caiToYard(draft.costPerCai, draft.widthCm)}
              onChange={(e) =>
                update({
                  costPerCai: yardToCai(Number(e.target.value), draft.widthCm),
                })
              }
            />
            <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
              ≈ {formatCurrency(draft.costPerCai)}/才
            </div>
          </div>
          <div>
            <Label>牌價（元/碼）</Label>
            <Input
              type="number"
              value={caiToYard(draft.listPricePerCai, draft.widthCm)}
              onChange={(e) =>
                update({
                  listPricePerCai: yardToCai(
                    Number(e.target.value),
                    draft.widthCm,
                  ),
                })
              }
            />
            <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
              ≈ {formatCurrency(draft.listPricePerCai)}/才
            </div>
          </div>
          <div>
            <Label>最低訂量</Label>
            <Input
              value={draft.minOrder}
              onChange={(e) => update({ minOrder: e.target.value })}
            />
          </div>
          <div>
            <Label>交期 (天)</Label>
            <Input
              type="number"
              value={draft.leadTimeDays}
              onChange={(e) =>
                update({ leadTimeDays: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label>庫存狀態</Label>
            <Select
              value={draft.stockStatus}
              onValueChange={(v) =>
                update({ stockStatus: v as StockStatus })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_stock">有庫存</SelectItem>
                <SelectItem value="low">低庫存</SelectItem>
                <SelectItem value="out_of_stock">缺貨</SelectItem>
                <SelectItem value="order_only">接單採購</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>備註</Label>
          <Input
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </div>

        {error && (
          <p className="text-xs text-[var(--error)]">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
