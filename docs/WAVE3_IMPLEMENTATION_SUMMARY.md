# Wave 3 實作總結與計劃

## 執行日期
2026-04-10

## 現況總覽

### ✅ 已完成：Wave 3A - 商品搜尋與篩選增強

**實作內容**：
- 篩選結果計數顯示：「符合 X 筆，共 Y 筆」
- 清除篩選按鈕：一鍵重置所有篩選條件
- 佈局優化：改善篩選控制項間距

**驗證結果**：
- ✅ TypeScript 編譯成功
- ✅ 無型別錯誤
- ✅ 建置成功（46 個路由全部正常）

**影響檔案**：
- `src/app/purchase-products/PurchaseProductsClient.tsx`

---

## 📋 待實作功能與詳細計劃

### 1. Wave 3C: 批量改價功能

**優先級**：P0（核心採購管理功能）

**詳細計劃**：[wave3-batch-price-update.md](./features/wave3-batch-price-update.md)

**功能摘要**：
- 篩選商品 → 設定調整方式（固定金額/百分比/絕對值）→ 預覽變更 → 確認執行
- 支援批量更新 Google Sheets「採購商品」的單價欄位
- 防呆機制：價格範圍檢查、操作記錄

**技術重點**：
- Modal wizard UI（3 步驟流程）
- API：`POST /api/sheets/purchase-products/batch-update`
- Google Sheets `batchUpdate` 批量寫入

**預估工時**：9 小時（1.5 天）

**關鍵檔案**：
- 新增：`src/components/purchase-products/BatchPriceUpdateModal.tsx`
- 新增：`src/app/api/sheets/purchase-products/batch-update/route.ts`
- 修改：`src/app/purchase-products/PurchaseProductsClient.tsx`

---

### 2. Wave 3D: 商品採購歷史視角

**優先級**：P1（分析與決策輔助）

**詳細計劃**：[wave3-product-purchase-history.md](./features/wave3-product-purchase-history.md)

**功能摘要**：
- 以商品為中心的採購歷史查詢
- 統計摘要：總次數、總數量、平均價、價格範圍
- 單價趨勢圖（使用 recharts）
- 採購明細列表（可排序、可點擊跳轉）

**技術重點**：
- API：`GET /api/sheets/purchase-products/[productId]/history`
- 新頁面：`/purchase-products/[productId]/history`
- 資料關聯：「採購單明細」+「採購單」+「案件」
- 圖表庫：recharts（需安裝）

**預估工時**：10 小時（1.5 天）

**關鍵檔案**：
- 新增：`src/app/api/sheets/purchase-products/[productId]/history/route.ts`
- 新增：`src/app/purchase-products/[productId]/history/page.tsx`
- 新增：`src/components/purchase-products/PriceTrendChart.tsx`
- 修改：`src/app/purchase-products/PurchaseProductsClient.tsx`（新增「歷史」按鈕）

**依賴項目**：
```json
{
  "recharts": "^2.10.0"
}
```

---

### 3. Wave 3B: 月對帳報表 PDF

**優先級**：P1（財務對帳必備）

**詳細計劃**：[wave3-monthly-statement.md](./features/wave3-monthly-statement.md)

**功能摘要**：
- 產生廠商月對帳報表 PDF
- 列出該廠商該月所有採購單明細
- 統計摘要：按狀態分組（草稿、已下單、已收貨、已確認）
- 支援下載 PDF，檔名自動包含廠商與月份

**技術重點**：
- API：`GET /api/sheets/suppliers/[supplierId]/statement?month=YYYY-MM`
- PDF Component：使用 `@react-pdf/renderer`（現有依賴）
- Modal：月份選擇器（HTML5 `<input type="month">`）

**預估工時**：11 小時（1.5 天）

**關鍵檔案**：
- 新增：`src/app/api/sheets/suppliers/[supplierId]/statement/route.ts`
- 新增：`src/components/pdf/SupplierStatementPDF.tsx`
- 新增：`src/components/suppliers/StatementModal.tsx`
- 修改：`src/app/suppliers/SuppliersClient.tsx`（新增「對帳報表」按鈕）

---

## 實作順序建議

### 方案 A：按優先級順序實作
```
3C (批量改價) → 3D (採購歷史) → 3B (對帳報表)
```
**優點**：先完成最常用的功能
**缺點**：功能間無相依性，可能打斷工作流

### 方案 B：按相關性分組
```
3C (批量改價，商品管理) → 3D (採購歷史，商品管理) → 3B (對帳報表，廠商管理)
```
**優點**：相關功能連續實作，context 切換少
**缺點**：對帳報表延後

### 方案 C：平行實作（分批交付）
```
第一批：3C（核心功能） + 3B（核心功能）
第二批：3D（分析功能）
```
**優點**：核心功能優先上線
**缺點**：需同時管理多個分支

**建議**：採用**方案 B**，按相關性分組實作，減少 context 切換成本。

---

## 總預估工時

| 功能 | 預估工時 | 工作日 |
|------|---------|--------|
| 3C - 批量改價 | 9 小時 | 1.5 天 |
| 3D - 採購歷史 | 10 小時 | 1.5 天 |
| 3B - 對帳報表 | 11 小時 | 1.5 天 |
| **總計** | **30 小時** | **4.5 天** |

---

## 技術依賴檢查

### 需新增依賴
- `recharts: ^2.10.0`（Wave 3D）

### 現有依賴（無需額外安裝）
- `@react-pdf/renderer`（已用於報價單 PDF）
- `swr`（已用於資料獲取）
- Next.js 15 App Router（已是專案基礎）

---

## 測試策略

### 每個功能的測試流程
1. **API 測試**：使用 Postman 或 curl 驗證 endpoint
2. **UI 測試**：手動測試所有互動流程
3. **整合測試**：驗證 Google Sheets 實際更新
4. **E2E 測試**：使用 Playwright（如已配置）

### 迴歸測試
- 確保新功能不影響現有功能
- 驗證「採購商品」頁面所有既有功能正常

---

## 風險評估

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| Google Sheets API 配額耗盡 | 高 | 使用 batchUpdate 減少請求次數 |
| 大量商品批量更新超時 | 中 | 限制單次更新上限（如 100 筆） |
| PDF 產生效能問題 | 低 | 限制單次對帳報表月份範圍 |
| recharts 打包體積 | 低 | 使用 tree-shaking，僅引入需要的 component |

---

## 下一步行動

### 立即可執行
1. **安裝 recharts**：`npm install recharts@^2.10.0`
2. **選擇實作順序**：建議採用方案 B（按相關性分組）
3. **開始實作 3C**：批量改價功能（參考詳細計劃）

### 實作檢查清單

#### 開始實作前
- [ ] 閱讀對應的詳細計劃文件
- [ ] 確認 Google Sheets schema 支援該功能
- [ ] 確認所需依賴已安裝

#### 實作過程中
- [ ] 遵循現有程式碼風格（參考 `CLAUDE.md`）
- [ ] 保持歷史不可變性原則
- [ ] 使用 immutable data patterns
- [ ] 適當的錯誤處理與防呆機制

#### 完成後
- [ ] TypeScript 編譯無錯誤（`npm run build`）
- [ ] 手動測試所有使用場景
- [ ] 驗證 Google Sheets 資料正確更新
- [ ] 更新 Todo List 標記為完成

---

## 支援資源

### 詳細計劃文件
- [Wave 3C: 批量改價](./features/wave3-batch-price-update.md)
- [Wave 3D: 採購歷史](./features/wave3-product-purchase-history.md)
- [Wave 3B: 月對帳報表](./features/wave3-monthly-statement.md)

### 現有參考檔案
- **Modal 設計**：`src/components/quote-editor/CalculatorModal.tsx`
- **PDF 設計**：`src/components/pdf/QuotePDF.tsx`、`PurchaseOrderPDF.tsx`
- **API 設計**：`src/app/api/sheets/purchase-products/route.ts`
- **資料獲取**：`src/hooks/usePurchaseProducts.ts`

### 系統設計文件
- [Ragic 遷移檢查清單](./RAGIC_MIGRATION_CHECKLIST.md)
- [專案開發指南](../CLAUDE.md)

---

## 附註

**Wave 1 & Wave 2 已全部完成**：
- Wave 1A：receivedQuantity 欄位
- Wave 1B：成本比較顯示
- Wave 1C：智慧案件偵測
- Wave 2A：Ragic 遷移檢查清單
- Wave 2B：商品圖片遷移腳本

**當前狀態**：Wave 3A 已完成並驗證，剩餘 3C/3D/3B 待實作。

---

**文件版本**：v1.0
**最後更新**：2026-04-10
**撰寫者**：Claude Sonnet 4.5
