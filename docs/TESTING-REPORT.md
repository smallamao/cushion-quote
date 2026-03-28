# 報價範本功能測試報告

## 測試日期
2026-03-22

## 測試環境
- Node.js 版本：v22.x
- Next.js 版本：15.5.12
- 開發伺服器：http://localhost:3001

## 測試範圍

### ✅ 1. 後端 API 測試

#### 1.1 GET /api/sheets/templates
- **測試內容**：取得所有啟用的範本
- **測試結果**：✅ 通過
- **驗證項目**：
  - [x] API 正確回應 JSON 格式
  - [x] 回傳範本陣列結構正確
  - [x] 只回傳 `isActive = true` 的範本
  - [x] 空範本列表回傳空陣列

#### 1.2 POST /api/sheets/templates（新增範本）
- **測試內容**：建立新範本
- **測試結果**：✅ 通過
- **驗證項目**：
  - [x] 自動生成 `TPL-XXX` ID（測試: TPL-001, TPL-002）
  - [x] 正確儲存範本名稱與說明
  - [x] 正確序列化品項 JSON
  - [x] 自動設定建立與更新時間
  - [x] 預設 `isActive = true`

**測試請求範例**：
```json
{
  "template": {
    "templateId": "",
    "templateName": "測試範本",
    "description": "這是一個測試範本",
    "items": [
      {
        "name": "測試品項1",
        "spec": "規格說明",
        "qty": 1,
        "unit": "只",
        "unitPrice": 1000,
        "amount": 1000,
        "isCostItem": false,
        "notes": ""
      }
    ],
    "isActive": true
  }
}
```

**測試回應**：
```json
{
  "ok": true,
  "template": {
    "templateId": "TPL-001",
    "templateName": "測試範本",
    "description": "這是一個測試範本",
    "items": [...],
    "isActive": true,
    "createdAt": "2026-03-22T04:33:50.038Z",
    "updatedAt": "2026-03-22T04:33:50.038Z"
  }
}
```

#### 1.3 DELETE /api/sheets/templates
- **測試內容**：軟刪除範本
- **測試結果**：✅ 通過
- **驗證項目**：
  - [x] 正確接收 `templateId` 參數
  - [x] 設定 `isActive = FALSE` 而非真刪除
  - [x] 刪除後 GET API 不再回傳該範本
  - [x] 工作表中資料仍存在（軟刪除）

### ✅ 2. Google Sheets 整合測試

#### 2.1 工作表初始化
- **測試內容**：建立「報價範本」工作表
- **測試結果**：✅ 通過
- **API 端點**：POST /api/sheets/init
- **驗證項目**：
  - [x] 工作表成功建立
  - [x] 欄位標題正確（範本ID, 範本名稱, 說明, 品項JSON, 啟用, 建立時間, 更新時間）
  - [x] 與現有工作表共存無衝突

**初始化回應**：
```json
{
  "ok": true,
  "created": ["報價範本"],
  "existing": [
    "材質資料庫",
    "工資表",
    "系統設定",
    "客戶資料庫",
    "案件",
    "報價",
    "報價版本",
    "報價版本明細",
    "佣金結算"
  ]
}
```

#### 2.2 資料持久化
- **測試內容**：範本資料正確寫入 Google Sheets
- **測試結果**：✅ 通過
- **驗證項目**：
  - [x] 範本 ID 自動遞增（TPL-001, TPL-002, ...）
  - [x] JSON 序列化正確（品項陣列轉字串）
  - [x] 布林值正確轉換（TRUE/FALSE）
  - [x] 時間戳記正確儲存（ISO 8601 格式）

### ✅ 3. 建置測試

#### 3.1 TypeScript 型別檢查
- **測試結果**：✅ 通過
- **驗證項目**：
  - [x] 所有檔案通過型別檢查
  - [x] 無型別錯誤
  - [x] QuoteTemplate 型別定義正確

#### 3.2 生產建置
- **測試指令**：`npm run build`
- **測試結果**：✅ 通過
- **建置輸出**：
  - ✓ 編譯成功
  - ✓ 靜態頁面生成（29/29）
  - ✓ 無致命錯誤

**警告項目**（非阻斷性）：
- 未使用變數（可忽略）
- img 標籤建議使用 next/image（效能優化，非功能性）

### ✅ 4. 修復項目

#### 4.1 修復：GET API 未過濾 isActive
**問題**：GET /api/sheets/templates 回傳所有範本（包含已刪除）
**修復**：
```typescript
// 修復前
const templates = rows.map(rowToTemplate).filter((t) => t.templateId);

// 修復後
const templates = rows.map(rowToTemplate).filter((t) => t.templateId && t.isActive);
```
**檔案**：`src/app/api/sheets/templates/route.ts:57`
**測試結果**：✅ 已驗證

#### 4.2 修復：VersionLineRecord 型別不完整
**問題**：`versions/[versionId]/route.ts` 缺少 v0.3.2 新增欄位
**修復**：新增以下欄位到 VersionLineRecord 映射
```typescript
panelInputMode: line.panelInputMode ?? "",
surfaceWidthCm: line.surfaceWidthCm ?? 0,
surfaceHeightCm: line.surfaceHeightCm ?? 0,
splitDirection: line.splitDirection ?? "",
splitCount: line.splitCount ?? 0,
caiRoundingMode: line.caiRoundingMode ?? "",
```
**檔案**：`src/app/api/sheets/versions/[versionId]/route.ts:142-147`
**測試結果**：✅ 已驗證

#### 4.3 修復：QuoteEditor 型別轉換
**問題**：`toFlexItemsFromVersion` 函數中 `panelInputMode` 型別轉換錯誤
**修復**：
```typescript
// 修復前
panelInputMode: line.panelInputMode || undefined,

// 修復後
panelInputMode: (line.panelInputMode as PanelInputMode) || undefined,
```
**檔案**：`src/components/quote-editor/QuoteEditor.tsx:279`
**測試結果**：✅ 已驗證

## 測試結論

### ✅ 所有測試通過

1. **後端 API**：所有 CRUD 操作正常運作
2. **Google Sheets 整合**：資料正確讀寫
3. **型別安全**：TypeScript 型別檢查通過
4. **建置成功**：生產環境建置無錯誤

### 📋 待用戶測試項目

由於 UI 測試需要實際操作，以下項目待用戶驗證：

1. **範本管理 UI（/settings）**
   - [ ] 查看範本列表
   - [ ] 新增範本（手動輸入）
   - [ ] 編輯範本名稱與說明
   - [ ] 刪除範本

2. **報價工作台整合**
   - [ ] 「📄 套用整單範本」下拉選單顯示正確
   - [ ] 套用範本後品項正確載入
   - [ ] 套用範本後自動計算定價
   - [ ] 「💾 存為範本」功能
   - [ ] 儲存範本對話框 UI
   - [ ] 儲存成功後重新載入範本列表

3. **完整工作流程**
   - [ ] 建立報價 → 存為範本 → 新建報價 → 套用範本
   - [ ] 範本在設定頁面與報價工作台之間同步

### 🚀 建議測試步驟

1. **啟動開發伺服器**：
   ```bash
   npm run dev -- -p 3001
   ```

2. **初始化 Google Sheets**（如果尚未完成）：
   ```bash
   curl -X POST http://localhost:3001/api/sheets/init
   ```

3. **測試 API**：
   ```bash
   # 取得範本列表
   curl http://localhost:3001/api/sheets/templates

   # 建立範本（使用 /tmp/test-template.json）
   curl -X POST http://localhost:3001/api/sheets/templates \
     -H "Content-Type: application/json" \
     -d @/tmp/test-template.json
   ```

4. **測試 UI**：
   - 訪問 http://localhost:3001/settings
   - 測試範本管理功能
   - 訪問 http://localhost:3001
   - 測試報價工作台功能

## 測試數據

### 測試範本 1
- **ID**：TPL-002
- **名稱**：測試範本
- **說明**：這是一個測試範本
- **品項數**：2
- **狀態**：啟用

### Google Sheets 狀態
- **工作表名稱**：報價範本
- **資料列數**：2（1 個已刪除 + 1 個啟用）
- **欄位數**：7

## 版本資訊
- **功能版本**：v0.3.2
- **測試版本**：Initial Release
- **測試人員**：Claude Sonnet 4.5
- **測試日期**：2026-03-22
