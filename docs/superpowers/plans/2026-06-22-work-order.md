# 訂製訂單管理系統 實作規格

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 建立完整的訂製訂單管理模組，取代 Notion 訂製訂單，涵蓋：工單製作（取代 Keynote）、訂單執行追蹤、成本與毛利紀錄。

**Architecture:** 新增 Google Sheets 工作表「訂製訂單」作為主要資料來源。前端分三個區塊：基本資訊、工單細節（含 PDF 輸出）、財務紀錄。與現有案件、報價版本、AR、採購單模組整合。

**Tech Stack:** Next.js 14, TypeScript, @react-pdf/renderer, Cloudinary, Google Sheets

---

## 功能範圍

### 取代什麼

| Notion 功能 | 本模組對應 |
|---|---|
| 訂製訂單列表（604 筆） | 訂單列表頁，可搜尋/篩選 |
| 品項/狀態/日期欄位 | 訂單基本資訊區塊 |
| 成本/運費/毛利率 | 財務區塊 |
| 留言貼工單圖片 | 工單細節區塊 → PDF 輸出 |
| Keynote 製作工單 | 系統內工單編輯器 → PDF |
| LINE 傳工單給師傅 | PDF 下載後透過 LINE 傳送（不變） |

### 兩種建立方式

**A. 從報價成交建立**：報價版本標記「成交」後，一鍵建立訂單，自動帶入客戶、報價金額、材質、補充說明。

**B. 直接建立（B2B 月結）**：不需報價，直接填寫訂單內容。

---

## 資料模型

### Google Sheets：訂製訂單

#### 欄位定義（共 36 欄）

| # | 欄位名稱 | 說明 | 範例 |
|---|---|---|---|
| A | orderId | 唯一 ID，格式 ORD-YYYYMM-NNN | ORD-202606-001 |
| B | caseId | 關聯案件 ID（可空） | S892 |
| C | versionId | 關聯報價版本 ID（可空） | V-xxx |
| D | clientName | 客戶名稱快照 | 秦薏喬 |
| E | orderNumber | 工單顯示編號 | S892 (20251218-01) |
| F | orderTitle | 訂製內容 | 木柵 訂製床頭繃布 |
| G | itemCategory | 品項分類 | 縫布裱板 |
| H | deliveryMethod | 配送方式 | 到府施工 |
| I | status | 訂單狀態 | production |
| J | sourceType | quote \| direct | quote |
| K | orderDate | 下單日（客戶確認日） | 2026-06-01 |
| L | supplierOrderDate | 向供應商下單日 | 2026-06-02 |
| M | productionDueDate | 生產期限 | 2026-06-15 |
| N | installDate | 安裝/出貨日 | 2026-06-17 |
| O | completedDate | 完成日 | 2026-06-17 |
| P | quotedAmount | 報價金額（含稅） | 8400 |
| Q | materialCost | 材質成本 | 2800 |
| R | laborCost | 工資成本 | 1200 |
| S | shippingCost | 運費 | 0 |
| T | otherCost | 其他成本 | 0 |
| U | materialName | 材質名稱 | OTE 貓抓布 1050A-110 |
| V | materialCode | 材質色號 | 1050A-110 |
| W | materialImageUrl | 材質樣品圖 URL | https://... |
| X | deadline | 交期說明（文字） | 急單，做好出 |
| Y | itemsJson | 品項清單 JSON | [...] |
| Z | notesJson | 特殊備註 JSON | [...] |
| AA | photosJson | 附圖 URL 陣列 JSON | [...] |
| AB | invoiceStatus | 開票狀態 | pending |
| AC | isArchived | 是否歸檔 | FALSE |
| AD | notes | 備忘（內部） | 客戶說急 |
| AE | createdAt | 建立時間 ISO | 2026-06-22T10:00:00Z |
| AF | updatedAt | 更新時間 ISO | 2026-06-22T10:00:00Z |
| AG | createdBy | 建立者 email | smallamao79@gmail.com |

#### 計算欄位（不存 Sheets，前端計算）
- `totalCost = materialCost + laborCost + shippingCost + otherCost`
- `netProfit = quotedAmount - totalCost`
- `marginRate = netProfit / quotedAmount * 100`

### 品項分類選項（itemCategory）
```
坐/背墊 | 臥榻墊 | 縫布裱板 | 到府清潔 | 到府施工 |
訂製沙發 | 泡棉內裏 | 皮/布套 | 維修 | 大和樂活
```

### 配送方式（deliveryMethod）
```
自運 | 宅配 | 到府施工
```

### 訂單狀態（status）
```
production（排程/生產中）→ waiting（待出貨）→ completed（完成）→ cancelled（取消）
```

### 開票狀態（invoiceStatus）
```
pending（待開）| issued（已開）| exempt（免開）
```

### itemsJson 結構
```typescript
interface OrderItem {
  id: string;
  name: string;         // e.g., "坐墊外布套"
  dimensions: string;   // e.g., "w65 x 68 x 13cm"
  quantity: string;     // e.g., "*2pcs"
  foamSpec: string;     // e.g., "0.08 半硬軟 + 0.06 硬"
  foamColor: "orange" | "red" | null;
}
```

### notesJson 結構
```typescript
interface OrderNote {
  id: string;
  text: string;
  color: "black" | "red" | "orange";
  isWarning: boolean;   // true → 加 ⚠️
}
```

---

## 使用者介面

### 1. 訂單列表頁 `/orders`

**功能：**
- 搜尋：案件號、客戶名稱
- 篩選：品項分類、訂單狀態、月份
- 排序：建立日期（預設降序）

**列表欄位：**
```
工單編號 | 客戶 | 品項分類 | 狀態 | 下單日 | 安裝/出貨日 | 操作
```

**狀態 Badge 顏色：**
- 排程/生產中 → 藍色
- 待出貨 → 橘色
- 完成 → 綠色
- 取消 → 灰色

**右上角：** 「新增訂單」按鈕

---

### 2. 訂單詳情/編輯頁 `/orders/[id]`

分三個 Tab：

#### Tab A：基本資訊

```
工單編號     [S892 (20251218-01)]         ← 可編輯
訂製內容     [木柵 訂製床頭繃布]
品項分類     [縫布裱板 ▼]
配送方式     [到府施工 ▼]
狀態         [排程中 ▼]
────────────────────────────────────
下單日       [2026-06-01]
向廠商下單日  [2026-06-02]
生產期限     [2026-06-15]
安裝/出貨日  [2026-06-17]
完成日       [           ]
────────────────────────────────────
開票狀態     [待開 ▼]
已歸檔       [ ] 
內部備忘     [文字輸入]
```

連結資訊（唯讀，帶入自報價）：
- 關聯案件：`S892` → 連結到案件頁
- 關聯報價版本：`V-xxx` → 連結到報價頁
- 關聯 AR：有則顯示，無則空

---

#### Tab B：工單細節

用於產出施工工單 PDF。

**材質區塊：**
```
材質名稱   [OTE 貓抓布 1050A-110]
材質色號   [1050A-110]
材質圖片   [預覽圖] [上傳/更換]
交期說明   [急單，做好出]          ← 文字，非日期
安裝日說明 [6/17 下午]             ← 文字，非日期（工單顯示用）
```

**品項清單：**
可新增/刪除/拖排，每筆：
```
名稱 [_______________] 尺寸 [_______________] 數量 [______]
泡棉規格 [_______________]  顏色 [無▼/橘▼/紅▼]
```

**特殊備註（◆）：**
可新增/刪除/拖排，每筆：
```
文字 [___________________________] 顏色[黑▼] ☐ 警告⚠️
```

**附圖：**
- 上傳按鈕（Cloudinary）
- 縮圖 grid，可刪除
- 說明：材質樣品照、沙發現況照、手繪標示圖

**底部：**
- 「儲存」按鈕
- 「產生工單 PDF」按鈕 → 新分頁開啟 PDF 預覽 + 下載

---

#### Tab C：財務

```
───── 收入 ─────────────────────────
報價金額（含稅）   $8,400        ← 從報價版本帶入，可覆寫

───── 成本 ─────────────────────────
材質成本           $[    2,800 ]
工資成本           $[    1,200 ]
運費               $[        0 ]
其他成本           $[        0 ]

───── 結果（自動計算）──────────────
總成本             $4,000
淨利潤             $4,400
毛利率             52.4%
```

欄位說明：
- 報價金額：從關聯版本含稅總額帶入，可手動覆寫（B2B 月結無版本時手填）
- 成本欄位全部手動填寫

---

### 3. 新增訂單 `/orders/new`

兩種模式切換：

**從報價建立：**
- 輸入 versionId 或案件號搜尋
- 選擇版本後自動帶入：客戶名、報價金額、材質、補充說明解析為品項/備註

**直接建立（B2B）：**
- 填寫客戶名稱、工單編號（手填）
- 其餘欄位全手動

---

### 4. 報價成交入口

**修改** 報價紀錄頁面 `/quotes`：

版本狀態為「成交（accepted）」的版本列：
- 若無關聯訂單 → 顯示「📋 建立訂單」按鈕
- 若已建立 → 顯示「查看訂單 ORD-xxx」連結

---

## 施工工單 PDF 格式

### 版面規格（對應 Keynote 格式）

```
┌──────────────────────────────────────────┐
│                               [材質樣品圖]│
│  編號：S892 (20251218-01)                 │
│                                           │
│  訂製內容：木柵 訂製床頭繃布              │
│  材質：OTE 貓抓布 1050A-110  ← 紅色      │
│  安裝日：6/17 下午  ← 紅色               │
│  交期：急單，做好出  ← 紅色              │
│                                           │
│  補充說明：                               │
│    · 單面床頭板                           │
│      W79.7 x H35.7cm * 二只              │
│      [泡棉規格 橘色字]                    │
│                                           │
│  ◆ 貼合1.5" 中密度泡棉，無貼合絲棉       │
│  ◆ [紅色備註] ⚠️                         │
│                                           │
│  [photo 1]    [photo 2]                   │
│  [photo 3]    [photo 4]                   │
└──────────────────────────────────────────┘
```

**字型：** NotoSansTC（現有）
**色彩：**
- 材質、安裝日、交期 → `#E53E3E`（紅）
- 品項泡棉規格 → `#DD6B20`（橘）
- 備註依 color 欄位：黑 / 紅 / 橘
- 附圖：底部 2 欄 grid，最多 6 張

---

## API 設計

```
GET    /api/sheets/orders                   列表（?caseId=&status=&category=&month=&q=）
POST   /api/sheets/orders                   新建
GET    /api/sheets/orders/[id]              取單筆
PUT    /api/sheets/orders/[id]              完整更新
PATCH  /api/sheets/orders/[id]/status       只改狀態
```

### POST /api/sheets/orders

Request body：
```typescript
// 從報價建立
{ sourceType: "quote", versionId: string }

// 直接建立
{ sourceType: "direct", clientName: string, orderNumber: string }
```

從報價建立時，系統自動擷取：
- 版本 → caseId, clientName, quotedAmount, materialId（第一筆品項）
- 案件 → orderNumber（caseId）
- 材質庫 → materialName, materialCode, materialImageUrl
- 版本 scopeDescription → 解析成 notesJson 初始值（每行 = 一筆 note）

---

## 實作任務拆解

### Task 1：型別定義 + Sheet 初始化

**修改** `src/lib/types.ts`：
```typescript
export type OrderStatus = "production" | "waiting" | "completed" | "cancelled";
export type OrderSourceType = "quote" | "direct";
export type OrderDeliveryMethod = "自運" | "宅配" | "到府施工";
export type OrderInvoiceStatus = "pending" | "issued" | "exempt";
export type OrderItemCategory =
  | "坐/背墊" | "臥榻墊" | "縫布裱板" | "到府清潔" | "到府施工"
  | "訂製沙發" | "泡棉內裏" | "皮/布套" | "維修" | "大和樂活";

export interface OrderItem {
  id: string;
  name: string;
  dimensions: string;
  quantity: string;
  foamSpec: string;
  foamColor: "orange" | "red" | null;
}

export interface OrderNote {
  id: string;
  text: string;
  color: "black" | "red" | "orange";
  isWarning: boolean;
}

export interface CustomOrder {
  orderId: string;
  caseId: string;
  versionId: string;
  clientName: string;
  orderNumber: string;
  orderTitle: string;
  itemCategory: OrderItemCategory | "";
  deliveryMethod: OrderDeliveryMethod | "";
  status: OrderStatus;
  sourceType: OrderSourceType;
  orderDate: string;
  supplierOrderDate: string;
  productionDueDate: string;
  installDate: string;
  completedDate: string;
  quotedAmount: number;
  materialCost: number;
  laborCost: number;
  shippingCost: number;
  otherCost: number;
  materialName: string;
  materialCode: string;
  materialImageUrl: string;
  deadline: string;
  items: OrderItem[];
  notes: OrderNote[];
  photos: string[];
  invoiceStatus: OrderInvoiceStatus;
  isArchived: boolean;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

**新增** `src/lib/order-utils.ts`：
- `ORDER_SHEET`, `ORDER_RANGE_DATA`, `ORDER_RANGE_FULL` 常數
- `orderRowToRecord(row: string[]): CustomOrder`
- `orderRecordToRow(r: CustomOrder): string[]`
- `generateOrderId(client): Promise<string>`
- `calcOrderFinancials(order: CustomOrder)`: `{ totalCost, netProfit, marginRate }`

**修改** `src/app/api/sheets/init/route.ts`：加入「訂製訂單」sheet（36 欄）

---

### Task 2：API Routes

**新增** `src/app/api/sheets/orders/route.ts`（GET + POST）

GET 支援 query params：`caseId`, `status`, `category`, `month`(YYYY-MM), `q`(搜尋)，`archived`

POST 邏輯（從報價建立）：
1. 讀 versionId 版本 → 取 caseId, clientName, quotedAmount
2. 讀版本明細第一筆 → materialId
3. 查材質庫 → materialName, materialCode, materialImageUrl
4. 解析 scopeDescription → notesJson（split by \n，每行一筆，color 預設 black）
5. 寫入新 row，回傳 orderId

**新增** `src/app/api/sheets/orders/[id]/route.ts`（GET + PUT）

**新增** `src/app/api/sheets/orders/[id]/status/route.ts`（PATCH）
- body: `{ status: OrderStatus }`
- 若 status = "completed"，自動填入 completedDate = today

---

### Task 3：訂單列表頁

**新增** `src/app/orders/page.tsx`（server component，role: admin）

**新增** `src/app/orders/OrderListClient.tsx`：
- 搜尋框（q）
- 篩選：品項分類 select + 狀態 tab + 月份 select
- 列表：orderId, clientName, orderTitle, itemCategory, status badge, orderDate, installDate, 操作欄
- 點列 → `/orders/[id]`
- 右上角「新增訂單」

**修改** `src/components/layout/nav-links.ts`：
```typescript
import { ClipboardList } from "lucide-react";
{ href: "/orders", label: "訂製訂單", icon: ClipboardList, roles: ["admin"], group: "operations" }
```
放在「排程出貨」後面。

---

### Task 4：訂單詳情頁框架 + Tab A（基本資訊）

**新增** `src/app/orders/[id]/page.tsx`（server component，讀單筆）

**新增** `src/app/orders/[id]/OrderDetailClient.tsx`：
- 三個 Tab：基本資訊 / 工單細節 / 財務
- Tab A：所有基本資訊欄位（orderNumber, orderTitle, itemCategory, deliveryMethod, status, 各日期, invoiceStatus, isArchived, internalNotes）
- 儲存按鈕（PUT /api/sheets/orders/[id]）
- 右上角：狀態快速切換按鈕

關聯資訊列（唯讀）：
- 案件連結（若有 caseId）
- 報價版本連結（若有 versionId）

---

### Task 5：Tab B - 工單細節

在 `OrderDetailClient.tsx` 加入 Tab B：

**材質區塊：**
- materialName, materialCode 文字輸入
- materialImageUrl：圖片預覽 + Cloudinary 上傳
- deadline, installDate 文字輸入（非 date picker，因格式不固定）

**品項清單（OrderItem[]）：**
- 可新增/刪除列
- 每列：name | dimensions | quantity | foamSpec | foamColor select
- 狀態存在 component state，儲存時序列化成 JSON

**特殊備註（OrderNote[]）：**
- 可新增/刪除列
- 每列：text | color select（黑/紅/橘）| isWarning checkbox

**附圖（photos: string[]）：**
- Cloudinary 上傳（複用現有 upload pattern）
- 縮圖 grid，可刪除

**底部：**
- 「儲存工單細節」按鈕
- 「產生施工工單 PDF」按鈕 → `window.open('/orders/[id]/pdf')`

---

### Task 6：Tab C - 財務

在 `OrderDetailClient.tsx` 加入 Tab C：

- quotedAmount 數字輸入（從版本帶入，可覆寫）
- materialCost, laborCost, shippingCost, otherCost 數字輸入
- 自動計算顯示（純前端，不需 API）：
  - 總成本 = materialCost + laborCost + shippingCost + otherCost
  - 淨利潤 = quotedAmount - 總成本
  - 毛利率 = 淨利潤 / quotedAmount（百分比）
- 毛利率顯示顏色：< 20% 紅、20-40% 黃、> 40% 綠

---

### Task 7：施工工單 PDF

**新增** `src/components/pdf/WorkOrderPDF.tsx`：

Props: `order: CustomOrder`

版面（對應 Keynote）：
- 右上角：materialImageUrl 圖片（若有）
- 大標題：`編號：{orderNumber}`（24pt 粗體）
- `訂製內容：{orderTitle}`
- `材質：{materialName}` 紅色
- `安裝日：{deadline}` 紅色（若有）
- `交期：{installDate}` 紅色（若有）
- 分隔線
- 「補充說明：」標題
- 每個 item：`· {name}` 粗體 + `{dimensions} {quantity}` + `{foamSpec}` 橘/紅色
- 分隔線
- 每個 note：`◆ {text}` 依 color 上色，isWarning 加 ⚠️
- 底部 2 欄附圖 grid

**新增** `src/app/orders/[id]/pdf/page.tsx`：
- 動態載入 WorkOrderPDF（`dynamic(() => import(...), { ssr: false })`）
- 用 `PDFViewer` 顯示 + 「下載 PDF」`PDFDownloadLink`

---

### Task 8：報價成交 → 建立訂單入口

**修改** `src/app/quotes/QuotesClient.tsx`：

版本 status === "accepted" 的版本列加入：
- 讀取 `GET /api/sheets/orders?versionId={versionId}` 判斷是否已有訂單
- 無訂單 → 「📋 建立訂單」按鈕
  - 點擊 → POST /api/sheets/orders `{ sourceType: "quote", versionId }`
  - 成功 → `router.push('/orders/{orderId}')`
- 有訂單 → 「查看訂單 {orderId}」連結

---

### Task 9：新增訂單頁（B2B 直接建立）

**新增** `src/app/orders/new/page.tsx`

**新增** `src/app/orders/new/NewOrderClient.tsx`：

兩種模式 radio：
- 「從報價建立」→ 搜尋框輸入案件號/版本ID → 找到版本 → 顯示預覽 → 確認建立
- 「直接建立（B2B）」→ 填 clientName, orderNumber, itemCategory → 建立空白訂單 → 跳轉編輯頁

---

## 驗收標準

- [ ] 訂單列表可搜尋案件號/客戶名，可篩選分類/狀態/月份
- [ ] 報價成交版本可一鍵建立訂單，基本資料自動帶入
- [ ] B2B 可直接建立訂單（不需報價版本）
- [ ] Tab A：基本資訊可完整編輯儲存
- [ ] Tab B：工單細節可新增品項/備註/附圖，可產生 PDF
- [ ] PDF 版面接近現有 Keynote 格式
- [ ] Tab C：財務欄位可填寫，自動計算毛利率
- [ ] 毛利率按數值顯示不同顏色
- [ ] Nav 有「訂製訂單」連結，位於排程出貨後
- [ ] 所有操作限 admin 角色

---

## 不在本次範圍（之後再做）

- Notion 歷史資料匯入（604 筆）
- 師傅手機端工單閱讀介面（師傅目前看 LINE 傳的 PDF）
- 工單與採購單自動連動（供應商下單）
- 完成後的成品照片上傳
- 月度毛利報表（累積多筆訂單後再做）
- 多師傅分工單

---

## 實作順序建議

```
Task 1（型別 + Sheet）→ Task 2（API）→ Task 3（列表）
→ Task 4（詳情框架 + Tab A）→ Task 5（Tab B 工單細節）
→ Task 6（Tab C 財務）→ Task 7（PDF）→ Task 8（報價入口）
→ Task 9（新增頁）
```

Task 7 可在 Task 5 完成後立刻進行，不需等待 Task 6。
