"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";
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
import type { POLineItem } from "@/lib/types";
import type { CustomOrder } from "@/lib/types";
import { calculateFabricNeeded } from "@/lib/dimension-parser";

interface MatchedItem {
  orderNumber: string;
  itemName: string;
  dimensions: string;
  quantity: string;
}

interface LineItemSuggestion {
  matched: MatchedItem[];
  fabricWidthCm: number;
  wrapCm: number;
  wasteRate: number;
  calculatedQty: number | null;
  loading: boolean;
  error: string | null;
}

function makeEmptyLineItem(): POLineItem {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    materialName: "",
    colorCode: "",
    quantity: 0,
    unit: "碼",
    suggestedQty: 0,
    linkedOrderNumbers: [],
    notes: "",
  };
}

function makeEmptySuggestion(): LineItemSuggestion {
  return {
    matched: [],
    fabricWidthCm: 145,
    wrapCm: 10,
    wasteRate: 0.1,
    calculatedQty: null,
    loading: false,
    error: null,
  };
}

function recalcSuggestion(
  suggestion: LineItemSuggestion,
  unit: "碼" | "公尺",
): number {
  if (suggestion.matched.length === 0) return 0;
  let total = 0;
  for (const m of suggestion.matched) {
    const result = calculateFabricNeeded({
      dimensions: m.dimensions,
      fabricWidthCm: suggestion.fabricWidthCm,
      wrapCm: suggestion.wrapCm,
      wasteRate: suggestion.wasteRate,
      unit,
    });
    total += result.suggestedQty;
  }
  return Math.ceil(total * 10) / 10;
}

export function NewPurchaseOrderClient() {
  const router = useRouter();
  const [supplierName, setSupplierName] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<POLineItem[]>([makeEmptyLineItem()]);
  const [suggestions, setSuggestions] = useState<LineItemSuggestion[]>([
    makeEmptySuggestion(),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function addLineItem() {
    setLineItems((prev) => [...prev, makeEmptyLineItem()]);
    setSuggestions((prev) => [...prev, makeEmptySuggestion()]);
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLineItem(index: number, patch: Partial<POLineItem>) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function updateSuggestion(index: number, patch: Partial<LineItemSuggestion>) {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  async function fetchSuggestion(index: number) {
    const item = lineItems[index];
    const colorCode = item.colorCode.trim();
    if (!colorCode) {
      updateSuggestion(index, { error: "請先輸入色號", matched: [], calculatedQty: null });
      return;
    }

    updateSuggestion(index, { loading: true, error: null, matched: [], calculatedQty: null });

    try {
      const res = await fetch("/api/sheets/orders");
      const json = (await res.json()) as { orders?: CustomOrder[]; ok?: boolean };
      const allOrders: CustomOrder[] = json.orders ?? [];

      const matched: MatchedItem[] = [];
      for (const order of allOrders) {
        for (const orderItem of order.items ?? []) {
          if (orderItem.colorCode === colorCode) {
            matched.push({
              orderNumber: order.orderNumber,
              itemName: orderItem.name,
              dimensions: orderItem.dimensions,
              quantity: orderItem.quantity,
            });
          }
        }
      }

      if (matched.length === 0) {
        updateSuggestion(index, {
          loading: false,
          matched: [],
          calculatedQty: null,
          error: `找不到使用色號「${colorCode}」的工單品項`,
        });
        return;
      }

      const currentSuggestion = suggestions[index];
      let total = 0;
      for (const m of matched) {
        const result = calculateFabricNeeded({
          dimensions: m.dimensions,
          fabricWidthCm: currentSuggestion.fabricWidthCm,
          wrapCm: currentSuggestion.wrapCm,
          wasteRate: currentSuggestion.wasteRate,
          unit: item.unit,
        });
        total += result.suggestedQty;
      }
      const calculatedQty = Math.ceil(total * 10) / 10;

      updateSuggestion(index, { loading: false, matched, calculatedQty, error: null });
    } catch (err) {
      updateSuggestion(index, {
        loading: false,
        error: err instanceof Error ? err.message : "查詢失敗",
      });
    }
  }

  function handleSuggestionParamChange(
    index: number,
    patch: Partial<Pick<LineItemSuggestion, "fabricWidthCm" | "wrapCm" | "wasteRate">>,
  ) {
    setSuggestions((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const next = { ...s, ...patch };
        if (next.matched.length > 0) {
          next.calculatedQty = recalcSuggestion(next, lineItems[i].unit);
        }
        return next;
      }),
    );
  }

  function applyQty(index: number) {
    const sugg = suggestions[index];
    if (sugg.calculatedQty !== null) {
      updateLineItem(index, { quantity: sugg.calculatedQty, suggestedQty: sugg.calculatedQty });
    }
  }

  async function handleSubmit() {
    if (!supplierName.trim()) {
      setSubmitError("請填寫供應商名稱");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        supplierName: supplierName.trim(),
        expectedAt,
        notes,
        lineItems,
      };
      const res = await fetch("/api/sheets/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        ok: boolean;
        poId?: string;
        error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? "建立失敗");
      router.push(`/purchase-orders/${json.poId ?? ""}` as never);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/purchase-orders" as never)}
        >
          <ChevronLeft className="h-4 w-4" />
          返回
        </Button>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">新增布料採購單</h1>
      </div>

      {/* Basic Info */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-4">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">基本資訊</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="supplierName" className="text-xs">
              供應商名稱 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="supplierName"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="例：阿布實業"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expectedAt" className="text-xs">
              預計到料日
            </Label>
            <Input
              id="expectedAt"
              type="date"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes" className="text-xs">整體備注</Label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="填寫整張採購單的備注…"
            rows={2}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      {/* Line Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">明細</h2>
          <Button size="sm" variant="outline" onClick={addLineItem}>
            <Plus className="h-3.5 w-3.5" />
            新增明細
          </Button>
        </div>

        {lineItems.map((item, index) => {
          const sugg = suggestions[index];
          return (
            <div
              key={item.id}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-4"
            >
              {/* Item Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  明細 #{index + 1}
                </span>
                {lineItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    className="text-[var(--text-tertiary)] hover:text-red-600"
                    title="刪除明細"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Material + Color */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label className="text-xs">材質名稱</Label>
                  <Input
                    value={item.materialName}
                    onChange={(e) => updateLineItem(index, { materialName: e.target.value })}
                    placeholder="例：蘭陽貓抓布"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">色號</Label>
                  <Input
                    value={item.colorCode}
                    onChange={(e) => updateLineItem(index, { colorCode: e.target.value })}
                    placeholder="例：LY9404"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">單位</Label>
                  <Select
                    value={item.unit}
                    onValueChange={(v) =>
                      updateLineItem(index, { unit: v as "碼" | "公尺" })
                    }
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="碼">碼</SelectItem>
                      <SelectItem value="公尺">公尺</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Suggestion Query Button */}
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void fetchSuggestion(index)}
                  disabled={sugg.loading || !item.colorCode.trim()}
                >
                  {sugg.loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  查詢建議用量
                </Button>
              </div>

              {/* Suggestion Error */}
              {sugg.error && (
                <p className="text-xs text-red-600">{sugg.error}</p>
              )}

              {/* Suggestion Panel */}
              {sugg.matched.length > 0 && (
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3 space-y-3">
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    找到 {sugg.matched.length} 個工單品項使用此色號：
                  </p>
                  <ul className="space-y-1">
                    {sugg.matched.map((m, mi) => (
                      <li key={mi} className="text-xs text-[var(--text-secondary)]">
                        <span className="font-medium text-[var(--text-primary)]">
                          {m.orderNumber}
                        </span>{" "}
                        {m.itemName} →{" "}
                        <span className="font-mono">
                          {m.dimensions.replace(/\n/g, " + ")}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Calc params */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px]">布幅 (cm)</Label>
                      <Input
                        type="number"
                        value={sugg.fabricWidthCm}
                        onChange={(e) =>
                          handleSuggestionParamChange(index, {
                            fabricWidthCm: Number(e.target.value),
                          })
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">包邊 (cm)</Label>
                      <Input
                        type="number"
                        value={sugg.wrapCm}
                        onChange={(e) =>
                          handleSuggestionParamChange(index, {
                            wrapCm: Number(e.target.value),
                          })
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">加耗 (%)</Label>
                      <Input
                        type="number"
                        value={Math.round(sugg.wasteRate * 100)}
                        onChange={(e) =>
                          handleSuggestionParamChange(index, {
                            wasteRate: Number(e.target.value) / 100,
                          })
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>

                  {sugg.calculatedQty !== null && (
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        建議採購：{sugg.calculatedQty} {item.unit}
                      </p>
                      <Button size="sm" onClick={() => applyQty(index)}>
                        套用建議量
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Quantity + Linked orders + Notes */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">採購數量 ({item.unit})</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={item.quantity}
                    onChange={(e) =>
                      updateLineItem(index, { quantity: Number(e.target.value) })
                    }
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">關聯工單號碼</Label>
                  <Input
                    value={item.linkedOrderNumbers.join(", ")}
                    onChange={(e) =>
                      updateLineItem(index, {
                        linkedOrderNumbers: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="S808, S812"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">備注</Label>
                  <Input
                    value={item.notes}
                    onChange={(e) => updateLineItem(index, { notes: e.target.value })}
                    placeholder="選填"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit */}
      {submitError && (
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.push("/purchase-orders" as never)}
          disabled={submitting}
        >
          取消
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              建立中…
            </>
          ) : (
            "建立採購單"
          )}
        </Button>
      </div>
    </div>
  );
}
