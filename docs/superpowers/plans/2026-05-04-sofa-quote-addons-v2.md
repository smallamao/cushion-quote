# 尺寸報價補齊進階選項（改扶手 / 改背枕 / 改置物平台）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 POS 報價的改扶手（14款左右各選 + 寬度/置物/枕心）、改背枕（+$500/座）、改置物平台（+$1,500 手續費）完整移植到尺寸報價的進階選項。

**Architecture:** 新建 `src/lib/sofa-addons-config.ts` 存放靜態設定（扶手列表、相容矩陣、背枕款式、置物平台款式）；擴充 `SofaAddons` 介面加入新欄位；`calcAddons` 接受 `seatCount` 和 `armCost` 額外參數；`SofaQuoteClient` 新增 改扶手 獨立折疊區塊，並在現有 進階選項 內加入 改背枕、改置物平台。

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, Tailwind CSS (CSS variables)

---

## File Map

| 檔案 | 動作 | 說明 |
|------|------|------|
| `src/lib/sofa-addons-config.ts` | Create | 靜態扶手/背枕/平台設定 + `calcArmCost` + `getArmCompat` |
| `src/lib/sofa-quote-data.ts` | Modify | 擴充 `SofaAddons`，更新 `calcAddons`/`buildQuoteOutput` |
| `src/app/sofa-quote/SofaQuoteClient.tsx` | Modify | 新增 改扶手 區塊 + 改背枕/改置物平台 UI |
| `src/__tests__/sofa-addons-config.test.ts` | Create | `calcArmCost` 單元測試 |
| `src/__tests__/sofa-quote-addons.test.ts` | Modify | 補充新 `calcAddons` 行為測試 |

---

## Context

### 現有 SofaAddons（`src/lib/sofa-quote-data.ts` 約 line 187）

```typescript
export interface SofaAddons {
  groundOption: "none" | "half" | "full"
  heightReduction: boolean
  removeArmrestCount: number
  usbCount: number
  removeStandardUsb: boolean
  wirelessChargeCount: number
  slideRailCount: number
  slideRailRatePerSeat: number
  platformNoStorage: boolean
}
```

`calcAddons(addons: SofaAddons): number` — 固定費率加總，不含外部資料。

`buildQuoteOutput(product, grade, inputWidth, seatCount, basePrice, addons?): QuoteOutput`

### 現有 SofaQuoteClient（`src/app/sofa-quote/SofaQuoteClient.tsx`）

已有：
- `addons` state（`useState<SofaAddons>(DEFAULT_ADDONS)`）
- `addonTotal = useMemo(() => calcAddons(addons), [addons])`
- `handleQuote()` 傳 `addons` 給 `buildQuoteOutput`
- 進階選項折疊面板（含 桶身落地/高度削減/扶手移除/USB/無線充電/滑軌/平台無置物）
- `segBase`, `segActive`, `segInactive` CSS 常數（line 151-153）

### 費率（全靜態）

| 項目 | 費用 |
|------|------|
| 改扶手 | 每側：各扶手款式的 `total_fee`（500~1,500） |
| 改背枕 | +500 / 座（沙發幾座就乘幾） |
| 改置物平台 | +1,500 工費（固定） |

---

## Task 1: 建立 `src/lib/sofa-addons-config.ts`

**Files:**
- Create: `src/lib/sofa-addons-config.ts`
- Create: `src/__tests__/sofa-addons-config.test.ts`

- [ ] **Step 1: 寫失敗測試**

新建 `src/__tests__/sofa-addons-config.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { calcArmCost, getArmCompat } from "@/lib/sofa-addons-config";

describe("calcArmCost", () => {
  it("none → 0", () => {
    expect(calcArmCost("none", "", "")).toBe(0);
  });
  it("both_same ELEC → 1000 (500×2)", () => {
    expect(calcArmCost("both_same", "ELEC", "ELEC")).toBe(1000);
  });
  it("both_same OBA → 2000 (1000×2)", () => {
    expect(calcArmCost("both_same", "OBA", "OBA")).toBe(2000);
  });
  it("left_only HAILY → 1500", () => {
    expect(calcArmCost("left_only", "HAILY", "")).toBe(1500);
  });
  it("right_only BOOM → 700", () => {
    expect(calcArmCost("right_only", "", "BOOM")).toBe(700);
  });
  it("both_different ELEC+MIKO → 500+800=1300", () => {
    expect(calcArmCost("both_different", "ELEC", "MIKO")).toBe(1300);
  });
  it("unknown code → 0 per side", () => {
    expect(calcArmCost("left_only", "UNKNOWN", "")).toBe(0);
  });
});

describe("getArmCompat", () => {
  it("MULE × BLT → true", () => {
    expect(getArmCompat("MULE", "BLT")?.compatible).toBe(true);
  });
  it("BJ × ELEC → false", () => {
    expect(getArmCompat("BJ", "ELEC")?.compatible).toBe(false);
  });
  it("unknown style → null", () => {
    expect(getArmCompat("ZZZZZ", "ELEC")).toBeNull();
  });
});
```

- [ ] **Step 2: 確認測試失敗**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx vitest run src/__tests__/sofa-addons-config.test.ts 2>&1 | tail -10
```

Expected: FAIL（模組不存在）

- [ ] **Step 3: 建立 `src/lib/sofa-addons-config.ts`**

```typescript
// ─── Types ────────────────────────────────────────────────────────────────────

export type ArmMode = "none" | "both_same" | "both_different" | "left_only" | "right_only"

export interface ArmrestOption {
  code: string
  name: string
  default_width: number
  customizable_width: boolean
  min_width: number
  max_width: number
  has_storage_option: boolean
  storage_default: boolean
  has_pillow: boolean
  pillow_default: string | null
  total_fee: number
}

export interface ArmCompatEntry {
  compatible: boolean | null
  note?: string
}

// ─── Armrest Options ──────────────────────────────────────────────────────────

export const ARMREST_OPTIONS: ArmrestOption[] = [
  { code: "ELEC", name: "高壓電", default_width: 17, customizable_width: false, min_width: 17, max_width: 17, has_storage_option: false, storage_default: true, has_pillow: false, pillow_default: null, total_fee: 500 },
  { code: "AMY",  name: "艾米",   default_width: 15, customizable_width: true,  min_width: 10, max_width: 25, has_storage_option: false, storage_default: true, has_pillow: false, pillow_default: null, total_fee: 500 },
  { code: "BLT",  name: "安格斯", default_width: 19, customizable_width: false, min_width: 19, max_width: 19, has_storage_option: false, storage_default: true, has_pillow: false, pillow_default: null, total_fee: 500 },
  { code: "BOOM", name: "爆發力", default_width: 27, customizable_width: true,  min_width: 10, max_width: 27, has_storage_option: true,  storage_default: true, has_pillow: false, pillow_default: null, total_fee: 700 },
  { code: "MIKO", name: "米可",   default_width: 25, customizable_width: true,  min_width: 20, max_width: 25, has_storage_option: false, storage_default: true, has_pillow: true,  pillow_default: "絲棉",       total_fee: 800 },
  { code: "JIMMY",name: "吉米",   default_width: 20, customizable_width: false, min_width: 20, max_width: 20, has_storage_option: false, storage_default: true, has_pillow: true,  pillow_default: "二合一羽毛", total_fee: 800 },
  { code: "LEO",  name: "里歐",   default_width: 29, customizable_width: false, min_width: 29, max_width: 29, has_storage_option: false, storage_default: true, has_pillow: false, pillow_default: null, total_fee: 700 },
  { code: "OBA",  name: "歐巴",   default_width: 29, customizable_width: false, min_width: 29, max_width: 29, has_storage_option: false, storage_default: true, has_pillow: true,  pillow_default: "二合一羽毛", total_fee: 1000 },
  { code: "GALI", name: "咖哩",   default_width: 17, customizable_width: false, min_width: 17, max_width: 17, has_storage_option: false, storage_default: true, has_pillow: false, pillow_default: null, total_fee: 500 },
  { code: "BSK",  name: "巴斯克", default_width: 20, customizable_width: true,  min_width: 15, max_width: 20, has_storage_option: false, storage_default: true, has_pillow: false, pillow_default: null, total_fee: 500 },
  { code: "LEMON",name: "雷夢",   default_width: 10, customizable_width: false, min_width: 10, max_width: 10, has_storage_option: false, storage_default: true, has_pillow: false, pillow_default: null, total_fee: 500 },
  { code: "MULE", name: "沐樂",   default_width: 17, customizable_width: false, min_width: 17, max_width: 17, has_storage_option: false, storage_default: true, has_pillow: false, pillow_default: null, total_fee: 500 },
  { code: "MULO", name: "沐落",   default_width: 17, customizable_width: false, min_width: 17, max_width: 17, has_storage_option: false, storage_default: true, has_pillow: false, pillow_default: null, total_fee: 500 },
  { code: "HAILY",name: "海力",   default_width: 27, customizable_width: false, min_width: 27, max_width: 27, has_storage_option: false, storage_default: true, has_pillow: false, pillow_default: null, total_fee: 1500 },
]

export const PILLOW_FILL_OPTIONS = ["絲棉", "珍珠棉", "二合一羽毛"] as const

// ─── Armrest Compatibility ────────────────────────────────────────────────────

export const ARMREST_COMPAT: Record<string, Record<string, ArmCompatEntry>> = {"ELEC":{"ELEC":{"compatible":true,"note":"原廠扶手"},"POINT":{"compatible":false,"note":"不可改"},"BLT":{"compatible":true,"note":"深減3"},"MIKO":{"compatible":null,"note":"待確認"},"BOOM":{"compatible":null,"note":"待確認"},"AMY":{"compatible":null,"note":"待確認"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":null,"note":"待確認"},"LEO":{"compatible":null,"note":"待確認"},"OBA":{"compatible":null,"note":"待確認"},"GALI":{"compatible":null,"note":"待確認"},"ICE":{"compatible":false,"note":"不可改"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":null,"note":"待確認"},"FLA":{"compatible":false,"note":"不可改"},"BJ":{"compatible":false,"note":"不可改"},"AMI":{"compatible":false,"note":"不可改"},"EDSON":{"compatible":false,"note":"不可改"},"MULO":{"compatible":null,"note":"待確認"}},"LEMON":{"LEMON":{"compatible":true,"note":"原廠扶手"},"BOOM":{"compatible":true,"note":"正"},"MIKO":{"compatible":true,"note":"正"},"GALI":{"compatible":true,"note":"深加4"}},"MULE":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":true,"note":"深加11.5"},"MIKO":{"compatible":true,"note":"深加8"},"BOOM":{"compatible":true,"note":"深加6 高減6"},"AMY":{"compatible":true,"note":"深加8 高加3"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"深加8"},"LEO":{"compatible":true,"note":"深加10"},"OBA":{"compatible":true,"note":"深加10"},"GALI":{"compatible":true,"note":"深加6"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":true,"note":"深加9 缺口減17"},"MULE":{"compatible":true,"note":"原廠扶手 圓版型"},"MULO":{"compatible":true,"note":"沐落扶手 寬深正常 下框高減-12cm"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":true,"note":"深加6 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"}},"MULO":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":true,"note":"深加11.5"},"MIKO":{"compatible":true,"note":"深加8"},"BOOM":{"compatible":true,"note":"深加6 高減6"},"AMY":{"compatible":true,"note":"深加8"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"深加8"},"LEO":{"compatible":true,"note":"深加10"},"OBA":{"compatible":true,"note":"深加10"},"GALI":{"compatible":true,"note":"深加6"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":true,"note":"深加9 缺口減17"},"MULE":{"compatible":true,"note":"沐樂扶手 尺寸相同"},"MULO":{"compatible":true,"note":"原廠扶手"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":true,"note":"深加6 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"}},"GALI":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":true,"note":"深加4"},"BOOM":{"compatible":true,"note":"深正常 高減6"},"AMY":{"compatible":true,"note":"深加4"},"BSK":{"compatible":true,"note":"深減33"},"JIMMY":{"compatible":true,"note":"深加4"},"LEO":{"compatible":true,"note":"深加2"},"OBA":{"compatible":true,"note":"深減8"},"GALI":{"compatible":true,"note":"原廠扶手"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":true,"note":"深正常 缺口減17"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":true,"note":"深減4 高加3"},"ATR":{"compatible":true,"note":"深減2 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"ICE":{"ELEC":{"compatible":true,"note":"深加6"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":true,"note":"深加3"},"MIKO":{"compatible":true,"note":"正"},"BOOM":{"compatible":true,"note":"深正常 高減6"},"AMY":{"compatible":true,"note":"正"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"正"},"LEO":{"compatible":true,"note":"正"},"OBA":{"compatible":true,"note":"深減10"},"GALI":{"compatible":true,"note":"正"},"ICE":{"compatible":true,"note":"原廠扶手"},"LEMON":{"compatible":true,"note":"深加1 缺口減17"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":true,"note":"深減6 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"MIKO":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":true,"note":"原廠扶手"},"BOOM":{"compatible":true,"note":"深減2.5 高減6"},"AMY":{"compatible":true,"note":"正"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"正"},"LEO":{"compatible":true,"note":"深加2"},"OBA":{"compatible":true,"note":"深減8"},"GALI":{"compatible":true,"note":"正"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":true,"note":"深減2.5 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"JIMMY":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":true,"note":"正"},"BOOM":{"compatible":true,"note":"深減2.5 高減6"},"AMY":{"compatible":true,"note":"正"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"原廠扶手"},"LEO":{"compatible":true,"note":"深加2"},"OBA":{"compatible":true,"note":"深減8"},"GALI":{"compatible":true,"note":"正"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":true,"note":"深減2.5 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"AMY":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":true,"note":"正"},"BOOM":{"compatible":true,"note":"深減2.5 高減6"},"AMY":{"compatible":true,"note":"原廠扶手"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"正"},"LEO":{"compatible":true,"note":"深加2"},"OBA":{"compatible":true,"note":"深減8"},"GALI":{"compatible":true,"note":"正"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":true,"note":"深減2.5 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"LEO":{"ELEC":{"compatible":true,"note":"深加9 高加3"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":true,"note":"深加2 高加2"},"MIKO":{"compatible":true,"note":"深減2"},"BOOM":{"compatible":true,"note":"深減4.5 高減6"},"AMY":{"compatible":true,"note":"深減2"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"深減2"},"LEO":{"compatible":true,"note":"原廠扶手"},"OBA":{"compatible":true,"note":"深減10"},"GALI":{"compatible":true,"note":"正"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":true,"note":"深減2.5 缺口減14"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":true,"note":"深減4.5 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"BJ":{"ELEC":{"compatible":false,"note":"不支援"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":false,"note":"不支援"},"MIKO":{"compatible":false,"note":"不支援"},"BOOM":{"compatible":false,"note":"不支援"},"AMY":{"compatible":false,"note":"不支援"},"BSK":{"compatible":false,"note":"不支援"},"JIMMY":{"compatible":false,"note":"不支援"},"LEO":{"compatible":false,"note":"不支援"},"OBA":{"compatible":false,"note":"不支援"},"GALI":{"compatible":false,"note":"不支援"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":false,"note":"不支援"},"MULE":{"compatible":false,"note":"不支援"},"HAILY":{"compatible":false,"note":"不支援"},"ATR":{"compatible":false,"note":"不支援"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":true,"note":"原廠扶手"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":false,"note":"沐落扶手 (同沐樂 不支援)"}},"OBA":{"ELEC":{"compatible":true,"note":"深加19 高加3"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":true,"note":"深加12 高加2"},"MIKO":{"compatible":true,"note":"深加8"},"BOOM":{"compatible":true,"note":"深加5.5 高減6"},"AMY":{"compatible":true,"note":"深加8"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"深加8"},"LEO":{"compatible":true,"note":"深加10"},"OBA":{"compatible":true,"note":"原廠扶手"},"GALI":{"compatible":null,"note":"待確認"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":true,"note":"深加3 高加3"},"ATR":{"compatible":true,"note":"深加5.5 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"BOOM":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":true,"note":"深加2.5 高加6"},"BOOM":{"compatible":true,"note":"原廠扶手"},"AMY":{"compatible":true,"note":"深加2.5 高加6"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"深加2.5 高加6"},"LEO":{"compatible":true,"note":"深加4 高加5"},"OBA":{"compatible":true,"note":"深減6 高加5"},"GALI":{"compatible":true,"note":"深加3 高加6"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":true,"note":"正"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"ATR":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":true,"note":"深加2.5 高加6"},"BOOM":{"compatible":true,"note":"正"},"AMY":{"compatible":true,"note":"深加2.5 高加6"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"深加2.5 高加6"},"LEO":{"compatible":true,"note":"深加5 高加5"},"OBA":{"compatible":true,"note":"深減5 高加5"},"GALI":{"compatible":true,"note":"深加3 高加6"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":true,"note":"原廠扶手"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"BLT":{"ELEC":{"compatible":true,"note":"深加3"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":true,"note":"原廠扶手"},"MIKO":{"compatible":true,"note":"深減4"},"BOOM":{"compatible":true,"note":"深減5.5 高減6"},"AMY":{"compatible":true,"note":"深減4"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"深減4"},"LEO":{"compatible":null,"note":"待確認"},"OBA":{"compatible":null,"note":"待確認"},"GALI":{"compatible":true,"note":"深減6"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":true,"note":"深減3 缺口減11"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":true,"note":"深減5.5 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"POINT":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":true,"note":"原廠扶手"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":true,"note":"正"},"BOOM":{"compatible":null,"note":"待確認"},"AMY":{"compatible":true,"note":"正"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"正"},"LEO":{"compatible":null,"note":"待確認"},"OBA":{"compatible":null,"note":"待確認"},"GALI":{"compatible":true,"note":"高加6"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":null,"note":"待確認"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"BSK":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":true,"note":"深加37"},"BOOM":{"compatible":true,"note":"深加36.5 高減6"},"AMY":{"compatible":true,"note":"深加37"},"BSK":{"compatible":true,"note":"原廠扶手"},"JIMMY":{"compatible":true,"note":"深加37"},"LEO":{"compatible":null,"note":"待確認"},"OBA":{"compatible":null,"note":"待確認"},"GALI":{"compatible":null,"note":"待確認"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":true,"note":"深加32 高加3"},"ATR":{"compatible":true,"note":"深加36.5 高減6"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"EDSON":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":true,"note":"深+3cm"},"MIKO":{"compatible":true,"note":"深減5"},"BOOM":{"compatible":null,"note":"待確認"},"AMY":{"compatible":true,"note":"深減5"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"深減5"},"LEO":{"compatible":null,"note":"待確認"},"OBA":{"compatible":null,"note":"待確認"},"GALI":{"compatible":null,"note":"待確認"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":null,"note":"待確認"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":true,"note":"原廠扶手"},"MULO":{"compatible":null,"note":"待確認"}},"HAILY":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":null,"note":"待確認"},"BOOM":{"compatible":null,"note":"待確認"},"AMY":{"compatible":null,"note":"待確認"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":null,"note":"待確認"},"LEO":{"compatible":null,"note":"待確認"},"OBA":{"compatible":null,"note":"待確認"},"GALI":{"compatible":null,"note":"待確認"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":true,"note":"原廠扶手"},"ATR":{"compatible":null,"note":"待確認"},"FLA":{"compatible":null,"note":"待確認"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"AMI":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":true,"note":"正"},"BOOM":{"compatible":null,"note":"待確認"},"AMY":{"compatible":true,"note":"正"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"正"},"LEO":{"compatible":true,"note":"深加2"},"OBA":{"compatible":true,"note":"深減8"},"GALI":{"compatible":null,"note":"待確認"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":null,"note":"待確認"},"FLA":{"compatible":false,"note":"不支援"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":true,"note":"原廠扶手"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}},"FLA":{"ELEC":{"compatible":null,"note":"待確認"},"POINT":{"compatible":false,"note":"不支援"},"BLT":{"compatible":null,"note":"待確認"},"MIKO":{"compatible":true,"note":"深加2.5"},"BOOM":{"compatible":null,"note":"待確認"},"AMY":{"compatible":true,"note":"深加2.5"},"BSK":{"compatible":null,"note":"待確認"},"JIMMY":{"compatible":true,"note":"深加2.5"},"LEO":{"compatible":null,"note":"待確認"},"OBA":{"compatible":null,"note":"待確認"},"GALI":{"compatible":null,"note":"待確認"},"ICE":{"compatible":false,"note":"不支援"},"LEMON":{"compatible":null,"note":"待確認"},"MULE":{"compatible":null,"note":"待確認"},"HAILY":{"compatible":null,"note":"待確認"},"ATR":{"compatible":null,"note":"待確認"},"FLA":{"compatible":true,"note":"原廠扶手"},"BJ":{"compatible":false,"note":"不支援"},"AMI":{"compatible":false,"note":"不支援"},"EDSON":{"compatible":false,"note":"不支援"},"MULO":{"compatible":null,"note":"待確認"}}}

// ─── Backrest Config ──────────────────────────────────────────────────────────

/** 可選擇的背枕款式 */
export const BACKREST_STYLES = ["POINT", "GALI", "ICE", "MIKO", "BOOM"] as const
export type BackrestStyle = typeof BACKREST_STYLES[number]

/** 支援改背枕的沙發款式（用 product.displayName 比對） */
export const BACKREST_COMPATIBLE_STYLES = [
  "POINT", "GALI", "BSK", "ICE", "MIKO", "BOOM", "OBA", "AMI", "AMY", "JIMMY", "ATR",
]

// ─── Platform Storage Config ──────────────────────────────────────────────────

export interface PlatformStorageStyle {
  code: string
  name: string
  standardWidth: number
  standardDepth: number
}

export const PLATFORM_STORAGE_STYLES: PlatformStorageStyle[] = [
  { code: "BOOM",  name: "爆發力", standardWidth: 80, standardDepth: 96 },
  { code: "ATR",   name: "吸引力", standardWidth: 80, standardDepth: 96 },
  { code: "MULE",  name: "沐樂",   standardWidth: 76, standardDepth: 82 },
  { code: "LEMON", name: "雷夢",   standardWidth: 85, standardDepth: 85 },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function calcArmCost(
  armMode: ArmMode,
  leftCode: string,
  rightCode: string,
): number {
  if (armMode === "none") return 0;
  const sides =
    armMode === "both_same"      ? [leftCode, leftCode]
    : armMode === "both_different" ? [leftCode, rightCode]
    : armMode === "left_only"      ? [leftCode]
    : /* right_only */               [rightCode];
  return sides.filter(Boolean).reduce((sum, code) => {
    const opt = ARMREST_OPTIONS.find((o) => o.code === code);
    return sum + (opt?.total_fee ?? 0);
  }, 0);
}

export function getArmCompat(
  styleCode: string,
  armCode: string,
): ArmCompatEntry | null {
  return ARMREST_COMPAT[styleCode]?.[armCode] ?? null;
}
```

- [ ] **Step 4: 確認測試通過**

```bash
npx vitest run src/__tests__/sofa-addons-config.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 10/10 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sofa-addons-config.ts src/__tests__/sofa-addons-config.test.ts
git commit -m "feat(sofa-quote): add sofa-addons-config with armrest/backrest/platform data + calcArmCost"
```

---

## Task 2: 擴充 `SofaAddons` + 更新 `calcAddons` / `buildQuoteOutput`

**Files:**
- Modify: `src/lib/sofa-quote-data.ts`
- Modify: `src/__tests__/sofa-quote-addons.test.ts`

**說明：**
- `SofaAddons` 新增 11 個欄位（改扶手 × 9 + 改背枕 × 2 + 改置物平台 × 4）
- `calcAddons(addons, seatCount = 3, armCost = 0)` — 新增 seatCount 和 armCost 參數（向後相容，default 讓現有測試繼續通過）
- `buildQuoteOutput` 新增第 7 個可選參數 `armCost = 0`；在進階選項段落補充 改扶手/改背枕/改置物平台 行

- [ ] **Step 1: 寫失敗測試**

在 `src/__tests__/sofa-quote-addons.test.ts` 末尾新增：

```typescript
import { DEFAULT_ADDONS } from "@/lib/sofa-quote-data";

describe("calcAddons — new params", () => {
  it("改背枕 with seatCount=3 → +1500", () => {
    expect(calcAddons({ ...DEFAULT_ADDONS, backrestChange: true, backrestTargetStyle: "GALI" }, 3, 0)).toBe(1500);
  });
  it("改背枕 with seatCount=2 → +1000", () => {
    expect(calcAddons({ ...DEFAULT_ADDONS, backrestChange: true, backrestTargetStyle: "GALI" }, 2, 0)).toBe(1000);
  });
  it("改置物平台 → +1500", () => {
    expect(calcAddons({ ...DEFAULT_ADDONS, changeStoragePlatform: true, storagePlatformStyle: "BOOM", storagePlatformWidthAdj: 0, storagePlatformDepthAdj: 0 }, 3, 0)).toBe(1500);
  });
  it("armCost 直接加入總計", () => {
    expect(calcAddons(DEFAULT_ADDONS, 3, 1400)).toBe(1400);
  });
  it("複合：半落地 + 改背枕 + armCost 700", () => {
    expect(calcAddons({ ...DEFAULT_ADDONS, groundOption: "half", backrestChange: true, backrestTargetStyle: "ICE" }, 3, 700)).toBe(1500 + 1500 + 700);
  });
});
```

- [ ] **Step 2: 確認測試失敗**

```bash
npx vitest run src/__tests__/sofa-quote-addons.test.ts 2>&1 | tail -10
```

Expected: FAIL（SofaAddons 缺新欄位）

- [ ] **Step 3: 更新 `SofaAddons` 介面、`DEFAULT_ADDONS`、`calcAddons`**

在 `src/lib/sofa-quote-data.ts` 中，找到 `SofaAddons` interface（約 line 187），整段替換為：

```typescript
export interface SofaAddons {
  // 既有選項
  groundOption: "none" | "half" | "full"
  heightReduction: boolean
  removeArmrestCount: number
  usbCount: number
  removeStandardUsb: boolean
  wirelessChargeCount: number
  slideRailCount: number
  /** Must be set via `getSlideRailRate(productCode)`. 800 for BOOM/BOOMs, 1000 for others. */
  slideRailRatePerSeat: number
  platformNoStorage: boolean
  // 改扶手
  armMode: "none" | "both_same" | "both_different" | "left_only" | "right_only"
  leftArmCode: string
  rightArmCode: string
  leftArmWidth: number
  rightArmWidth: number
  leftBoomStorage: boolean
  rightBoomStorage: boolean
  leftPillowFill: string
  rightPillowFill: string
  // 改背枕
  backrestChange: boolean
  backrestTargetStyle: string
  // 改置物平台
  changeStoragePlatform: boolean
  storagePlatformStyle: string
  storagePlatformWidthAdj: number
  storagePlatformDepthAdj: number
}
```

找到 `DEFAULT_ADDONS`，整段替換：

```typescript
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
  armMode: "none",
  leftArmCode: "",
  rightArmCode: "",
  leftArmWidth: 0,
  rightArmWidth: 0,
  leftBoomStorage: false,
  rightBoomStorage: false,
  leftPillowFill: "",
  rightPillowFill: "",
  backrestChange: false,
  backrestTargetStyle: "",
  changeStoragePlatform: false,
  storagePlatformStyle: "",
  storagePlatformWidthAdj: 0,
  storagePlatformDepthAdj: 0,
}
```

找到 `calcAddons` 函式，整段替換：

```typescript
export function calcAddons(addons: SofaAddons, seatCount = 3, armCost = 0): number {
  const groundCost = addons.groundOption === "full" ? PRICE_GROUND_FULL
    : addons.groundOption === "half" ? PRICE_GROUND_HALF : 0;
  const heightDiscount = addons.heightReduction ? PRICE_HEIGHT_REDUCTION : 0;
  const armrestDiscount = addons.removeArmrestCount * PRICE_ARMREST_REMOVAL;
  const usbCost = addons.usbCount * PRICE_USB;
  const removeUsbDiscount = addons.removeStandardUsb ? PRICE_REMOVE_STANDARD_USB : 0;
  const wirelessCost = addons.wirelessChargeCount * PRICE_WIRELESS;
  const slideRailCost = addons.slideRailCount * addons.slideRailRatePerSeat;
  const platformNoStorageDiscount = addons.platformNoStorage ? PRICE_PLATFORM_NO_STORAGE : 0;
  const backrestCost = addons.backrestChange ? 500 * seatCount : 0;
  const changeStorageFee = addons.changeStoragePlatform ? 1500 : 0;
  return groundCost + heightDiscount + armrestDiscount + usbCost
    + removeUsbDiscount + wirelessCost + slideRailCost + platformNoStorageDiscount
    + backrestCost + changeStorageFee + armCost;
}
```

- [ ] **Step 4: 更新 `buildQuoteOutput`**

找到 `buildQuoteOutput` 函式宣告，加入 `armCost = 0` 第 7 參數並更新進階選項段落：

函式簽章（找到現有宣告整行替換）：
```typescript
export function buildQuoteOutput(
  product: SofaProduct,
  grade: MaterialGrade,
  inputWidth: number,
  seatCount: number,
  basePrice: number,
  addons?: SofaAddons,
  armCost = 0,
): QuoteOutput {
```

找到 `const addonTotal = addons ? calcAddons(addons) : 0`，替換為：
```typescript
const addonTotal = addons ? calcAddons(addons, seatCount, armCost) : 0
```

找到 `if (addons && addonTotal !== 0) {` 段落，在既有項目（platformNoStorage 那行）之後，在 `}` 結束之前插入：

```typescript
    if (addons.backrestChange && addons.backrestTargetStyle) {
      const cost = 500 * seatCount;
      copyLines.push(`改背枕（${addons.backrestTargetStyle}）+${fmtAmount(cost)}`);
    }
    if (addons.changeStoragePlatform && addons.storagePlatformStyle) {
      copyLines.push(`改置物平台（${addons.storagePlatformStyle}）+1,500`);
    }
    if (armCost > 0) {
      copyLines.push(`改扶手 +${fmtAmount(armCost)}`);
    }
```

- [ ] **Step 5: 確認測試通過**

```bash
npx vitest run src/__tests__/sofa-quote-addons.test.ts --reporter=verbose 2>&1 | tail -25
```

Expected: 全部 PASS（舊 19 + 新 5 = 24 個）

- [ ] **Step 6: 確認所有測試無影響**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: 所有測試通過（原有 2 個預存失敗仍在，不新增失敗）

- [ ] **Step 7: Commit**

```bash
git add src/lib/sofa-quote-data.ts src/__tests__/sofa-quote-addons.test.ts
git commit -m "feat(sofa-quote): extend SofaAddons with armrest/backrest/platform fields, update calcAddons + buildQuoteOutput"
```

---

## Task 3: 改扶手 UI 區塊（SofaQuoteClient）

**Files:**
- Modify: `src/app/sofa-quote/SofaQuoteClient.tsx`

**說明：** 在尺寸報價主表單的「進階選項」折疊面板之前，新增一個獨立的「改扶手」折疊卡片。卡片內有：模式選擇（PillRow）、左側扶手 Panel（ArmPanel）、右側扶手 Panel（如果需要）、費用摘要。

- [ ] **Step 1: 更新 import**

找到現有的 `@/lib/sofa-quote-data` import 行，加入 `ArmMode` 類型（`type ArmMode` from `@/lib/sofa-quote-data` — 注意：`ArmMode` 在 Task 2 中加入 SofaAddons 為 inline literal union，不需另外 export 但 UI 需要用到類型）。

新增 import 行（在現有 import 之後）：

```typescript
import {
  ARMREST_OPTIONS,
  PILLOW_FILL_OPTIONS,
  calcArmCost,
  getArmCompat,
  type ArmrestOption,
  type ArmCompatEntry,
} from "@/lib/sofa-addons-config";
```

- [ ] **Step 2: 新增 `ArmPanel` 子元件**

在 `SofaQuoteClient` 函式之前（`// ─── Main Component` 區塊之前），新增：

```tsx
// ─── Arm Panel ────────────────────────────────────────────────────────────────

function compatBadge(compatible: boolean | null) {
  if (compatible === true) return { text: "可搭配", cls: "text-green-600 bg-green-50" };
  if (compatible === false) return { text: "不可改", cls: "text-red-600 bg-red-50" };
  return { text: "待確認", cls: "text-amber-600 bg-amber-50" };
}

function ArmPanel({
  label, armCode, armWidth, boomStorage, pillowFill,
  compatEntry, onOpenPicker, onWidthChange, onBoomStorageChange, onPillowChange,
}: {
  label: string;
  armCode: string; armWidth: number; boomStorage: boolean; pillowFill: string;
  compatEntry: ArmCompatEntry | null;
  onOpenPicker: () => void;
  onWidthChange: (v: number) => void;
  onBoomStorageChange: (v: boolean) => void;
  onPillowChange: (v: string) => void;
}) {
  const opt = ARMREST_OPTIONS.find((o) => o.code === armCode);
  const badge = compatEntry ? compatBadge(compatEntry.compatible) : null;

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
      <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      <div className="flex items-center gap-2">
        <button onClick={onOpenPicker}
          className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)]">
          {opt ? `${opt.name}（${opt.default_width}cm）` : "選擇扶手款式"}
        </button>
        {badge && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
            {badge.text}
          </span>
        )}
      </div>
      {opt && (
        <div className="space-y-2">
          {opt.customizable_width && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">寬度 (cm)</span>
              <input type="number" value={armWidth} onChange={(e) => onWidthChange(Number(e.target.value))}
                min={opt.min_width} max={opt.max_width}
                className="w-20 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-center text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
            </div>
          )}
          {opt.has_storage_option && (
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={boomStorage} onChange={(e) => onBoomStorageChange(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]" />
              BOOM 置物
            </label>
          )}
          {opt.has_pillow && PILLOW_FILL_OPTIONS.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-[var(--text-tertiary)]">枕心填充</p>
              <div className="flex flex-wrap gap-1.5">
                {PILLOW_FILL_OPTIONS.map((p) => (
                  <button key={p} onClick={() => onPillowChange(p)}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      pillowFill === p ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
                    ].join(" ")}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {compatEntry?.note && (
            <p className="text-[10px] text-[var(--text-tertiary)]">{compatEntry.note}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 新增 state 變數 + 派生值 + selectArmStyle**

在 `SofaQuoteClient` 函式的 state 區塊（`const [showAddons, setShowAddons] = useState(false);` 之後）新增：

```typescript
const [showArmPanel, setShowArmPanel] = useState(false);
const [showLeftArmPicker, setShowLeftArmPicker] = useState(false);
const [showRightArmPicker, setShowRightArmPicker] = useState(false);
```

在 `const addonTotal = useMemo(...)` 之前新增：

```typescript
const effectiveRightCode = addons.armMode === "both_same" ? addons.leftArmCode : addons.rightArmCode;
const effectiveRightWidth = addons.armMode === "both_same" ? addons.leftArmWidth : addons.rightArmWidth;
const effectiveRightBoom = addons.armMode === "both_same" ? addons.leftBoomStorage : addons.rightBoomStorage;
const effectiveRightPillow = addons.armMode === "both_same" ? addons.leftPillowFill : addons.rightPillowFill;
const showLeft = addons.armMode !== "none" && addons.armMode !== "right_only";
const showRight = addons.armMode === "right_only" || addons.armMode === "both_different";

const leftCompat = getArmCompat(product.displayName, addons.leftArmCode);
const rightCompat = getArmCompat(product.displayName, effectiveRightCode);
const armCost = useMemo(
  () => calcArmCost(addons.armMode, addons.leftArmCode, effectiveRightCode),
  [addons.armMode, addons.leftArmCode, effectiveRightCode],
);
```

把現有的 `const addonTotal = useMemo(() => calcAddons(addons), [addons]);` 替換為：

```typescript
const addonTotal = useMemo(() => calcAddons(addons, seatCount, armCost), [addons, seatCount, armCost]);
```

把現有的 `handleQuote` 函式中的 `buildQuoteOutput(product, grade, inputWidth, seatCount, basePrice, addons)` 替換為：

```typescript
const result = buildQuoteOutput(product, grade, inputWidth, seatCount, basePrice, addons, armCost);
```

在 `handleProductSelect` 的 `setAddons((prev) => ({...}))` 呼叫中，加入：

```typescript
backrestChange: false,
backrestTargetStyle: "",
changeStoragePlatform: false,
storagePlatformStyle: "",
storagePlatformWidthAdj: 0,
storagePlatformDepthAdj: 0,
```

（保持現有的 `slideRailRatePerSeat`, `removeStandardUsb: false`, `platformNoStorage: false` 不動）

新增 `selectArmStyle` 函式（在 `handleProductSelect` 之後）：

```typescript
function selectArmStyle(side: "left" | "right", code: string) {
  const opt = ARMREST_OPTIONS.find((o) => o.code === code);
  if (!opt) return;
  const firstPillow = PILLOW_FILL_OPTIONS[0];
  const isMirror = addons.armMode === "both_same";
  const setLeft = side === "left" || isMirror;
  const setRight = side === "right" || isMirror;
  const updates: Partial<typeof addons> = {};
  if (setLeft) {
    updates.leftArmCode = code;
    updates.leftArmWidth = opt.default_width;
    updates.leftBoomStorage = opt.storage_default;
    updates.leftPillowFill = opt.has_pillow ? (opt.pillow_default ?? firstPillow) : "";
  }
  if (setRight) {
    updates.rightArmCode = code;
    updates.rightArmWidth = opt.default_width;
    updates.rightBoomStorage = opt.storage_default;
    updates.rightPillowFill = opt.has_pillow ? (opt.pillow_default ?? firstPillow) : "";
  }
  setAddons((prev) => ({ ...prev, ...updates }));
}
```

- [ ] **Step 4: 新增 ARM_MODES 常數**

在 `segBase`/`segActive`/`segInactive` 常數（約 line 151）之後，在 `return (` 之前新增：

```typescript
const ARM_MODES: Array<{ value: typeof addons.armMode; label: string }> = [
  { value: "none",           label: "無" },
  { value: "both_same",      label: "兩側相同" },
  { value: "both_different", label: "左右分開" },
  { value: "left_only",      label: "僅左側" },
  { value: "right_only",     label: "僅右側" },
];
```

- [ ] **Step 5: 新增 改扶手 UI 區塊**

在現有 `{/* Advanced options */}` 折疊面板之前（即 `進階選項` 的 `<div className="rounded-[var(--radius-md)] border...">` 之前）插入：

```tsx
{/* 改扶手 */}
<div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
  <button
    onClick={() => setShowArmPanel((v) => !v)}
    className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)]"
  >
    <span>改扶手</span>
    <span className="flex items-center gap-2">
      {armCost > 0 && (
        <span className="text-sm font-semibold text-red-500">
          +${fmtAmount(armCost)}
        </span>
      )}
      <span className="text-[var(--text-tertiary)]">{showArmPanel ? "▲" : "▼"}</span>
    </span>
  </button>

  {showArmPanel && (
    <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
      {/* 扶手模式 */}
      <div className="space-y-1">
        <p className="text-xs text-[var(--text-secondary)]">扶手模式</p>
        <div className="flex flex-wrap gap-1.5">
          {ARM_MODES.map((m) => (
            <button key={m.value}
              onClick={() => setAddons((prev) => ({ ...prev, armMode: m.value }))}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                addons.armMode === m.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
              ].join(" ")}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {showLeft && (
        <ArmPanel
          label={addons.armMode === "both_same" ? "扶手（兩側相同）" : addons.armMode === "both_different" ? "左側扶手" : "扶手"}
          armCode={addons.leftArmCode}
          armWidth={addons.leftArmWidth}
          boomStorage={addons.leftBoomStorage}
          pillowFill={addons.leftPillowFill}
          compatEntry={leftCompat}
          onOpenPicker={() => setShowLeftArmPicker(true)}
          onWidthChange={(v) => {
            const u: Partial<typeof addons> = { leftArmWidth: v };
            if (addons.armMode === "both_same") u.rightArmWidth = v;
            setAddons((prev) => ({ ...prev, ...u }));
          }}
          onBoomStorageChange={(v) => {
            const u: Partial<typeof addons> = { leftBoomStorage: v };
            if (addons.armMode === "both_same") u.rightBoomStorage = v;
            setAddons((prev) => ({ ...prev, ...u }));
          }}
          onPillowChange={(v) => {
            const u: Partial<typeof addons> = { leftPillowFill: v };
            if (addons.armMode === "both_same") u.rightPillowFill = v;
            setAddons((prev) => ({ ...prev, ...u }));
          }}
        />
      )}

      {showRight && (
        <ArmPanel
          label="右側扶手"
          armCode={addons.rightArmCode}
          armWidth={effectiveRightWidth}
          boomStorage={effectiveRightBoom}
          pillowFill={effectiveRightPillow}
          compatEntry={rightCompat}
          onOpenPicker={() => setShowRightArmPicker(true)}
          onWidthChange={(v) => setAddons((prev) => ({ ...prev, rightArmWidth: v }))}
          onBoomStorageChange={(v) => setAddons((prev) => ({ ...prev, rightBoomStorage: v }))}
          onPillowChange={(v) => setAddons((prev) => ({ ...prev, rightPillowFill: v }))}
        />
      )}

      {addons.armMode !== "none" && armCost > 0 && (
        <div className="rounded-[var(--radius-md)] bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          改扶手費用：${fmtAmount(armCost)}
        </div>
      )}
    </div>
  )}
</div>

{/* ActionSheetPicker for arm styles — 放在此處（section 內）或 pickers 區塊均可，推薦放在最後的 pickers 區塊 */}
```

- [ ] **Step 6: 新增扶手款式 ActionSheetPicker**

在現有 `{/* Pickers */}` 區塊中（含 `ActionSheetPicker open={showProductPicker}` 和 `ActionSheetPicker open={showGradePicker}` 的地方），追加：

```tsx
<ActionSheetPicker
  open={showLeftArmPicker}
  title="左側扶手款式"
  options={ARMREST_OPTIONS}
  getLabel={(o) => `${o.name}（${o.default_width}cm）$${o.total_fee.toLocaleString()}`}
  onSelect={(o, _) => { selectArmStyle("left", o.code); }}
  onClose={() => setShowLeftArmPicker(false)}
/>
<ActionSheetPicker
  open={showRightArmPicker}
  title="右側扶手款式"
  options={ARMREST_OPTIONS}
  getLabel={(o) => `${o.name}（${o.default_width}cm）$${o.total_fee.toLocaleString()}`}
  onSelect={(o, _) => { selectArmStyle("right", o.code); }}
  onClose={() => setShowRightArmPicker(false)}
/>
```

注意：現有的 `ActionSheetPicker` 在 `SofaQuoteClient.tsx` 的 `onSelect` 第二參數是 `(item, idx)`，但 sofa-addons-config 版本只需 code。確認 SofaQuoteClient 的 `ActionSheetPicker` 定義的 `onSelect` 類型，若簽章為 `(item: T, idx: number) => void` 則傳 `(o, _)` 即可。

- [ ] **Step 7: TypeScript 型別檢查**

```bash
npx tsc --noEmit 2>&1 | grep -E "SofaQuote|SofaAddons|sofa-quote|armrest" | head -20
```

Expected: 無錯誤

- [ ] **Step 8: Commit**

```bash
git add src/app/sofa-quote/SofaQuoteClient.tsx
git commit -m "feat(sofa-quote): add 改扶手 collapsible section with ArmPanel + compat badges"
```

---

## Task 4: 改背枕 + 改置物平台 加入「進階選項」面板

**Files:**
- Modify: `src/app/sofa-quote/SofaQuoteClient.tsx`

**說明：** 在現有「進階選項」折疊面板的子項目最後（`重置進階選項` 按鈕之前）加入 改背枕 和 改置物平台 兩個選項。

- [ ] **Step 1: 補充 import**

更新 `@/lib/sofa-addons-config` import（已在 Task 3 建立），加入新的 export：

```typescript
import {
  ARMREST_OPTIONS,
  PILLOW_FILL_OPTIONS,
  BACKREST_COMPATIBLE_STYLES,
  BACKREST_STYLES,
  PLATFORM_STORAGE_STYLES,
  calcArmCost,
  getArmCompat,
  type ArmrestOption,
  type ArmCompatEntry,
} from "@/lib/sofa-addons-config";
```

- [ ] **Step 2: 新增 picker state**

在現有 `const [showLeftArmPicker, ...]` 之後新增：

```typescript
const [showBackrestPicker, setShowBackrestPicker] = useState(false);
const [showPlatformStylePicker, setShowPlatformStylePicker] = useState(false);
```

- [ ] **Step 3: 在進階選項面板加入 改背枕 + 改置物平台**

找到進階選項面板中「重置進階選項」按鈕的 `{calcAddons(addonTotal) !== 0 && ...}` 條件（或直接找 `重置進階選項` 文字），在其之前插入：

```tsx
{/* 改背枕 */}
{BACKREST_COMPATIBLE_STYLES.includes(product.displayName) && (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-[var(--text-secondary)]">改背枕</p>
        <p className="text-[10px] text-red-500">+500/座（共 {seatCount} 座 = +{(500 * seatCount).toLocaleString()}）</p>
      </div>
      <input type="checkbox" checked={addons.backrestChange}
        onChange={(e) => setAddons((prev) => ({
          ...prev,
          backrestChange: e.target.checked,
          backrestTargetStyle: e.target.checked ? prev.backrestTargetStyle : "",
        }))}
        className="h-5 w-5 rounded border-[var(--border)] accent-[var(--accent)]" />
    </div>
    {addons.backrestChange && (
      <button onClick={() => setShowBackrestPicker(true)}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)]">
        {addons.backrestTargetStyle || "選擇背枕款式"}
      </button>
    )}
  </div>
)}

{/* 改置物平台 */}
{PLATFORM_STORAGE_STYLES.length > 0 && (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-[var(--text-secondary)]">改置物平台款式</p>
        <p className="text-[10px] text-red-500">+手續費 1,500</p>
      </div>
      <input type="checkbox" checked={addons.changeStoragePlatform}
        onChange={(e) => setAddons((prev) => ({
          ...prev,
          changeStoragePlatform: e.target.checked,
          storagePlatformStyle: e.target.checked ? prev.storagePlatformStyle : "",
          storagePlatformWidthAdj: 0,
          storagePlatformDepthAdj: 0,
        }))}
        className="h-5 w-5 rounded border-[var(--border)] accent-[var(--accent)]" />
    </div>
    {addons.changeStoragePlatform && (
      <div className="space-y-2">
        <button onClick={() => setShowPlatformStylePicker(true)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)]">
          {addons.storagePlatformStyle
            ? `${PLATFORM_STORAGE_STYLES.find((p) => p.code === addons.storagePlatformStyle)?.name ?? addons.storagePlatformStyle}`
            : "選擇平台款式"}
        </button>
        {addons.storagePlatformStyle && (() => {
          const base = PLATFORM_STORAGE_STYLES.find((p) => p.code === addons.storagePlatformStyle);
          return base ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-[var(--text-tertiary)]">平台寬調整（原 {base.standardWidth}cm）</p>
                <input type="number" value={base.standardWidth + addons.storagePlatformWidthAdj}
                  onChange={(e) => setAddons((prev) => ({ ...prev, storagePlatformWidthAdj: Number(e.target.value) - base.standardWidth }))}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-center text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-[var(--text-tertiary)]">平台深調整（原 {base.standardDepth}cm）</p>
                <input type="number" value={base.standardDepth + addons.storagePlatformDepthAdj}
                  onChange={(e) => setAddons((prev) => ({ ...prev, storagePlatformDepthAdj: Number(e.target.value) - base.standardDepth }))}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-center text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
              </div>
            </div>
          ) : null;
        })()}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: 加入背枕 + 平台款式 Picker**

在 `{/* Pickers */}` 區塊追加（在扶手 pickers 之後）：

```tsx
<ActionSheetPicker
  open={showBackrestPicker}
  title="背枕款式"
  options={[...BACKREST_STYLES]}
  getLabel={(s) => s}
  onSelect={(s, _) => setAddons((prev) => ({ ...prev, backrestTargetStyle: s }))}
  onClose={() => setShowBackrestPicker(false)}
/>
<ActionSheetPicker
  open={showPlatformStylePicker}
  title="置物平台款式"
  options={PLATFORM_STORAGE_STYLES}
  getLabel={(p) => `${p.name} ${p.standardWidth}×${p.standardDepth}cm`}
  onSelect={(p, _) => setAddons((prev) => ({ ...prev, storagePlatformStyle: p.code, storagePlatformWidthAdj: 0, storagePlatformDepthAdj: 0 }))}
  onClose={() => setShowPlatformStylePicker(false)}
/>
```

- [ ] **Step 5: TypeScript 型別檢查**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 無錯誤

- [ ] **Step 6: 確認全部測試通過**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: 所有現有測試仍通過

- [ ] **Step 7: Commit**

```bash
git add src/app/sofa-quote/SofaQuoteClient.tsx
git commit -m "feat(sofa-quote): add 改背枕 + 改置物平台 to 進階選項 panel"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 改扶手：14款、左右各選（兩側相同/左右分開/僅左/僅右）、寬度微調（AMY/BOOM/BSK/MIKO）、BOOM 置物、枕心填充（MIKO/JIMMY/OBA）
- ✅ 相容性徽章（可搭配/不可改/待確認）來自 ARMREST_COMPAT
- ✅ 改背枕：+$500/座、款式選擇（POINT/GALI/ICE/MIKO/BOOM）、僅支援相容款式
- ✅ 改置物平台：+$1,500 手續費、款式選擇（BOOM/ATR/MULE/LEMON）、寬/深微調
- ✅ 所有費用加入 `calcAddons` / `buildQuoteOutput` copyText
- ✅ 切換款式時重置 backrestChange、changeStoragePlatform

**2. Placeholder scan:** 無

**3. Type consistency:**
- `ArmMode` — inline union 在 SofaAddons，`calcArmCost` 使用相同字串
- `BACKREST_STYLES` — `as const` tuple，`backrestTargetStyle: string` 接受任意 string（picker 只會傳 tuple 值）
- `PLATFORM_STORAGE_STYLES` 的 `code` 對應 `storagePlatformStyle: string`（一致）
