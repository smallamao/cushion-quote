# CushionQuote v2 — 春懋繃布工程報價系統
## 產品規格書 PRD

**版本**：v0.3
**日期**：2026-03-21
**擁有者**：春懋 / 馬鈴薯沙發工廠
**變更紀錄**：v0.3 — 新增施工加給分級制、多片組合輸入模式；翻修案改為「正常作法+拆舊手動填金額」處理；拆舊工程改為無預設值手動輸入

---

## 一、專案概述

### 1.1 背景

春懋（Chunmao）專營板材繃布/繃皮工程，服務對象涵蓋三種通路：批發（窗簾/軟裝店）、室內設計師、終端屋主。目前報價流程依賴人工計算，缺乏統一的定價體系、材質管理、和報價紀錄。

### 1.2 目標

建立一套輕量化的網頁報價工具，實現：
- 統一的三通路定價體系（批發/設計師/屋主）
- 材質（面料）牌價資料庫，可維護、可查詢
- 一鍵輸出專業報價單 PDF
- Google Sheets 整合，作為資料庫後端與報價歷史紀錄

### 1.3 使用者

- 主要使用者：懋懋（老闆）、工廠 2-3 位同事
- 使用場景：辦公室電腦、偶爾手機查看
- 技術程度：非工程師，需要直覺操作

---

## 二、技術架構

### 2.1 前端

| 項目 | 選擇 | 理由 |
|------|------|------|
| 框架 | Next.js (App Router) | 檔案式路由、API Routes 保護金鑰、Vercel 零設定部署 |
| UI 套件 | Tailwind CSS + shadcn/ui | 開發速度快，風格統一 |
| 語言 | TypeScript | 型別安全，減少 bug |
| 部署 | Vercel（免費方案） | Next.js 原生支援，自動部署，HTTPS，自訂域名 |
| 認證 | 無（完全公開） | 小團隊內部工具，不設登入門檻。Vercel URL 本身不公開即可。未來如需保護可加簡易密碼中間件 |

### 2.2 後端 / 資料層

| 項目 | 選擇 | 理由 |
|------|------|------|
| 材質資料庫 | Google Sheets | 團隊熟悉，可直接在 Sheets 維護 |
| 報價紀錄 | Google Sheets | 同上，天然備份 |
| API 存取 | Google Sheets API v4 | 透過 Next.js API Routes + Service Account（金鑰在伺服器端，不暴露給前端） |
| 本地快取 | localStorage | 離線草稿、減少 API 呼叫 |
| PDF 生成 | @react-pdf/renderer | 前端直接產 PDF；或透過 API Route 在伺服器端生成 |

### 2.3 Google Sheets 結構

一個 Spreadsheet 檔案，包含以下工作表（Sheet Tab）：

**Sheet 1：`材質資料庫`**
**Sheet 2：`工資表`**
**Sheet 3：`報價紀錄`**（一張報價單 = 一列）
**Sheet 4：`報價明細`**（一個項目 = 一列，用 quote_id 關聯報價紀錄）
**Sheet 5：`系統設定`**

（各工作表欄位定義見第三章）

### 2.4 專案目錄結構

```
cushion-quote/
├── src/
│   ├── app/                    # 頁面路由 (Next.js App Router)
│   │   ├── page.tsx            # 首頁（報價計算器）
│   │   ├── layout.tsx          # 全域佈局（Sidebar + Navbar）
│   │   ├── materials/          # 材質資料庫頁面
│   │   │   └── page.tsx
│   │   ├── quotes/             # 報價歷史頁面
│   │   │   └── page.tsx
│   │   ├── settings/           # 系統設定頁面
│   │   │   └── page.tsx
│   │   └── api/                # API Routes（伺服器端，金鑰不暴露）
│   │       ├── sheets/         # Google Sheets 讀寫
│   │       │   ├── materials/route.ts
│   │       │   ├── quotes/route.ts
│   │       │   └── settings/route.ts
│   │       └── pdf/route.ts    # PDF 生成（備用方案）
│   ├── components/
│   │   ├── calculator/         # 報價計算器元件群
│   │   │   ├── DimensionInput.tsx
│   │   │   ├── MethodSelector.tsx
│   │   │   ├── ThicknessSelector.tsx
│   │   │   ├── FabricPicker.tsx
│   │   │   ├── ExtrasPanel.tsx
│   │   │   ├── ChannelPricing.tsx
│   │   │   ├── CostBreakdown.tsx
│   │   │   └── QuoteItemList.tsx
│   │   ├── pdf/                # PDF 報價單元件
│   │   │   ├── QuotePDF.tsx
│   │   │   └── QuoteTemplate.tsx
│   │   ├── materials/          # 材質管理元件
│   │   │   ├── MaterialTable.tsx
│   │   │   ├── MaterialForm.tsx
│   │   │   └── MaterialImport.tsx
│   │   └── ui/                 # 共用 UI 元件 (shadcn)
│   ├── lib/
│   │   ├── google-sheets.ts    # Google Sheets API 封裝
│   │   ├── pricing-engine.ts   # 報價計算核心邏輯
│   │   ├── types.ts            # TypeScript 型別定義
│   │   └── constants.ts        # 常數（作法/通路/預設值）
│   ├── hooks/
│   │   ├── useMaterials.ts     # 材質資料 hook
│   │   ├── useQuote.ts         # 報價狀態管理 hook
│   │   └── useGoogleSheets.ts  # Sheets API hook
│   └── data/
│       └── defaults.json       # 離線預設資料
├── public/
│   └── logo.png                # 春懋 Logo
├── .env.local                  # Google API 金鑰（不進 git，Vercel 環境變數設定）
├── package.json
└── README.md
```

---

## 三、功能模組規格

---

### 模組 A：材質資料庫（P0 — 最高優先）

#### A.1 資料結構

**Google Sheets `材質資料庫` 工作表欄位：**

| 欄 | 欄位名稱 | 類型 | 說明 | 範例 |
|----|---------|------|------|------|
| A | material_id | string | 唯一識別碼（自動生成） | MAT-001 |
| B | brand | string | 品牌名稱 | JF 輝煌 |
| C | series | string | 系列名稱 | 貓抓布 N200 系列 |
| D | color_code | string | 色號 | N200-03 |
| E | color_name | string | 顏色名稱 | 駝色 |
| F | category | enum | 分類 | fabric / pu_leather / pvc_leather / genuine_leather |
| G | cost_per_cai | number | 進貨成本（元/才） | 45 |
| H | list_price_per_cai | number | 牌價/建議售價（元/才） | 80 |
| I | supplier | string | 供應商名稱 | 宏亞布行 |
| J | width_cm | number | 布寬（cm） | 150 |
| K | min_order | string | 最低訂量 | 1碼 |
| L | lead_time_days | number | 交期（天） | 3 |
| M | stock_status | enum | 庫存狀態 | in_stock / low / out_of_stock / order_only |
| N | features | string | 特殊功能（逗號分隔） | 防貓抓,防潑水,防焰 |
| O | notes | string | 備註 | 以色列進口，色牢度佳 |
| P | is_active | boolean | 是否啟用 | TRUE |
| Q | created_at | date | 建立日期 | 2026-03-16 |
| R | updated_at | date | 最後更新 | 2026-03-16 |

#### A.2 前端功能

**材質列表頁 `/materials`**

- 表格呈現，支援排序（品牌/進價/分類）與篩選（分類/品牌/庫存狀態）
- 搜尋列：輸入品牌名、色號、系列名，即時篩選
- 每列顯示：品牌、系列、色號、色名、進價、牌價、庫存狀態
- 點擊展開：完整資訊卡片
- 操作：新增、編輯、停用（軟刪除，is_active = FALSE）

**新增/編輯材質表單**

- 品牌：文字輸入，支援自動完成（從現有品牌列表）
- 分類：下拉選擇 fabric / pu_leather / pvc_leather / genuine_leather
- 價格：進價（成本）、牌價（建議售價），兩欄同時顯示毛利率
- 庫存狀態：四選一按鈕
- 特殊功能：多選 tag（防貓抓/防潑水/防焰/易清潔/抗UV）

**批次匯入**

- 支援從 CSV 或直接貼上 Excel 內容匯入
- 匯入預覽：顯示即將新增/更新的資料，確認後寫入 Sheets

#### A.3 報價計算器整合

- 報價計算器的「面料」區塊改為從材質資料庫選取
- 搜尋/篩選 → 選中材質 → 自動帶入進價或牌價
- 可切換「以進價計算」或「以牌價計算」
- 仍保留「自訂面料」手動輸入選項

---

### 模組 B：報價單 PDF 輸出（P1）

#### B.1 報價單資訊結構

```
┌──────────────────────────────────────────┐
│  春懋 LOGO          報價單 QUOTATION      │
│                     單號：CQ-20260316-001 │
│                     日期：2026-03-16      │
│                     有效期限：30 天        │
├──────────────────────────────────────────┤
│  客戶資訊                                 │
│  公司/姓名：○○○設計事務所                   │
│  聯絡人：王先生                             │
│  電話：0912-345-678                       │
│  案場地址：台北市大安區○○路○號               │
│  案場名稱：王宅                             │
├──────────────────────────────────────────┤
│  報價明細                                 │
│ ┌────┬────────┬──────┬────┬────┬───────┐ │
│ │ # │ 品項    │ 規格  │才數│單價│ 小計  │ │
│ ├────┼────────┼──────┼────┼────┼───────┤ │
│ │ 1 │主臥床頭板│180×120│ 24 │$300│$7,200│ │
│ │   │        │單面板  │    │    │      │ │
│ │   │        │1.5"中密│    │    │      │ │
│ │   │        │貓抓布  │    │    │      │ │
│ ├────┼────────┼──────┼────┼────┼───────┤ │
│ │ 2 │客廳臥榻 │184×56 │11.5│$250│$2,875│ │
│ │   │        │單面榻  │    │    │      │ │
│ │   │        │2"高密  │    │    │      │ │
│ ├────┼────────┼──────┼────┼────┼───────┤ │
│ │ 3 │皮革加工 │      │ 24 │ $50│$1,200│ │
│ ├────┼────────┼──────┼────┼────┼───────┤ │
│ │ 4 │現場安裝 │      │  1 │    │$3,500│ │
│ └────┴────────┴──────┴────┴────┴───────┘ │
│                                          │
│                     小計    $14,775       │
│                     稅 5%   $739         │
│                     合計    $15,514       │
├──────────────────────────────────────────┤
│  備註                                     │
│  1. 面料由客戶自備 / 面料由春懋提供          │
│  2. 底板由木工工班提供                      │
│  3. 交期約 7-10 個工作天                   │
│  4. 付款方式：訂金 50%，完工驗收後付清       │
├──────────────────────────────────────────┤
│  春懋繃布工程                              │
│  地址：新北市土城區○○路○號                  │
│  電話：02-XXXX-XXXX                      │
│  LINE：@chunmao                          │
└──────────────────────────────────────────┘
```

#### B.2 PDF 功能需求

- 前端生成（@react-pdf/renderer），不需要後端
- A4 直式
- 可選：含稅 / 未稅
- 可選：顯示 / 隱藏進價（給設計師看的版本可隱藏成本）
- 支援多項目（一張報價單可包含多片床頭板/臥榻）
- 報價單編號自動遞增：CQ-YYYYMMDD-NNN
- 下載為 PDF 檔案
- （未來）直接透過 LINE 或 Email 分享

> **技術備註（CJK 字型）**：@react-pdf/renderer 不內建中文字型，需手動載入 Noto Sans TC（~4MB）。做法是將字型檔放在 `public/fonts/` 並在元件初始化時 `Font.register()`。首次生成 PDF 需載入字型約 1-2 秒，之後瀏覽器快取即為毫秒級。部署在 Vercel CDN 上不影響體驗。

#### B.3 報價單欄位說明

每個報價項目（Quote Line Item）包含：

| 欄位 | 說明 |
|------|------|
| item_name | 品項名稱（如：主臥床頭板） |
| method | 作法（平貼/單面板/活動板/單面榻/雙面榻） |
| width_cm | 寬度 cm |
| height_cm | 高度 cm |
| cai_count | 才數（自動計算） |
| foam_thickness | 泡棉厚度（英吋，平貼填 0） |
| material_id | 面料 ID（連結材質資料庫） |
| material_desc | 面料描述（顯示在報價單上） |
| qty | 數量（同款 ×N） |
| labor_rate | 工資/才 |
| material_rate | 面料/才 |
| extras | 其他加工項目陣列 |
| unit_price | 每才單價 |
| piece_price | 每片價格 |
| subtotal | 小計（piece_price × qty） |
| notes | 備註 |

---

### 模組 C：三通路倍率定價系統（P2）

#### C.1 定價邏輯

```
工廠成本 = 工資/才（含品質溢價 + 施工加給）+ 面料/才（含損耗）+ 其他加工/才

工資/才 = 同業基準 × (1+品質溢價%) × (1+安裝高度加給%+板片尺寸加給%)

三通路報價：
├── 批發價   = 工廠成本 × 批發倍率（預設 1.30-1.50, step 0.05）
├── 設計師價 = 工廠成本 × 設計師倍率（預設 1.80-2.20, step 0.05）
└── 屋主價   = 工廠成本 × 屋主倍率（預設 2.50-3.00, step 0.05）
```

#### C.2 通路切換

- 報價計算器上方有通路選擇器（三個 Tab）
- 切換通路 → 所有價格即時更新
- 報價單 PDF 自動套用所選通路的價格
- 預設倍率可在設定頁面調整

#### C.3 設計師佣金模式

支援兩種模式（在設定中選擇）：

**模式 A：價差模式（預設）**
- 設計師以設計師價進貨，自行加價報給屋主
- 報價單顯示設計師價
- 不另外計算佣金

**模式 B：返佣模式**
- 報價單以屋主價開立
- 系統自動計算返佣金額（屋主價 × 返佣比例）
- 返佣比例可設定（預設 10-15%）
- 報價單上不顯示返佣，但內部紀錄中記錄

#### C.4 系統設定（Google Sheets `系統設定` 工作表）

| 設定項 | 預設值 | 說明 |
|--------|--------|------|
| wholesale_multiplier | 1.4 | 批發倍率 |
| designer_multiplier | 2.0 | 設計師倍率 |
| retail_multiplier | 2.8 | 屋主倍率 |
| quality_premium | 10 | 品質溢價 % |
| default_waste_rate | 15 | 預設損耗率 % |
| commission_mode | price_gap | 佣金模式 |
| commission_rate | 12 | 返佣比例 %（模式B用） |
| tax_rate | 5 | 營業稅率 % |
| quote_validity_days | 30 | 報價有效天數 |
| company_name | 春懋繃布工程 | 公司名稱 |
| company_phone | | 電話 |
| company_address | | 地址 |
| company_line | | LINE ID |

---

### 模組 D：Google Sheets 整合（P3）

#### D.1 報價紀錄工作表欄位

**Google Sheets `報價紀錄` 工作表（一張報價單 = 一列）：**

| 欄 | 欄位名稱 | 說明 |
|----|---------|------|
| A | quote_id | 報價單編號 CQ-YYYYMMDD-NNN |
| B | quote_date | 報價日期 |
| C | client_name | 客戶名稱 |
| D | client_contact | 聯絡人 |
| E | client_phone | 電話 |
| F | project_name | 案場名稱 |
| G | project_address | 案場地址 |
| H | channel | 通路（wholesale/designer/retail） |
| I | total_before_tax | 稅前合計 |
| J | tax | 稅額 |
| K | total | 含稅合計 |
| L | commission_mode | 佣金模式（price_gap / rebate / none） |
| M | commission_rate | 返佣比例 %（模式B用，模式A填0） |
| N | commission_amount | 返佣金額（系統自動計算） |
| O | status | 狀態（draft/sent/accepted/rejected/expired） |
| P | created_by | 建立者 |
| Q | notes | 備註 |
| R | created_at | 建立時間 |
| S | updated_at | 更新時間 |

**Google Sheets `報價明細` 工作表（一個項目 = 一列，用 quote_id 關聯）：**

> 拆成獨立工作表（而非 JSON 塞同一格），好處是可以直接在 Sheets 裡篩選分析，例如「這個月做了幾片床頭板」「哪種面料用最多」。

| 欄 | 欄位名稱 | 說明 |
|----|---------|------|
| A | quote_id | 關聯報價單編號 |
| B | line_number | 項目序號（1, 2, 3...） |
| C | item_name | 品項名稱（如：主臥床頭板） |
| D | method | 作法 ID |
| E | width_cm | 寬度 cm |
| F | height_cm | 高度 cm |
| G | cai_count | 才數 |
| H | foam_thickness | 泡棉厚度（英吋，平貼填 0） |
| I | material_id | 面料 ID（連結材質資料庫） |
| J | material_desc | 面料描述（品牌+色號，顯示在報價單上） |
| K | qty | 數量（同款 ×N） |
| L | labor_rate | 工資/才 |
| M | material_rate | 面料/才 |
| N | extras | 其他加工（逗號分隔：leather_labor,lining...） |
| O | unit_price | 每才單價 |
| P | piece_price | 每片價格 |
| Q | subtotal | 小計（piece_price × qty） |
| R | install_height_cm | 安裝離地高度 cm（不安裝填空） |
| S | height_tier | 高度加給等級（normal/medium_high/elevated） |
| T | size_tier | 尺寸加給等級（standard/large/oversized） |
| U | surcharge_percent | 施工加給合計 % |
| V | input_mode | 輸入模式（per_piece/full_wall） |
| W | cai_calc_mode | 才數算法（per_piece/total） |
| X | notes | 備註 |

#### D.2 工資表工作表

**Google Sheets `工資表` 工作表：**

| 欄 | 欄位名稱 | 說明 |
|----|---------|------|
| A | method_id | 作法 ID |
| B | method_name | 作法名稱 |
| C | description | 說明 |
| D | min_cai | 最低才數 |
| E | base_thickness | 基準厚度（英吋，平貼填空） |
| F | base_rate | 基準工資（元/才） |
| G | increment_per_half_inch | 每半英吋加價（平貼填 0） |
| H | thickness_options | 可選厚度（逗號分隔，平貼填空） |

> 注意：泡棉密度（中密度/高密度）不另設欄位，因為每種作法固定對應一種泡棉——單面板/活動板 = 中密度，臥榻 = 高密度，平貼 = 無。前端由 method_id 自動推導，不需要在 Sheets 重複維護。

預設資料（來自同業行情參考）：

| 作法 | 泡棉 | 基準厚度 | 基準工資 | 每半吋加價 | 可選厚度 |
|------|------|---------|---------|-----------|---------|
| 平貼 | 無 | — | $60 | — | — |
| 單面床頭板 | 中密度 | 1" | $100 | +$15 | 1,1.5,2,2.5,3 |
| 活動床頭板 | 中密度 | 1" | $155 | +$20 | 1,1.5,2,2.5,3 |
| 單面臥榻 | 高密度 | 2" | $180 | +$20 | 2,2.5,3 |
| 雙面臥榻 | 高密度 | 2" | $210 | +$20 | 2,2.5,3 |

> **翻修案處理方式**：不另設獨立作法。翻修案 = 選擇對應的正常作法（如單面床頭板）計算繃布工資 + 勾選「拆舊工程」手動填入金額。因為拆開前無法確認內部狀況，拆舊金額由報價人員依經驗判斷填寫，保留議價空間。報價單備註欄應加註：「若拆除後發現結構損壞或泡棉需更換，將另行報價。」

#### D.3 同步機制

- **讀取**：頁面載入時從 Google Sheets 讀取，快取至 localStorage（快取 5 分鐘）
- **寫入**：儲存報價 / 新增材質時即時寫入 Sheets
- **手動同步**：提供「重新載入」按鈕，強制從 Sheets 拉最新資料
- **離線模式**：若 API 不可用，使用 localStorage 快取繼續操作，上線後提示同步
- **衝突處理**：以 Google Sheets 為最終真實來源（last-write-wins）

#### D.4 備份/還原

- **備份**：匯出整個 Spreadsheet 為 `.xlsx` 下載（Google Drive API）
- **還原**：上傳 `.xlsx`，系統讀取後覆寫 Sheets 內容（需二次確認）
- **版本紀錄**：Google Sheets 自帶版本歷史，可從 Sheets 介面直接還原

---

## 四、工資計算核心邏輯（pricing-engine.ts）

```typescript
// ===== 型別定義 =====

type Method = 'flat' | 'single_headboard' | 'removable_headboard' 
            | 'single_daybed' | 'double_daybed';

type Channel = 'wholesale' | 'designer' | 'retail';

type ExtraItem = 'leather_labor' | 'lining' | 'anti_slip' | 'power_hole';

type AddonType = 'demolition' | 'install' | 'floor_surcharge' | 'rush_3day' | 'rush_1day';

// ===== 施工加給 =====

type InstallHeightTier = 'normal' | 'medium_high' | 'elevated';
type PanelSizeTier = 'standard' | 'large' | 'oversized';

const INSTALL_HEIGHT_TIERS: Record<InstallHeightTier, { maxCm: number; percent: number; label: string }> = {
  normal:      { maxCm: 200, percent: 0,  label: '一般（站地面）' },
  medium_high: { maxCm: 300, percent: 25, label: '中高（需 A 字梯）' },
  elevated:    { maxCm: Infinity, percent: 60, label: '高空（需鷹架）' },
};

const PANEL_SIZE_TIERS: Record<PanelSizeTier, { maxLongSideCm: number; percent: number; label: string }> = {
  standard:  { maxLongSideCm: 180, percent: 0,  label: '標準（一人搬運）' },
  large:     { maxLongSideCm: 240, percent: 20, label: '大型（需兩人）' },
  oversized: { maxLongSideCm: Infinity, percent: 40, label: '超大型（需三人以上）' },
};

// ===== 多片組合 =====

type InputMode = 'per_piece' | 'full_wall';      // 每片尺寸×數量 / 整面尺寸÷分片數
type CaiCalcMode = 'per_piece' | 'total';         // 逐片進位 / 整面一次進位

interface MultiPanelConfig {
  inputMode: InputMode;
  caiCalcMode: CaiCalcMode;
  // inputMode = 'full_wall' 時使用：
  fullWallWidthCm?: number;   // 整面寬度
  fullWallHeightCm?: number;  // 整面高度
  splitCount?: number;         // 分幾片
  splitDirection?: 'horizontal' | 'vertical';  // 橫切（分高度）或直切（分寬度）
}

// ===== 核心型別 =====

interface MethodConfig {
  id: Method;
  label: string;
  desc: string;
  minCai: number;
  baseThickness: number | null;  // 平貼、翻修 = null
  baseRate: number;
  incrementPerHalfInch: number;
  thicknessOptions: number[];
}

interface Material {
  id: string;
  brand: string;
  series: string;
  colorCode: string;
  colorName: string;
  category: string;
  costPerCai: number;
  listPricePerCai: number;
}

interface QuoteLineItem {
  itemName: string;
  method: Method;
  widthCm: number;               // 每片寬度（inputMode=full_wall 時由系統算出）
  heightCm: number;              // 每片高度
  qty: number;                   // 數量
  foamThickness: number | null;
  material: Material | null;
  customMaterialCost: number | null;
  useListPrice: boolean;
  extras: ExtraItem[];
  powerHoleCount: number;
  // 施工加給
  installHeightCm: number | null;   // 安裝離地高度 cm，null = 不安裝（工廠製作出貨）
  // 多片組合
  multiPanel: MultiPanelConfig | null;  // null = 單片模式
}

interface AddonItem {
  type: AddonType;
  qty: number;
  customAmount: number | null;  // 手動填入金額（拆舊工程用，其他項目為 null）
}

interface PricingConfig {
  qualityPremium: number;
  wasteRate: number;
  channelMultipliers: Record<Channel, number>;  // step 0.05
  taxRate: number;
  commissionMode: 'price_gap' | 'rebate' | 'none';
  commissionRate: number;
}

// ===== 附加工程定義 =====
const ADDON_DEFS: Record<AddonType, { label: string; unit: string; unitCost: number | null; isPercent: boolean }> = {
  demolition:      { label: '拆舊工程',      unit: '式', unitCost: null, isPercent: false },  // 手動填金額，無預設值
  install:         { label: '現場安裝',      unit: '次', unitCost: 3500, isPercent: false },
  floor_surcharge: { label: '高樓層搬運加價', unit: '式', unitCost: 2000, isPercent: false },
  rush_3day:       { label: '急件（3日內）',  unit: '%',  unitCost: 40,   isPercent: true },
  rush_1day:       { label: '超急件（隔日）',  unit: '%',  unitCost: 80,   isPercent: true },
};

// ===== 核心計算函式 =====

// 才數計算（單片）
function calculateCaiCount(widthCm: number, heightCm: number, minCai: number): number {
  const raw = (widthCm * heightCm) / 900;
  return Math.max(Math.ceil(raw * 10) / 10, minCai);
}

// 才數計算（多片組合 — 支援兩種算法）
function calculateMultiPanelCai(
  pieceWidthCm: number, pieceHeightCm: number, qty: number, minCai: number, mode: CaiCalcMode
): { caiPerPiece: number; totalCai: number } {
  if (mode === 'per_piece') {
    // 逐片進位：每片獨立計算再乘數量
    const caiPerPiece = calculateCaiCount(pieceWidthCm, pieceHeightCm, minCai);
    return { caiPerPiece, totalCai: caiPerPiece * qty };
  } else {
    // 整面進位：總面積一次計算
    const totalArea = pieceWidthCm * pieceHeightCm * qty;
    const totalCai = Math.max(Math.ceil((totalArea / 900) * 10) / 10, minCai);
    const caiPerPiece = Math.round((totalCai / qty) * 10) / 10;
    return { caiPerPiece, totalCai };
  }
}

// 施工加給：安裝高度等級判定
function getInstallHeightTier(heightCm: number): InstallHeightTier {
  if (heightCm <= 200) return 'normal';
  if (heightCm <= 300) return 'medium_high';
  return 'elevated';
}

// 施工加給：板片尺寸等級判定
function getPanelSizeTier(widthCm: number, heightCm: number): PanelSizeTier {
  const longSide = Math.max(widthCm, heightCm);
  if (longSide <= 180) return 'standard';
  if (longSide <= 240) return 'large';
  return 'oversized';
}

// 施工加給：計算加給百分比
function calculateInstallSurcharge(installHeightCm: number | null, widthCm: number, heightCm: number): {
  heightTier: InstallHeightTier | null;
  sizeTier: PanelSizeTier;
  surchargePercent: number;
} {
  const sizeTier = getPanelSizeTier(widthCm, heightCm);
  let surchargePercent = PANEL_SIZE_TIERS[sizeTier].percent;
  let heightTier: InstallHeightTier | null = null;

  if (installHeightCm !== null) {
    heightTier = getInstallHeightTier(installHeightCm);
    surchargePercent += INSTALL_HEIGHT_TIERS[heightTier].percent;
  }

  return { heightTier, sizeTier, surchargePercent };
}

// 基準工資計算（含品質溢價，不含施工加給）
function calculateBaseLaborRate(method: MethodConfig, thickness: number | null, qualityPremium: number): number {
  if (method.baseThickness === null) {
    return Math.round(method.baseRate * (1 + qualityPremium / 100));
  }
  const steps = ((thickness ?? method.baseThickness) - method.baseThickness) / 0.5;
  const refRate = method.baseRate + steps * method.incrementPerHalfInch;
  return Math.round(refRate * (1 + qualityPremium / 100));
}

// 單一項目計算
function calculateLineItem(item: QuoteLineItem, method: MethodConfig, config: PricingConfig) {
  // 1. 才數（支援多片組合兩種算法）
  const caiCalcMode = item.multiPanel?.caiCalcMode ?? 'per_piece';
  const { caiPerPiece, totalCai } = calculateMultiPanelCai(
    item.widthCm, item.heightCm, item.qty, method.minCai, caiCalcMode
  );

  // 2. 基準工資/才（含品質溢價）
  const baseLaborRate = calculateBaseLaborRate(method, item.foamThickness, config.qualityPremium);

  // 3. 施工加給
  const surcharge = calculateInstallSurcharge(item.installHeightCm, item.widthCm, item.heightCm);
  const laborRate = Math.round(baseLaborRate * (1 + surcharge.surchargePercent / 100));

  // 4. 面料/才（含損耗）
  const rawMaterialCost = item.material
    ? (item.useListPrice ? item.material.listPricePerCai : item.material.costPerCai)
    : (item.customMaterialCost ?? 0);
  const materialRate = Math.round(rawMaterialCost * (1 + config.wasteRate / 100));

  // 5. 其他加工/才
  let extrasPerCai = 0;
  let extrasFixed = 0;
  if (item.extras.includes('leather_labor')) extrasPerCai += 50;
  if (item.extras.includes('lining')) extrasPerCai += 60;
  if (item.extras.includes('anti_slip')) extrasPerCai += 60;
  if (item.extras.includes('power_hole')) extrasFixed += 50 * item.powerHoleCount;

  // 6. 每才合計（工廠成本）
  const costPerCai = laborRate + materialRate + extrasPerCai;

  // 7. 每片成本 → 項目總計
  const pieceCost = costPerCai * caiPerPiece + extrasFixed;
  const lineSubtotal = pieceCost * item.qty;

  // 8. 三通路報價
  const channelPrices: Record<Channel, { total: number; perPiece: number; perCai: number; margin: number }> = {} as any;
  for (const [ch, mult] of Object.entries(config.channelMultipliers)) {
    const perPiece = Math.round(pieceCost * mult / 10) * 10;
    const total = perPiece * item.qty;
    const perCai = Math.round(perPiece / caiPerPiece);
    const margin = ((perPiece - pieceCost) / perPiece * 100);
    channelPrices[ch as Channel] = { total, perPiece, perCai, margin: Math.round(margin * 10) / 10 };
  }

  return {
    caiPerPiece, totalCai, caiCalcMode,
    baseLaborRate, surcharge, laborRate,
    materialRate, extrasPerCai, extrasFixed,
    costPerCai, pieceCost, lineSubtotal, channelPrices,
  };
}

// 整張報價單計算（含附加工程）
function calculateQuote(
  items: Array<{ item: QuoteLineItem; method: MethodConfig }>,
  addons: AddonItem[],
  config: PricingConfig,
  channel: Channel,
) {
  const lineResults = items.map(({ item, method }) => ({
    ...calculateLineItem(item, method, config),
    item,
  }));

  const itemsSubtotal = lineResults.reduce((sum, lr) => sum + lr.channelPrices[channel].total, 0);

  let addonFixed = 0;
  let addonPercent = 0;
  for (const addon of addons) {
    const def = ADDON_DEFS[addon.type];
    if (def.isPercent) {
      addonPercent += def.unitCost!;
    } else if (addon.customAmount !== null) {
      addonFixed += addon.customAmount;              // 手動填入金額（拆舊工程）
    } else {
      addonFixed += (def.unitCost ?? 0) * addon.qty; // 固定金額 × 數量
    }
  }
  const rushSurcharge = Math.round(itemsSubtotal * (addonPercent / 100));

  const subtotalBeforeTax = itemsSubtotal + addonFixed + rushSurcharge;
  const tax = Math.round(subtotalBeforeTax * (config.taxRate / 100));
  const grandTotal = subtotalBeforeTax + tax;

  let commissionAmount = 0;
  if (config.commissionMode === 'rebate') {
    commissionAmount = Math.round(grandTotal * (config.commissionRate / 100));
  }

  return { lineResults, itemsSubtotal, addonFixed, rushSurcharge, subtotalBeforeTax, tax, grandTotal, commissionAmount };
}
```

> **倍率精度**：通路倍率 slider step = 0.05，支援 ×1.35 等精細調控。

---

## 五、UI 頁面規劃

### 5.1 頁面結構

```
左側 Sidebar（收合式）：
├── 🧮 報價計算器（首頁）
├── 🧵 材質資料庫
├── 📋 報價紀錄
└── ⚙️ 系統設定

頂部 Navbar：
├── 春懋 Logo
├── 目前通路（快速切換：批發/設計師/屋主）
└── 同步狀態指示燈
```

### 5.2 報價計算器頁面（首頁）

```
┌─ 左側 ─────────────────┬─ 右側 ──────────────────┐
│                         │                         │
│ 📋 客戶資料（收合式）     │ 📊 即時報價摘要          │
│   公司/姓名              │   工廠成本 $XXX/才       │
│   聯絡人/電話            │   ────────────          │
│   案場名稱/地址          │   批發價  $XXX  (XX%)   │
│                         │   設計師  $XXX  (XX%)   │
│ 🔧 作法 & 泡棉           │   屋主價  $XXX  (XX%)   │
│   [5 種作法卡片]         │                         │ 📦 項目清單              │
│   [厚度選擇器]           │   #1 主臥床頭 180×120   │
│   [品質溢價滑桿]         │      24才 × $300 = ...  │
│                         │   #2 牆面繃布 151.5×240  │
│ 📐 尺寸                  │      ÷6片 逐片算 40.8才  │
│   輸入模式切換：          │   ──────────── ─        │
│   [每片×數量|整面÷分片]  │   + 新增項目              │
│   寬度 × 高度 → 才數     │   ────────────          │
│   數量 / 分片數           │   小計  $XX,XXX          │
│   才數算法：              │   稅    $X,XXX          │
│   [逐片進位|整面進位]     │   合計  $XX,XXX          │
│   兩種算法才數對比顯示     │                         │
│                         │ 🖨 操作按鈕              │
│ 🏗️ 施工加給              │   [ 下載 PDF ]           │
│   安裝高度 [___] cm離地  │   [ 儲存報價 ]           │
│   → 等級：一般 +0%       │   [ 新增項目 ]           │
│   板片尺寸 自動判定       │                         │
│   → 等級：標準 +0%       │                         │
│   施工加給合計 +0%        │                         │
│                         │                         │
│ 🧵 面料（從資料庫選取）    │                         │
│   搜尋/篩選面料          │                         │
│   選中材質的資訊卡        │                         │
│   進價/牌價切換           │                         │
│                         │                         │
│ ✨ 其他加工               │                         │
│   ☐ 皮革加工 +$50/才    │                         │
│   ☐ 加車裡布 +$60/才    │                         │
│   ☐ 背車止滑布 +$60/才  │                         │
│   ☐ 代釘電源孔 +$50/孔  │                         │
│                         │                         │
│ 📎 附加工程               │                         │
│   ☐ 拆舊 $[____] 手動填 │                         │
│   ☐ 現場安裝 $3,500/次  │                         │
│   ☐ 高樓層搬運 $2,000/式│                         │
│   ☐ 急件 +40%           │                         │
└─────────────────────────┴─────────────────────────┘
```

### 5.3 材質資料庫頁面

```
┌─────────────────────────────────────────────────────┐
│ 🧵 材質資料庫                    [ + 新增 ] [ 匯入 ] │
├─────────────────────────────────────────────────────┤
│ 🔍 搜尋面料...     分類 [全部▾]  品牌 [全部▾]  庫存  │
├─────────────────────────────────────────────────────┤
│ 品牌     │ 系列      │ 色號    │ 進價 │ 牌價 │ 庫存  │
│──────────┼───────────┼────────┼─────┼─────┼──────│
│ JF 輝煌  │ N200貓抓布 │ N200-03│ $45 │ $80 │ 🟢    │
│ JF 輝煌  │ N200貓抓布 │ N200-07│ $45 │ $80 │ 🟢    │
│ AITEX    │ 以色列貓抓 │ IL-001 │ $65 │ $120│ 🟡    │
│ 南亞     │ PU皮革    │ PU-330 │ $30 │ $55 │ 🟢    │
│ ...      │           │        │     │     │      │
└─────────────────────────────────────────────────────┘
```

---

## 六、開發階段規劃

### Phase 1：基礎框架 + 材質資料庫（1-2 週）

- [ ] 初始化 Next.js + TypeScript + Tailwind + shadcn/ui 專案
- [ ] Google Sheets API 連接與認證設定
- [ ] 材質資料庫 CRUD（新增/讀取/編輯/停用）
- [ ] 材質列表頁面（搜尋/篩選/排序）
- [ ] 離線快取機制（localStorage）

### Phase 2：報價計算器 + PDF（2-3 週）

- [ ] 報價計算器核心 UI（從現有 CushionQuote 遷移）
- [ ] pricing-engine.ts 計算邏輯
- [ ] 面料選取改為連結材質資料庫
- [ ] 多項目報價（項目清單管理）
- [ ] 多片組合輸入模式（每片×數量 / 整面÷分片）及才數算法切換
- [ ] 施工加給計算（安裝高度 + 板片尺寸兩維度）
- [ ] 客戶資料表單
- [ ] PDF 報價單生成與下載

### Phase 3：三通路定價 + 設定（1 週）

- [ ] 通路選擇器與即時價格切換
- [ ] 品質溢價機制
- [ ] 系統設定頁面（倍率/稅率/公司資訊）
- [ ] 設計師佣金模式切換

### Phase 4：Google Sheets 整合 + 報價管理（1-2 週）

- [ ] 報價紀錄寫入 Sheets
- [ ] 報價歷史列表頁面
- [ ] 報價狀態管理（草稿/已送出/已接受/已拒絕/已過期）
- [ ] 備份/還原功能
- [ ] 部署至 Vercel

### Phase 5：優化（持續）

- [ ] 手機版 RWD 適配
- [ ] 3D 預覽（從 CushionQuote 遷移）
- [ ] LINE 分享報價單
- [ ] 報價範本（常用規格一鍵帶入）

---

## 七、待確認事項

在開始開發前，需要懋懋確認以下項目：

1. **春懋公司資訊**：報價單上要顯示的公司名、地址、電話、LINE ID、Logo 圖檔
2. **營業稅**：報價單是否需要含稅？稅率 5%？
3. **Google 帳號**：用哪個 Google 帳號的 Sheets？需要設定 Service Account 存取權限
4. **面料初始資料**：目前常用的面料品牌/色號/進價，可以先整理一份 Excel 或直接在 Sheets 建好
5. **報價單格式**：目前有在用的報價單範本嗎？有的話可以沿用版面設計
6. **CushionQuote 程式碼**：需要從 AI Studio 匯出，看能複用多少前端元件
7. **部署域名**：要用自訂域名（如 quote.chunmao.com）還是 Vercel 預設？
8. **施工加給門檻與百分比**：已確認（安裝高度 200/300cm、板片尺寸 180/240cm），上線後依實際案場回饋微調
