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

---

## 10. 實作結果（繃布報價端，2026-08-28）

三個需求＋回應擴充**全部上線**（commit `b0a84d2` 起）。以下是排程端串接時要知道的事。

### 10.1 已實作的介面

| 需求 | 端點 | 狀態 |
|---|---|---|
| C 查詢 | `GET /api/sheets/products/lookup?codes=A,B,C`（`x-api-key` 同 from-paste） | ✅ |
| A 覆寫 | `POST /api/sheets/purchases/from-paste` + `supplierOverrides` | ✅ |
| B 指定建檔 | 同上 + `createMissingWithSupplier: true` | ✅ |
| 回應擴充 | `items[].supplierUsed / supplierFromCatalog / supplierSource`、頂層 `catalogMismatch`、`warnings` | ✅ |
| 相容 | 三欄位皆選填；不傳時行為與過去完全相同（既有 27 個測試原樣通過） | ✅ |
| dryRun | 所有判斷與新欄位照算，只是不落地 | ✅ |

### 10.2 lookup 回應（實際格式）

```jsonc
{
  "success": true,
  "products": [
    { "code": "2200A21", "exists": true, "matchType": "fuzzy",   // ← 注意
      "productCode": "TT-S彈簧2.1", "productName": "…", "specification": "…", "unit": "…",
      "supplierId": "PS013", "supplierName": "大同", "supplierFullName": "大同沙發材料有限公司",
      "inactiveMatch": false, "template": null },
    { "code": "SC598-85", "exists": true, "matchType": "exact", "productCode": "SC59885", "supplierName": "勝騏SC", … },
    { "code": "XXX999", "exists": false, "matchType": null, …,
      "inactiveMatch": false,
      "template": { "productCode": "XXX001", "supplierId": "PS0xx", "supplierName": "…" } }   // autoCreate 會複製誰、繼承誰；null＝建不了檔（除非 createMissingWithSupplier）
  ],
  "suppliers": [ { "supplierId": "PS004", "name": "翰銓國際總代理", "shortName": "米盧" }, … ]   // 可用的供應商名稱
}
```

**lookup 與 from-paste 用同一個解析器比對**，所以 lookup 看到什麼，建單就會對到什麼。

### 10.3 一個比「目錄掛錯」更根本的原因：數字模糊比對

驗收時發現 `2200A21` **目錄裡根本沒有**。它會「掛到大同」是因為解析器有一層「數字相同就算對到」的模糊比對，把它對到大同的 **`TT-S彈簧2.1`**（一個彈簧）。這就是你們看到「2200A21 掛成大同」的真相，`GC31606` 之前掛阿布也是同類（目前目錄已有正確的 GC31606 → 綠都GC）。

因此 A 的行為比規格多一條：

- 貼上色號**精確**對到目錄商品、但目錄掛的廠商 ≠ 指定廠商 → 只換開單對象，列 `catalogMismatch`（規格原意）。
- 貼上色號只是**模糊**對到**別家**商品、且有指定廠商 → **不拿那個商品開單**（品名／單價都是別人的），該行視為查無：
  - 有 `createMissingWithSupplier: true` → 用正確色號＋指定廠商建新商品，再開單（`autoCreated[].supplierSource = "override"`，`catalogMismatch` 會註明 `matchedProductCode` 與 `note: "模糊比對（目錄無此色號）"`）
  - 沒有 → 留在 `unmatched`，`reason` 以「模糊比對到他廠商品 …」開頭
- 模糊對到**同一家**（例如 `SC598-85` → `SC59885`）不受影響，照常建單。

**建議排程端**：lookup 回 `matchType: "fuzzy"` 且 `supplierName` 跟你們對照表不同的色號，一律放進 `supplierOverrides` 並開 `createMissingWithSupplier`。

### 10.4 其他行為

- 供應商名稱比對：簡稱（米盧、綠都GC、阿布ABU…）或全名皆可，不分大小寫與空白；查無 → 該行 `unmatched`（reason「supplierOverrides 指定的供應商不存在『X』」）＋ `warnings`，不靜默改用目錄、不建檔。
- 指定廠商建檔：有同前綴範本就沿用規格／單位／單價、只換供應商；沒範本也會建最小商品（面料、碼、單價 0）。`notes` 會寫「供應商依呼叫端指定為 X」。
- 範本選取多一層退回：連字號前綴（`SC598-85`→`SC598`）找不到時退回字母前綴（`SC`）。
- `items[]` 另附 `quantity`（＝qty）與 `orderNo`（＝caseRef 去掉 #），對齊規格範例。
- 不動商品主檔的既有供應商；主檔修正仍由人決定。

### 10.5 驗收（規格第 7 節原文，本機接同一份目錄、dryRun）

```
米盧       → 2200A21[override]、2200A71[catalog]
蘭陽LY     → LY9804[catalog]
綠都GC     → GC74027[catalog]、GC74020[catalog]、GC75504[catalog]、GC31606[override]
阿布ABU    → ABU1038A-102[catalog]
布谷BG     → BG107[catalog]
勝騏SC     → SC598-85[catalog]、SC5762[catalog]、SC5756[catalog]
unmatched: []
autoCreated: [{"productCode":"2200A21","copiedFrom":"","supplier":"米盧","supplierSource":"override"}]
catalogMismatch: [{"productCode":"2200A21","catalog":"大同","used":"米盧","matchedProductCode":"TT-S彈簧2.1","note":"模糊比對（目錄無此色號）"}]
```

與預期表一致；`catalogMismatch` 只有 1 筆是因為目錄現在已有正確的 GC31606（2026-08-28 建）。舊 payload（不帶新欄位）與「指定不存在的廠商」兩個相容／防呆案例亦通過。

繃布端沒有 `SCHEDULER_API_KEY` 本機副本，線上請由排程端以 `dryRun: true` 再打一次同一組資料確認。
