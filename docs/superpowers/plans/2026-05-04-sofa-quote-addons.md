# 尺寸報價合併 POS 進階選項 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 POS 訂製報價的附加選項（落地、扶手移除、USB、無線充電、滑軌、高度削減、平台無置物）合併進尺寸報價，並廢棄 POS 報價 tab/頁面。

**Architecture:** 在 `sofa-quote-data.ts` 新增 `SofaAddons` interface 與 `calcAddons()` 計算函式；在 `SofaQuoteClient` 加可折疊的「進階選項」區塊，所有附加費計入報價總額；`QuotePageClient` 移除 POS tab 直接 render `SofaQuoteClient`；`/pos-quote` 改為 redirect。

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, Tailwind CSS (CSS variables)

---

## File Map

| 檔案 | 動作 | 說明 |
|------|------|------|
| `src/lib/sofa-quote-data.ts` | Modify | 新增 `SofaAddons`、`calcAddons()`、更新 `buildQuoteOutput()` signature |
| `src/app/sofa-quote/SofaQuoteClient.tsx` | Modify | 加進階選項 UI + 連接附加費計算 |
| `src/app/sofa-quote/QuotePageClient.tsx` | Modify | 移除 POS tab，直接 render `SofaQuoteClient` |
| `src/app/pos-quote/page.tsx` | Modify | Redirect 到 `/sofa-quote` |
| `src/__tests__/sofa-quote-addons.test.ts` | Create | `calcAddons()` 的單元測試 |

---

## Context（給 subagent 的背景）

### 現有尺寸報價定價邏輯（`src/lib/sofa-quote-data.ts`）

```typescript
// 寬度調整
export function calcWidthAdjustment(inputWidth, product, seatCount, grade): WidthCalcResult
// 平台費用（在 SofaQuoteClient 內）
function calcPlatformFee(diffCm: number, rate: number): number
// 輸出報價文字
export function buildQuoteOutput(product, grade, inputWidth, seatCount, basePrice): QuoteOutput
```

`buildQuoteOutput` 回傳 `{ detailText, copyText }`。`copyText` 是給客戶看的文字，已含靜態提示（如 `扣除USB - $1,000`）。

### 現有 POS 附加項目費率（全部固定，不從 Sheets 動態載入）

| 選項 | 費用 |
|------|------|
| 桶身落地（半落地） | +1,500 |
| 桶身落地（全落地） | +2,000 |
| 高度削減 4~6cm | -1,000 |
| 移除扶手 | -1,500 / 個 |
| 加裝 USB 充電 | +1,500 / 組 |
| 扣除標配 USB（LEO/OBA） | -1,000 |
| 加裝無線充電 | +1,200 / 組 |
| 加裝滑軌 | BOOM/BOOMs: +800/座，其他: +1,000/座 |
| 平台無置物（BOOM/LEMON/MULE） | -1,000 |

### 滑軌費率規則
```typescript
function getSlideRailRate(productCode: string): number {
  return ["BOOM", "BOOMs"].includes(productCode) ? 800 : 1000;
}
```

---

## Task 1: `SofaAddons` interface + `calcAddons()` + 測試

**Files:**
- Modify: `src/lib/sofa-quote-data.ts`（在檔案末尾新增）
- Create: `src/__tests__/sofa-quote-addons.test.ts`

- [ ] **Step 1: 寫失敗測試**

新建 `src/__tests__/sofa-quote-addons.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { calcAddons, type SofaAddons } from "@/lib/sofa-quote-data";

const base: SofaAddons = {
  groundOption: "none",
  heightReduction: false,
  removeArmrestCount: 0,
  usbCount: 0,
  removeStandardUsb: false,
  wirelessChargeCount: 0,
  slideRailCount: 0,
  slideRailRatePerSeat: 1000,
  platformNoStorage: false,
};

describe("calcAddons", () => {
  it("全部預設值時回傳 0", () => {
    expect(calcAddons(base)).toBe(0);
  });

  it("半落地 +1500", () => {
    expect(calcAddons({ ...base, groundOption: "half" })).toBe(1500);
  });

  it("全落地 +2000", () => {
    expect(calcAddons({ ...base, groundOption: "full" })).toBe(2000);
  });

  it("高度削減 -1000", () => {
    expect(calcAddons({ ...base, heightReduction: true })).toBe(-1000);
  });

  it("移除 2 個扶手 -3000", () => {
    expect(calcAddons({ ...base, removeArmrestCount: 2 })).toBe(-3000);
  });

  it("USB 2 組 +3000", () => {
    expect(calcAddons({ ...base, usbCount: 2 })).toBe(3000);
  });

  it("扣除標配 USB -1000", () => {
    expect(calcAddons({ ...base, removeStandardUsb: true })).toBe(-1000);
  });

  it("無線充電 1 組 +1200", () => {
    expect(calcAddons({ ...base, wirelessChargeCount: 1 })).toBe(1200);
  });

  it("滑軌 3 座 rate 1000 → +3000", () => {
    expect(calcAddons({ ...base, slideRailCount: 3, slideRailRatePerSeat: 1000 })).toBe(3000);
  });

  it("BOOM 滑軌 3 座 rate 800 → +2400", () => {
    expect(calcAddons({ ...base, slideRailCount: 3, slideRailRatePerSeat: 800 })).toBe(2400);
  });

  it("平台無置物 -1000", () => {
    expect(calcAddons({ ...base, platformNoStorage: true })).toBe(-1000);
  });

  it("複合：半落地 + USB 2 組 + 移除扶手 1 個", () => {
    expect(calcAddons({
      ...base,
      groundOption: "half",
      usbCount: 2,
      removeArmrestCount: 1,
    })).toBe(1500 + 3000 - 1500);
  });
});
```

- [ ] **Step 2: 確認測試失敗**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx vitest run src/__tests__/sofa-quote-addons.test.ts 2>&1 | tail -20
```

Expected: FAIL（`calcAddons` 不存在）

- [ ] **Step 3: 實作 `SofaAddons` 和 `calcAddons`**

在 `src/lib/sofa-quote-data.ts` 末尾新增：

```typescript
// ─── Add-on Options ────────────────────────────────────────────────────────────

export interface SofaAddons {
  groundOption: "none" | "half" | "full"
  heightReduction: boolean
  removeArmrestCount: number
  usbCount: number
  removeStandardUsb: boolean
  wirelessChargeCount: number
  slideRailCount: number
  slideRailRatePerSeat: number  // 800 for BOOM/BOOMs, 1000 for others
  platformNoStorage: boolean
}

export const DEFAULT_ADDONS: SofaAddons = {
  groundOption: "none",
  heightReduction: false,
  removeArmrestCount: 0,
  usbCount: 0,
  removeStandardUsb: false,
  wirelessChargeCount: 0,
  slideRailCount: 0,
  slideRailRatePerSeat: 1000,
  platformNoStorage: false,
}

export function getSlideRailRate(productCode: string): number {
  return ["BOOM", "BOOMs"].includes(productCode) ? 800 : 1000;
}

export function calcAddons(addons: SofaAddons): number {
  const groundCost = addons.groundOption === "full" ? 2000
    : addons.groundOption === "half" ? 1500 : 0;
  const heightDiscount = addons.heightReduction ? -1000 : 0;
  const armrestDiscount = addons.removeArmrestCount * -1500;
  const usbCost = addons.usbCount * 1500;
  const removeUsbDiscount = addons.removeStandardUsb ? -1000 : 0;
  const wirelessCost = addons.wirelessChargeCount * 1200;
  const slideRailCost = addons.slideRailCount * addons.slideRailRatePerSeat;
  const platformNoStorageDiscount = addons.platformNoStorage ? -1000 : 0;
  return groundCost + heightDiscount + armrestDiscount + usbCost
    + removeUsbDiscount + wirelessCost + slideRailCost + platformNoStorageDiscount;
}
```

- [ ] **Step 4: 確認測試通過**

```bash
npx vitest run src/__tests__/sofa-quote-addons.test.ts 2>&1 | tail -10
```

Expected: 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sofa-quote-data.ts src/__tests__/sofa-quote-addons.test.ts
git commit -m "feat(sofa-quote): add SofaAddons interface and calcAddons()"
```

---

## Task 2: 更新 `buildQuoteOutput` 接受並輸出附加費明細

**Files:**
- Modify: `src/lib/sofa-quote-data.ts`（更新 `buildQuoteOutput`）

**說明：** `buildQuoteOutput` 的 signature 加 `addons?: SofaAddons`。若有附加費則在 copyText 末尾加一個分隔段落，列出各項目和費用。總價 = 原本 `totalPrice` + `calcAddons(addons)`。

- [ ] **Step 1: 寫失敗測試**

在 `src/__tests__/sofa-quote-addons.test.ts` 新增（在最後一個 `describe` block 後面）：

```typescript
import { buildQuoteOutput, SOFA_PRODUCTS, MATERIAL_GRADES, getBasePrice } from "@/lib/sofa-quote-data";

describe("buildQuoteOutput with addons", () => {
  const product = SOFA_PRODUCTS.find((p) => p.displayName === "ELEC")!;
  const grade = MATERIAL_GRADES.find((g) => g.id === "TW_LV1")!;
  const basePrice = getBasePrice("ELEC", "TW_LV1"); // 42600

  it("無附加時輸出不含進階選項段落", () => {
    const { copyText } = buildQuoteOutput(product, grade, 262, 3, basePrice);
    expect(copyText).not.toContain("進階選項");
  });

  it("有附加費時 copyText 含各項目", () => {
    const { copyText } = buildQuoteOutput(product, grade, 262, 3, basePrice, {
      ...base,
      groundOption: "half",
      usbCount: 1,
    });
    expect(copyText).toContain("桶身落地（半落地）+1,500");
    expect(copyText).toContain("加裝 USB 充電 ×1 +1,500");
  });

  it("有附加費時總價正確", () => {
    const { copyText } = buildQuoteOutput(product, grade, 262, 3, basePrice, {
      ...base,
      groundOption: "full",
    });
    // basePrice 42600 + 2000 = 44600
    expect(copyText).toContain("44,600");
  });
});
```

- [ ] **Step 2: 確認測試失敗**

```bash
npx vitest run src/__tests__/sofa-quote-addons.test.ts 2>&1 | tail -15
```

Expected: FAIL（`buildQuoteOutput` 沒有第 6 個參數）

- [ ] **Step 3: 更新 `buildQuoteOutput`**

在 `src/lib/sofa-quote-data.ts` 中找到 `buildQuoteOutput` 並更新：

```typescript
export function buildQuoteOutput(
  product: SofaProduct,
  grade: MaterialGrade,
  inputWidth: number,
  seatCount: number,
  basePrice: number,
  addons?: SofaAddons,
): QuoteOutput {
  const lc = calcLShape(product, basePrice)
  const wc = calcWidthAdjustment(inputWidth, product, seatCount, grade)
  const addonTotal = addons ? calcAddons(addons) : 0;

  const isEdsonBj = ['EDSON', 'BJ'].includes(product.displayName)
  const reductionText = getReductionDiscount(product, inputWidth)

  const detailLines: string[] = []

  // 一字型 (左二右二)
  if (!isEdsonBj) {
    detailLines.push('【一字型 分四位(左二右二)】')
    const fullWidthForL = lc.sizeL3 * 2
    const widthDiff = fullWidthForL - inputWidth
    if (widthDiff < 0) {
      const addPrice = Math.abs(widthDiff) * grade.ratePerSeatPerCm
      detailLines.push(`${lc.sizeL3 * 2} - ${inputWidth} = ${Math.abs(widthDiff)}cm`)
      detailLines.push(`$${fmtAmount(lc.L3 * 2)} + ${fmtAmount(addPrice)} = $${fmtAmount(lc.L3 * 2 + addPrice)}  [不含腳椅]`)
    } else {
      const stepPrice = lShapeStepPrice(widthDiff)
      detailLines.push(`${lc.sizeL3 * 2} - ${inputWidth} = ${widthDiff}cm`)
      detailLines.push(`$${fmtAmount(lc.L3 * 2)} - ${fmtAmount(stepPrice)} = $${fmtAmount(lc.L3 * 2 - stepPrice)}  [不含腳椅]`)
    }
    detailLines.push('')
  }

  // L型 分三位
  detailLines.push('【L型 分三位】')
  const sofaTotal = basePrice + wc.adjustPrice
  const grandTotal = sofaTotal + addonTotal;
  if (wc.adjustPrice < 0) {
    detailLines.push(`$${fmtAmount(basePrice)} - ${fmtAmount(Math.abs(wc.adjustPrice))} = $${fmtAmount(sofaTotal)}`)
  } else if (wc.adjustPrice > 0) {
    detailLines.push(`$${fmtAmount(basePrice)} + ${fmtAmount(wc.adjustPrice)} = $${fmtAmount(sofaTotal)}`)
  } else {
    detailLines.push(`$${fmtAmount(basePrice)}`)
  }

  detailLines.push('')
  detailLines.push('- - - 詳細資訊 - - -')
  detailLines.push(`Ｌ三人份 ${lc.sizeL3}cm  $${fmtAmount(lc.L3)}`)
  detailLines.push(`Ｌ一人份 ${lc.sizeL1}cm  $${fmtAmount(lc.L1)}`)
  detailLines.push(`一人坐寬 ${wc.oneSeatWidth.toFixed(1)}cm`)

  detailLines.push('')
  detailLines.push('【Ｌ型 正常報價】')

  // Copy text (client-facing)
  const copyLines: string[] = []
  copyLines.push(`${product.displayName} ${product.moduleName} ${inputWidth}cm 三件式L型`)
  const totalDisplay = addonTotal !== 0 ? grandTotal : sofaTotal;
  copyLines.push(`${grade.materialDescription} $${fmtAmount(totalDisplay)}`)
  if (reductionText) copyLines.push(reductionText)
  copyLines.push(`平台尺寸w${product.footSeatSize}cm`)
  copyLines.push(`椅腳樣式：${product.defaultFoot}`)
  copyLines.push('')
  copyLines.push(`扣除平台 - $${fmtAmount(lc.platform)}`)
  if (['BOOM', 'LEMON', 'MULE'].includes(product.displayName)) {
    copyLines.push('訂平台無置物 - $1,000')
  }
  if (['LEO', 'OBA'].includes(product.displayName)) {
    copyLines.push('扣除USB - $1,000')
  }
  if (product.displayName === 'BOOM') {
    copyLines.push('扣除滑軌 - $2,400')
  } else if (['ICE', 'LEO', 'OBA', 'AMI', 'LEMON', 'MULE'].includes(product.displayName)) {
    copyLines.push('扣除煞車滑軌 - $3,000')
  }

  // Add-ons section
  if (addons && addonTotal !== 0) {
    copyLines.push('')
    copyLines.push('【進階選項】')
    if (addons.groundOption === "half") copyLines.push('桶身落地（半落地）+1,500')
    if (addons.groundOption === "full") copyLines.push('桶身落地（全落地）+2,000')
    if (addons.heightReduction) copyLines.push('高度削減 4~6cm -1,000')
    if (addons.removeArmrestCount > 0) {
      const total = addons.removeArmrestCount * 1500;
      copyLines.push(`移除扶手 ×${addons.removeArmrestCount} -${fmtAmount(total)}`)
    }
    if (addons.usbCount > 0) {
      const total = addons.usbCount * 1500;
      copyLines.push(`加裝 USB 充電 ×${addons.usbCount} +${fmtAmount(total)}`)
    }
    if (addons.removeStandardUsb) copyLines.push('扣除標配 USB -1,000')
    if (addons.wirelessChargeCount > 0) {
      const total = addons.wirelessChargeCount * 1200;
      copyLines.push(`加裝無線充電 ×${addons.wirelessChargeCount} +${fmtAmount(total)}`)
    }
    if (addons.slideRailCount > 0) {
      const total = addons.slideRailCount * addons.slideRailRatePerSeat;
      copyLines.push(`加裝滑軌 ×${addons.slideRailCount}座 +${fmtAmount(total)}`)
    }
    if (addons.platformNoStorage) copyLines.push('平台無置物 -1,000')
  }

  const copyText = copyLines.join('\n')
  detailLines.push(copyText)

  return { detailText: detailLines.join('\n'), copyText }
}
```

- [ ] **Step 4: 確認測試通過**

```bash
npx vitest run src/__tests__/sofa-quote-addons.test.ts 2>&1 | tail -10
```

Expected: 全部 PASS（含 Task 1 的 12 個 + Task 2 的 3 個 = 15 個）

- [ ] **Step 5: 確認既有測試不受影響**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: 所有既有測試仍 PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/sofa-quote-data.ts src/__tests__/sofa-quote-addons.test.ts
git commit -m "feat(sofa-quote): buildQuoteOutput accepts addons, appends 進階選項 to copyText"
```

---

## Task 3: 在 `SofaQuoteClient` 加進階選項 UI

**Files:**
- Modify: `src/app/sofa-quote/SofaQuoteClient.tsx`

**說明：**
1. Import `SofaAddons`, `DEFAULT_ADDONS`, `calcAddons`, `getSlideRailRate` from `sofa-quote-data`
2. 加 `addons` state（初始值 `DEFAULT_ADDONS`）
3. 在 `handleQuote` 傳 `addons` 給 `buildQuoteOutput`
4. 在平台區塊之後加「進階選項」折疊區塊
5. 當 product 改變時，自動更新 `addons.slideRailRatePerSeat`

- [ ] **Step 1: 更新 import**

在 `SofaQuoteClient.tsx` 的 import 行更新：

```typescript
import {
  SOFA_PRODUCTS,
  MATERIAL_GRADES,
  getBasePrice,
  calcWidthAdjustment,
  buildQuoteOutput,
  fmtAmount,
  DEFAULT_ADDONS,
  calcAddons,
  getSlideRailRate,
  type SofaProduct,
  type MaterialGrade,
  type SofaAddons,
} from "@/lib/sofa-quote-data";
```

- [ ] **Step 2: 加 addons state + 更新 handleProductSelect + handleQuote**

在 `SofaQuoteClient` function 的 state 區塊加：

```typescript
const [addons, setAddons] = useState<SofaAddons>(DEFAULT_ADDONS);
```

更新 `handleProductSelect`，切換款式時同步 slideRailRate：

```typescript
function handleProductSelect(p: SofaProduct, idx: number) {
  setProductIdx(idx);
  setInputWidth(p.width);
  setSeatCount(p.defaultSeat);
  setPlatformW(null);
  setPlatformH(null);
  setAddons((prev) => ({ ...prev, slideRailRatePerSeat: getSlideRailRate(p.displayName) }));
}
```

更新 `handleQuote`：

```typescript
function handleQuote() {
  if (!basePrice) return;
  const result = buildQuoteOutput(product, grade, inputWidth, seatCount, basePrice, addons);
  setModal({ detail: result.detailText, copy: result.copyText });
}
```

- [ ] **Step 3: 加進階選項 UI 區塊**

在 `{/* Pickers */}` 之前、平台區塊之後，新增以下 JSX。先加 state：

```typescript
const [showAddons, setShowAddons] = useState(false);
```

然後加 UI：

```tsx
{/* Advanced options */}
<div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
  <button
    onClick={() => setShowAddons((v) => !v)}
    className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)]"
  >
    <span>進階選項</span>
    <span className="flex items-center gap-2">
      {calcAddons(addons) !== 0 && (
        <span className={`text-sm font-semibold ${calcAddons(addons) > 0 ? "text-red-500" : "text-blue-500"}`}>
          {calcAddons(addons) > 0 ? "+" : ""}${fmtAmount(calcAddons(addons))}
        </span>
      )}
      <span className="text-[var(--text-tertiary)]">{showAddons ? "▲" : "▼"}</span>
    </span>
  </button>

  {showAddons && (
    <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">

      {/* 桶身落地 */}
      <div className="space-y-1">
        <p className="text-xs text-[var(--text-secondary)]">桶身落地</p>
        <div className="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] p-0.5">
          {(["none", "half", "full"] as const).map((opt) => (
            <button key={opt}
              onClick={() => setAddons((a) => ({ ...a, groundOption: opt }))}
              className={[segBase, addons.groundOption === opt ? segActive : segInactive].join(" ")}
            >
              {opt === "none" ? "不落地" : opt === "half" ? "半落地 +1,500" : "全落地 +2,000"}
            </button>
          ))}
        </div>
      </div>

      {/* 高度削減 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">高度削減 4~6cm <span className="text-blue-500">-1,000</span></p>
        <button
          onClick={() => setAddons((a) => ({ ...a, heightReduction: !a.heightReduction }))}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${addons.heightReduction ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--text-secondary)]"}`}
        >
          {addons.heightReduction ? "✓ 已選" : "選取"}
        </button>
      </div>

      {/* 移除扶手 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">移除扶手（-1,500/個）</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setAddons((a) => ({ ...a, removeArmrestCount: Math.max(0, a.removeArmrestCount - 1) }))}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-4 text-center text-sm font-bold">{addons.removeArmrestCount}</span>
          <button onClick={() => setAddons((a) => ({ ...a, removeArmrestCount: Math.min(2, a.removeArmrestCount + 1) }))}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* USB */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">加裝 USB 充電（+1,500/組）</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setAddons((a) => ({ ...a, usbCount: Math.max(0, a.usbCount - 1) }))}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-4 text-center text-sm font-bold">{addons.usbCount}</span>
          <button onClick={() => setAddons((a) => ({ ...a, usbCount: a.usbCount + 1 }))}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 扣除標配 USB (LEO/OBA only) */}
      {["LEO", "OBA"].includes(product.displayName) && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--text-secondary)]">扣除標配 USB <span className="text-blue-500">-1,000</span></p>
          <button
            onClick={() => setAddons((a) => ({ ...a, removeStandardUsb: !a.removeStandardUsb }))}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${addons.removeStandardUsb ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--text-secondary)]"}`}
          >
            {addons.removeStandardUsb ? "✓ 已選" : "選取"}
          </button>
        </div>
      )}

      {/* 無線充電 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">加裝無線充電（+1,200/組）</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setAddons((a) => ({ ...a, wirelessChargeCount: Math.max(0, a.wirelessChargeCount - 1) }))}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-4 text-center text-sm font-bold">{addons.wirelessChargeCount}</span>
          <button onClick={() => setAddons((a) => ({ ...a, wirelessChargeCount: a.wirelessChargeCount + 1 }))}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 滑軌 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">
          加裝滑軌（+{addons.slideRailRatePerSeat.toLocaleString()}/座）
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setAddons((a) => ({ ...a, slideRailCount: Math.max(0, a.slideRailCount - 1) }))}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-4 text-center text-sm font-bold">{addons.slideRailCount}</span>
          <button onClick={() => setAddons((a) => ({ ...a, slideRailCount: a.slideRailCount + 1 }))}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 平台無置物 (BOOM/LEMON/MULE only) */}
      {["BOOM", "BOOMs", "LEMON", "MULE"].includes(product.displayName) && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--text-secondary)]">平台無置物 <span className="text-blue-500">-1,000</span></p>
          <button
            onClick={() => setAddons((a) => ({ ...a, platformNoStorage: !a.platformNoStorage }))}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${addons.platformNoStorage ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--text-secondary)]"}`}
          >
            {addons.platformNoStorage ? "✓ 已選" : "選取"}
          </button>
        </div>
      )}

      {/* Reset button */}
      {calcAddons(addons) !== 0 && (
        <button
          onClick={() => setAddons({ ...DEFAULT_ADDONS, slideRailRatePerSeat: getSlideRailRate(product.displayName) })}
          className="w-full rounded border border-[var(--border)] py-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        >
          重置進階選項
        </button>
      )}
    </div>
  )}
</div>
```

**注意：** `segBase`, `segActive`, `segInactive` 這三個 CSS 常數已在 `SofaQuoteClient` 原始碼中定義（line 151-153），可直接使用。

- [ ] **Step 4: TypeScript 型別檢查**

```bash
npx tsc --noEmit 2>&1 | grep -E "sofa-quote|SofaAddons" | head -20
```

Expected: 無錯誤

- [ ] **Step 5: Commit**

```bash
git add src/app/sofa-quote/SofaQuoteClient.tsx
git commit -m "feat(sofa-quote): add 進階選項 collapsible panel with all POS add-ons"
```

---

## Task 4: 移除 POS tab，廢棄 `/pos-quote` 頁面

**Files:**
- Modify: `src/app/sofa-quote/QuotePageClient.tsx`
- Modify: `src/app/pos-quote/page.tsx`

- [ ] **Step 1: 簡化 QuotePageClient — 移除 POS tab**

將 `src/app/sofa-quote/QuotePageClient.tsx` 完整替換為：

```typescript
"use client";

import { SofaQuoteClient } from "@/app/sofa-quote/SofaQuoteClient";

export function QuotePageClient() {
  return <SofaQuoteClient />;
}
```

- [ ] **Step 2: 更新 `/pos-quote` 為 redirect**

將 `src/app/pos-quote/page.tsx` 完整替換為：

```typescript
import { redirect } from "next/navigation";

export default function PosQuotePage() {
  redirect("/sofa-quote");
}
```

- [ ] **Step 3: 確認 TypeScript 無錯**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 無錯誤

- [ ] **Step 4: 確認所有測試仍通過**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/sofa-quote/QuotePageClient.tsx src/app/pos-quote/page.tsx
git commit -m "feat(sofa-quote): remove POS tab, redirect /pos-quote to /sofa-quote"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 加附加選項 UI（落地、扶手、USB、無線充電、滑軌、高度削減、平台無置物）
- ✅ 附加費計入報價文字
- ✅ 移除 POS tab
- ✅ `/pos-quote` redirect
- ✅ 測試覆蓋 `calcAddons` 所有路徑

**2. Placeholder scan:** 無

**3. Type consistency:**
- `SofaAddons` 定義於 Task 1，Task 2/3 直接使用 — ✅
- `DEFAULT_ADDONS` 定義於 Task 1，Task 3 import — ✅
- `getSlideRailRate` 定義於 Task 1，Task 3 import — ✅
- `buildQuoteOutput` 的第 6 個參數 `addons?: SofaAddons` 於 Task 2 加入，Task 3 傳入 — ✅
