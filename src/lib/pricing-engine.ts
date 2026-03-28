import { ADDON_DEFS, EXTRA_DEFS, INSTALL_HEIGHT_TIERS, PANEL_SIZE_TIERS } from "@/lib/constants";
import type {
  AddonItem,
  Channel,
  InstallHeightTier,
  MethodConfig,
  PanelSizeTier,
  PricingConfig,
  QuoteLineItem,
  SplitDirection,
} from "@/lib/types";

export interface ChannelPrice {
  total: number;
  perCai: number;
  perPiece: number;
  margin: number;
}

export interface LineCalculationResult {
  caiCount: number;
  laborRate: number;
  baseLaborRate?: number;
  materialRate: number;
  extrasPerCai: number;
  extrasFixed: number;
  costPerCai: number;
  pieceCost: number;
  lineSubtotal: number;
  allocatedCommission: number;
  installSurchargePercent?: number;
  channelPrices: Record<Channel, ChannelPrice>;
}

export interface QuoteCalculationResult {
  lineResults: Array<LineCalculationResult & { item: QuoteLineItem }>;
  itemsSubtotal: number;
  addonFixed: number;
  rushSurcharge: number;
  subtotalBeforeTax: number;
  tax: number;
  grandTotal: number;
  commissionAmount: number;
}

export function calculateCaiCount(widthCm: number, heightCm: number, minCai: number) {
  const raw = (widthCm * heightCm) / 900;
  return Math.max(Math.ceil(raw), minCai);
}

export function calculateLaborRate(method: MethodConfig, thickness: number | null, qualityPremium: number) {
  if (method.baseThickness === null) {
    return Math.round(method.baseRate * (1 + qualityPremium / 100));
  }

  const baseThickness = thickness ?? method.baseThickness;
  const steps = (baseThickness - method.baseThickness) / 0.5;
  const refRate = method.baseRate + steps * method.incrementPerHalfInch;
  return Math.round(refRate * (1 + qualityPremium / 100));
}

export function inferHeightTier(heightCm: number): InstallHeightTier {
  if (heightCm <= 200) {
    return "normal";
  }
  if (heightCm <= 300) {
    return "mid_high";
  }
  return "high_altitude";
}

export function inferPanelSizeTier(widthCm: number, heightCm: number): PanelSizeTier {
  const longSide = Math.max(widthCm, heightCm);
  if (longSide <= 180) {
    return "standard";
  }
  if (longSide <= 240) {
    return "large";
  }
  return "extra_large";
}

export function calculateInstallSurcharge(heightTier: InstallHeightTier, panelSizeTier: PanelSizeTier): number {
  const heightPercent = INSTALL_HEIGHT_TIERS[heightTier]?.surchargePercent ?? 0;
  const panelPercent = PANEL_SIZE_TIERS[panelSizeTier]?.surchargePercent ?? 0;
  return heightPercent + panelPercent;
}

export function applyInstallSurcharge(baseLaborRate: number, surchargePercent: number): number {
  return Math.round(baseLaborRate * (1 + surchargePercent / 100));
}

type QuoteLineItemWithSurcharge = QuoteLineItem & {
  installHeightTier?: InstallHeightTier;
  panelSizeTier?: PanelSizeTier;
};

export function calculateLineItem(item: QuoteLineItem, method: MethodConfig, config: PricingConfig): LineCalculationResult {
  const caiCount = calculateCaiCount(item.widthCm, item.heightCm, method.minCai);
  const baseLaborRate = calculateLaborRate(method, item.foamThickness, config.qualityPremium);

  let laborRate = baseLaborRate;
  let installSurchargePercent: number | undefined = undefined;

  const itemWithSurcharge = item as QuoteLineItemWithSurcharge;
  if (itemWithSurcharge.installHeightTier && itemWithSurcharge.panelSizeTier) {
    const heightTier = itemWithSurcharge.installHeightTier;
    const panelSizeTier = itemWithSurcharge.panelSizeTier;
    installSurchargePercent = calculateInstallSurcharge(heightTier, panelSizeTier);
    laborRate = applyInstallSurcharge(baseLaborRate, installSurchargePercent);
  }

  const rawMaterialCost = item.material
    ? item.useListPrice
      ? item.material.listPricePerCai
      : item.material.costPerCai
    : (item.customMaterialCost ?? 0);
  const materialRate = Math.round(rawMaterialCost * (1 + config.wasteRate / 100));

  let extrasPerCai = 0;
  let extrasFixed = 0;
  for (const extra of item.extras) {
    const definition = EXTRA_DEFS[extra];
    if (definition.perUnit) {
      extrasFixed += definition.unitCost * item.powerHoleCount;
    } else {
      extrasPerCai += definition.unitCost;
    }
  }

  const costPerCai = laborRate + materialRate + extrasPerCai;
  const pieceCost = costPerCai * caiCount + extrasFixed;
  const lineSubtotal = pieceCost * item.qty;

  const commissionMultiplier = config.commissionMode === "rebate" ? 1 + config.commissionRate / 100 : 1;

  const channelPrices = (Object.entries(config.channelMultipliers) as Array<[Channel, number]>).reduce<
    Record<Channel, ChannelPrice>
  >(
    (result, [channel, multiplier]) => {
      const perPiece = Math.round((pieceCost * multiplier * commissionMultiplier) / 10) * 10;
      const total = perPiece * item.qty;
      const perCai = Math.round(perPiece / caiCount);
      const margin = Math.round((((perPiece - pieceCost) / perPiece) * 100) * 10) / 10;
      result[channel] = { total, perCai, perPiece, margin };
      return result;
    },
    {
      wholesale: { total: 0, perCai: 0, perPiece: 0, margin: 0 },
      designer: { total: 0, perCai: 0, perPiece: 0, margin: 0 },
      retail: { total: 0, perCai: 0, perPiece: 0, margin: 0 },
      luxury_retail: { total: 0, perCai: 0, perPiece: 0, margin: 0 },
    },
  );

  const result: LineCalculationResult = {
    caiCount,
    laborRate,
    materialRate,
    extrasPerCai,
    extrasFixed,
    costPerCai,
    pieceCost,
    lineSubtotal,
    allocatedCommission: 0,
    channelPrices,
  };

  if (installSurchargePercent !== undefined) {
    result.baseLaborRate = baseLaborRate;
    result.installSurchargePercent = installSurchargePercent;
  }

  return result;
}

export function calculateQuote(
  items: Array<{ item: QuoteLineItem; method: MethodConfig }>,
  addons: AddonItem[],
  config: PricingConfig,
  channel: Channel,
): QuoteCalculationResult {
  const lineResults = items.map(({ item, method }) => ({ ...calculateLineItem(item, method, config), item }));

  if (config.commissionMode === "fixed") {
    const fixedCommission = Math.max(0, Math.round(config.commissionFixedAmount));
    const channels = Object.keys(config.channelMultipliers) as Channel[];

    for (const currentChannel of channels) {
      const baseSubtotals = lineResults.map((line) => line.channelPrices[currentChannel].perPiece * line.item.qty);
      const allocatableSubtotal = baseSubtotals.reduce((sum, value) => sum + value, 0);
      if (allocatableSubtotal <= 0 || fixedCommission <= 0) {
        continue;
      }

      const allocations = baseSubtotals.map((baseSubtotal) => Math.floor((fixedCommission * baseSubtotal) / allocatableSubtotal));
      const allocatedTotal = allocations.reduce((sum, value) => sum + value, 0);
      const remainder = fixedCommission - allocatedTotal;

      let targetIndex = 0;
      for (let i = 1; i < baseSubtotals.length; i++) {
        if (baseSubtotals[i] > baseSubtotals[targetIndex]) {
          targetIndex = i;
        }
      }
      allocations[targetIndex] += remainder;

      lineResults.forEach((line, index) => {
        const basePerPiece = line.channelPrices[currentChannel].perPiece;
        const qty = Math.max(1, line.item.qty);
        const allocatedCommission = allocations[index] ?? 0;
        const finalPerPiece = Math.round((basePerPiece + allocatedCommission / qty) / 10) * 10;
        const finalTotal = finalPerPiece * qty;
        const margin = finalPerPiece > 0 ? Math.round((((finalPerPiece - line.pieceCost) / finalPerPiece) * 100) * 10) / 10 : 0;

        line.channelPrices[currentChannel] = {
          total: finalTotal,
          perCai: Math.round(finalPerPiece / line.caiCount),
          perPiece: finalPerPiece,
          margin,
        };

        if (currentChannel === channel) {
          line.allocatedCommission = allocatedCommission;
        }
      });
    }
  }

  const itemsSubtotal = lineResults.reduce((sum, line) => sum + line.channelPrices[channel].total, 0);

  let addonFixed = 0;
  let addonPercent = 0;
  for (const addon of addons) {
    const definition = ADDON_DEFS[addon.type];
    if (definition.isPercent) {
      addonPercent += definition.unitCost;
    } else {
      addonFixed += definition.unitCost * addon.qty;
    }
  }

  const rushSurcharge = Math.round(itemsSubtotal * (addonPercent / 100));
  const subtotalBeforeTax = itemsSubtotal + addonFixed + rushSurcharge;
  const tax = Math.round(subtotalBeforeTax * (config.taxRate / 100));
  const grandTotal = subtotalBeforeTax + tax;

  let commissionAmount = 0;
  if (config.commissionMode === "rebate") {
    commissionAmount = Math.round(grandTotal * (config.commissionRate / 100));
  } else if (config.commissionMode === "fixed") {
    commissionAmount = Math.max(0, Math.round(config.commissionFixedAmount));
  }

  return { lineResults, itemsSubtotal, addonFixed, rushSurcharge, subtotalBeforeTax, tax, grandTotal, commissionAmount };
}

/**
 * 整面÷分片：根據整面尺寸與分片配置，計算單片尺寸
 * @param surfaceWidthCm 整面寬度 (cm)
 * @param surfaceHeightCm 整面高度 (cm)
 * @param splitDirection 分片方向：horizontal（橫切）或 vertical（直切）
 * @param splitCount 分片數量
 * @returns 單片寬度與高度
 */
export function calculateSurfaceSplit(
  surfaceWidthCm: number,
  surfaceHeightCm: number,
  splitDirection: SplitDirection,
  splitCount: number,
): { panelWidthCm: number; panelHeightCm: number } {
  if (splitCount <= 0) {
    return { panelWidthCm: surfaceWidthCm, panelHeightCm: surfaceHeightCm };
  }

  if (splitDirection === "horizontal") {
    // 橫切：沿著高度方向切割，每片保持全寬，高度÷分片數
    return {
      panelWidthCm: surfaceWidthCm,
      panelHeightCm: surfaceHeightCm / splitCount,
    };
  }

  // 直切：沿著寬度方向切割，每片保持全高，寬度÷分片數
  return {
    panelWidthCm: surfaceWidthCm / splitCount,
    panelHeightCm: surfaceHeightCm,
  };
}

/**
 * 雙模式才數計算：同時計算「逐片進位」與「整面進位」的才數
 * @param panelWidthCm 單片寬度 (cm)
 * @param panelHeightCm 單片高度 (cm)
 * @param splitCount 分片數量
 * @param minCai 最低才數（每片或整面的最小值）
 * @returns 兩種進位模式的才數對比
 */
export function calculateCaiCountDual(
  panelWidthCm: number,
  panelHeightCm: number,
  splitCount: number,
  minCai: number,
): {
  perPieceCeilTotal: number;
  surfaceCeilTotal: number;
  perPieceRaw: number;
  difference: number;
} {
  // 單片原始才數（未進位）
  const rawPerPanel = (panelWidthCm * panelHeightCm) / 900;

  // 模式 1: 逐片進位 - 每片進位後 × 分片數
  const ceiledPerPanel = Math.max(Math.ceil(rawPerPanel), minCai);
  const perPieceCeilTotal = ceiledPerPanel * splitCount;

  // 模式 2: 整面進位 - 總才數進位一次
  const rawTotal = rawPerPanel * splitCount;
  const surfaceCeilTotal = Math.max(Math.ceil(rawTotal), minCai);

  return {
    perPieceCeilTotal,
    surfaceCeilTotal,
    perPieceRaw: rawPerPanel,
    difference: perPieceCeilTotal - surfaceCeilTotal,
  };
}
