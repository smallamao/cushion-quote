"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PurchaseProduct } from "@/lib/types";
import {
  calculateAdjustedPrice,
  validateAdjustedPrice,
  validatePriceAdjustment,
  type AdjustmentMode,
} from "@/lib/purchase-product-price";

const MAX_BATCH_PRODUCTS = 100;

interface BatchPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  filteredProducts: PurchaseProduct[];
  activeFilters: string[];
  onSuccess: () => void;
}

type Step = "confirm" | "adjust" | "preview" | "result";

export function BatchPriceUpdateModal({
  isOpen,
  onClose,
  filteredProducts,
  activeFilters,
  onSuccess,
}: BatchPriceUpdateModalProps) {
  const [step, setStep] = useState<Step>("confirm");
  const [mode, setMode] = useState<AdjustmentMode>("percentage");
  const [value, setValue] = useState<number>(10);
  const [isIncrease, setIsIncrease] = useState(true);
  const [showPreviewList, setShowPreviewList] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      handleReset();
    }
  }, [isOpen]);

  const previewResults = useMemo(() => {
    return filteredProducts.map((p) => {
      const currentPrice = p.unitPrice ?? 0;
      const newPrice = calculateAdjustedPrice(currentPrice, {
        mode,
        value,
        isIncrease,
      });
      const diff = newPrice - currentPrice;
      const diffPercent =
        currentPrice > 0 ? ((diff / currentPrice) * 100).toFixed(1) : "—";

      return {
        productCode: p.productCode,
        productName: p.productName,
        oldPrice: currentPrice,
        newPrice,
        diff,
        diffPercent,
      };
    });
  }, [filteredProducts, mode, value, isIncrease]);

  const averageChange = useMemo(() => {
    if (previewResults.length === 0) return { oldAvg: 0, newAvg: 0 };
    const oldAvg =
      previewResults.reduce((sum, r) => sum + r.oldPrice, 0) /
      previewResults.length;
    const newAvg =
      previewResults.reduce((sum, r) => sum + r.newPrice, 0) /
      previewResults.length;
    return { oldAvg: Math.round(oldAvg), newAvg: Math.round(newAvg) };
  }, [previewResults]);

  const adjustmentLabel = useMemo(() => {
    if (mode === "absolute") return `設為 ${value} 元`;
    const sign = isIncrease ? "+" : "-";
    const unit = mode === "percentage" ? "%" : "元";
    return `${sign}${value}${unit}`;
  }, [mode, value, isIncrease]);

  function handleReset() {
    setStep("confirm");
    setMode("percentage");
    setValue(10);
    setIsIncrease(true);
    setShowPreviewList(false);
    setIsExecuting(false);
    setUpdatedCount(0);
    setErrorMessage("");
  }

  function handleClose() {
    handleReset();
    onClose();
  }

  function validateBeforeProceed(): string | null {
    if (filteredProducts.length === 0) {
      return "目前沒有符合條件的商品可供改價";
    }

    if (filteredProducts.length > MAX_BATCH_PRODUCTS) {
      return `單次最多可更新 ${MAX_BATCH_PRODUCTS} 筆商品，請縮小篩選範圍`;
    }

    const adjustmentError = validatePriceAdjustment({ mode, value, isIncrease });
    if (adjustmentError) {
      return adjustmentError;
    }

    const invalidPreview = previewResults.find((item) => validateAdjustedPrice(item.newPrice));
    if (invalidPreview) {
      return `商品 ${invalidPreview.productCode}${validateAdjustedPrice(invalidPreview.newPrice)}`;
    }

    return null;
  }

  function handleNextFromConfirm() {
    const validationError = validateBeforeProceed();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage("");
    setStep("adjust");
  }

  function handleNextFromAdjust() {
    const validationError = validateBeforeProceed();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage("");
    setStep("preview");
  }

  async function handleExecute() {
    const validationError = validateBeforeProceed();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsExecuting(true);
    setErrorMessage("");
    try {
      const response = await fetch(
        "/api/sheets/purchase-products/batch-update",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productIds: filteredProducts.map((p) => p.id),
            selectedProducts: filteredProducts.map((p) => ({
              id: p.id,
              productCode: p.productCode,
              productName: p.productName,
              specification: p.specification,
              supplierId: p.supplierId,
              unitPrice: p.unitPrice,
              createdAt: p.createdAt,
              updatedAt: p.updatedAt,
            })),
            adjustment: {
              mode,
              value,
              isIncrease: mode !== "absolute" ? isIncrease : undefined,
            },
          }),
        }
      );

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "更新失敗");
      }

      setUpdatedCount(data.updatedCount);
      setStep("result");
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "批量更新失敗";
      setErrorMessage(msg);
      setIsExecuting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            批量改價
            {step === "confirm" && " - 選擇商品"}
            {step === "adjust" && " - 設定新價格"}
            {step === "preview" && " - 確認執行"}
            {step === "result" && " - 執行結果"}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Confirm selection */}
        {step === "confirm" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                當前篩選條件已選擇以下商品：
              </p>
              <div className="p-3 bg-[var(--bg-subtle)] rounded-md">
                <p className="text-sm font-semibold">
                  符合 {filteredProducts.length} 筆商品
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeFilters.length > 0 ? (
                    activeFilters.map((filter) => (
                      <span
                        key={filter}
                        className="rounded-full bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                      >
                        {filter}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">未套用篩選條件，將更新目前列表全部商品</span>
                  )}
                </div>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreviewList(!showPreviewList)}
                className="mb-2"
              >
                {showPreviewList ? (
                  <>
                    <ChevronUp className="mr-1 h-3 w-3" />
                    收起清單
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1 h-3 w-3" />
                    預覽清單
                  </>
                )}
              </Button>

              {showPreviewList && (
                <div className="border border-[var(--border)] rounded-md max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[var(--bg-subtle)]">
                      <tr>
                        <th className="px-2 py-1 text-left">商品編號</th>
                        <th className="px-2 py-1 text-left">商品名稱</th>
                        <th className="px-2 py-1 text-right">目前單價</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {filteredProducts.map((p) => (
                        <tr key={p.id}>
                          <td className="px-2 py-1">{p.productCode}</td>
                          <td className="px-2 py-1">{p.productName}</td>
                          <td className="px-2 py-1 text-right font-mono">
                            ${p.unitPrice}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                取消
              </Button>
              <Button onClick={handleNextFromConfirm}>
                下一步：設定價格
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Adjust settings */}
        {step === "adjust" && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-sm">調整方式：</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="mode-percentage"
                    value="percentage"
                    checked={mode === "percentage"}
                    onChange={(e) => setMode(e.target.value as AdjustmentMode)}
                    className="h-4 w-4"
                  />
                  <Label
                    htmlFor="mode-percentage"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    百分比調整
                    {mode === "percentage" && (
                      <div className="flex items-center gap-1">
                        <select
                          value={isIncrease ? "increase" : "decrease"}
                          onChange={(e) =>
                            setIsIncrease(e.target.value === "increase")
                          }
                          className="px-2 py-1 border border-[var(--border)] rounded text-xs"
                        >
                          <option value="increase">+</option>
                          <option value="decrease">-</option>
                        </select>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={value}
                          onChange={(e) =>
                            setValue(Number(e.target.value) || 0)
                          }
                          className="w-20 h-8 text-xs"
                        />
                        <span className="text-xs">%</span>
                      </div>
                    )}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="mode-fixed"
                    value="fixed"
                    checked={mode === "fixed"}
                    onChange={(e) => setMode(e.target.value as AdjustmentMode)}
                    className="h-4 w-4"
                  />
                  <Label
                    htmlFor="mode-fixed"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    固定金額調整
                    {mode === "fixed" && (
                      <div className="flex items-center gap-1">
                        <select
                          value={isIncrease ? "increase" : "decrease"}
                          onChange={(e) =>
                            setIsIncrease(e.target.value === "increase")
                          }
                          className="px-2 py-1 border border-[var(--border)] rounded text-xs"
                        >
                          <option value="increase">+</option>
                          <option value="decrease">-</option>
                        </select>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={value}
                          onChange={(e) =>
                            setValue(Number(e.target.value) || 0)
                          }
                          className="w-24 h-8 text-xs"
                        />
                        <span className="text-xs">元</span>
                      </div>
                    )}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="mode-absolute"
                    value="absolute"
                    checked={mode === "absolute"}
                    onChange={(e) => setMode(e.target.value as AdjustmentMode)}
                    className="h-4 w-4"
                  />
                  <Label
                    htmlFor="mode-absolute"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    設定統一單價
                    {mode === "absolute" && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={value}
                          onChange={(e) =>
                            setValue(Number(e.target.value) || 0)
                          }
                          className="w-24 h-8 text-xs"
                        />
                        <span className="text-xs">元/單位</span>
                      </div>
                    )}
                  </Label>
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm">預覽變更（前 10 筆）：</Label>
              <div className="border border-[var(--border)] rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-subtle)]">
                    <tr>
                      <th className="px-2 py-1 text-left">商品</th>
                      <th className="px-2 py-1 text-right">原價</th>
                      <th className="px-2 py-1 text-right">新價</th>
                      <th className="px-2 py-1 text-right">變動</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {previewResults.slice(0, 10).map((r, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1">{r.productCode}</td>
                        <td className="px-2 py-1 text-right font-mono">
                          ${r.oldPrice}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          ${r.newPrice}
                        </td>
                        <td
                          className={`px-2 py-1 text-right font-mono ${
                            r.diff > 0
                              ? "text-red-600"
                              : r.diff < 0
                                ? "text-green-600"
                                : ""
                          }`}
                        >
                          {r.diff > 0 ? "+" : ""}
                          {r.diffPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("confirm")}>
                上一步
              </Button>
              <Button onClick={handleNextFromAdjust}>確認執行</Button>
            </div>
          </div>
        )}

        {/* Step 3: Final confirmation */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm font-semibold text-amber-900 mb-2">
                ⚠️ 即將更新 {filteredProducts.length} 筆商品單價
              </p>
              <div className="text-xs text-amber-800 space-y-1">
                <p>調整方式：{adjustmentLabel}</p>
                <p>
                  平均變動：原價 {averageChange.oldAvg} 元 → 新價{" "}
                  {averageChange.newAvg} 元
                </p>
              </div>
            </div>

            <p className="text-sm text-[var(--text-secondary)]">
              此操作將立即生效且無法復原，請確認後執行。
            </p>

            {errorMessage ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                取消
              </Button>
              <Button
                onClick={handleExecute}
                disabled={isExecuting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isExecuting ? "執行中..." : "確認執行"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Result */}
        {step === "result" && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm font-semibold text-green-900 mb-2">
                ✅ 成功更新 {updatedCount} 筆商品
              </p>
              <div className="text-xs text-green-800 space-y-1">
                <p>執行時間：{new Date().toLocaleString("zh-TW")}</p>
                <p>調整方式：{adjustmentLabel}</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleClose}>完成</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
