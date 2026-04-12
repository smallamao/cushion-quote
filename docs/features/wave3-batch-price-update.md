# Wave 3C: 批量改價功能 (Batch Price Update)

## 功能概述

允許採購管理員批量修改多個商品的單價，支援篩選商品、預覽變更、確認執行。

## 使用場景

1. **廠商統一調漲/調降**：某廠商所有商品漲價 5%
2. **特定類別調整**：所有「緞面布」統一調整價格
3. **手動批量修正**：導入時發現某批商品單價錯誤需批量修正

## UI/UX 設計

### 入口位置

- **位置**：`/purchase-products` 頁面頂部篩選區塊
- **按鈕**：「批量改價」按鈕，位於「新增商品」按鈕旁邊
- **觸發條件**：當篩選結果 > 0 時啟用

### Modal 流程設計

#### Step 1: 篩選確認
```
┌─────────────────────────────────────────┐
│  批量改價 - 選擇商品                      │
├─────────────────────────────────────────┤
│                                         │
│  當前篩選條件：                           │
│  ✓ 類別：緞面布                          │
│  ✓ 廠商：XX布料行                        │
│                                         │
│  符合 45 筆商品                          │
│                                         │
│  [ 預覽清單 ▼ ]                          │
│                                         │
│  [取消]              [下一步：設定價格]   │
└─────────────────────────────────────────┘
```

#### Step 2: 價格調整設定
```
┌─────────────────────────────────────────┐
│  批量改價 - 設定新價格                    │
├─────────────────────────────────────────┤
│                                         │
│  調整方式：                               │
│  ○ 固定金額調整    [+/-] [____] 元       │
│  ● 百分比調整      [+/-] [_10_] %        │
│  ○ 設定統一單價    [____] 元/單位        │
│                                         │
│  預覽變更（前 10 筆）：                   │
│  ┌────────┬─────┬─────┬──────┐         │
│  │ 商品   │ 原價│ 新價│ 變動  │         │
│  ├────────┼─────┼─────┼──────┤         │
│  │ A101   │ 100 │ 110 │ +10% │         │
│  │ A102   │ 150 │ 165 │ +10% │         │
│  └────────┴─────┴─────┴──────┘         │
│                                         │
│  [上一步]              [確認執行]         │
└─────────────────────────────────────────┘
```

#### Step 3: 執行確認
```
┌─────────────────────────────────────────┐
│  批量改價 - 確認執行                      │
├─────────────────────────────────────────┤
│                                         │
│  ⚠️  即將更新 45 筆商品單價               │
│                                         │
│  調整方式：+10%                          │
│  平均變動：原價 125 元 → 新價 137.5 元   │
│                                         │
│  此操作無法復原，請確認後執行              │
│                                         │
│  [取消]              [確認執行]           │
└─────────────────────────────────────────┘
```

#### Step 4: 執行結果
```
┌─────────────────────────────────────────┐
│  批量改價 - 執行結果                      │
├─────────────────────────────────────────┤
│                                         │
│  ✅ 成功更新 45 筆商品                    │
│                                         │
│  執行時間：2026-04-10 14:35              │
│  變更範圍：緞面布 / XX布料行              │
│  調整方式：+10%                          │
│                                         │
│              [完成]                      │
└─────────────────────────────────────────┘
```

## 技術實作

### 1. 前端 Component

**檔案**：`src/components/purchase-products/BatchPriceUpdateModal.tsx`

```typescript
interface BatchPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  filteredProducts: PurchaseProduct[];
  onSuccess: () => void;
}

type AdjustmentMode = 'fixed' | 'percentage' | 'absolute';

interface PriceAdjustment {
  mode: AdjustmentMode;
  value: number; // +10 for percentage, +50 for fixed, 200 for absolute
  isIncrease: boolean; // only for fixed/percentage
}
```

**主要功能**：
- 多步驟 wizard UI（使用 state machine）
- 價格預覽計算（不呼叫 API）
- 最終確認後呼叫 API

### 2. API Endpoint

**檔案**：`src/app/api/sheets/purchase-products/batch-update/route.ts`

**Request Body**：
```typescript
{
  productIds: string[];  // 要更新的商品 ID 列表
  adjustment: {
    mode: 'fixed' | 'percentage' | 'absolute';
    value: number;
    isIncrease?: boolean;
  };
}
```

**Response**：
```typescript
{
  ok: true;
  updatedCount: number;
  results: Array<{
    productId: string;
    oldPrice: number;
    newPrice: number;
  }>;
}
```

**流程**：
1. 驗證 `productIds` 存在且有效
2. 計算每個商品的新單價（四捨五入至整數）
3. 批量更新 Google Sheets「採購商品」sheet 的 H 欄（unitPrice）
4. 返回更新結果

### 3. Google Sheets 更新

使用 `batchUpdate` API：

```typescript
const batchData = productUpdates.map((update) => ({
  range: `採購商品!H${update.rowIndex}`,
  values: [[update.newPrice]],
}));

await client.sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: client.spreadsheetId,
  requestBody: {
    data: batchData,
    valueInputOption: 'RAW',
  },
});
```

### 4. 整合到 PurchaseProductsClient

**修改位置**：`src/app/purchase-products/PurchaseProductsClient.tsx`

**步驟**：
1. Import `BatchPriceUpdateModal`
2. 新增狀態：`const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);`
3. 在「新增商品」按鈕旁新增「批量改價」按鈕
4. 將當前篩選結果 `filtered` 傳給 Modal
5. 成功後呼叫 `mutate()` 重新載入資料

## 安全性考量

1. **權限檢查**：只有管理員可執行（目前系統暫無權限機制，先允許所有使用者）
2. **防呆機制**：
   - 最少需選擇 1 筆商品
   - 價格不可為負數
   - 價格上限檢查（例如單價不可超過 100,000 元）
3. **操作記錄**：在 console.log 記錄批量更新的操作（未來可擴展為 audit log）

## 測試計劃

### 單元測試
- 價格計算邏輯（固定金額、百分比、絕對值）
- 四捨五入邏輯
- 邊界值測試（0 元、負數、超大值）

### 整合測試
- API 批量更新成功
- API 錯誤處理（無效商品 ID）
- Google Sheets 實際更新驗證

### E2E 測試
- 篩選商品 → 開啟 Modal → 設定價格 → 預覽 → 執行 → 驗證結果
- 取消操作不更新資料

## 擴展性考量

### 未來可新增功能
1. **操作記錄查詢**：批量改價歷史紀錄（誰、何時、改了什麼）
2. **復原功能**：Undo 最近一次批量操作
3. **排程改價**：設定未來日期生效
4. **通知機制**：改價完成後發送通知

### 資料結構擴展
如需記錄歷史，可新增 Google Sheets「價格異動記錄」sheet：

| 欄位 | 說明 |
|------|------|
| timestamp | 操作時間 |
| productIds | 影響商品（JSON） |
| adjustmentMode | 調整方式 |
| adjustmentValue | 調整值 |
| affectedCount | 影響筆數 |
| operator | 操作人（未來） |

## 實作優先級

1. **P0 - 核心功能**：Modal UI、價格計算、API endpoint、Google Sheets 更新
2. **P1 - 防呆機制**：輸入驗證、價格範圍檢查
3. **P2 - 體驗優化**：預覽清單展開/收起、執行進度條
4. **P3 - 擴展功能**：操作記錄、復原功能

## 預估工時

- 前端 Modal UI：4 小時
- API Endpoint 開發：2 小時
- 整合測試：2 小時
- E2E 測試：1 小時

**總計**：約 9 小時（1.5 天）
