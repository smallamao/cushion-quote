# 客戶主檔優化設計規格

## 概述

將現有的單層客戶主檔升級為「公司 + 聯絡人」兩層架構，並加入名片拍照辨識自動建檔功能。優化列表頁搜尋篩選體驗，改為側欄詳情面板的互動模式，為後續案件管理與客戶貢獻度分析打好基礎。

## 第一階段範圍（本次實作）

### 1. 資料架構：公司 + 聯絡人兩層

#### 公司（Company）— 改造現有 Client

現有 `Client` interface 移除個人聯絡欄位，保留公司層級資訊：

```typescript
interface Company {
  id: string;              // 維持 CLI-{timestamp} 格式
  companyName: string;
  shortName: string;
  clientType: ClientType;
  channel: Channel;
  address: string;
  taxId: string;
  commissionMode: CommissionMode | "default";
  commissionRate: number;
  commissionFixedAmount: number;
  paymentTerms: string;
  defaultNotes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  notes: string;
}
```

#### 聯絡人（Contact）— 新增

```typescript
interface Contact {
  id: string;              // CON-{timestamp} 格式
  companyId: string;       // 關聯至 Company.id
  name: string;
  role: string;            // 自由文字：老闆、採購、設計師、工程...
  phone: string;
  phone2: string;
  lineId: string;
  email: string;
  businessCardUrl: string; // Google Drive 圖片 URL
  isPrimary: boolean;      // 主要聯絡人標記
  createdAt: string;
  updatedAt: string;
}
```

#### 向後相容

- 現有的 `Client` type 保留為 alias，映射為 Company + 其下的主要聯絡人，避免報價編輯器等既有功能大幅改動。
- 現有客戶資料的 `contactName`、`phone`、`phone2`、`lineId`、`email` 遷移為該公司的第一位聯絡人（isPrimary: true）。

### 2. Google Sheets 結構

#### 「客戶資料庫」工作表（改造）

移除個人聯絡欄位，保留公司層級：

| 欄 | 欄位 | 類型 |
|---|---|---|
| A | id | string |
| B | companyName | string |
| C | shortName | string |
| D | clientType | string |
| E | channel | string |
| F | address | string |
| G | taxId | string |
| H | commissionMode | string |
| I | commissionRate | number |
| J | paymentTerms | string |
| K | defaultNotes | string |
| L | isActive | boolean |
| M | createdAt | date |
| N | updatedAt | date |
| O | notes | string |
| P | commissionFixedAmount | number |

#### 「聯絡人」工作表（新增）

| 欄 | 欄位 | 類型 |
|---|---|---|
| A | id | string |
| B | companyId | string |
| C | name | string |
| D | role | string |
| E | phone | string |
| F | phone2 | string |
| G | lineId | string |
| H | email | string |
| I | businessCardUrl | string |
| J | isPrimary | boolean |
| K | createdAt | date |
| L | updatedAt | date |

### 3. 名片辨識流程

**技術方案：** Gemini Flash（免費額度）

**流程：**
1. 用戶點擊「名片建檔」按鈕
2. 選擇圖片檔案（或手機拍照）
3. 前端將圖片上傳至 API route
4. API route 做兩件事（並行）：
   - 將圖片上傳至 Google Drive 指定資料夾，取得 URL
   - 將圖片送 Gemini Flash API，prompt 要求回傳結構化 JSON
5. 回傳辨識結果 + 圖片 URL 給前端
6. 前端自動填入聯絡人表單欄位，用戶可修正
7. 確認後儲存聯絡人 + 圖片 URL

**Gemini prompt 策略：**
- 要求回傳 JSON：`{ name, role, phone, phone2, lineId, email, companyName }`
- 如果辨識到公司名稱且與現有公司不符，提示用戶確認
- 辨識失敗時 graceful fallback：顯示「無法辨識，請手動輸入」

**圖片儲存：**
- Google Drive 建立「繃布報價-名片」資料夾
- 檔名格式：`{companyId}_{contactId}_{timestamp}.jpg`
- 儲存公開可讀的分享連結到 Sheet

### 4. 列表頁優化

#### 搜尋與篩選
- 維持全文搜尋（搜尋公司名、簡稱、聯絡人姓名、電話、統編）
- 新增篩選：客戶類型 dropdown、通路 dropdown
- 新增排序：名稱（預設）、建立日期、最近更新
- 新增「顯示停用客戶」toggle（預設隱藏）

#### 表格欄位
| 公司名稱（含簡稱） | 類型 | 通路 | 主要聯絡人 | 電話 | 狀態 | 操作 |
|---|---|---|---|---|---|---|
| 公司名 + 簡稱副行 | 類型標籤 | 通路標籤 | isPrimary 的聯絡人姓名 | 主要聯絡人電話 | 啟用/停用 | 檢視 |

- 統編移至詳情面板
- 點擊整列開啟側欄面板
- 「檢視」按鈕也可開啟面板

#### 新增按鈕區
- 「新增公司」按鈕 — 開啟空白側欄面板
- 「名片建檔」按鈕 — 直接進入名片上傳流程，辨識後：
  - 如果辨識出的公司名稱匹配現有公司 → 自動關聯，新增為該公司的聯絡人
  - 如果無匹配 → 同時建立新公司 + 聯絡人，用戶可修改公司資料

### 5. 側欄詳情面板

#### 面板規格
- 從右側滑入，寬度約 480px（桌面）或全螢幕（手機）
- 點擊面板外區域或 X 按鈕關閉
- 背景列表加上半透明遮罩

#### 面板頂部
- 公司名稱（大字）
- 類型標籤 + 通路標籤
- 建立日期

#### Tab 結構

**Tab 1：公司資料**
- 基本資訊區：公司名稱、簡稱、類型、通路
- 商務設定區：統編、佣金模式（含條件欄位）、付款條件、預設備註
- 公司地址
- 備註
- 所有欄位可直接 inline 編輯

**Tab 2：聯絡人**
- 頂部操作列：「+ 新增聯絡人」「📇 名片建檔」
- 聯絡人卡片列表，每張卡片顯示：
  - 姓名、角色、電話
  - 名片縮圖（有的話）
  - 「主要」標記（isPrimary）
  - 編輯、更多選單（設為主要、刪除）
- 點擊「編輯」展開 inline 表單：姓名、角色、電話、電話2、LINE、Email
- 名片圖片區：縮圖預覽、點擊放大、重新上傳

**Tab 3：報價歷史**（整合現有功能）
- 將 `ClientQuoteHistoryDialog` 的內容改為嵌入 tab
- 顯示該公司所有報價版本：版本ID、日期、案名、狀態、金額
- 可點擊跳轉到報價編輯頁

#### 底部操作列
- 左側：「停用公司」按鈕（附確認 dialog）
- 右側：「儲存修改」按鈕

### 6. API 路由

#### `/api/sheets/clients`（改造）
- GET：回傳公司列表（不含聯絡人細節，但包含 primaryContact 摘要）
- POST：建立公司
- PATCH：更新公司

#### `/api/sheets/contacts`（新增）
- GET `?companyId=xxx`：取得某公司的所有聯絡人
- POST：建立聯絡人
- PATCH：更新聯絡人
- DELETE：刪除聯絡人

#### `/api/business-card/recognize`（新增）
- POST：接收圖片，呼叫 Gemini Flash 辨識，回傳結構化資料
- 同時上傳圖片至 Google Drive，回傳圖片 URL

### 7. Hook 改造

#### `useClients`（改造為 `useCompanies`）
- 管理公司列表
- 搜尋、篩選、排序邏輯
- 快取策略維持 5 分鐘 localStorage

#### `useContacts`（新增）
- 依 companyId 載入聯絡人列表
- CRUD 操作
- 快取隨公司快取連動

#### `useBusinessCardRecognition`（新增）
- 管理名片上傳與辨識流程
- 上傳進度、辨識狀態、結果回傳

## 第二階段（後續規劃，本次不實作）

- 列表加入貢獻度欄位（累積報價金額、案件數）
- 排序依貢獻度
- 案件管理對接
- 客戶分析儀表板

## 技術決策

| 決策 | 選擇 | 理由 |
|---|---|---|
| 架構模式 | 公司 + 聯絡人兩層 | 支撐案件管理與貢獻度分析 |
| 名片 OCR | Gemini Flash 免費額度 | 中文準確度高、免費額度足夠 B2B 量級 |
| 圖片儲存 | Google Drive | 與現有 Sheets 生態一致 |
| 面板模式 | 右側滑出面板 | 列表與詳情同時可見，擴充性好 |
| 向後相容 | Client type alias + 資料遷移 | 不破壞報價編輯器等既有功能 |
