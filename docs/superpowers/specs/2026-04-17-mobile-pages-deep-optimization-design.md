# 手機版操作 UI 優化 — Phase 2 全頁面深度優化

## 背景

Phase 1 已完成 Shell 層響應式（MobileDrawer、Header、觸控尺寸、斷點體系）。所有頁面現在可以在手機上導航，但各頁面的內容（表格、表單、下拉選單）仍是桌面佈局，在 375px 螢幕上不可用。

## 設計目標

- 所有列表頁面在 ≤768px 時自動切換為卡片式呈現
- 報價編輯器品項表格在手機上改為逐筆卡片
- ProductCombobox 在手機上全寬顯示
- 桌面版行為完全不變
- 不新增外部依賴

## 共用基礎元件

### useIsMobile hook

**新增：** `src/hooks/useIsMobile.ts`

監聽 `window.matchMedia('(max-width: 768px)')` 回傳 boolean。使用 `matchMedia` 而非 `resize` 事件，效能更好且與 CSS 斷點一致。

```ts
export function useIsMobile(): boolean
```

### ResponsiveList 元件

**不建立。** 每個頁面的卡片結構差異太大，統一包裝反而增加複雜度。各頁面直接用 `useIsMobile()` 條件渲染即可：

```tsx
const isMobile = useIsMobile();
return isMobile ? <MobileCards data={data} /> : <DesktopTable data={data} />;
```

---

## 1. 報價編輯器（QuoteEditor）

**影響檔案：** `src/components/quote-editor/QuoteEditor.tsx`
**新增檔案：** `src/components/quote-editor/MobileQuoteItemCard.tsx`

### 手機版品項卡片

每個報價品項在手機上渲染為獨立卡片，取代桌面版的 `<tr>` 行：

**卡片結構：**
```
┌─────────────────────────────┐
│ [序號]              [備註][刪除] │
├─────────────────────────────┤
│ 商品名稱                      │
│ [textarea, 全寬]              │
│                              │
│ 規格 / 材質                   │
│ [input, 全寬]                 │
│                              │
│ [數量]    [單位]    [單價]      │
│ (3 欄 grid)                   │
├─────────────────────────────┤
│ 小計                  $28,000 │
└─────────────────────────────┘

[展開時追加]
│ 備註 [textarea]               │
│ 成本/件 [input]（若啟用）      │
│ 參考圖片 [upload]             │
│ 規格圖片 [upload]             │
```

**設計決策：**
- 手機上隱藏拖曳排序（GripVertical）。排序操作在手機上不是高頻需求，暫不替代。
- 數量/單位/單價用 `grid-cols-3`，充分利用 343px 可用寬度（375px - 32px padding）。
- 備註/圖片區域預設收起，點擊備註按鈕展開。
- 刪除按鈕在卡片右上角，帶確認防誤觸。
- 所有輸入框使用已放大的全域觸控尺寸（Phase 1 的 44px）。

**MobileQuoteItemCard props：** 與現有 `SortableQuoteItemRow` 接收相同 props（item, index, expanded, onUpdateItem, onRemoveItem, onToggleExpand, onHandleImageUpload 等），只是渲染為卡片而非 `<tr>`。

**QuoteEditor 改動：**
- 在品項渲染區域加入 `useIsMobile()` 判斷
- 手機：渲染 `<div>` 容器 + `MobileQuoteItemCard` 列表
- 桌面：保持現有 `<table>` + `SortableQuoteItemRow`
- 拖曳排序（DnD）僅在桌面啟用
- 品項表格下方的按鈕列（Undo/Redo/Add/Calculator/Templates）：手機上改為只顯示 icon，文字隱藏

---

## 2. 報價紀錄（QuotesClient）

**影響檔案：** `src/app/quotes/QuotesClient.tsx`

### 手機版卡片

```
┌─────────────────────────────┐
│ Q-2026-0042          [已接受] │
│ 王先生 — 三人座沙發翻新        │
│ 2026/04/15                   │
│ $42,800          [✏️] [📋]  │
└─────────────────────────────┘
```

**卡片欄位：** 單號 + 狀態 badge、客戶名 + 方案名、日期、金額 + 操作按鈕（編輯/複製）

**篩選區改動：**
- 搜尋框保持全寬
- 狀態選擇器：桌面 inline select 不變；手機改為全寬 select
- 日期範圍：桌面 inline 不變；手機垂直堆疊

**刪除操作：** 移入卡片長按選單或編輯頁面，避免手機上誤觸。

---

## 3. 案件紀錄（CasesClient）

**影響檔案：** `src/app/cases/CasesClient.tsx`

### 手機版卡片

```
┌─────────────────────────────┐
│ 王先生家三人沙發       [進行中] │
│ 客戶：王先生                  │
│ 來源：門市                    │
│ 2026/04/10           [✏️]   │
└─────────────────────────────┘
  ▼ 點擊展開
  ┌───────────────────────────┐
  │ 報價版本                    │
  │  V1 已接受 $42,800         │
  │  V2 草稿   $38,000         │
  │ 採購成本                    │
  │  預估: $22,000  實際: $21,500│
  └───────────────────────────┘
```

**卡片欄位：** 案件名 + 狀態、客戶、來源、建立日期、編輯按鈕
**展開詳情：** 報價版本列表 + 採購成本摘要（已有的展開邏輯保留，只改渲染方式）
**隱藏欄位：** 最近送出日、下次追蹤日（次要，展開後可見）

---

## 4. 採購單列表（PurchasesClient）

**影響檔案：** `src/app/purchases/PurchasesClient.tsx`

### 手機版卡片

```
┌─────────────────────────────┐
│ PO-2026-0018          [已確認]│
│ 永興皮革                      │
│ 2026/04/12         $15,200   │
└─────────────────────────────┘
```

**卡片欄位：** 單號 + 狀態、廠商名、日期 + 金額
**隱藏欄位：** 附註（notes）— 手機上不顯示，進入詳情頁可見
**篩選區：** 狀態 pill 按鈕改為水平捲動容器（`overflow-x-auto flex-nowrap`），不換行

---

## 5. 採購單編輯器（PurchaseEditorClient）

**影響檔案：** `src/app/purchases/PurchaseEditorClient.tsx`
**新增檔案：** `src/components/purchases/MobilePurchaseItemCard.tsx`

### 供應商表單區

手機上所有表單欄位垂直堆疊（`grid-cols-1`），取代桌面的多欄 grid。

### 品項卡片

結構同報價編輯器的 MobileQuoteItemCard，但欄位不同：

```
┌─────────────────────────────┐
│ [序號]                  [刪除]│
│ 商品（ProductCombobox, 全寬） │
│ [數量]    [單位]    [單價]    │
│ 備註 [input]                 │
│ 小計                  $3,200 │
└─────────────────────────────┘
```

---

## 6. ProductCombobox

**影響檔案：** `src/components/purchases/ProductCombobox.tsx`

### 寬度修復

- 下拉面板：`w-[380px]` → `w-[min(380px,calc(100vw-32px))]`
- 等效做法：`w-[380px] max-w-[calc(100vw-2rem)]`

### 結果項手機佈局

桌面（單行）：`[✓] CODE · SUPPLIER_CODE · 名稱 · 規格 · $Price`

手機（雙行）：
```
[✓] CODE · 名稱
    規格 · $Price
```

- 項目高度：`py-1.5` → `py-2.5`（增加觸控面積到 ~44px）
- 使用 `useIsMobile()` 控制單行/雙行佈局

---

## 7. 材質資料庫（MaterialsClient / MaterialTable）

**影響檔案：** `src/components/materials/MaterialTable.tsx`

### 手機版卡片

```
┌─────────────────────────────┐
│ [品牌] [系列]                 │
│ 色號：A123 / 深棕色           │
│ 進價: $280/碼  牌價: $450/碼  │
│ 庫存: 充足          [✏️][🚫] │
└─────────────────────────────┘
```

**隱藏欄位：** 分類（category）— 次要資訊

---

## 8. 佣金結算（CommissionsClient）

**影響檔案：** `src/app/commissions/CommissionsClient.tsx`

**改動最小 — 已有不錯的響應式 (`sm:grid-cols-2`)。**

僅需：
- 結算表格：手機上隱藏「付款日期」欄，只顯示 單號 / 合作方 / 佣金金額 / 狀態
- 報表分頁的合作方表格：同上隱藏次要欄位

---

## 9. 售後服務（AfterSalesListClient）

**影響檔案：** `src/app/after-sales/AfterSalesListClient.tsx`

### 手機版卡片

```
┌─────────────────────────────┐
│ SRV-2026-0005        [處理中] │
│ 王先生 / 0912-345-678        │
│ 三人座沙發 — 皮面裂痕         │
│ 2026/04/10  負責人：小陳      │
└─────────────────────────────┘
```

**卡片欄位：** 單號 + 狀態、客戶/電話、款式 + 問題摘要、日期 + 負責人
**隱藏欄位：** 訂單號（進入詳情可見）

### 篩選區

- 狀態 pill 按鈕：同採購單，改為水平捲動容器
- 搜尋框保持全寬

### 分頁

- 手機上簡化：隱藏「上一頁/下一頁」文字，只保留箭頭 icon
- 頁碼顯示：`1 / 10` 格式
- 每頁筆數 select：手機上隱藏（固定使用預設值）

---

## 影響檔案清單

| 檔案 | 操作 |
|------|------|
| `src/hooks/useIsMobile.ts` | 新增 |
| `src/components/quote-editor/MobileQuoteItemCard.tsx` | 新增 |
| `src/components/purchases/MobilePurchaseItemCard.tsx` | 新增 |
| `src/components/quote-editor/QuoteEditor.tsx` | 修改 |
| `src/app/quotes/QuotesClient.tsx` | 修改 |
| `src/app/cases/CasesClient.tsx` | 修改 |
| `src/app/purchases/PurchasesClient.tsx` | 修改 |
| `src/app/purchases/PurchaseEditorClient.tsx` | 修改 |
| `src/components/purchases/ProductCombobox.tsx` | 修改 |
| `src/components/materials/MaterialTable.tsx` | 修改 |
| `src/app/commissions/CommissionsClient.tsx` | 修改 |
| `src/app/after-sales/AfterSalesListClient.tsx` | 修改 |

## 測試計畫

- [ ] iPhone SE (375px)：報價編輯器品項卡片可編輯
- [ ] iPhone SE (375px)：新增/刪除品項正常
- [ ] iPhone SE (375px)：所有列表頁面顯示卡片而非表格
- [ ] iPhone SE (375px)：ProductCombobox 不溢出螢幕
- [ ] iPhone SE (375px)：篩選區可操作
- [ ] iPhone SE (375px)：分頁按鈕可點擊
- [ ] iPhone 15 Pro Max (430px)：卡片佈局正常
- [ ] iPad (769px)：切換為桌面表格
- [ ] Desktop (1200px+)：所有頁面與改動前完全一致
- [ ] 報價編輯器桌面版：拖曳排序正常
- [ ] 報價編輯器桌面版：表格列寬調整正常
