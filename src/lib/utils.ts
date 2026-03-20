import type { CommissionMode } from "@/lib/types";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

export function slugDate(date = new Date()) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

const YARD_CM = 90;
const CAI_AREA = 900;
const DEFAULT_WIDTH_CM = 135;

export function caiPerYard(widthCm: number = DEFAULT_WIDTH_CM): number {
  return (widthCm * YARD_CM) / CAI_AREA;
}

export function yardToCai(pricePerYard: number, widthCm: number): number {
  return Math.round((pricePerYard / caiPerYard(widthCm)) * 100) / 100;
}

export function caiToYard(pricePerCai: number, widthCm: number): number {
  return Math.round(pricePerCai * caiPerYard(widthCm));
}

export function clampCommissionRate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(50, Math.max(0, value));
}

export function roundPriceToTens(value: number) {
  return Math.round(value / 10) * 10;
}

export function calculateQuotedUnitPrice(
  pieceCost: number,
  multiplier: number,
  commissionMode: CommissionMode,
  commissionRate: number,
) {
  const commissionMultiplier = commissionMode === "rebate" ? 1 + commissionRate / 100 : 1;
  return roundPriceToTens(pieceCost * multiplier * commissionMultiplier);
}
