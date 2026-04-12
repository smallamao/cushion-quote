export type AdjustmentMode = "fixed" | "percentage" | "absolute";

export interface PriceAdjustment {
  mode: AdjustmentMode;
  value: number;
  isIncrease?: boolean;
}

const MAX_BATCH_PRICE = 100000;

export function calculateAdjustedPrice(
  oldPrice: number,
  adjustment: PriceAdjustment,
): number {
  const normalizedOldPrice = Number.isFinite(oldPrice) ? oldPrice : 0;
  const normalizedValue = Number.isFinite(adjustment.value) ? adjustment.value : 0;

  let newPrice: number;

  switch (adjustment.mode) {
    case "fixed":
      newPrice = adjustment.isIncrease ? normalizedOldPrice + normalizedValue : normalizedOldPrice - normalizedValue;
      break;
    case "percentage": {
      const multiplier = adjustment.isIncrease ? 1 + normalizedValue / 100 : 1 - normalizedValue / 100;
      newPrice = normalizedOldPrice * multiplier;
      break;
    }
    case "absolute":
      newPrice = normalizedValue;
      break;
  }

  return Math.round(newPrice);
}

export function validatePriceAdjustment(adjustment: PriceAdjustment): string | null {
  if (!adjustment.mode) {
    return "請選擇調整方式";
  }

  if (!Number.isFinite(adjustment.value)) {
    return "請輸入有效的調整值";
  }

  if (adjustment.value < 0) {
    return "調整值不可為負數";
  }

  if (adjustment.mode === "percentage" && adjustment.value > 100) {
    return "百分比調整不可超過 100%";
  }

  if (adjustment.mode === "absolute" && adjustment.value > MAX_BATCH_PRICE) {
    return `統一單價不可超過 ${MAX_BATCH_PRICE.toLocaleString("zh-TW")} 元`;
  }

  return null;
}

export function validateAdjustedPrice(newPrice: number): string | null {
  if (newPrice < 0) {
    return "計算後價格不可為負數";
  }

  if (newPrice > MAX_BATCH_PRICE) {
    return `計算後價格不可超過 ${MAX_BATCH_PRICE.toLocaleString("zh-TW")} 元`;
  }

  return null;
}
