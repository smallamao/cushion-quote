import { ADDON_DEFS, EXTRA_DEFS } from "@/lib/constants";
import type { AddonItem, Channel, MethodConfig, PricingConfig, QuoteLineItem } from "@/lib/types";

export interface ChannelPrice {
  total: number;
  perCai: number;
  perPiece: number;
  margin: number;
}

export interface LineCalculationResult {
  caiCount: number;
  laborRate: number;
  materialRate: number;
  extrasPerCai: number;
  extrasFixed: number;
  costPerCai: number;
  pieceCost: number;
  lineSubtotal: number;
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
  return Math.max(Math.ceil(raw * 10) / 10, minCai);
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

export function calculateLineItem(item: QuoteLineItem, method: MethodConfig, config: PricingConfig): LineCalculationResult {
  const caiCount = calculateCaiCount(item.widthCm, item.heightCm, method.minCai);
  const laborRate = calculateLaborRate(method, item.foamThickness, config.qualityPremium);

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

  const channelPrices = (Object.entries(config.channelMultipliers) as Array<[Channel, number]>).reduce<
    Record<Channel, ChannelPrice>
  >(
    (result, [channel, multiplier]) => {
      const perPiece = Math.round((pieceCost * multiplier) / 10) * 10;
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

  return { caiCount, laborRate, materialRate, extrasPerCai, extrasFixed, costPerCai, pieceCost, lineSubtotal, channelPrices };
}

export function calculateQuote(
  items: Array<{ item: QuoteLineItem; method: MethodConfig }>,
  addons: AddonItem[],
  config: PricingConfig,
  channel: Channel,
): QuoteCalculationResult {
  const lineResults = items.map(({ item, method }) => ({ ...calculateLineItem(item, method, config), item }));

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
  }

  return { lineResults, itemsSubtotal, addonFixed, rushSurcharge, subtotalBeforeTax, tax, grandTotal, commissionAmount };
}
