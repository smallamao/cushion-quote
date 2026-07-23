# API 需求規格：排程系統「用布量」→ 繃布報價「採購單＋JPG」串接

> 提出方：馬鈴薯沙發排程系統（用布量計算端）
> 目的：排程系統算完用布量後，把「採購清單」直接 POST 過來，由繃布報價自動建採購單並回傳 JPG，省去人工貼上＋手動下載。
> 日期：2026-07-23

---

## 一、背景（現況）

- 排程系統會產出「採購清單」文字，格式**已對齊你們的 `purchase-paste-parser`**：
  ```
  3200A22 21y #P6177
  2200A71 12y #P6181
  谷806 2件 #P6180
  谷PVC806 12y #P6180
  6616 1.5件 #P6184
  BG116 20y #P6178
  ```
  即 `{色號} {數量}{單位} #{訂單號}`，單位支援 y/碼、件/p、只/才/小才、複合(3件+10y)、小數(1.5件)。

- 目前流程：人工複製 → 貼進網頁採購貼上 → 建採購單 → 採購單是 react-pdf 預覽 → （比照報價單）下載 JPG → 傳廠商。

- **要自動化的就是中間這段**：POST 清單 → 建採購單 → 回 JPG。

---

## 二、要新增的 API 端點

### `POST /api/sheets/purchases/from-paste`

**Request body**
```jsonc
{
  "pasteText": "3200A22 21y #P6177\n2200A71 12y #P6181\n...",  // 必填：採購清單(多行)
  "purchaseDate": "2026-07-22",        // 選填：採購日期，預設今天
  "groupBySupplier": true,             // 選填：預設 true = 每供應商建一張採購單
  "returnJpg": true,                   // 選填：是否回傳採購單 JPG（見第四節）
  "source": "排程系統-用布量",          // 選填：來源標記，寫進採購單備註
  "dryRun": false                      // 選填：true = 只解析對帳、不真的建單（給預覽用）
}
```

**處理流程（可重用現有程式）**
1. `parsePurchasePasteText(pasteText)` → `ParsedPasteLine[]`
2. `resolveParsedLines(parsed, products)` → `ResolvedItem[]`（matched / unmatched）
   - 用現有商品目錄比對（productCode / supplierProductCode / colorCode）
3. 依每個 matched item 的 `product.supplier`（或 supplierId）**分組**
4. 每個供應商建一張 `PurchaseOrder`（沿用現有 POST /api/sheets/purchases 的建單邏輯＋supplierSnapshot）
5. `returnJpg=true` 時，每張採購單算 JPG（見第四節）

**Response**
```jsonc
{
  "success": true,
  "purchaseOrders": [
    {
      "supplier": "米盧",
      "supplierId": "PS00X",
      "orderId": "建立後的採購單ID",
      "items": [
        { "productCode": "3200A22", "productName": "以色列3200A22", "qty": 21, "unit": "碼", "caseRef": "P6177", "matched": true },
        { "productCode": "2200A71", "qty": 12, "unit": "碼", "caseRef": "P6181", "matched": true }
      ],
      "jpgBase64": "data:image/jpeg;base64,....",   // returnJpg=true 時
      "jpgUrl": null                                 // 或改成存檔後回 URL，二擇一
    }
  ],
  "unmatched": [
    { "line": "谷PVC806 12y #P6180", "productCode": "谷PVC806", "reason": "商品目錄查無此色號" }
  ],
  "warnings": ["某行缺數量已略過"]
}
```

> **unmatched 要回傳、不要靜默丟棄**（排程端會顯示給老闆補建商品）。

---

## 三、供應商分組規則（重要）

- **一張訂單的主色/副色/配件色可能屬於不同供應商**，分組要按「每個 item 的商品供應商」拆，不是按訂單。
  - 例：`#P6177` 的 `3200A22`→米盧、`BBL5-17`→尚慶，會落在兩張不同採購單。
- 分組完，**每個供應商一張採購單**。

---

## 四、採購單 → JPG（比照報價單，零件都現成）

- 採購單版型：**已有 `src/components/pdf/PurchaseOrderPDF.tsx`**。
- JPG 生成：**比照 `QuotePDF.tsx`(line ~629) / `WorkOrderPDF.tsx`(line ~736-771) 現成做法** — react-pdf 產 PDF → `pdfjs` 渲染頁面到 canvas → `canvas.toBlob('image/jpeg', 0.92)`。
- 兩種回傳方式（你們選一種）：
  - **(A) 回 base64**：API response 直接帶 `jpgBase64`（排程端直接存檔）——最省事。
  - **(B) 存檔回 URL**：存 Drive/公開路徑，回 `jpgUrl`。
- 若 JPG 只能在瀏覽器端算（pdfjs 需 browser canvas），可改為：API 只建單＋回 PDF buffer，JPG 由另一個既有 client 流程算；**但最理想是 API 直接回 JPG**（排程端是後端呼叫，無瀏覽器）。若需 server 端算 JPG，可用 `pdfjs-dist` + node canvas，或 react-pdf `renderToBuffer` + PDF 轉圖庫。

---

## 五、驗收案例（用這批測）

POST 這段 `pasteText`：
```
3200A22 21y #P6177
BBL5-17 14y #P6177
BBL5-09 1y #P6177
BBL5-12 1y #P6177
BBL5-19 1y #P6177
2200A71 12y #P6181
1800A04 9y #P6181
2200A76 4y #P6181
谷806 2件 #P6180
谷PVC806 12y #P6180
LY9705 11y #P6182
LY9409 6y #P6182
BG116 20y #P6178
BG114 1y #P6178
BG115 1y #P6178
BG102 1y #P6178
```
**預期**：建 5 張採購單（米盧/尚慶/谷懋/LY蘭陽/布穀），各回一張 JPG；`谷PVC806`、`BG116` 等若商品目錄沒有 → 進 unmatched。

---

## 六、排程端會怎麼呼叫（給你參考）

排程系統（Python 後端）會：
```
POST https://cushion-quote.vercel.app/api/sheets/purchases/from-paste
Body: { pasteText, returnJpg: true }
→ 收到 purchaseOrders[].jpgBase64 → 存成 檔 → 開資料夾給老闆傳廠商
```

## 七、認證

- 若此端點需權限，請提供**排程系統可用的呼叫方式**（API key header 或 service token），因為排程端是後端 server 對 server，非瀏覽器登入。

---

## 附：可重用的現有程式
| 用途 | 檔案/函式 |
|---|---|
| 解析採購清單 | `src/lib/purchase-paste-parser.ts` → `parsePurchasePasteText` |
| 對帳商品目錄 | 同上 → `resolveParsedLines`, `summarizeCaseRefs`, `detectPrimaryCaseId` |
| 商品/供應商欄位 | `src/lib/types.ts` → `PurchaseProduct.supplier/supplierId/colorCode`, `Supplier` |
| 建採購單 | `src/app/api/sheets/purchases/route.ts`（POST，含 supplierSnapshot） |
| 採購單版型 | `src/components/pdf/PurchaseOrderPDF.tsx` |
| PDF→JPG | `src/components/pdf/QuotePDF.tsx`(~629)、`WorkOrderPDF.tsx`(~736) |
