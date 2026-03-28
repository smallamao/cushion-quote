# 報價範本功能規格

## 概述

報價範本功能允許用戶將常用的報價品項組合儲存為範本，以便在建立新報價時快速套用，提高報價效率。

## 功能特性

### 1. 範本管理（系統設定頁面）

位置：`/settings` → 報價範本管理區塊

功能：
- 查看所有已儲存的報價範本
- 新增範本（手動輸入範本名稱、說明、品項）
- 編輯現有範本
- 刪除範本（軟刪除，設為 `isActive = false`）

### 2. 範本套用（報價工作台）

位置：報價工作台頁面 → 「📄 套用整單範本」按鈕

功能：
- 顯示所有可用的範本列表（包含硬編碼範本 + 資料庫範本）
- 點擊範本後，替換當前所有品項為範本品項
- 確認提示，避免誤操作

### 3. 儲存為範本（報價工作台）

位置：報價工作台頁面 → 「存為範本」按鈕

功能：
- 將當前報價的所有品項儲存為新範本
- 輸入範本名稱（必填）
- 輸入範本說明（選填）
- 預覽將儲存的品項列表
- 儲存成功後自動重新載入範本列表

## 資料結構

### QuoteTemplate (types.ts)

```typescript
export interface QuoteTemplate {
  templateId: string;      // TPL-001, TPL-002, ...
  templateName: string;    // 範本名稱
  description: string;     // 範本說明
  items: FlexQuoteItem[];  // 範本包含的品項列表
  isActive: boolean;       // 是否啟用
  createdAt: string;       // 建立時間
  updatedAt: string;       // 更新時間
}
```

### Google Sheets 工作表：「報價範本」

| 欄位 | 說明 | 範例 |
|------|------|------|
| A - 範本ID | 自動生成 TPL-XXX | TPL-001 |
| B - 範本名稱 | 用戶輸入 | 標準臥室套餐 |
| C - 說明 | 用戶輸入 | 包含床頭板、運費、安裝 |
| D - 品項JSON | FlexQuoteItem[] 序列化 | `[{...}, {...}]` |
| E - 啟用 | TRUE/FALSE | TRUE |
| F - 建立時間 | ISO 8601 | 2026-03-20T10:30:00.000Z |
| G - 更新時間 | ISO 8601 | 2026-03-20T10:30:00.000Z |

## API 端點

### GET /api/sheets/templates

取得所有啟用的範本

回應：
```json
{
  "ok": true,
  "templates": [
    {
      "templateId": "TPL-001",
      "templateName": "標準臥室套餐",
      "description": "包含床頭板、運費、安裝",
      "items": [...],
      "isActive": true,
      "createdAt": "2026-03-20T10:30:00.000Z",
      "updatedAt": "2026-03-20T10:30:00.000Z"
    }
  ]
}
```

### POST /api/sheets/templates

新增或更新範本

請求：
```json
{
  "template": {
    "templateId": "",  // 空字串表示新增，系統自動生成 ID
    "templateName": "標準臥室套餐",
    "description": "包含床頭板、運費、安裝",
    "items": [...],
    "isActive": true
  }
}
```

回應：
```json
{
  "ok": true,
  "template": {
    "templateId": "TPL-001",
    ...
  }
}
```

### DELETE /api/sheets/templates?templateId=TPL-001

刪除範本（軟刪除）

回應：
```json
{
  "ok": true,
  "templateId": "TPL-001"
}
```

## 實作檔案

### 後端

- `src/lib/types.ts` - QuoteTemplate 型別定義
- `src/app/api/sheets/init/route.ts` - 新增「報價範本」工作表定義
- `src/app/api/sheets/templates/route.ts` - 範本 CRUD API
- `src/hooks/useTemplates.ts` - 範本資料管理 hook

### 前端

- `src/components/settings/TemplateManager.tsx` - 範本管理 UI 組件
- `src/app/settings/SettingsClient.tsx` - 整合範本管理到設定頁面
- `src/components/quote-editor/QuoteEditor.tsx` - 套用範本 & 存為範本功能

## 使用流程

### 建立範本（從報價工作台）

1. 在報價工作台中建立報價品項
2. 點擊「存為範本」按鈕
3. 輸入範本名稱（必填）
4. 輸入範本說明（選填）
5. 點擊「儲存範本」
6. 系統自動生成 `TPL-XXX` ID 並儲存到 Google Sheets

### 建立範本（從系統設定）

1. 進入系統設定頁面（`/settings`）
2. 滾動到「報價範本管理」區塊
3. 點擊「新增範本」按鈕
4. 輸入範本名稱、說明
5. 注意：此方式品項為空，需手動編輯或從報價工作台建立

### 套用範本

1. 在報價工作台中，點擊「📄 套用整單範本」按鈕
2. 從下拉選單中選擇範本
3. 確認替換當前品項
4. 系統自動載入範本品項並套用定價規則

### 編輯範本

1. 進入系統設定頁面（`/settings`）
2. 在「報價範本管理」區塊找到要編輯的範本
3. 點擊「編輯」按鈕
4. 修改範本名稱或說明
5. 點擊「儲存範本」

### 刪除範本

1. 進入系統設定頁面（`/settings`）
2. 在「報價範本管理」區塊找到要刪除的範本
3. 點擊刪除按鈕（垃圾桶圖示）
4. 確認刪除
5. 系統執行軟刪除（`isActive = false`）

## 測試計畫

### 單元測試

- [ ] API GET /api/sheets/templates 回傳正確格式
- [ ] API POST /api/sheets/templates 正確建立新範本
- [ ] API POST /api/sheets/templates 正確更新現有範本
- [ ] API DELETE /api/sheets/templates 正確軟刪除範本
- [ ] useTemplates hook 正確載入範本
- [ ] useTemplates hook 正確儲存範本
- [ ] useTemplates hook 正確刪除範本

### 整合測試

- [ ] 從報價工作台儲存範本後，範本出現在設定頁面
- [ ] 從設定頁面建立範本後，範本出現在報價工作台的下拉選單
- [ ] 套用範本後，品項正確載入到報價工作台
- [ ] 編輯範本後，變更正確反映在所有位置
- [ ] 刪除範本後，範本不再出現在下拉選單和設定頁面

### E2E 測試

- [ ] 完整流程：建立報價 → 存為範本 → 新建報價 → 套用範本
- [ ] 完整流程：建立範本 → 編輯範本 → 刪除範本
- [ ] 邊界條件：空品項清單無法儲存範本
- [ ] 邊界條件：範本名稱為空無法儲存
- [ ] 錯誤處理：API 失敗時顯示錯誤訊息

## 版本歷史

- v0.3.2 (2026-03-20): 初始實作報價範本功能

## 未來改進方向

1. **範本分類**：支援範本分類（如：臥室、客廳、商空等）
2. **範本預覽**：套用前預覽範本品項明細
3. **範本複製**：從現有範本複製並修改
4. **範本匯入/匯出**：支援 JSON 格式匯入/匯出範本
5. **範本權限**：支援公開/私有範本
6. **範本使用統計**：追蹤範本使用次數
