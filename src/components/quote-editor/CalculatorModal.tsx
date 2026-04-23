"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { usePurchaseProducts } from "@/hooks/usePurchaseProducts";
import {
  CATEGORY_LABELS,
  EXTRA_DEFS,
  FOAM_CORE_CHANNEL_LABELS,
  FOAM_CORE_VOLUME_FACTORS,
  INSTALL_HEIGHT_OPTIONS,
  INSTALL_HEIGHT_TIERS,
  METHODS,
  PANEL_SIZE_TIERS,
  STOCK_STATUS_LABELS,
} from "@/lib/constants";
import { calculateFabric, calculateFabricForPanels } from "@/lib/fabric-calculator";
import type { CutPiece } from "@/lib/fabric-calculator";
import {
  applyInstallSurcharge,
  calculateCaiCount,
  calculateInstallSurcharge,
  calculateLaborRate,
  calculateSurfaceSplitPieces,
  calculateCaiCountDual,
  calculateCaiCountDualForPieces,
  inferHeightTier,
  inferPanelSizeTier,
} from "@/lib/pricing-engine";
import type {
  Channel,
  ExtraItem,
  FlexQuoteItem,
  InstallHeightTier,
  Method,
  SystemSettings,
  PanelInputMode,
  CaiRoundingMode,
  SplitDirection,
} from "@/lib/types";
import { calculateQuotedUnitPrice, caiToYard, formatCurrency, roundPriceToTens } from "@/lib/utils";

// Mapping functions for PurchaseProduct to Material compatibility
const mapPurchaseCategoryToMaterialCategory = (category: PurchaseProductCategory): Category => {
  // Simple mapping - adjust based on actual needs
  switch (category) {
    case "面料":
      return "fabric";
    case "皮革":
      // Could be pu_leather, pvc_leather, or genuine_leather - default to pu_leather
      return "pu_leather";
    case "泡棉":
      // Not really a fabric material, but we'll map it to fabric for now
      return "fabric";
    case "木料":
      return "fabric"; // Not ideal but avoids errors
    case "五金":
      return "fabric"; // Not ideal but avoids errors
    case "其他":
      return "fabric"; // Default
    default:
      return "fabric";
  }
};

const mapPurchaseUnitToStockStatus = (unit: PurchaseUnit): StockStatus => {
  // Simple mapping - most purchasable items are considered in stock
  // This could be enhanced based on actual inventory data
  return "in_stock";
};
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
import { Textarea } from "@/components/ui/textarea";

function parseCustomSplitSizes(value: string): number[] {
  return value
    .split(/[\n,，、\s]+/)
    .map((segment) => Number(segment.trim()))
    .filter((segment) => Number.isFinite(segment) && segment > 0);
}

function formatSplitSize(size: number): string {
  return Number.isInteger(size) ? `${size}` : size.toFixed(1);
}

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
  const { products: purchaseProducts, favoriteIds, recentIds, toggleFavorite, addRecent } = usePurchaseProducts();

  // Convert PurchaseProduct to Material-compatible object
  const materials = useMemo(() => {
    return purchaseProducts.map(p => ({
      id: p.id,
      brand: p.brand ?? '',
      series: p.series ?? '',
      colorCode: p.colorCode ?? '',
      colorName: p.colorName ?? '',
      category: mapPurchaseCategoryToMaterialCategory(p.category),
      costPerCai: p.costPerCai ?? p.unitPrice ?? 0,
      listPricePerCai: p.listPricePerCai ?? p.unitPrice ?? 0,
      supplier: p.supplierName ?? '',
      widthCm: p.widthCm ?? 137, // Default width if not specified
      minOrder: '',
      leadTimeDays: 0,
      stockStatus: mapPurchaseUnitToStockStatus(p.unit),
      features: [],
      notes: p.notes ?? '',
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }, [purchaseProducts]);

  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [method, setMethod] = useState<Method>("single_headboard");
  const [widthCm, setWidthCm] = useState(180);
  const [heightCm, setHeightCm] = useState(120);
  const [qty, setQty] = useState(1);
  const [thickness, setThickness] = useState<number>(1);
  const [extraThickness, setExtraThickness] = useState(0);
  const [selectedMaterialId, setSelectedMaterialId] = useState("custom");
  const [customMaterialCostYard, setCustomMaterialCostYard] = useState(0);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const [powerHoleCount, setPowerHoleCount] = useState(1);
  const [installHeightTier, setInstallHeightTier] = useState<InstallHeightTier>("normal");

  // v0.3.2: 多片組合輸入模式
  const [panelInputMode, setPanelInputMode] = useState<PanelInputMode>("per_piece");
  const [surfaceWidthCm, setSurfaceWidthCm] = useState(360);
  const [surfaceHeightCm, setSurfaceHeightCm] = useState(240);
  const [splitDirection, setSplitDirection] = useState<SplitDirection>("horizontal");
  const [splitCount, setSplitCount] = useState(3);
  const [caiRoundingMode, setCaiRoundingMode] = useState<CaiRoundingMode>("per_piece_ceil");
  const [customSplitInput, setCustomSplitInput] = useState("");

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

  // 整面分片：計算單片尺寸
  const customSplitSizes = useMemo(() => parseCustomSplitSizes(customSplitInput), [customSplitInput]);
  const hasCustomSplitSizes = customSplitSizes.length > 0;
  const splitTargetCm = splitDirection === "horizontal" ? surfaceHeightCm : surfaceWidthCm;
  const customSplitTotalCm = useMemo(
    () => customSplitSizes.reduce((sum, size) => sum + size, 0),
    [customSplitSizes],
  );
  const isCustomSplitValid = !hasCustomSplitSizes || Math.abs(customSplitTotalCm - splitTargetCm) < 0.5;

  const derivedPanels = useMemo(() => {
    if (panelInputMode !== "divide_surface") return [];
    if (hasCustomSplitSizes && !isCustomSplitValid) return [];
    return calculateSurfaceSplitPieces(surfaceWidthCm, surfaceHeightCm, splitDirection, splitCount, customSplitSizes);
  }, [
    panelInputMode,
    surfaceWidthCm,
    surfaceHeightCm,
    splitDirection,
    splitCount,
    customSplitSizes,
    hasCustomSplitSizes,
    isCustomSplitValid,
  ]);
  const derivedPanel = derivedPanels[0] ?? null;
  const effectiveSplitCount = panelInputMode === "divide_surface"
    ? (hasCustomSplitSizes ? customSplitSizes.length : splitCount)
    : qty;
  const maxPanelWidthCm = derivedPanels.reduce((max, panel) => Math.max(max, panel.panelWidthCm), 0);
  const maxPanelHeightCm = derivedPanels.reduce((max, panel) => Math.max(max, panel.panelHeightCm), 0);

  // 有效尺寸與數量（根據模式動態切換）
  const effectiveWidthCm = panelInputMode === "divide_surface" ? maxPanelWidthCm || widthCm : widthCm;
  const effectiveHeightCm = panelInputMode === "divide_surface" ? maxPanelHeightCm || heightCm : heightCm;
  const effectiveQty = panelInputMode === "divide_surface" ? effectiveSplitCount : qty;
  const isFoamCore = method === "foam_core";
  const isDaybed = method === "single_daybed" || method === "double_daybed";
  const usesConstructionConditions =
    method === "flat" || method === "single_headboard" || method === "removable_headboard";
  const hasExtraThickness = isDaybed || isFoamCore;
  const totalThickness = thickness + extraThickness;

  // v0.3.2+: 整面÷分片模式下，根據整面高度自動判定安裝高度等級
  useEffect(() => {
    if (usesConstructionConditions && panelInputMode === "divide_surface" && surfaceHeightCm > 0) {
      const autoTier = inferHeightTier(surfaceHeightCm);
      setInstallHeightTier(autoTier);
    }
  }, [panelInputMode, surfaceHeightCm, usesConstructionConditions]);

  // 雙模式才數對比（僅 divide_surface 模式）
  const dualCai = useMemo(() => {
    if (panelInputMode !== "divide_surface") return null;
    if (hasCustomSplitSizes) {
      const result = calculateCaiCountDualForPieces(derivedPanels, methodConfig.minCai);
      return {
        ...result,
        detailMode: "custom" as const,
      };
    }
    const result = calculateCaiCountDual(effectiveWidthCm, effectiveHeightCm, splitCount, methodConfig.minCai);
    return {
      ...result,
      rawTotal: result.perPieceRaw * splitCount,
      rawPerPanels: Array.from({ length: splitCount }, () => result.perPieceRaw),
      detailMode: "equal" as const,
    };
  }, [panelInputMode, hasCustomSplitSizes, derivedPanels, methodConfig.minCai, effectiveWidthCm, effectiveHeightCm, splitCount]);

  const caiCount = useMemo(() => {
    // divide_surface 模式：使用選定的進位模式結果
    if (panelInputMode === "divide_surface" && dualCai) {
      return caiRoundingMode === "surface_ceil"
        ? dualCai.surfaceCeilTotal
        : dualCai.perPieceCeilTotal;
    }
    // per_piece 模式：使用原有計算
    return calculateCaiCount(effectiveWidthCm, effectiveHeightCm, methodConfig.minCai);
  }, [panelInputMode, dualCai, caiRoundingMode, effectiveWidthCm, effectiveHeightCm, methodConfig.minCai]);

  const foamCoreDims = useMemo(() => {
    if (!isFoamCore) return { w: 0, l: 0, h: 0, volume: 0 };
    const w = effectiveWidthCm / 2.54 + 0.5;
    const l = effectiveHeightCm / 2.54 + 0.5;
    const h = totalThickness + 0.5;
    return { w, l, h, volume: w * l * h };
  }, [isFoamCore, effectiveWidthCm, effectiveHeightCm, totalThickness]);

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

  const panelSizeTier = useMemo(
    () => inferPanelSizeTier(effectiveWidthCm, effectiveHeightCm),
    [effectiveWidthCm, effectiveHeightCm],
  );

  const surchargePercent = useMemo(
    () => (usesConstructionConditions ? calculateInstallSurcharge(installHeightTier, panelSizeTier) : 0),
    [installHeightTier, panelSizeTier, usesConstructionConditions],
  );

  const adjustedLaborRate = useMemo(
    () => (usesConstructionConditions ? applyInstallSurcharge(laborRate, surchargePercent) : laborRate),
    [laborRate, surchargePercent, usesConstructionConditions],
  );

  const fabricWidthCm = selectedMaterial?.widthCm && selectedMaterial.widthCm > 0 ? selectedMaterial.widthCm : 137;

  const fabricResult = useMemo(
    () => {
      if (isFoamCore) return null;
      if (panelInputMode === "divide_surface") {
        if (derivedPanels.length === 0) return null;
        return hasCustomSplitSizes
          ? calculateFabricForPanels(
              method,
              derivedPanels.map((panel) => ({ widthCm: panel.panelWidthCm, lengthCm: panel.panelHeightCm })),
              totalThickness,
              fabricWidthCm,
            )
          : calculateFabric(method, effectiveWidthCm, effectiveHeightCm, totalThickness, effectiveQty, fabricWidthCm);
      }

      return calculateFabric(method, effectiveWidthCm, effectiveHeightCm, totalThickness, effectiveQty, fabricWidthCm);
    },
    [
      isFoamCore,
      panelInputMode,
      derivedPanels,
      hasCustomSplitSizes,
      method,
      effectiveWidthCm,
      effectiveHeightCm,
      totalThickness,
      effectiveQty,
      fabricWidthCm,
    ],
  );

  const listPricePerYard = useMemo(() => {
    if (isFoamCore) return 0;
    if (selectedMaterial) {
      return caiToYard(selectedMaterial.listPricePerCai, selectedMaterial.widthCm);
    }
    return customMaterialCostYard;
  }, [isFoamCore, selectedMaterial, customMaterialCostYard]);

  const pricePerYard = Math.round(listPricePerYard * settings.fabricDiscount);
  const pricingRoundedYards = fabricResult?.pricingRoundedYards ?? 0;
  const pricingExactYards = fabricResult?.pricingExactYards ?? 0;
  const usesReserveFabricPricing = fabricResult?.pricingMode === "reserve";

  const fabricCostPerPiece = useMemo(() => {
    if (!fabricResult || pricingRoundedYards === 0 || pricePerYard === 0) return 0;
    return Math.round((pricingRoundedYards * pricePerYard) / effectiveQty);
  }, [effectiveQty, fabricResult, pricePerYard, pricingRoundedYards]);

  const costPricePerYard = useMemo(() => {
    if (isFoamCore || !selectedMaterial) return 0;
    return caiToYard(selectedMaterial.costPerCai, selectedMaterial.widthCm);
  }, [isFoamCore, selectedMaterial]);

  const materialRate = useMemo(() => {
    const caiCountPerUnit = panelInputMode === "divide_surface" && effectiveQty > 0
      ? caiCount / effectiveQty
      : caiCount;

    if (isFoamCore || caiCountPerUnit === 0) return 0;
    return Math.round(fabricCostPerPiece / caiCountPerUnit);
  }, [isFoamCore, fabricCostPerPiece, caiCount, panelInputMode, effectiveQty]);

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

  const effectiveCaiPerUnit = panelInputMode === "divide_surface" && effectiveQty > 0
    ? caiCount / effectiveQty
    : caiCount;
  const pieceCost = isFoamCore
    ? foamCorePrice + extrasPerCai * effectiveCaiPerUnit + extrasFixed
    : adjustedLaborRate * effectiveCaiPerUnit + fabricCostPerPiece + extrasPerCai * effectiveCaiPerUnit + extrasFixed;
  const multiplier = isFoamCore ? 1 : settings.channelMultipliers[channel];
  const baseUnitPrice = roundPriceToTens(pieceCost * multiplier);
  const unitPrice =
    settings.commissionMode === "fixed"
      ? baseUnitPrice
      : calculateQuotedUnitPrice(pieceCost, multiplier, settings.commissionMode, settings.commissionRate);
  const totalPrice = unitPrice * effectiveQty;

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

      if (usesConstructionConditions && surchargePercent > 0) {
        const heightLabel = INSTALL_HEIGHT_TIERS[installHeightTier].label;
        const sizeLabel = PANEL_SIZE_TIERS[panelSizeTier].label;
        spec += ` / 施工加給+${surchargePercent}% (${heightLabel}/${sizeLabel})`;
      }
    }

    // v0.3.2: 整面÷分片模式，更新 name 顯示
    if (panelInputMode === "divide_surface" && derivedPanel) {
      const directionLabel = splitDirection === "horizontal" ? "橫切" : "直切";
      const customSplitLabel = hasCustomSplitSizes
        ? `${customSplitSizes.map(formatSplitSize).join(" / ")}cm`
        : `每片 W${Math.round(derivedPanel.panelWidthCm)} × H${Math.round(derivedPanel.panelHeightCm)}cm`;
      name = [
        methodConfig.label,
        `整面 W${surfaceWidthCm} × H${surfaceHeightCm}cm`,
        `${directionLabel} ${effectiveSplitCount} 片 (${customSplitLabel})`,
      ].join("\n");
    }

    const item: Omit<FlexQuoteItem, "id"> = {
      name,
      spec,
      qty: effectiveQty,
      unit: "只",
      unitPrice,
      amount: unitPrice * effectiveQty,
      isCostItem: false,
      notes: "",
      autoPriced: true,
      costPerUnit: pieceCost,
      laborRate: adjustedLaborRate,
      materialRate,
      method,
      materialId: selectedMaterialId === "custom" ? "" : selectedMaterialId,
      installHeightTier: usesConstructionConditions ? installHeightTier : undefined,
      panelSizeTier: usesConstructionConditions ? panelSizeTier : undefined,
      installSurchargeRate: usesConstructionConditions ? surchargePercent : undefined,
      panelInputMode: panelInputMode === "per_piece" ? undefined : panelInputMode,
      surfaceWidthCm: panelInputMode === "divide_surface" ? surfaceWidthCm : undefined,
      surfaceHeightCm: panelInputMode === "divide_surface" ? surfaceHeightCm : undefined,
      splitDirection: panelInputMode === "divide_surface" ? splitDirection : undefined,
      splitCount: panelInputMode === "divide_surface" ? effectiveSplitCount : undefined,
      caiRoundingMode: panelInputMode === "divide_surface" ? caiRoundingMode : undefined,
      customSplitSizes: panelInputMode === "divide_surface" && hasCustomSplitSizes ? customSplitSizes : undefined,
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

          {/* 輸入模式切換器 (v0.3.2) */}
          {!isFoamCore && (
            <div className="mb-2">
              <Label className="mb-2 block">輸入模式</Label>
              <div className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-0.5">
                <button
                  type="button"
                  onClick={() => setPanelInputMode("per_piece")}
                  className={`flex-1 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-medium transition-colors ${
                    panelInputMode === "per_piece"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  每片 × 數量
                </button>
                <button
                  type="button"
                  onClick={() => setPanelInputMode("divide_surface")}
                  className={`flex-1 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-medium transition-colors ${
                    panelInputMode === "divide_surface"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  整面 ÷ 分片
                </button>
              </div>
            </div>
          )}

          {/* 每片×數量模式：原有輸入方式 */}
          {panelInputMode === "per_piece" && (
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
          )}

          {/* 整面÷分片模式：新的輸入方式 */}
          {panelInputMode === "divide_surface" && (
            <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>整面寬度 (cm)</Label>
                  <Input
                    type="number"
                    value={surfaceWidthCm}
                    onChange={(e) => setSurfaceWidthCm(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>整面高度 (cm)</Label>
                  <Input
                    type="number"
                    value={surfaceHeightCm}
                    onChange={(e) => setSurfaceHeightCm(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <Label>分片方向</Label>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSplitDirection("horizontal")}
                    className={`flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors ${
                      splitDirection === "horizontal"
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--border)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    橫切（沿高度）
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitDirection("vertical")}
                    className={`flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors ${
                      splitDirection === "vertical"
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--border)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    直切（沿寬度）
                  </button>
                </div>
              </div>

              <div>
                <Label>自訂分片尺寸（選填）</Label>
                <Textarea
                  value={customSplitInput}
                  onChange={(e) => setCustomSplitInput(e.target.value)}
                  placeholder={splitDirection === "horizontal" ? "例如：30,57,57,30" : "例如：50,60,60,47"}
                  className="mt-1 min-h-[84px]"
                />
                <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                  留空時使用均分；輸入逗號或換行分隔的尺寸後，會以清單片數為準。
                </div>
              </div>

              <div>
                <Label>分片數量</Label>
                {hasCustomSplitSizes ? (
                  <div className="mt-2 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] p-3 text-center">
                    <div className="text-2xl font-bold">{customSplitSizes.length} 片</div>
                    <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">依自訂尺寸自動判定</div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-center gap-6">
                    <button
                      type="button"
                      onClick={() => setSplitCount((prev) => Math.max(1, prev - 1))}
                      className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-lg font-bold transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      −
                    </button>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{splitCount} 片</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSplitCount((prev) => prev + 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-lg font-bold transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>

              {/* 計算結果：單片尺寸 */}
              {hasCustomSplitSizes && !isCustomSplitValid && (
                <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  自訂尺寸總和為 {formatSplitSize(customSplitTotalCm)} cm，與整面{splitDirection === "horizontal" ? "高度" : "寬度"} {formatSplitSize(splitTargetCm)} cm 不一致。
                </div>
              )}
              {derivedPanel && (
                <div className="rounded-[var(--radius-md)] bg-[var(--bg-subtle)] p-3 text-sm">
                  <div className="font-medium text-[var(--text-secondary)]">{hasCustomSplitSizes ? "分片尺寸" : "每片尺寸"}</div>
                  {hasCustomSplitSizes ? (
                    <div className="mt-2 space-y-1 text-xs">
                      {derivedPanels.map((panel, index) => (
                        <div key={`${panel.splitSizeCm}-${index}`} className="flex items-center justify-between">
                          <span>第 {index + 1} 片</span>
                          <span className="font-medium">
                            W{Math.round(panel.panelWidthCm)} × H{Math.round(panel.panelHeightCm)} cm
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 text-lg font-semibold">
                      W{Math.round(derivedPanel.panelWidthCm)} × H{Math.round(derivedPanel.panelHeightCm)} cm
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 才數進位模式對比 (v0.3.2) */}
          {panelInputMode === "divide_surface" && dualCai && !isFoamCore && (
            <div className="space-y-3">
              <Label>才數計算方式</Label>

              {/* 兩種進位模式選擇 */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCaiRoundingMode("per_piece_ceil")}
                  className={`rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                    caiRoundingMode === "per_piece_ceil"
                      ? "border-[var(--accent)] bg-[var(--accent-light)]"
                      : "border-[var(--border)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <div className="font-medium">逐片進位</div>
                  <div className="mt-1 text-2xl font-bold">{dualCai.perPieceCeilTotal} 才</div>
                  <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                    每片進位後相加
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCaiRoundingMode("surface_ceil")}
                  className={`rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                    caiRoundingMode === "surface_ceil"
                      ? "border-[var(--accent)] bg-[var(--accent-light)]"
                      : "border-[var(--border)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <div className="font-medium">整面進位</div>
                  <div className="mt-1 text-2xl font-bold">{dualCai.surfaceCeilTotal} 才</div>
                  <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                    總才數進位一次
                  </div>
                </button>
              </div>

              {/* 橘色差異說明（僅當有差異時顯示） */}
              {dualCai.difference > 0 && (
                <div className="rounded-[var(--radius-md)] border border-orange-200 bg-orange-50 p-3 text-sm">
                  <div className="font-medium text-orange-900 mb-2">
                    才數差異 {dualCai.difference} 才
                  </div>
                  <div className="space-y-1 text-xs text-orange-700">
                    {dualCai.detailMode === "equal" ? (
                      <>
                        <div>• 逐片進位: 每片 {Math.ceil(dualCai.perPieceRaw)} 才 × {effectiveSplitCount} 片 = {dualCai.perPieceCeilTotal} 才</div>
                        <div>• 整面進位: 總計 {dualCai.rawTotal.toFixed(2)} 才 → {dualCai.surfaceCeilTotal} 才</div>
                      </>
                    ) : (
                      <>
                        <div>• 逐片進位: {dualCai.rawPerPanels.map((raw, index) => `第${index + 1}片 ${Math.ceil(raw)}才`).join(" / ")} = {dualCai.perPieceCeilTotal} 才</div>
                        <div>• 整面進位: 總計 {dualCai.rawTotal.toFixed(2)} 才 → {dualCai.surfaceCeilTotal} 才</div>
                      </>
                    )}
                    <div className="pt-1 border-t border-orange-200">
                      成本差異約 ${Math.round(dualCai.difference * adjustedLaborRate)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {usesConstructionConditions && (
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium mb-3">施工條件（選填）</h4>

              {/* 安裝高度選擇器 */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">
                    安裝高度
                    {usesConstructionConditions && panelInputMode === "divide_surface" && (
                      <span className="ml-1 text-blue-600">（自動偵測）</span>
                    )}
                  </label>
                  {usesConstructionConditions && panelInputMode === "divide_surface" ? (
                    <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded text-sm">
                      {INSTALL_HEIGHT_TIERS[installHeightTier].label} ({INSTALL_HEIGHT_TIERS[installHeightTier].description})
                    </div>
                  ) : (
                    <select
                      value={installHeightTier}
                      onChange={(e) => setInstallHeightTier(e.target.value as InstallHeightTier)}
                      className="w-full px-3 py-2 border rounded"
                    >
                      {INSTALL_HEIGHT_OPTIONS.map((tier) => (
                        <option key={tier} value={tier}>
                          {INSTALL_HEIGHT_TIERS[tier].label} ({INSTALL_HEIGHT_TIERS[tier].description})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 板片尺寸（自動偵測，唯讀） */}
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">板片尺寸</label>
                  <div className="px-3 py-2 bg-gray-50 border rounded text-sm">
                    {PANEL_SIZE_TIERS[panelSizeTier].label} &middot; 自動偵測
                  </div>
                </div>
              </div>

              {/* 加給說明 */}
              {surchargePercent > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm">
                  <div className="font-medium text-orange-900 mb-1">
                    工資加給 +{surchargePercent}%
                  </div>
                  <div className="text-orange-700 text-xs space-y-1">
                    <div>&bull; 高度加給: {INSTALL_HEIGHT_TIERS[installHeightTier].label} +{INSTALL_HEIGHT_TIERS[installHeightTier].surchargePercent}%</div>
                    <div>&bull; 尺寸加給: {PANEL_SIZE_TIERS[panelSizeTier].label} +{PANEL_SIZE_TIERS[panelSizeTier].surchargePercent}%</div>
                    <div className="pt-1 border-t border-orange-200">
                      基礎工資 ${laborRate}/才 &rarr; 加給後 ${adjustedLaborRate}/才
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

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
                  布幅寬 {Math.round(fabricWidthCm)}cm · 排版預估
                </span>
                <div className="flex gap-3 font-medium">
                  <span>{fabricResult.exactYards} 碼</span>
                  <span className="text-[var(--accent)]">→ 計價 {fabricResult.roundedYards} 碼</span>
                </div>
              </div>
              {usesReserveFabricPricing && (
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">報價採用備布估算</span>
                  <div className="flex gap-3 font-medium">
                    <span>{pricingExactYards} 碼</span>
                    <span className="text-[var(--accent)]">→ 報價 {pricingRoundedYards} 碼</span>
                  </div>
                </div>
              )}
              {pricePerYard > 0 && (
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-[var(--text-tertiary)]">
                    {formatCurrency(pricePerYard)}/碼（{settings.fabricDiscount * 10}折）× {pricingRoundedYards} 碼 ÷ {effectiveQty} 件
                  </span>
                  <span className="font-medium">{formatCurrency(fabricCostPerPiece)}/件</span>
                </div>
              )}
            </div>
          )}

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
              {isFoamCore ? (
                <>
                  <div className="grid grid-cols-3 gap-4 text-center text-xs">
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
                    <div>
                      <div className="text-[var(--text-tertiary)]">總價</div>
                      <div className="mt-1 text-lg font-bold text-[var(--accent)]">
                        {formatCurrency(totalPrice)}
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
                <div className="grid grid-cols-5 gap-3 text-center text-xs">
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
                  <div>
                    <div className="text-[var(--text-tertiary)]">總價</div>
                    <div className="mt-1 text-lg font-bold text-[var(--accent)]">
                      {formatCurrency(totalPrice)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-center gap-6 text-[11px] text-[var(--text-tertiary)]">
                  <span>工資/才 {formatCurrency(adjustedLaborRate)}</span>
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
          <Button size="sm" onClick={handleInsert} disabled={panelInputMode === "divide_surface" && hasCustomSplitSizes && !isCustomSplitValid}>
            插入品項
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
