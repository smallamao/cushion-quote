/**
 * 出貨標籤（B2B 宅配，每包貼一張）。
 *
 * 取代老闆原本的 Keynote「獨立筒列印底稿」：每次複製一頁、手改三行字再印
 * （老闆 2026-11-06：米羅柚木 261025D101 分兩包，要印兩張）。
 * 版面沿用那份底稿：604×1755pt 長頁、標籤 584×289pt、三行置中、第三行紅字底線。
 *
 * 這裡只放純邏輯（預設文字、張數、分頁、字級），PDF 版面在 components/pdf/ShippingLabelPDF。
 */

import type { CustomOrder } from "@/lib/types";

/** Keynote 底稿：604×1755 長頁，第一張標籤從 y=207 起，每張高 289 → 一頁放得下 5 張 */
export const LABEL_PAGE = { width: 604, height: 1755 } as const;
export const LABEL_BOX = { left: 10, top: 207, width: 584, height: 289, border: 5 } as const;
export const LABELS_PER_PAGE = Math.floor(
  (LABEL_PAGE.height - LABEL_BOX.top) / LABEL_BOX.height,
);
/** 文字可用寬度：框內寬扣掉左右留白 */
export const LABEL_TEXT_MAX_WIDTH = 540;

export interface LabelLines {
  /** 客戶單號＋門市（粗體大字） */
  line1: string;
  /** 【品項分類】品名 */
  line2: string;
  /** 面料名稱＋色號（紅字底線） */
  line3: string;
}

/**
 * 出貨標籤只給 B2B 用：有關聯客戶主檔（公司）或有客戶自己的單號。
 * 散客走自己的送貨流程，不貼這種標籤。
 */
export function isB2BOrder(order: CustomOrder): boolean {
  return Boolean(order.clientId?.trim() || order.clientPoNumber?.trim());
}

/**
 * 單號尾巴是門市地名（「261025D101 新店」）時補成「新店門市」，跟手打的底稿一致。
 * 只補「單號 空格 兩字地名」這種寫法；已經是「門市」「○○店」或不是中文的照原樣，不猜。
 */
function withStoreSuffix(code: string): string {
  const s = code.trim();
  const tokens = s.split(/\s+/);
  const last = tokens[tokens.length - 1] ?? "";
  if (tokens.length >= 2 && /^[一-鿿]{2}$/.test(last)) return `${s}門市`;
  return s;
}

/** 去掉品名尾巴的數量（「四組」「2組」「x3只」），標籤每包一張，不寫總數 */
function stripTrailingQuantity(name: string): string {
  return name.replace(/\s*[xX×*]?\s*[一二兩三四五六七八九十\d]+\s*[組只件張個入套]$/, "").trim();
}

function line2For(order: CustomOrder): string {
  const category = order.itemCategory?.trim() ?? "";
  const header = order.items?.find((i) => i.itemType === "header")?.name?.trim() ?? "";
  const base = stripTrailingQuantity(header || order.orderTitle?.trim() || "");
  if (!base) return category ? `【${category}】` : "";
  if (base.startsWith("【") || !category) return base;
  return `【${category}】${base}`;
}

export function defaultLabelLines(order: CustomOrder): LabelLines {
  const code = order.clientPoNumber?.trim() || order.orderNumber?.trim() || "";
  return {
    line1: withStoreSuffix(code),
    line2: line2For(order),
    line3: [order.materialName?.trim(), order.materialCode?.trim()].filter(Boolean).join(" "),
  };
}

/** 張數預設＝訂單上的包數；沒填就 1 張 */
export function defaultLabelCopies(order: CustomOrder): number {
  const n = Math.floor(order.packageCount ?? 0);
  return n > 0 ? n : 1;
}

/** 把 N 張標籤切成每頁幾張，例：7 張 → [5, 2] */
export function paginateLabels(total: number): number[] {
  const pages: number[] = [];
  for (let left = Math.max(0, Math.floor(total)); left > 0; left -= LABELS_PER_PAGE) {
    pages.push(Math.min(LABELS_PER_PAGE, left));
  }
  return pages;
}

/**
 * 粗估文字寬度（全形 1em、半形 0.6em），太長就等比縮小字級，避免溢出框外。
 * react-pdf 不會自動縮字，長品名會斷成兩行把版面撐壞。
 */
export function fitLabelFontSize(text: string, baseSize: number, maxWidth: number): number {
  let ems = 0;
  // 粗體大寫英文與數字比 0.6em 寬，抓 0.7 寧可小一點也不要溢出
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    ems += code > 0xff ? 1 : /[A-Z0-9]/.test(ch) ? 0.7 : 0.6;
  }
  if (ems === 0) return baseSize;
  return Math.min(baseSize, Math.floor((maxWidth / ems) * 10) / 10);
}
