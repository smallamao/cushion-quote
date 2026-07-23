# 交接文件：排程系統 → 繃布報價「採購清單自動建單」API

> 給排程系統（Python 後端）串接用。端點已上線於正式環境。
> 對應需求規格：`docs/API需求_排程系統用布量串接.md`

---

## 0. 上線前設定（繃布報價這邊要先做一次）

**這支端點預設是「停用」的，必須先設好金鑰才會啟用。**

1. 產生一把隨機金鑰：
   ```bash
   openssl rand -hex 32
   ```
2. 到 **Vercel → 專案 cushion-quote → Settings → Environment Variables** 新增：
   - Name：`SCHEDULER_API_KEY`
   - Value：上一步產生的字串
   - Environment：Production（需要的話也加 Preview）
3. 重新部署（或等下次部署）讓環境變數生效。
4. 把**同一把金鑰**用安全管道（非明文貼在群組）給排程系統負責人。

> 未設定 `SCHEDULER_API_KEY` 時，端點會回 **503**（安全預設：寧可停用也不裸奔）。

---

## 1. 端點

```
POST https://cushion-quote.vercel.app/api/sheets/purchases/from-paste
Content-Type: application/json
x-api-key: <SCHEDULER_API_KEY>
```

- 認證用 header `x-api-key`，**不是**瀏覽器登入（server-to-server 專用）。
- 金鑰錯誤 → 401；金鑰未設定 → 503。

---

## 2. Request body

| 欄位 | 必填 | 說明 |
|------|:--:|------|
| `pasteText` | ✅ | 採購清單文字（多行）。格式 `{色號} {數量}{單位} #{訂單號}`，單位支援 y/碼、件/p、只/才/小才、複合(3件+10y)、小數(1.5件) |
| `purchaseDate` | | 採購日期 `YYYY-MM-DD`，預設今天 |
| `returnJpg` | | `true` 時回傳採購單圖檔（見第 4 節，**目前回 PDF**） |
| `source` | | 來源標記，寫進採購單備註，例：`"排程系統-用布量"` |
| `dryRun` | | `true` = 只解析對帳、**不真的建單**（建議先用這個測） |
| `groupBySupplier` | | 預設 `true`，每供應商一張採購單 |

```jsonc
{
  "pasteText": "3200A22 21y #P6177\nBBL5-17 14y #P6177\n2200A71 12y #P6181\n谷806 2件 #P6180\nLY9705 11y #P6182\nBG116 20y #P6178",
  "purchaseDate": "2026-07-23",
  "returnJpg": true,
  "source": "排程系統-用布量"
}
```

---

## 3. Response

```jsonc
{
  "success": true,
  "purchaseOrders": [
    {
      "supplier": "米盧",
      "supplierId": "PS004",
      "orderId": "PS-20260723-01",            // dryRun 時為 null
      "items": [
        { "productCode": "3200A22", "productName": "…", "qty": 21, "unit": "碼", "caseRef": "P6177", "matched": true }
      ],
      "pdfBase64": "data:application/pdf;base64,……",   // ⚠️ 見第 4 節
      "jpgBase64": null,
      "jpgUrl": null
    }
  ],
  "unmatched": [
    { "line": "谷PVC806 12y #P6180", "productCode": "谷PVC806", "reason": "商品目錄查無此色號" }
  ],
  "warnings": ["…"]
}
```

- **`unmatched` 一定要看**：對不到商品目錄的行會列在這，不會靜默丟棄。老闆看到就知道要去補建商品。
- **建單是即時寫入 Google Sheets** 的（除非 `dryRun`）。

---

## 4. ⚠️ 重要：目前回的是 **PDF**，不是 JPG

伺服器端沒有 canvas 影像相依，無法可靠地在 Vercel 產 JPG，所以：

- `returnJpg: true` 時，每張採購單回的是 **`pdfBase64`**（`data:application/pdf;base64,…`），`jpgBase64` 固定為 `null`，並在 `warnings` 附說明。
- **排程端請自行把 PDF 轉 JPG**（Python 很簡單）：

```python
import base64, fitz  # PyMuPDF

def pdf_b64_to_jpg(pdf_base64: str, out_path: str):
    raw = pdf_base64.split(",", 1)[1]           # 去掉 data: 前綴
    doc = fitz.open(stream=base64.b64decode(raw), filetype="pdf")
    pix = doc[0].get_pixmap(dpi=200)
    pix.save(out_path)                           # 存成 .jpg / .png
```

> 若之後希望 API 直接回 JPG，需在繃布報價端加 node-canvas 類相依；目前先用「回 PDF、排程端轉檔」最穩。這點請跟老闆確認可接受。

---

## 5. 建議串接步驟

1. 先用 `"dryRun": true` 打一次 → 確認 `purchaseOrders` 分組張數、`unmatched` 內容符合預期（**不會寫入任何資料**）。
2. 確認無誤後拿掉 `dryRun`（或設 false）→ 正式建單並拿 `pdfBase64`。
3. 把每張 `pdfBase64` 轉 JPG → 存檔 → 開資料夾給老闆傳廠商。

## 6. curl 測試

```bash
curl -X POST https://cushion-quote.vercel.app/api/sheets/purchases/from-paste \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SCHEDULER_API_KEY" \
  -d '{"pasteText":"3200A22 21y #P6177\n2200A71 12y #P6181","dryRun":true}'
```

---

## 7. 已知行為 / 注意事項

- **分組是按「每個色號的商品供應商」拆**，不是按訂單。同一張 `#P6177` 的主色/副色若屬不同供應商，會落在不同採購單。
- **`unmatched` 內容取決於線上商品目錄**：色號要先建在「採購商品」裡才對得到；模糊比對可能把相近碼（例 `谷PVC806`↔`谷806`）視為同一商品，實測請以線上目錄為準。
- 採購單狀態建立為**草稿**；供應商快照（統編/地址/付款條件）建立時一併拍照。
- `caseRef`（#訂單號）寫進採購單品項備註與整張採購單備註，但**不自動關聯到訂製訂單**。
