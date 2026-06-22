"use client";

import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomOrder } from "@/lib/types";

interface FinanceTabProps {
  draft: CustomOrder;
  updateDraft: <K extends keyof CustomOrder>(key: K, value: CustomOrder[K]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  isDirty: boolean;
}

export function FinanceTab({ draft, updateDraft, onSave, saving, isDirty }: FinanceTabProps) {
  const totalCost = draft.materialCost + draft.laborCost + draft.shippingCost + draft.otherCost;
  const netProfit = draft.quotedAmount - totalCost;
  const marginRate = draft.quotedAmount > 0 ? (netProfit / draft.quotedAmount) * 100 : 0;

  const marginColor =
    marginRate < 20
      ? "text-red-600"
      : marginRate < 40
        ? "text-yellow-600"
        : "text-green-600";

  return (
    <div className="space-y-6">

      {/* 收入區塊 */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          收入
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>報價金額（含稅）</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={draft.quotedAmount}
              onChange={(e) => updateDraft("quotedAmount", Number(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      {/* 成本區塊 */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          成本
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>材質成本</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={draft.materialCost}
              onChange={(e) => updateDraft("materialCost", Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>工資成本</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={draft.laborCost}
              onChange={(e) => updateDraft("laborCost", Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>運費</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={draft.shippingCost}
              onChange={(e) => updateDraft("shippingCost", Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>其他成本</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={draft.otherCost}
              onChange={(e) => updateDraft("otherCost", Number(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      {/* 結果區塊（自動計算）*/}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          結果（自動計算）
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-[var(--bg-subtle)] px-4 py-3">
            <p className="text-xs text-[var(--text-tertiary)]">總成本</p>
            <p className="mt-1 text-lg font-semibold">
              ${totalCost.toLocaleString("zh-TW")}
            </p>
          </div>
          <div className="rounded-md bg-[var(--bg-subtle)] px-4 py-3">
            <p className="text-xs text-[var(--text-tertiary)]">淨利潤</p>
            <p className="mt-1 text-lg font-semibold">
              ${netProfit.toLocaleString("zh-TW")}
            </p>
          </div>
          <div className="rounded-md bg-[var(--bg-subtle)] px-4 py-3">
            <p className="text-xs text-[var(--text-tertiary)]">毛利率</p>
            <p className={`mt-1 text-lg font-semibold ${marginColor}`}>
              {marginRate.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* 儲存按鈕 */}
      <div className="flex justify-end">
        <Button onClick={() => void onSave()} disabled={saving || !isDirty}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          儲存變更
        </Button>
      </div>
    </div>
  );
}
