# 繃布報價系統 API 擴充需求：採購單「供應商指定」

**提出方**：馬鈴薯沙發排程系統（用布量 → 自動建採購單）
**對象端點**：`POST /api/sheets/purchases/from-paste`
**日期**：2026-08-28

---

## 1. 背景：現在為什麼會出錯

排程系統算完用布量後，把採購清單 POST 給 from-paste 建採購單。**但目前 payload 沒有任何供應商欄位**：

```json
{ "pasteText": "...", "purchaseDate": "...", "returnJpg": true,
  "autoCreateMissing": true, "source": "...", "dryRun": false, "groupBySupplier": true }
```

供應商 **100% 由繃布端查「商品目錄」該色號建檔時掛的廠商** 決定。因此只要目錄掛錯或查無，採購單就一定錯，**呼叫端無法修正**。

### 實際發生過的三類錯誤

| 類型 | 實例 | 後果 |
|---|---|---|
| 目錄掛錯廠商 | `2200A21`（應米盧）掛成 **大同**；`GC31606`（應綠都GC）掛成 **阿布ABU** | 跟錯的廠商叫料 |
| 目錄查無 → 整行被丟棄 | `ABU1038A-102` 落在 `unmatched` | **漏採購**（最嚴重，師傅缺料才發現） |
| autoCreate 繼承錯廠商 | `S6934` 目錄沒有 → 自動複製同前綴 `S-148`（屬金揚五金＝五金行）→ 採購單開到 **金揚五金**，實際應為尚慶 | 開單給完全不相干的廠商，要人工作廢重開 |

呼叫端**知道正確答案**（有老闆逐次確認過的色號→供應商對照表），只是**沒有欄位可以告訴繃布**。

---

## 2. 需求 A（必要）：per-色號 供應商覆寫

### Request 新增欄位

```jsonc
{
  "pasteText": "2200A21 17y #P6047\nGC31606 6y #S966\n...",
  "supplierOverrides": {          // 新增，選填。key=色號(productCode)，value=供應商名稱
    "2200A21": "米盧",
    "GC31606": "綠都GC"
  }
}
```

### 行為

1. 解析每一行取得 `productCode`。
2. **若 `supplierOverrides` 有該 code → 採購單分組一律用指定的供應商**，忽略目錄上掛的廠商。
3. 沒指定的 code → 維持現行邏輯（查目錄）。
4. 供應商名稱以**現有廠商主檔的名稱字串**比對；查無該廠商 → 不要靜默改用目錄值，請回 `warnings` 明確告知（見第 5 節）。

> **只改採購單的分組/開單對象即可，不需要改寫商品主檔。** 主檔要不要改由人決定（我們會另外提醒老闆修）。

---

## 3. 需求 B（必要）：缺件建檔時指定供應商

現行 `autoCreateMissing: true` 是「複製同前綴既有商品」→ **會繼承那個範本的供應商**，這正是 S6934 開到金揚五金的原因。

### Request 新增欄位

```jsonc
{
  "autoCreateMissing": true,
  "createMissingWithSupplier": true   // 新增，選填，預設 false（維持現行行為）
}
```

### 行為

當 `createMissingWithSupplier: true` 且該 code 在 `supplierOverrides` 內：

- 建立新商品時，**供應商直接用 `supplierOverrides` 指定的值**，不要從範本繼承。
- 其餘欄位（規格、單位…）仍可沿用同前綴範本或留空。
- 若該 code 不在 `supplierOverrides` → 回到現行「複製前綴範本」邏輯。

**若無法安全建檔（例如指定的供應商不存在）→ 寧可回 `unmatched` 並附原因，也不要用錯誤的供應商建檔。**

---

## 4. 需求 C（強烈建議）：唯讀查詢端點（可先做，最小成本）

讓呼叫端在**建單前**就能發現目錄不一致，避免事後作廢。

```
GET /api/sheets/products/lookup?codes=2200A21,GC31606,ABU1038A-102
Header: x-api-key
```

```jsonc
{
  "products": [
    { "code": "2200A21",      "exists": true,  "supplierId": "PS007", "supplierName": "大同" },
    { "code": "GC31606",      "exists": true,  "supplierId": "PS011", "supplierName": "阿布ABU" },
    { "code": "ABU1038A-102", "exists": false, "supplierId": null,    "supplierName": null }
  ]
}
```

有這支，我們就能在送單前列出「目錄 vs 正確對照」的差異給老闆確認，**不必靠建單失敗才發現**。

---

## 5. Response 擴充（三個需求共用）

`purchaseOrders[].items[]` 每一項請附上實際使用的供應商與來源：

```jsonc
{
  "productCode": "2200A21",
  "quantity": 17,
  "unit": "碼",
  "orderNo": "P6047",
  "supplierUsed": "米盧",          // 這張單實際開給誰
  "supplierFromCatalog": "大同",   // 目錄原本掛的
  "supplierSource": "override"     // "override" | "catalog" | "autoCreated"
}
```

並在頂層新增（方便我們提醒老闆修主檔）：

```jsonc
{
  "catalogMismatch": [
    { "productCode": "2200A21", "catalog": "大同",     "used": "米盧" },
    { "productCode": "GC31606", "catalog": "阿布ABU", "used": "綠都GC" }
  ],
  "warnings": [
    "supplierOverrides 指定的供應商『XXX』不存在，該行未建單"
  ]
}
```

---

## 6. 相容性要求

- **三個新欄位全部選填**；不傳時行為與現在**完全相同**（不可影響繃布端既有的手動貼上流程）。
- `dryRun: true` 時，上述所有判斷與回應欄位**都要照樣計算並回傳**，只是不落地。
  （我們的流程一律先 dryRun 對帳、確認無誤才正式送。）

---

## 7. 驗收案例（用 2026-08-28 這批真實資料）

送出：

```
pasteText:
2200A21 17y #P6047
2200A71 10y #P6224
LY9804 13y #P6213
GC74027 10y #P6214
GC74020 7.5y #P6214
GC75504 7y #P6224
GC31606 6y #S966
ABU1038A-102 19y #P6215
BG107 8.5y #P6216
SC598-85 8.5y #P6216
SC5762 15y #P6218
SC5756 15y #P6227

supplierOverrides: { "2200A21": "米盧", "GC31606": "綠都GC" }
createMissingWithSupplier: true
dryRun: true
```

**預期結果**：

| 供應商 | 應包含色號 |
|---|---|
| 米盧 | 2200A21、2200A71 |
| 蘭陽LY | LY9804 |
| 綠都GC | GC74027、GC74020、GC75504、**GC31606** |
| 阿布ABU | ABU1038A-102 |
| 布谷BG | BG107 |
| 勝騏SC | SC598-85、SC5762、SC5756 |

- `unmatched` = **空**
- `catalogMismatch` = 2 筆（2200A21、GC31606）
- 現況（未實作前）錯在：2200A21 跑到「大同」、GC31606 跑到「阿布ABU」

---

## 8. 補充：現行 payload（供對照）

```jsonc
{
  "pasteText": "色號 數量單位 #訂單\n（一行一色）",
  "purchaseDate": "YYYY-MM-DD",
  "returnJpg": true,          // 回傳採購單 PDF/JPG base64
  "autoCreateMissing": true,
  "source": "排程系統-用布量",
  "dryRun": false,
  "groupBySupplier": true
}
```

認證：Header `x-api-key`。
現行回應：`{ success, purchaseOrders[], unmatched[], autoCreated[], warnings[] }`。

---

## 9. 優先順序

1. **需求 C（查詢端點）** — 成本最低、馬上能防止漏單與錯廠商
2. **需求 A（供應商覆寫）** — 根治開單對象錯誤
3. **需求 B（建檔指定供應商）** — 根治 autoCreate 繼承錯廠商（金揚五金那類）

三個都做完，排程系統這端就能保證「採購單開給正確廠商」，不必再靠人工事後檢查與作廢。
