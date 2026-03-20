"use client";

import { useCallback, useMemo, useState } from "react";

import { useMaterials } from "@/hooks/useMaterials";
import {
  CATEGORY_LABELS,
  EXTRA_DEFS,
  FOAM_CORE_CHANNEL_LABELS,
  FOAM_CORE_VOLUME_FACTORS,
  METHODS,
  STOCK_STATUS_LABELS,
} from "@/lib/constants";
import { calculateFabric } from "@/lib/fabric-calculator";
import type { CutPiece } from "@/lib/fabric-calculator";
import {
  calculateCaiCount,
  calculateLaborRate,
} from "@/lib/pricing-engine";
import type {
  Channel,
  ExtraItem,
  FlexQuoteItem,
  Method,
  SystemSettings,
} from "@/lib/types";
import { calculateQuotedUnitPrice, caiToYard, formatCurrency, roundPriceToTens, yardToCai } from "@/lib/utils";
import { Star } from "lucide-react";
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
  settings: SystemSettings;
}

const CHANNEL_OPTIONS = [
  { value: "wholesale", label: "批發" },
  { value: "designer", label: "設計師" },
  { value: "retail", label: "屋主" },
  { value: "luxury_retail", label: "豪華屋主" },
] as const;

export function CalculatorModal({
  open,
  onOpenChange,
  onInsertItem,
  channel: defaultChannel,
  settings,
}: CalculatorModalProps) {
  const { materials, favoriteIds, recentIds, toggleFavorite, addRecent } = useMaterials();

  const [channel, setChannel] = useState<Channel>(defaultChannel);
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

  const favoriteMaterials = useMemo(
    () => materials.filter((m) => favoriteIds.includes(m.id)),
    [materials, favoriteIds],
  );

  const recentMaterials = useMemo(
    () => recentIds
      .map((id) => materials.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => m != null && !favoriteIds.includes(m.id)),
    [materials, recentIds, favoriteIds],
  );

  const handleMaterialChange = useCallback((value: string) => {
    setSelectedMaterialId(value);
    addRecent(value);
  }, [addRecent]);

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

  const fabricResult = useMemo(
    () => isFoamCore ? null : calculateFabric(method, widthCm, heightCm, totalThickness, qty),
    [isFoamCore, method, widthCm, heightCm, totalThickness, qty],
  );

  const listPricePerYard = useMemo(() => {
    if (isFoamCore) return 0;
    if (selectedMaterial) {
      return caiToYard(selectedMaterial.listPricePerCai, selectedMaterial.widthCm);
    }
    return customMaterialCostYard;
  }, [isFoamCore, selectedMaterial, customMaterialCostYard]);

  const pricePerYard = Math.round(listPricePerYard * settings.fabricDiscount);

  const fabricCostPerPiece = useMemo(() => {
    if (!fabricResult || fabricResult.roundedYards === 0 || pricePerYard === 0) return 0;
    return Math.round((fabricResult.roundedYards * pricePerYard) / qty);
  }, [fabricResult, pricePerYard, qty]);

  const costPricePerYard = useMemo(() => {
    if (isFoamCore || !selectedMaterial) return 0;
    return caiToYard(selectedMaterial.costPerCai, selectedMaterial.widthCm);
  }, [isFoamCore, selectedMaterial]);

  const materialRate = useMemo(() => {
    if (isFoamCore || caiCount === 0) return 0;
    return Math.round(fabricCostPerPiece / caiCount);
  }, [isFoamCore, fabricCostPerPiece, caiCount]);

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

  const pieceCost = isFoamCore
    ? foamCorePrice + extrasPerCai * caiCount + extrasFixed
    : laborRate * caiCount + fabricCostPerPiece + extrasPerCai * caiCount + extrasFixed;
  const multiplier = isFoamCore ? 1 : settings.channelMultipliers[channel];
  const baseUnitPrice = roundPriceToTens(pieceCost * multiplier);
  const unitPrice =
    settings.commissionMode === "fixed"
      ? baseUnitPrice
      : calculateQuotedUnitPrice(pieceCost, multiplier, settings.commissionMode, settings.commissionRate);

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
        ? `${selectedMaterial.brand} ${selectedMaterial.series}${selectedMaterial.colorCode ? ` ${selectedMaterial.colorCode}` : ""}`
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
      autoPriced: true,
      costPerUnit: pieceCost,
      laborRate,
      materialRate,
      method,
      materialId: selectedMaterialId === "custom" ? "" : selectedMaterialId,
    };

    onInsertItem(item);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>繃布計算器</DialogTitle>
              <DialogDescription>
                選擇作法、尺寸、材質，計算後插入品項
              </DialogDescription>
            </div>
            <div className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-0.5">
              {CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChannel(opt.value)}
                  className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    channel === opt.value
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
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
              onValueChange={handleMaterialChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="選擇材質或自訂" />
              </SelectTrigger>
              <SelectContent>
                {favoriteMaterials.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">★ 常用材質</div>
                    {favoriteMaterials.map((mat) => (
                      <SelectItem key={`fav-${mat.id}`} value={mat.id}>
                        ★ {mat.brand} {mat.series}{mat.colorCode ? ` / ${mat.colorCode} ${mat.colorName}` : ""}
                      </SelectItem>
                    ))}
                    <div className="my-1 border-t border-[var(--border)]" />
                  </>
                )}
                {recentMaterials.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">最近使用</div>
                    {recentMaterials.map((mat) => (
                      <SelectItem key={`recent-${mat.id}`} value={mat.id}>
                    {mat.brand} {mat.series}{mat.colorCode ? ` / ${mat.colorCode} ${mat.colorName}` : ""}
                  </SelectItem>
                    ))}
                    <div className="my-1 border-t border-[var(--border)]" />
                  </>
                )}
                <SelectItem value="custom">自訂面料（手動輸入成本）</SelectItem>
                <div className="my-1 border-t border-[var(--border)]" />
                <div className="px-2 py-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">全部材質</div>
                {materials.map((mat) => (
                  <SelectItem key={mat.id} value={mat.id}>
                    {mat.brand} {mat.series}{mat.colorCode ? ` / ${mat.colorCode} ${mat.colorName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedMaterial ? (
              <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {selectedMaterial.brand} {selectedMaterial.series} /{" "}
                    {selectedMaterial.colorCode || selectedMaterial.series}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(selectedMaterial.id)}
                    className="rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
                    title={favoriteIds.includes(selectedMaterial.id) ? "取消常用" : "加入常用"}
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${favoriteIds.includes(selectedMaterial.id) ? "fill-[var(--warning)] text-[var(--warning)]" : "text-[var(--text-tertiary)]"}`}
                    />
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[var(--text-secondary)]">
                  <span>{CATEGORY_LABELS[selectedMaterial.category]}</span>
                  <span>{STOCK_STATUS_LABELS[selectedMaterial.stockStatus]}</span>
                  <span>牌價 {formatCurrency(caiToYard(selectedMaterial.listPricePerCai, selectedMaterial.widthCm))}/碼</span>
                  <span>報價 {formatCurrency(pricePerYard)}/碼（{settings.fabricDiscount * 10}折）</span>
                </div>
                <div className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">
                  進價 {formatCurrency(costPricePerYard)}/碼 · 毛利 {costPricePerYard > 0 ? Math.round(((pricePerYard - costPricePerYard) / pricePerYard) * 100) : 0}%
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <Label>面料牌價（元/碼）</Label>
                <Input
                  type="number"
                  value={customMaterialCostYard}
                  onChange={(e) =>
                    setCustomMaterialCostYard(Number(e.target.value))
                  }
                  placeholder="牌價/碼"
                  className="max-w-[200px]"
                />
                {customMaterialCostYard > 0 && (
                  <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                    報價 {formatCurrency(pricePerYard)}/碼（牌價 {settings.fabricDiscount * 10}折）
                  </div>
                )}
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

          {fabricResult && fabricResult.cutPieces.length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="mb-2 text-xs font-medium text-[var(--text-secondary)]">裁切清單</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-tertiary)]">
                    <th className="py-1 text-left font-normal">裁片</th>
                    <th className="py-1 text-right font-normal">尺寸 (cm)</th>
                    <th className="py-1 text-right font-normal">數量</th>
                    <th className="py-1 text-right font-normal">材質</th>
                  </tr>
                </thead>
                <tbody>
                  {fabricResult.cutPieces.map((piece: CutPiece, i: number) => (
                    <tr key={i} className={piece.material === "secondary" ? "text-[var(--text-tertiary)]" : ""}>
                      <td className="py-1">{piece.name}</td>
                      <td className="py-1 text-right">{Math.round(piece.widthCm)} × {Math.round(piece.lengthCm)}</td>
                      <td className="py-1 text-right">{piece.qty}</td>
                      <td className="py-1 text-right">{piece.material === "primary" ? "主布" : "副資材"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2 text-xs">
                <span className="text-[var(--text-secondary)]">
                  布幅寬 137cm · 排版預估
                </span>
                <div className="flex gap-3 font-medium">
                  <span>{fabricResult.exactYards} 碼</span>
                  <span className="text-[var(--accent)]">→ 計價 {fabricResult.roundedYards} 碼</span>
                </div>
              </div>
              {pricePerYard > 0 && (
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-[var(--text-tertiary)]">
                    {formatCurrency(pricePerYard)}/碼（{settings.fabricDiscount * 10}折）× {fabricResult.roundedYards} 碼 ÷ {qty} 件
                  </span>
                  <span className="font-medium">{formatCurrency(fabricCostPerPiece)}/件</span>
                </div>
              )}
            </div>
          )}

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
                {settings.commissionMode === "fixed" && (
                  <div className="mt-2 text-center text-[11px] text-[var(--text-tertiary)]">
                    固定佣金會在加入報價後，依全單品項自動分攤。
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-3 text-center text-xs">
                  <div>
                    <div className="text-[var(--text-tertiary)]">才數</div>
                    <div className="mt-1 text-lg font-semibold">{caiCount}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-tertiary)]">用布</div>
                    <div className="mt-1 text-lg font-semibold">{fabricResult?.roundedYards ?? 0} 碼</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-tertiary)]">成本/件</div>
                    <div className="mt-1 text-lg font-semibold">
                      {formatCurrency(pieceCost)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-tertiary)]">
                      報價/件
                    </div>
                    <div className="mt-1 text-lg font-bold text-[var(--accent)]">
                      {formatCurrency(unitPrice)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-center gap-6 text-[11px] text-[var(--text-tertiary)]">
                  <span>工資/才 {formatCurrency(laborRate)}</span>
                  <span>布料/件 {formatCurrency(fabricCostPerPiece)}</span>
                  <span>倍率 ×{multiplier}</span>
                </div>
                {settings.commissionMode === "fixed" && (
                  <div className="mt-2 text-center text-[11px] text-[var(--text-tertiary)]">
                    固定佣金會在加入報價後，依全單品項自動分攤。
                  </div>
                )}
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
