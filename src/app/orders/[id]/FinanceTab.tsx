"use client";

import { useId, useState } from "react";
import { ImagePlus, Loader2, Plus, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  CustomOrder,
  MaterialCostType,
  MaterialPurchase,
} from "@/lib/types";
import { MATERIAL_COST_TYPE_LABELS } from "@/lib/types";

const COST_TYPES: MaterialCostType[] = ["material", "labor", "outsourcing", "other"];

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "圖片上傳失敗");
  return json.url;
}

interface FinanceTabProps {
  draft: CustomOrder;
  updateDraft: <K extends keyof CustomOrder>(key: K, value: CustomOrder[K]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  isDirty: boolean;
}

export function FinanceTab({ draft, updateDraft, onSave, saving, isDirty }: FinanceTabProps) {
  const uid = useId();
  const [receiptUploading, setReceiptUploading] = useState<string | null>(null);

  const purchases: MaterialPurchase[] = draft.materialPurchases ?? [];

  // Use materialPurchases sum if there are entries; fall back to old fields for legacy orders
  const hasPurchases = purchases.length > 0;
  const totalCostFromPurchases = purchases.reduce((s, p) => s + (p.amount || 0), 0);
  const legacyTotalCost = draft.materialCost + draft.laborCost + draft.shippingCost + draft.otherCost;
  const totalCost = hasPurchases ? totalCostFromPurchases : legacyTotalCost;

  const netProfit = draft.quotedAmount - totalCost;
  const marginRate = draft.quotedAmount > 0 ? (netProfit / draft.quotedAmount) * 100 : 0;
  const marginColor =
    marginRate < 20 ? "text-red-600" : marginRate < 40 ? "text-yellow-600" : "text-green-600";

  // Subtotals by type
  const subtotals = COST_TYPES.map((type) => ({
    type,
    label: MATERIAL_COST_TYPE_LABELS[type],
    amount: purchases.filter((p) => p.costType === type).reduce((s, p) => s + (p.amount || 0), 0),
  })).filter((s) => s.amount > 0);

  function addPurchase() {
    const newItem: MaterialPurchase = {
      id: `${uid}-${Date.now()}`,
      costType: "material",
      item: "",
      amount: 0,
      date: "",
      receiptUrls: [],
    };
    updateDraft("materialPurchases", [...purchases, newItem]);
  }

  function updatePurchase(id: string, patch: Partial<MaterialPurchase>) {
    updateDraft(
      "materialPurchases",
      purchases.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }

  function removePurchase(id: string) {
    updateDraft("materialPurchases", purchases.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-6">

      {/* 收入 */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          收入
        </h3>
        <div className="max-w-xs">
          <Label>報價金額（含稅）</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={draft.quotedAmount || ""}
            onChange={(e) => updateDraft("quotedAmount", Number(e.target.value) || 0)}
          />
        </div>
      </div>

      {/* 進貨成本明細 */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              進貨成本明細
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
              適用：自購材料、委外代工、發包費、直接人工
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={addPurchase}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            新增項目
          </Button>
        </div>

        {purchases.length === 0 && (
          <p className="text-sm text-[var(--text-tertiary)]">
            尚無成本記錄。點「新增項目」加入。
          </p>
        )}

        <div className="space-y-2">
          {purchases.map((p) => (
            <div key={p.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
              <div className="grid grid-cols-4 gap-2 items-end">
                {/* Cost type */}
                <div>
                  <Label className="text-xs">類型</Label>
                  <select
                    value={p.costType ?? "material"}
                    onChange={(e) => updatePurchase(p.id, { costType: e.target.value as MaterialCostType })}
                    className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  >
                    {COST_TYPES.map((t) => (
                      <option key={t} value={t}>{MATERIAL_COST_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                {/* Description */}
                <div>
                  <Label className="text-xs">廠商/說明</Label>
                  <Input
                    value={p.item}
                    onChange={(e) => updatePurchase(p.id, { item: e.target.value })}
                    placeholder="例：昇緯 LY9713"
                    className="h-9 text-sm"
                  />
                </div>
                {/* Amount */}
                <div>
                  <Label className="text-xs">金額</Label>
                  <Input
                    type="number"
                    value={p.amount || ""}
                    onChange={(e) => updatePurchase(p.id, { amount: Number(e.target.value) })}
                    placeholder="0"
                    className="h-9 text-sm"
                  />
                </div>
                {/* Date */}
                <div>
                  <Label className="text-xs">日期</Label>
                  <Input
                    type="date"
                    value={p.date}
                    onChange={(e) => updatePurchase(p.id, { date: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* Receipt photos */}
              {p.receiptUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.receiptUrls.map((url, i) => (
                    <div key={i} className="relative">
                      <img src={url} alt="" className="h-14 w-14 rounded border object-cover" />
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white shadow"
                        onClick={() => updatePurchase(p.id, { receiptUrls: p.receiptUrls.filter((_, j) => j !== i) })}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 flex items-center gap-2">
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs hover:bg-[var(--bg-hover)]">
                    <ImagePlus className="h-3 w-3" />
                    {receiptUploading === p.id ? "上傳中…" : "附單據照片"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    disabled={receiptUploading === p.id}
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (!files.length) return;
                      setReceiptUploading(p.id);
                      try {
                        const urls = await Promise.all(files.map(uploadFile));
                        updatePurchase(p.id, { receiptUrls: [...p.receiptUrls, ...urls] });
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "上傳失敗");
                      } finally {
                        setReceiptUploading(null);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removePurchase(p.id)}
                  className="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3" />
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Subtotals by type + grand total */}
        {purchases.length > 0 && (
          <div className="mt-4 space-y-1 border-t border-[var(--border)] pt-3">
            {subtotals.map((s) => (
              <div key={s.type} className="flex justify-between text-xs text-[var(--text-secondary)]">
                <span>{s.label}</span>
                <span>${s.amount.toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-sm font-semibold">
              <span>總進貨成本</span>
              <span>${totalCostFromPurchases.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Legacy fallback notice */}
        {!hasPurchases && legacyTotalCost > 0 && (
          <div className="mt-3 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
            目前使用舊式成本欄位（材質 ${draft.materialCost} + 工資 ${draft.laborCost} + 運費 ${draft.shippingCost} + 其他 ${draft.otherCost}）。
            新增明細後將以明細為準。
          </div>
        )}
      </div>

      {/* 結果 */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          損益結果
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-[var(--bg-subtle)] px-4 py-3">
            <p className="text-xs text-[var(--text-tertiary)]">總成本</p>
            <p className="mt-1 text-lg font-semibold">${totalCost.toLocaleString("zh-TW")}</p>
          </div>
          <div className="rounded-md bg-[var(--bg-subtle)] px-4 py-3">
            <p className="text-xs text-[var(--text-tertiary)]">淨利潤</p>
            <p className="mt-1 text-lg font-semibold">${netProfit.toLocaleString("zh-TW")}</p>
          </div>
          <div className="rounded-md bg-[var(--bg-subtle)] px-4 py-3">
            <p className="text-xs text-[var(--text-tertiary)]">毛利率</p>
            <p className={`mt-1 text-lg font-semibold ${marginColor}`}>{marginRate.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* 儲存 */}
      <div className="flex justify-end">
        <Button onClick={() => void onSave()} disabled={saving || !isDirty}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          儲存變更
        </Button>
      </div>
    </div>
  );
}
