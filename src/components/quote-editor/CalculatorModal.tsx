"use client";

import { useMemo, useState } from "react";

import { useMaterials } from "@/hooks/useMaterials";
import { useSettings } from "@/hooks/useSettings";
import {
  CATEGORY_LABELS,
  EXTRA_DEFS,
  FOAM_CORE_CHANNEL_LABELS,
  FOAM_CORE_VOLUME_FACTORS,
  METHODS,
  STOCK_STATUS_LABELS,
} from "@/lib/constants";
import {
  calculateCaiCount,
  calculateLaborRate,
} from "@/lib/pricing-engine";
import type {
  Channel,
  ExtraItem,
  FlexQuoteItem,
  Method,
} from "@/lib/types";
import { caiToYard, formatCurrency, yardToCai } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

interface CalculatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsertItem: (item: Omit<FlexQuoteItem, "id">) => void;
  channel: Channel;
}

export function CalculatorModal({
  open,
  onOpenChange,
  onInsertItem,
  channel,
}: CalculatorModalProps) {
  const { settings } = useSettings();
  const { materials } = useMaterials();

  const [method, setMethod] = useState<Method>("single_headboard");
  const [widthCm, setWidthCm] = useState(180);
  const [heightCm, setHeightCm] = useState(120);
  const [qty, setQty] = useState(1);
  const [thickness, setThickness] = useState<number>(1);
  const [extraThickness, setExtraThickness] = useState(0);
  const [selectedMaterialId, setSelectedMaterialId] = useState("custom");
  const [customMaterialCostYard, setCustomMaterialCostYard] = useState(0);
  const [useListPrice, setUseListPrice] = useState(false);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const [powerHoleCount, setPowerHoleCount] = useState(1);

  const methodConfig = METHODS[method];

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === selectedMaterialId) ?? null,
    [materials, selectedMaterialId],
  );

  const caiCount = useMemo(
    () => calculateCaiCount(widthCm, heightCm, methodConfig.minCai),
    [widthCm, heightCm, methodConfig.minCai],
  );

  const isFoamCore = method === "foam_core";
  const isDaybed = method === "single_daybed" || method === "double_daybed";
  const hasExtraThickness = isDaybed || isFoamCore;
  const totalThickness = thickness + extraThickness;

  const foamCoreDims = useMemo(() => {
    if (!isFoamCore) return { w: 0, l: 0, h: 0, volume: 0 };
    const w = widthCm / 2.54 + 0.5;
    const l = heightCm / 2.54 + 0.5;
    const h = totalThickness + 0.5;
    return { w, l, h, volume: w * l * h };
  }, [isFoamCore, widthCm, heightCm, totalThickness]);

  const foamCoreFactor = isFoamCore ? FOAM_CORE_VOLUME_FACTORS[channel] : 0;
  const foamCorePrice = isFoamCore ? Math.round(foamCoreDims.volume * foamCoreFactor) : 0;

  const laborRate = useMemo(
    () =>
      isFoamCore
        ? 0
        : calculateLaborRate(
            methodConfig,
            methodConfig.baseThickness !== null ? totalThickness : null,
            settings.qualityPremium,
          ),
    [isFoamCore, methodConfig, totalThickness, settings.qualityPremium],
  );

  const materialRateRaw = useMemo(() => {
    if (isFoamCore) return 0;
    if (selectedMaterial) {
      return useListPrice
        ? selectedMaterial.listPricePerCai
        : selectedMaterial.costPerCai;
    }
    return yardToCai(customMaterialCostYard, 135);
  }, [isFoamCore, selectedMaterial, useListPrice, customMaterialCostYard]);

  const materialRate = Math.round(
    materialRateRaw * (1 + settings.wasteRate / 100),
  );

  const extrasPerCai = useMemo(() => {
    let total = 0;
    for (const extra of extras) {
      const def = EXTRA_DEFS[extra];
      if (!def.perUnit) total += def.unitCost;
    }
    return total;
  }, [extras]);

  const extrasFixed = useMemo(() => {
    let total = 0;
    for (const extra of extras) {
      const def = EXTRA_DEFS[extra];
      if (def.perUnit) total += def.unitCost * powerHoleCount;
    }
    return total;
  }, [extras, powerHoleCount]);

  const costPerCai = laborRate + materialRate + extrasPerCai;
  const pieceCost = isFoamCore
    ? foamCorePrice + extrasPerCai * caiCount + extrasFixed
    : costPerCai * caiCount + extrasFixed;
  const multiplier = isFoamCore ? 1 : settings.channelMultipliers[channel];
  const unitPrice = Math.round((pieceCost * multiplier) / 10) * 10;

  function toggleExtra(extra: ExtraItem, checked: boolean) {
    setExtras((prev) =>
      checked ? [...prev, extra] : prev.filter((e) => e !== extra),
    );
  }

  function handleMethodChange(next: Method) {
    setMethod(next);
    setExtraThickness(0);
    const config = METHODS[next];
    if (config.baseThickness !== null) {
      setThickness(config.baseThickness);
    }
  }

  function handleInsert() {
    let name: string;
    let spec: string;

    if (isFoamCore) {
      const thickLabel = `${totalThickness}"${extraThickness > 0 ? `(含加厚+${extraThickness}")` : ""}`;
      name = [
        "泡棉內裡",
        `W${widthCm} × H${heightCm}cm × ${thickLabel}`,
      ].join("\n");
      spec = `泡棉內裡 / ${FOAM_CORE_CHANNEL_LABELS[channel]} / ${foamCoreDims.volume.toFixed(1)}立方英吋`;
    } else {
      const foamLabel = isDaybed
        ? `(貼合${totalThickness}"高密度泡棉${extraThickness > 0 ? `，含額外加厚+${extraThickness}"` : ""})`
        : methodConfig.baseThickness !== null && thickness
          ? `(貼合${thickness}"${methodConfig.baseThickness === 2 ? "高" : "中"}密度泡棉)`
          : "";

      const materialDesc = selectedMaterial
        ? `${selectedMaterial.brand} ${selectedMaterial.series} ${selectedMaterial.colorCode}`
        : "自訂面料";

      name = [
        methodConfig.label,
        `W${widthCm} × H${heightCm}cm`,
        foamLabel,
      ]
        .filter(Boolean)
        .join("\n");
      spec = `${methodConfig.label} / ${materialDesc}`;
    }

    const item: Omit<FlexQuoteItem, "id"> = {
      name,
      spec,
      qty,
      unit: "只",
      unitPrice,
      amount: unitPrice * qty,
      isCostItem: false,
      notes: "",
    };

    onInsertItem(item);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>繃布計算器</DialogTitle>
          <DialogDescription>
            選擇作法、尺寸、材質，計算後插入品項
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>作法</Label>
              <Select
                value={method}
                onValueChange={(v) => handleMethodChange(v as Method)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(METHODS).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                {methodConfig.desc}
              </p>
            </div>
            {methodConfig.thicknessOptions.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <Label>{isFoamCore ? "泡棉厚度" : "泡棉規格 (基礎厚度)"}</Label>
                  {hasExtraThickness && (
                    <span className="rounded-full border border-[var(--warning)] bg-[var(--warning-light)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--warning)]">
                      {isFoamCore ? "厚度" : "成品總厚"}: {totalThickness}&quot; ≈ {(totalThickness * 2.54).toFixed(1)} cm
                    </span>
                  )}
                </div>
                <Select
                  value={String(thickness)}
                  onValueChange={(v) => setThickness(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {methodConfig.thicknessOptions.map((t) => (
                      <SelectItem key={t} value={String(t)}>
                        {t}英吋 (約{(t * 2.54).toFixed(1)}cm) {isFoamCore || t >= 2 ? "高" : "中"}密度{!isFoamCore ? ` ($${methodConfig.baseRate + ((t - (methodConfig.baseThickness ?? 0)) / 0.5) * methodConfig.incrementPerHalfInch}/才)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {hasExtraThickness && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">額外加厚 (每單位 0.5 英吋)</span>
                {!isFoamCore && (
                  <span className="text-xs font-medium text-[var(--accent)]">+${methodConfig.incrementPerHalfInch}/才</span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-center gap-6">
                <button
                  type="button"
                  onClick={() => setExtraThickness((prev) => Math.max(0, prev - 0.5))}
                  className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-lg font-bold transition-colors hover:bg-[var(--bg-hover)]"
                >
                  −
                </button>
                <div className="text-center">
                  <div className="text-2xl font-bold">+{extraThickness}&quot;</div>
                  <div className="text-[11px] text-[var(--text-tertiary)]">(+{(extraThickness * 2.54).toFixed(1)} cm)</div>
                </div>
                <button
                  type="button"
                  onClick={() => setExtraThickness((prev) => prev + 0.5)}
                  className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-lg font-bold transition-colors hover:bg-[var(--bg-hover)]"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>寬度 (cm)</Label>
              <Input
                type="number"
                value={widthCm}
                onChange={(e) => setWidthCm(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>高度 (cm)</Label>
              <Input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>數量</Label>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              />
            </div>
          </div>

          {isFoamCore && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[var(--text-tertiary)]">寬 (含耗損)</div>
                  <div className="mt-0.5 font-medium">{foamCoreDims.w.toFixed(2)}&quot;</div>
                </div>
                <div>
                  <div className="text-[var(--text-tertiary)]">長 (含耗損)</div>
                  <div className="mt-0.5 font-medium">{foamCoreDims.l.toFixed(2)}&quot;</div>
                </div>
                <div>
                  <div className="text-[var(--text-tertiary)]">厚 (含耗損)</div>
                  <div className="mt-0.5 font-medium">{foamCoreDims.h.toFixed(2)}&quot;</div>
                </div>
                <div>
                  <div className="text-[var(--text-tertiary)]">總體積</div>
                  <div className="mt-0.5 font-medium">{foamCoreDims.volume.toFixed(1)} 立方英吋</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs">
                <span className="text-[var(--text-secondary)]">
                  對象係數 ({FOAM_CORE_CHANNEL_LABELS[channel]})
                </span>
                <span className="font-semibold text-[var(--accent)]">×{foamCoreFactor}</span>
              </div>
            </div>
          )}

          {!isFoamCore && <div>
            <Label>選擇材質</Label>
            <Select
              value={selectedMaterialId}
              onValueChange={setSelectedMaterialId}
            >
              <SelectTrigger>
                <SelectValue placeholder="選擇材質或自訂" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">自訂面料（手動輸入成本）</SelectItem>
                {materials.map((mat) => (
                  <SelectItem key={mat.id} value={mat.id}>
                    {mat.brand} {mat.series} / {mat.colorCode} {mat.colorName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedMaterial ? (
              <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs">
                <div className="font-medium">
                  {selectedMaterial.brand} {selectedMaterial.series} /{" "}
                  {selectedMaterial.colorCode}
                </div>
                <div className="mt-1 flex gap-3 text-[var(--text-secondary)]">
                  <span>
                    {
                      CATEGORY_LABELS[
                        selectedMaterial.category
                      ]
                    }
                  </span>
                  <span>
                    {
                      STOCK_STATUS_LABELS[
                        selectedMaterial.stockStatus
                      ]
                    }
                  </span>
                  <span>
                    進價{" "}
                    {formatCurrency(
                      caiToYard(
                        selectedMaterial.costPerCai,
                        selectedMaterial.widthCm,
                      ),
                    )}
                    /碼
                  </span>
                </div>
                <label className="mt-2 flex items-center gap-2 text-[var(--text-secondary)]">
                  <Checkbox
                    checked={useListPrice}
                    onCheckedChange={(v) => setUseListPrice(v === true)}
                  />
                  以牌價計算
                </label>
              </div>
            ) : (
              <div className="mt-2">
                <Label>面料成本（元/碼）</Label>
                <Input
                  type="number"
                  value={customMaterialCostYard}
                  onChange={(e) =>
                    setCustomMaterialCostYard(Number(e.target.value))
                  }
                  placeholder="供應商報價/碼"
                  className="max-w-[200px]"
                />
              </div>
            )}
          </div>}

          <div>
            <Label>其他加工</Label>
            <div className="mt-1 space-y-1.5">
              {(
                Object.entries(EXTRA_DEFS) as Array<
                  [ExtraItem, (typeof EXTRA_DEFS)[ExtraItem]]
                >
              ).map(([key, def]) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs"
                >
                  <span>{def.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[var(--text-tertiary)]">
                      {formatCurrency(def.unitCost)}/{def.unit}
                    </span>
                    <Checkbox
                      checked={extras.includes(key)}
                      onCheckedChange={(v) =>
                        toggleExtra(key, v === true)
                      }
                    />
                  </div>
                </label>
              ))}
              {extras.includes("power_hole") && (
                <div className="pl-3">
                  <Label>電源孔數量</Label>
                  <Input
                    type="number"
                    min={1}
                    value={powerHoleCount}
                    onChange={(e) =>
                      setPowerHoleCount(Math.max(1, Number(e.target.value)))
                    }
                    className="max-w-[100px]"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
            {isFoamCore ? (
              <>
                <div className="grid grid-cols-2 gap-4 text-center text-xs">
                  <div>
                    <div className="text-[var(--text-tertiary)]">泡棉費用</div>
                    <div className="mt-1 text-lg font-semibold">{formatCurrency(foamCorePrice)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-tertiary)]">
                      報價/片 ({FOAM_CORE_CHANNEL_LABELS[channel]})
                    </div>
                    <div className="mt-1 text-lg font-bold text-[var(--accent)]">
                      {formatCurrency(unitPrice)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-center gap-6 text-[11px] text-[var(--text-tertiary)]">
                  <span>體積 {foamCoreDims.volume.toFixed(1)} in³</span>
                  <span>係數 ×{foamCoreFactor}</span>
                  {extrasPerCai > 0 && <span>加工/才 {formatCurrency(extrasPerCai)}</span>}
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4 text-center text-xs">
                  <div>
                    <div className="text-[var(--text-tertiary)]">才數</div>
                    <div className="mt-1 text-lg font-semibold">{caiCount}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-tertiary)]">成本/片</div>
                    <div className="mt-1 text-lg font-semibold">
                      {formatCurrency(pieceCost)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-tertiary)]">
                      報價/片 ({channel === "wholesale" ? "批發" : channel === "designer" ? "設計師" : channel === "luxury_retail" ? "豪華屋主" : "屋主"})
                    </div>
                    <div className="mt-1 text-lg font-bold text-[var(--accent)]">
                      {formatCurrency(unitPrice)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-center gap-6 text-[11px] text-[var(--text-tertiary)]">
                  <span>工資/才 {formatCurrency(laborRate)}</span>
                  <span>面料/才 {formatCurrency(materialRate)}</span>
                  <span>倍率 ×{multiplier}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={handleInsert}>
            插入品項
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
