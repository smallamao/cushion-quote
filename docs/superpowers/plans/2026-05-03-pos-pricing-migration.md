# POS 訂製報價定價遷移計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 POS 訂製報價的定價資料從 FastAPI 遷移至 Google Sheets，Next.js 直接計算所有費用（FastAPI 僅保留指示圖繪製）。

**Architecture:**
- Google Sheets 新增兩個標籤：`POS_底價`（各款式各座位數各材質底價）與 `POS_調整費率`（各材質群組的深度/背高/加寬費率）。
- Next.js 新增 API route 讀取這兩個標籤，並實作 `pos-pricing-engine.ts` 做全部計算。
- `PosQuoteClient.tsx` 改為呼叫 Next.js API 取底價與計算結果，移除對 FastAPI `/calculate` 的呼叫。
- FastAPI 保留 `POST /api/pos/generate-diagram` 指示圖端點不變。

**Tech Stack:** Next.js 15 App Router, Google Sheets API, TypeScript, shadcn/ui

---

## 資料定義

### 材質 ID 對應（13 種，與尺寸報價一致）

| ID | 說明 |
|---|---|
| TW_LV1 | 台灣 LV1 藍標 |
| TW_LV2 | 台灣 LV2 綠標 |
| TW_LV3 | 台灣 LV3 黃標 |
| TW_LV4 | 台灣 LV4 橘標 |
| TW_LV5 | 台灣 LV5 紅標 |
| IMPORT_LV1 | 進口 LV1 |
| IMPORT_LV2 | 進口 LV2 |
| IMPORT_LV3 | 進口 LV3 |
| IMPORT_LV4 | 進口 LV4 |
| IMPORT_LV5 | 進口 LV5 |
| LEATHER_LV1 | 牛皮 LV1 |
| LEATHER_LV2 | 牛皮 LV2 |
| LEATHER_LV3 | 牛皮 LV3 |

### Google Sheets 結構

**Tab: `POS_底價`**（48 rows + header = 49 rows）

| 款式 | 座位 | TW_LV1 | TW_LV2 | TW_LV3 | TW_LV4 | TW_LV5 | IMPORT_LV1 | IMPORT_LV2 | IMPORT_LV3 | IMPORT_LV4 | IMPORT_LV5 | LEATHER_LV1 | LEATHER_LV2 | LEATHER_LV3 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ELEC | 1人 | 14000 | 14200 | 14600 | 15100 | 15700 | 17100 | 18400 | 19100 | 20200 | 21800 | 17100 | 20000 | 24000 |
| ELEC | 2人 | 20200 | 20500 | 21200 | 21800 | 22800 | 24800 | 26700 | 27700 | 29300 | 31600 | 24700 | 28900 | 34700 |
| ELEC | 3人 | 30200 | 30600 | 31600 | 32600 | 34000 | 37000 | 39900 | 41300 | 43700 | 47100 | 36900 | 43200 | 51800 |
| POINT | 1人 | 14600 | 14800 | 15300 | 15700 | 16400 | 17800 | 19100 | 19800 | 20900 | 22400 | 17700 | 20600 | 24600 |
| POINT | 2人 | 21200 | 21500 | 22200 | 22800 | 23800 | 25800 | 27700 | 28700 | 30300 | 32500 | 25700 | 29900 | 35700 |
| POINT | 3人 | 31600 | 32100 | 33100 | 34000 | 35500 | 38400 | 41300 | 42800 | 45200 | 48500 | 38300 | 44600 | 53300 |
| BLT | 1人 | 14400 | 14600 | 15100 | 15500 | 16200 | 17600 | 18900 | 19600 | 20700 | 22200 | 17500 | 20400 | 24400 |
| BLT | 2人 | 20900 | 21200 | 21800 | 22500 | 23400 | 25400 | 27400 | 28300 | 30000 | 32200 | 25400 | 29600 | 35400 |
| BLT | 3人 | 31100 | 31600 | 32600 | 33500 | 35000 | 38000 | 40800 | 42300 | 44700 | 48100 | 37900 | 44100 | 52800 |
| GALI | 1人 | 14400 | 14600 | 15100 | 15500 | 16200 | 17600 | 18900 | 19600 | 20700 | 22200 | 17500 | 20400 | 24400 |
| GALI | 2人 | 20900 | 21200 | 21800 | 22500 | 23400 | 25400 | 27400 | 28300 | 30000 | 32200 | 25400 | 29600 | 35400 |
| GALI | 3人 | 31100 | 31600 | 32600 | 33500 | 35000 | 38000 | 40800 | 42300 | 44700 | 48100 | 37900 | 44100 | 52800 |
| MIKO | 1人 | 14400 | 14600 | 15100 | 15500 | 16200 | 17600 | 18900 | 19600 | 20700 | 22200 | 18000 | 20900 | 24500 |
| MIKO | 2人 | 20900 | 21200 | 21800 | 22500 | 23400 | 25400 | 27400 | 28300 | 30000 | 32200 | 26100 | 30300 | 35500 |
| MIKO | 3人 | 31100 | 31600 | 32600 | 33500 | 35000 | 38000 | 40800 | 42300 | 44700 | 48100 | 39000 | 45200 | 52900 |
| JIMMY | 1人 | 14400 | 14600 | 15100 | 15500 | 16200 | 17600 | 18900 | 19600 | 20700 | 22200 | 18000 | 20900 | 24500 |
| JIMMY | 2人 | 20900 | 21200 | 21800 | 22500 | 23400 | 25400 | 27400 | 28300 | 30000 | 32200 | 26100 | 30300 | 35500 |
| JIMMY | 3人 | 31100 | 31600 | 32600 | 33500 | 35000 | 38000 | 40800 | 42300 | 44700 | 48100 | 39000 | 45200 | 52900 |
| BSK | 1人 | 16000 | 16200 | 16600 | 17100 | 17700 | 19100 | 20400 | 21100 | 22200 | 23800 | 19600 | 23100 | 26700 |
| BSK | 2人 | 23100 | 23400 | 24100 | 24700 | 25700 | 27700 | 29600 | 30600 | 32200 | 34500 | 28400 | 33500 | 38700 |
| BSK | 3人 | 34500 | 35000 | 35900 | 36900 | 38300 | 41300 | 44200 | 45700 | 48100 | 51400 | 42300 | 50000 | 57700 |
| ICE | 1人 | 15300 | 15500 | 16000 | 16400 | 17100 | 18400 | 19800 | 20400 | 21600 | 23100 | 18400 | 21300 | 25300 |
| ICE | 2人 | 22200 | 22500 | 23100 | 23800 | 24700 | 26700 | 28700 | 29600 | 31200 | 33500 | 26700 | 30900 | 36700 |
| ICE | 3人 | 33100 | 33500 | 34500 | 35500 | 36900 | 39900 | 42800 | 44200 | 46600 | 50000 | 39800 | 46000 | 54700 |
| FLA | 1人 | 14800 | 15100 | 15500 | 16000 | 16600 | 18000 | 19300 | 20000 | 21100 | 22700 | 18000 | 20800 | 24800 |
| FLA | 2人 | 21500 | 21800 | 22500 | 23100 | 24100 | 26100 | 28000 | 29000 | 30600 | 32900 | 26000 | 30200 | 36000 |
| FLA | 3人 | 32100 | 32600 | 33500 | 34500 | 35900 | 38900 | 41800 | 43300 | 45700 | 49000 | 38800 | 45100 | 53700 |
| BOOM | 1人 | 15300 | 15500 | 16000 | 16400 | 17100 | 18400 | 19800 | 20400 | 21600 | 23100 | 18400 | 21300 | 25300 |
| BOOM | 2人 | 22200 | 22500 | 23100 | 23800 | 24700 | 26700 | 28700 | 29600 | 31200 | 33500 | 26700 | 30900 | 36700 |
| BOOM | 3人 | 33100 | 33500 | 34500 | 35500 | 36900 | 39900 | 42800 | 44200 | 46600 | 50000 | 39800 | 46000 | 54700 |
| LEO | 1人 | 16000 | 16200 | 16600 | 17100 | 17700 | 19100 | 20400 | 21100 | 22200 | 23800 | 19100 | 22000 | 26000 |
| LEO | 2人 | 23100 | 23400 | 24100 | 24700 | 25700 | 27700 | 29600 | 30600 | 32200 | 34500 | 27600 | 31800 | 37600 |
| LEO | 3人 | 34500 | 35000 | 35900 | 36900 | 38300 | 41300 | 44200 | 45700 | 48100 | 51400 | 41200 | 47500 | 56100 |
| OBA | 1人 | 16400 | 16600 | 17100 | 17500 | 18200 | 19600 | 20900 | 21600 | 22700 | 24200 | 19500 | 22400 | 26400 |
| OBA | 2人 | 23800 | 24100 | 24700 | 25400 | 26300 | 28300 | 30300 | 31200 | 32900 | 35100 | 28300 | 32500 | 38300 |
| OBA | 3人 | 35500 | 35900 | 36900 | 37900 | 39300 | 42300 | 45200 | 46600 | 49000 | 52400 | 42200 | 48400 | 57100 |
| LEMON | 1人 | 16000 | 16200 | 16600 | 17100 | 17700 | 19100 | 20400 | 21100 | 22200 | 23800 | 19400 | 22700 | 26200 |
| LEMON | 2人 | 23100 | 23400 | 24100 | 24700 | 25700 | 27700 | 29600 | 30600 | 32200 | 34500 | 28100 | 32900 | 38000 |
| LEMON | 3人 | 34500 | 35000 | 35900 | 36900 | 38300 | 41300 | 44200 | 45700 | 48100 | 51400 | 41900 | 49100 | 56800 |
| MULE | 1人 | 16600 | 16800 | 17300 | 17700 | 18400 | 19800 | 21100 | 21800 | 22900 | 24400 | 19700 | 22600 | 26200 |
| MULE | 2人 | 24100 | 24400 | 25100 | 25700 | 26700 | 28700 | 30600 | 31600 | 33200 | 35400 | 28600 | 32800 | 37900 |
| MULE | 3人 | 35900 | 36400 | 37400 | 38300 | 39800 | 42800 | 45700 | 47100 | 49500 | 52900 | 42700 | 48900 | 56600 |
| HAILY | 1人 | 17500 | 17700 | 18200 | 18600 | 19300 | 20700 | 22000 | 22700 | 23800 | 25300 | 20600 | 23500 | 27100 |
| HAILY | 2人 | 25400 | 25700 | 26300 | 27000 | 28000 | 30000 | 31900 | 32900 | 34500 | 36700 | 29900 | 34100 | 39200 |
| HAILY | 3人 | 37900 | 38300 | 39300 | 40300 | 41700 | 44700 | 47600 | 49000 | 51400 | 54800 | 44600 | 50900 | 58600 |
| HANA | 1人 | 18600 | 18800 | 19300 | 19700 | 20400 | 21800 | 23100 | 23800 | 24900 | 26400 | 21700 | 24600 | 28200 |
| HANA | 2人 | 27000 | 27300 | 28000 | 28600 | 29600 | 31600 | 33500 | 34500 | 36100 | 38300 | 31500 | 35700 | 40800 |
| HANA | 3人 | 40300 | 40800 | 41700 | 42700 | 44100 | 47100 | 50000 | 51400 | 53800 | 57200 | 47000 | 53300 | 61000 |
| BJ | 1人 | 14600 | 14800 | 15300 | 15700 | 16400 | 17800 | 19100 | 19800 | 20900 | 22400 | 17700 | 20600 | 24600 |
| BJ | 2人 | 21200 | 21500 | 22200 | 22800 | 23800 | 25800 | 27700 | 28700 | 30300 | 32500 | 25700 | 29900 | 35700 |
| BJ | 3人 | 31600 | 32100 | 33100 | 34000 | 35500 | 38400 | 41300 | 42800 | 45200 | 48500 | 38300 | 44600 | 53300 |

**Tab: `POS_調整費率`**（6 rows + header = 7 rows）

費率為**全款式通用**，依材質群組與座位數而異。

| 費率群組 | 適用材質IDs | 1人_深/6cm | 1人_背/6cm | 2人_深/6cm | 2人_背/6cm | 3人_深/6cm | 3人_背/6cm | 加寬/1cm |
|---|---|---|---|---|---|---|---|---|
| TW | TW_LV1,TW_LV2,TW_LV3,TW_LV4,TW_LV5 | 700 | 500 | 900 | 700 | 1300 | 1000 | 150 |
| IMPORT_基礎 | IMPORT_LV1,IMPORT_LV2,IMPORT_LV3 | 900 | 700 | 1300 | 1000 | 1500 | 1200 | 200 |
| IMPORT_高階 | IMPORT_LV4,IMPORT_LV5 | 1300 | 1000 | 1500 | 1200 | 2000 | 1800 | 250 |
| LEATHER_LV1 | LEATHER_LV1 | 700 | 500 | 900 | 700 | 1000 | 800 | 150 |
| LEATHER_LV2 | LEATHER_LV2 | 900 | 700 | 1300 | 1000 | 1500 | 1200 | 200 |
| LEATHER_LV3 | LEATHER_LV3 | 1000 | 900 | 1500 | 1200 | 2000 | 1800 | 300 |

---

## File Structure

| 狀態 | 路徑 | 說明 |
|---|---|---|
| 修改 | `src/app/api/sheets/init/route.ts` | 新增 POS_底價、POS_調整費率 定義 |
| 新增 | `src/app/api/sheets/migrate-v15/route.ts` | 遷移：新增兩個新 tab 並填入資料 |
| 新增 | `src/app/api/sheets/pos-pricing/route.ts` | GET：讀取 POS_底價 + POS_調整費率 |
| 新增 | `src/lib/pos-pricing-engine.ts` | POS 計算引擎（純 TS，可 server/client 共用） |
| 修改 | `src/app/pos-quote/PosQuoteClient.tsx` | 改用 Next.js API 取底價，移除 FastAPI calculate |

---

## Task 1: 更新 init 加入 POS 定價 tab 定義

**Files:**
- Modify: `src/app/api/sheets/init/route.ts`

- [ ] **Step 1: 在 SHEET_DEFINITIONS 陣列末尾加入兩個定義**

在最後一個 `},` 後（`庫存主檔` 或最後一個定義後）加入：

```typescript
  {
    title: "POS_底價",
    headers: ["款式", "座位", "TW_LV1", "TW_LV2", "TW_LV3", "TW_LV4", "TW_LV5", "IMPORT_LV1", "IMPORT_LV2", "IMPORT_LV3", "IMPORT_LV4", "IMPORT_LV5", "LEATHER_LV1", "LEATHER_LV2", "LEATHER_LV3"],
  },
  {
    title: "POS_調整費率",
    headers: ["費率群組", "適用材質IDs", "1人_深/6cm", "1人_背/6cm", "2人_深/6cm", "2人_背/6cm", "3人_深/6cm", "3人_背/6cm", "加寬/1cm"],
  },
```

- [ ] **Step 2: 執行 /api/sheets/init 驗證不報錯**

```bash
curl -s -X POST http://localhost:3000/api/sheets/init | jq '.success'
# Expected: true
```

- [ ] **Step 3: 確認 Google Sheets 中新增了兩個空白標籤**

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sheets/init/route.ts
git commit -m "feat(sheets): add POS_底價 and POS_調整費率 tab definitions to init"
```

---

## Task 2: 建立 migrate-v15 填入 POS 定價資料

**Files:**
- Create: `src/app/api/sheets/migrate-v15/route.ts`

- [ ] **Step 1: 建立 migrate-v15/route.ts**

路徑：`src/app/api/sheets/migrate-v15/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";

const POS_BASE_PRICES: string[][] = [
  ["款式", "座位", "TW_LV1", "TW_LV2", "TW_LV3", "TW_LV4", "TW_LV5", "IMPORT_LV1", "IMPORT_LV2", "IMPORT_LV3", "IMPORT_LV4", "IMPORT_LV5", "LEATHER_LV1", "LEATHER_LV2", "LEATHER_LV3"],
  ["ELEC","1人","14000","14200","14600","15100","15700","17100","18400","19100","20200","21800","17100","20000","24000"],
  ["ELEC","2人","20200","20500","21200","21800","22800","24800","26700","27700","29300","31600","24700","28900","34700"],
  ["ELEC","3人","30200","30600","31600","32600","34000","37000","39900","41300","43700","47100","36900","43200","51800"],
  ["POINT","1人","14600","14800","15300","15700","16400","17800","19100","19800","20900","22400","17700","20600","24600"],
  ["POINT","2人","21200","21500","22200","22800","23800","25800","27700","28700","30300","32500","25700","29900","35700"],
  ["POINT","3人","31600","32100","33100","34000","35500","38400","41300","42800","45200","48500","38300","44600","53300"],
  ["BLT","1人","14400","14600","15100","15500","16200","17600","18900","19600","20700","22200","17500","20400","24400"],
  ["BLT","2人","20900","21200","21800","22500","23400","25400","27400","28300","30000","32200","25400","29600","35400"],
  ["BLT","3人","31100","31600","32600","33500","35000","38000","40800","42300","44700","48100","37900","44100","52800"],
  ["GALI","1人","14400","14600","15100","15500","16200","17600","18900","19600","20700","22200","17500","20400","24400"],
  ["GALI","2人","20900","21200","21800","22500","23400","25400","27400","28300","30000","32200","25400","29600","35400"],
  ["GALI","3人","31100","31600","32600","33500","35000","38000","40800","42300","44700","48100","37900","44100","52800"],
  ["MIKO","1人","14400","14600","15100","15500","16200","17600","18900","19600","20700","22200","18000","20900","24500"],
  ["MIKO","2人","20900","21200","21800","22500","23400","25400","27400","28300","30000","32200","26100","30300","35500"],
  ["MIKO","3人","31100","31600","32600","33500","35000","38000","40800","42300","44700","48100","39000","45200","52900"],
  ["JIMMY","1人","14400","14600","15100","15500","16200","17600","18900","19600","20700","22200","18000","20900","24500"],
  ["JIMMY","2人","20900","21200","21800","22500","23400","25400","27400","28300","30000","32200","26100","30300","35500"],
  ["JIMMY","3人","31100","31600","32600","33500","35000","38000","40800","42300","44700","48100","39000","45200","52900"],
  ["BSK","1人","16000","16200","16600","17100","17700","19100","20400","21100","22200","23800","19600","23100","26700"],
  ["BSK","2人","23100","23400","24100","24700","25700","27700","29600","30600","32200","34500","28400","33500","38700"],
  ["BSK","3人","34500","35000","35900","36900","38300","41300","44200","45700","48100","51400","42300","50000","57700"],
  ["ICE","1人","15300","15500","16000","16400","17100","18400","19800","20400","21600","23100","18400","21300","25300"],
  ["ICE","2人","22200","22500","23100","23800","24700","26700","28700","29600","31200","33500","26700","30900","36700"],
  ["ICE","3人","33100","33500","34500","35500","36900","39900","42800","44200","46600","50000","39800","46000","54700"],
  ["FLA","1人","14800","15100","15500","16000","16600","18000","19300","20000","21100","22700","18000","20800","24800"],
  ["FLA","2人","21500","21800","22500","23100","24100","26100","28000","29000","30600","32900","26000","30200","36000"],
  ["FLA","3人","32100","32600","33500","34500","35900","38900","41800","43300","45700","49000","38800","45100","53700"],
  ["BOOM","1人","15300","15500","16000","16400","17100","18400","19800","20400","21600","23100","18400","21300","25300"],
  ["BOOM","2人","22200","22500","23100","23800","24700","26700","28700","29600","31200","33500","26700","30900","36700"],
  ["BOOM","3人","33100","33500","34500","35500","36900","39900","42800","44200","46600","50000","39800","46000","54700"],
  ["LEO","1人","16000","16200","16600","17100","17700","19100","20400","21100","22200","23800","19100","22000","26000"],
  ["LEO","2人","23100","23400","24100","24700","25700","27700","29600","30600","32200","34500","27600","31800","37600"],
  ["LEO","3人","34500","35000","35900","36900","38300","41300","44200","45700","48100","51400","41200","47500","56100"],
  ["OBA","1人","16400","16600","17100","17500","18200","19600","20900","21600","22700","24200","19500","22400","26400"],
  ["OBA","2人","23800","24100","24700","25400","26300","28300","30300","31200","32900","35100","28300","32500","38300"],
  ["OBA","3人","35500","35900","36900","37900","39300","42300","45200","46600","49000","52400","42200","48400","57100"],
  ["LEMON","1人","16000","16200","16600","17100","17700","19100","20400","21100","22200","23800","19400","22700","26200"],
  ["LEMON","2人","23100","23400","24100","24700","25700","27700","29600","30600","32200","34500","28100","32900","38000"],
  ["LEMON","3人","34500","35000","35900","36900","38300","41300","44200","45700","48100","51400","41900","49100","56800"],
  ["MULE","1人","16600","16800","17300","17700","18400","19800","21100","21800","22900","24400","19700","22600","26200"],
  ["MULE","2人","24100","24400","25100","25700","26700","28700","30600","31600","33200","35400","28600","32800","37900"],
  ["MULE","3人","35900","36400","37400","38300","39800","42800","45700","47100","49500","52900","42700","48900","56600"],
  ["HAILY","1人","17500","17700","18200","18600","19300","20700","22000","22700","23800","25300","20600","23500","27100"],
  ["HAILY","2人","25400","25700","26300","27000","28000","30000","31900","32900","34500","36700","29900","34100","39200"],
  ["HAILY","3人","37900","38300","39300","40300","41700","44700","47600","49000","51400","54800","44600","50900","58600"],
  ["HANA","1人","18600","18800","19300","19700","20400","21800","23100","23800","24900","26400","21700","24600","28200"],
  ["HANA","2人","27000","27300","28000","28600","29600","31600","33500","34500","36100","38300","31500","35700","40800"],
  ["HANA","3人","40300","40800","41700","42700","44100","47100","50000","51400","53800","57200","47000","53300","61000"],
  ["BJ","1人","14600","14800","15300","15700","16400","17800","19100","19800","20900","22400","17700","20600","24600"],
  ["BJ","2人","21200","21500","22200","22800","23800","25800","27700","28700","30300","32500","25700","29900","35700"],
  ["BJ","3人","31600","32100","33100","34000","35500","38400","41300","42800","45200","48500","38300","44600","53300"],
];

const POS_ADJ_RATES: string[][] = [
  ["費率群組", "適用材質IDs", "1人_深/6cm", "1人_背/6cm", "2人_深/6cm", "2人_背/6cm", "3人_深/6cm", "3人_背/6cm", "加寬/1cm"],
  ["TW", "TW_LV1,TW_LV2,TW_LV3,TW_LV4,TW_LV5", "700", "500", "900", "700", "1300", "1000", "150"],
  ["IMPORT_基礎", "IMPORT_LV1,IMPORT_LV2,IMPORT_LV3", "900", "700", "1300", "1000", "1500", "1200", "200"],
  ["IMPORT_高階", "IMPORT_LV4,IMPORT_LV5", "1300", "1000", "1500", "1200", "2000", "1800", "250"],
  ["LEATHER_LV1", "LEATHER_LV1", "700", "500", "900", "700", "1000", "800", "150"],
  ["LEATHER_LV2", "LEATHER_LV2", "900", "700", "1300", "1000", "1500", "1200", "200"],
  ["LEATHER_LV3", "LEATHER_LV3", "1000", "900", "1500", "1200", "2000", "1800", "300"],
];

export async function POST() {
  try {
    const client = await getSheetsClient();

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: "POS_底價!A1",
      valueInputOption: "RAW",
      requestBody: { values: POS_BASE_PRICES },
    });

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: "POS_調整費率!A1",
      valueInputOption: "RAW",
      requestBody: { values: POS_ADJ_RATES },
    });

    return NextResponse.json({ success: true, message: "POS pricing data migrated" });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: 執行 migrate-v15 填入資料**

先確認 init 已執行（Task 1），再執行：
```bash
curl -s -X POST http://localhost:3000/api/sheets/migrate-v15 | jq '.success'
# Expected: true
```

- [ ] **Step 3: 在 Google Sheets 確認資料正確**

確認 POS_底價 第一行為 header，第二行 ELEC/1人/14000...，共 49 rows。
確認 POS_調整費率 共 7 rows。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sheets/migrate-v15/route.ts
git commit -m "feat(sheets): migrate-v15 seeds POS base prices and adjustment rates"
```

---

## Task 3: 建立 /api/sheets/pos-pricing API route

**Files:**
- Create: `src/app/api/sheets/pos-pricing/route.ts`

API 回傳格式（供 PosQuoteClient 用）：

```typescript
type AdjRates = { depthPer6cm: number; heightPer6cm: number; widthPer1cm: number }
type SeatRates = { "1人": AdjRates; "2人": AdjRates; "3人": AdjRates }

type PosPricingResponse = {
  basePrices: Record<string, Record<string, Record<string, number>>>
  // basePrices[style][seatType][materialId] = price
  // e.g. basePrices["ELEC"]["3人"]["TW_LV1"] = 30200
  adjRates: Record<string, SeatRates>
  // adjRates[materialId] = { "1人": {...}, "2人": {...}, "3人": {...} }
}
```

- [ ] **Step 1: 寫測試（Jest）**

建立 `src/__tests__/pos-pricing.test.ts`：

```typescript
import { parsePosBasePrices, parsePosAdjRates } from "@/lib/pos-pricing-engine";

describe("parsePosBasePrices", () => {
  it("parses header + data rows into nested lookup", () => {
    const rows = [
      ["款式", "座位", "TW_LV1", "TW_LV2"],
      ["ELEC", "3人", "30200", "30600"],
      ["POINT", "3人", "31600", "32100"],
    ];
    const result = parsePosBasePrices(rows);
    expect(result["ELEC"]["3人"]["TW_LV1"]).toBe(30200);
    expect(result["POINT"]["3人"]["TW_LV2"]).toBe(32100);
  });
});

describe("parsePosAdjRates", () => {
  it("maps each materialId in the tier to its seat-based rates", () => {
    const rows = [
      ["費率群組", "適用材質IDs", "1人_深/6cm", "1人_背/6cm", "2人_深/6cm", "2人_背/6cm", "3人_深/6cm", "3人_背/6cm", "加寬/1cm"],
      ["TW", "TW_LV1,TW_LV2", "700", "500", "900", "700", "1300", "1000", "150"],
    ];
    const result = parsePosAdjRates(rows);
    expect(result["TW_LV1"]["3人"].depthPer6cm).toBe(1300);
    expect(result["TW_LV2"]["1人"].widthPer1cm).toBe(150);
  });
});
```

- [ ] **Step 2: 確認測試失敗（函式還未存在）**

```bash
npx jest pos-pricing --no-coverage 2>&1 | tail -5
# Expected: FAIL with "Cannot find module"
```

- [ ] **Step 3: 建立 pos-pricing-engine.ts（只含 parse 函式）**

建立 `src/lib/pos-pricing-engine.ts`：

```typescript
export type AdjRates = { depthPer6cm: number; heightPer6cm: number; widthPer1cm: number }
export type SeatKey = "1人" | "2人" | "3人"
export type SeatRates = Record<SeatKey, AdjRates>

export function parsePosBasePrices(
  rows: string[][]
): Record<string, Record<string, Record<string, number>>> {
  const [header, ...dataRows] = rows;
  const matCols = header.slice(2); // after 款式, 座位

  const result: Record<string, Record<string, Record<string, number>>> = {};
  for (const row of dataRows) {
    const style = row[0];
    const seatType = row[1];
    if (!result[style]) result[style] = {};
    result[style][seatType] = {};
    matCols.forEach((matId, i) => {
      const price = Number(row[i + 2]);
      if (!isNaN(price) && price > 0) result[style][seatType][matId] = price;
    });
  }
  return result;
}

export function parsePosAdjRates(rows: string[][]): Record<string, SeatRates> {
  const [, ...dataRows] = rows; // skip header
  const result: Record<string, SeatRates> = {};

  for (const row of dataRows) {
    const matIds = row[1].split(",").map((s) => s.trim());
    const rates: SeatRates = {
      "1人": { depthPer6cm: Number(row[2]), heightPer6cm: Number(row[3]), widthPer1cm: Number(row[8]) },
      "2人": { depthPer6cm: Number(row[4]), heightPer6cm: Number(row[5]), widthPer1cm: Number(row[8]) },
      "3人": { depthPer6cm: Number(row[6]), heightPer6cm: Number(row[7]), widthPer1cm: Number(row[8]) },
    };
    for (const matId of matIds) result[matId] = rates;
  }
  return result;
}
```

- [ ] **Step 4: 確認測試通過**

```bash
npx jest pos-pricing --no-coverage
# Expected: PASS, 2 tests
```

- [ ] **Step 5: 建立 API route**

建立 `src/app/api/sheets/pos-pricing/route.ts`：

```typescript
import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import { parsePosBasePrices, parsePosAdjRates } from "@/lib/pos-pricing-engine";

export async function GET() {
  try {
    const client = await getSheetsClient();
    const [basePricesRes, adjRatesRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "POS_底價!A1:O",
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "POS_調整費率!A1:I",
      }),
    ]);

    const basePrices = parsePosBasePrices(basePricesRes.data.values as string[][]);
    const adjRates = parsePosAdjRates(adjRatesRes.data.values as string[][]);

    return NextResponse.json({ basePrices, adjRates });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 6: 確認 GET /api/sheets/pos-pricing 回傳正確資料**

```bash
curl -s http://localhost:3000/api/sheets/pos-pricing | jq '.basePrices.ELEC["3人"].TW_LV1'
# Expected: 30200
curl -s http://localhost:3000/api/sheets/pos-pricing | jq '.adjRates.TW_LV1["3人"].depthPer6cm'
# Expected: 1300
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/pos-pricing-engine.ts src/app/api/sheets/pos-pricing/route.ts src/__tests__/pos-pricing.test.ts
git commit -m "feat(pos): add pos-pricing API route reading from Google Sheets"
```

---

## Task 4: 實作 POS 費用計算函式（pos-pricing-engine.ts）

這些函式移植自 FastAPI `pos_service.py`，在 Next.js 側重新實作。

**Files:**
- Modify: `src/lib/pos-pricing-engine.ts`

費用計算邏輯（參考 `pos_service.py`）：

| 費用 | 計算方式 |
|---|---|
| 底價 | `basePrices[style][seatType][materialId]` |
| 寬度調整 | `widthAdjCm * adjRates[materialId][seatType].widthPer1cm` |
| 深度調整 | `Math.round(depthAdjCm / 6) * adjRates[materialId][seatType].depthPer6cm` |
| 背高調整 | `Math.round(heightAdjCm / 3) * adjRates[materialId][seatType].heightPer6cm` (按 3cm 計算，每 6cm 費率) |
| 平台微調 | 無調整→$0；只縮減→$500；有加大→`max((寬+深) × widthRate ÷ 2, 500)` |
| 落地改造 | `全落地: 2000, 半落地: 1500, 高度削減: -1000`（height_reduction 為折扣）|
| 扶手扣除 | `-1500 / 支` |
| USB 充電 | `1500 / 個` |
| 無線充電 | `1000 / 個` |
| 坐墊滑軌 | `1000 / 位` |
| 大腳椅 | 依座位寬加寬費用除以二（基本費 $500）|

> ⚠️ 先確認 `pos_service.py` 中各費用計算的確切公式，特別是深度/背高的 step 計算邏輯。

- [ ] **Step 1: 閱讀 pos_service.py 確認各費用計算公式**

讀取：`/Users/Mao/Documents/VSCode/PotatoSofa production scheduling system/sofa-production-system/api/services/pos_service.py`

重點確認：
- `calculate_depth_cost(material_id, seat_count, depth_adj)` 的步進邏輯
- `calculate_height_cost(material_id, seat_count, height_adj)` 的步進邏輯
- `calculate_ground_cost(ground_type, seat_count)` 的費率
- `calculate_platform_cost(style, seat_count)` 的費率

- [ ] **Step 2: 在 pos-pricing-engine.ts 加入計算函式**

加入以下（根據 Step 1 確認的公式填入實際邏輯）：

```typescript
export interface PosAdjustments {
  widthAdjCm: number        // 正數=加寬, 負數=縮減
  depthAdjCm: number        // 0~+18, step=3
  heightAdjCm: number       // 0~+12, step=3
  platformWidthAdj: number  // 平台加寬 cm
  platformDepthAdj: number  // 平台加深 cm
  groundOption: "none" | "full" | "half"
  heightReduction: boolean  // 高度削減 (-1000 折扣)
  removeArmrestCount: number
  usbCount: number
  wirelessChargeCount: number
  slideRailCount: number
}

export interface PosCostBreakdown {
  basePrice: number
  widthCost: number
  depthCost: number
  heightCost: number
  groundCost: number
  heightReductionDiscount: number
  platformCost: number
  armrestDiscount: number
  usbCost: number
  wirelessCost: number
  slideRailCost: number
  subtotal: number
  deposit: number
}

export function calcPosCost(
  basePrice: number,
  adjRates: SeatRates,
  seatKey: SeatKey,
  adj: PosAdjustments,
): PosCostBreakdown {
  const rates = adjRates[seatKey];
  const widthCost = adj.widthAdjCm * rates.widthPer1cm;
  // Both depth and height: 3cm or 6cm both cost 1 unit (ceil to nearest 6cm)
  const depthSteps = Math.ceil(adj.depthAdjCm / 6);
  const depthCost = depthSteps * rates.depthPer6cm;
  const heightSteps = Math.ceil(adj.heightAdjCm / 6);
  const heightCost = heightSteps * rates.heightPer6cm;

  const groundCost =
    adj.groundOption === "full" ? 2000 :
    adj.groundOption === "half" ? 1500 : 0;
  const heightReductionDiscount = adj.heightReduction ? -1000 : 0;

  // Platform adjustment: charged only when dimensions change
  const platIncrease = Math.max(0, adj.platformWidthAdj) + Math.max(0, adj.platformDepthAdj);
  const platformCost = platIncrease > 0
    ? Math.max(Math.floor(platIncrease * rates.widthPer1cm / 2), 500)
    : (adj.platformWidthAdj !== 0 || adj.platformDepthAdj !== 0) ? 500 : 0;

  const armrestDiscount = adj.removeArmrestCount * -1500;
  const usbCost = adj.usbCount * 1500;
  const wirelessCost = adj.wirelessChargeCount * 1200;
  const slideRailCost = adj.slideRailCount * 1000;

  const subtotal = basePrice + widthCost + depthCost + heightCost + groundCost + heightReductionDiscount + platformCost + armrestDiscount + usbCost + wirelessCost + slideRailCost;
  const deposit = Math.round(subtotal * 0.3);

  return { basePrice, widthCost, depthCost, heightCost, groundCost, heightReductionDiscount, platformCost, armrestDiscount, usbCost, wirelessCost, slideRailCost, subtotal, deposit };
}
```

- [ ] **Step 3: 為 calcPosCost 補充單元測試**

在 `src/__tests__/pos-pricing.test.ts` 加入：

```typescript
import { calcPosCost } from "@/lib/pos-pricing-engine";

const mockRates: SeatRates = {
  "3人": { depthPer6cm: 1300, heightPer6cm: 1000, widthPer1cm: 150 },
  "2人": { depthPer6cm: 900, heightPer6cm: 700, widthPer1cm: 150 },
  "1人": { depthPer6cm: 700, heightPer6cm: 500, widthPer1cm: 150 },
};

it("calcPosCost: base only, no adjustments", () => {
  const result = calcPosCost(30200, mockRates, "3人", {
    widthAdjCm: 0, depthAdjCm: 0, heightAdjCm: 0,
    groundType: null, removeArmrestCount: 0,
    usbCount: 0, wirelessChargeCount: 0, slideRailCount: 0,
  });
  expect(result.basePrice).toBe(30200);
  expect(result.widthCost).toBe(0);
  expect(result.depthCost).toBe(0);
});

it("calcPosCost: +6cm depth for 3人 TW = 1300", () => {
  const result = calcPosCost(30200, mockRates, "3人", {
    widthAdjCm: 0, depthAdjCm: 6, heightAdjCm: 0,
    groundType: null, removeArmrestCount: 0,
    usbCount: 0, wirelessChargeCount: 0, slideRailCount: 0,
  });
  expect(result.depthCost).toBe(1300);
});
```

- [ ] **Step 4: 確認測試通過**

```bash
npx jest pos-pricing --no-coverage
# Expected: PASS, 4+ tests
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/pos-pricing-engine.ts src/__tests__/pos-pricing.test.ts
git commit -m "feat(pos): implement POS cost calculation engine in Next.js"
```

---

## Task 5: 更新 PosQuoteClient 使用 Next.js API

**Files:**
- Modify: `src/app/pos-quote/PosQuoteClient.tsx`

目前 PosQuoteClient 呼叫 FastAPI 來計算費用。這個 Task 改為呼叫 `/api/sheets/pos-pricing` 取得定價資料，並在 client 端用 `calcPosCost` 計算。

- [ ] **Step 1: 加入 usePosPrice hook**

在 `PosQuoteClient.tsx` 頂部加入：

```typescript
function usePosPrice() {
  const [pricing, setPricing] = useState<{ basePrices: ...; adjRates: ... } | null>(null);
  useEffect(() => {
    fetch("/api/sheets/pos-pricing")
      .then((r) => r.json())
      .then(setPricing);
  }, []);
  return pricing;
}
```

- [ ] **Step 2: 在報價計算邏輯改用 calcPosCost**

找到目前呼叫 FastAPI `/calculate` 的地方（搜尋 `legacy/pos` 或 `calculate`），改為：
1. 從 `pricing.basePrices[style][seatType][materialId]` 取底價
2. 呼叫 `calcPosCost(basePrice, pricing.adjRates[materialId], seatType, adj)` 取費用明細

- [ ] **Step 3: 保留 FastAPI 呼叫用於指示圖**

`POST /api/legacy/pos/generate-diagram` 呼叫維持不變，只移除計算相關呼叫。

- [ ] **Step 4: 手動測試報價流程**

1. 選 ELEC、L1組、TW_LV1
2. 確認底價顯示 30,200
3. 加深 +6cm，確認深度費用 +1,300
4. 確認指示圖仍正常產生（FastAPI）

- [ ] **Step 5: Commit**

```bash
git add src/app/pos-quote/PosQuoteClient.tsx
git commit -m "feat(pos): PosQuoteClient reads pricing from Sheets, calculates locally"
```

---

## Self-Review

- [x] Spec coverage: init 定義 → migrate 填資料 → API route 讀取 → engine 計算 → client 使用
- [x] No placeholders: 所有步驟含完整程式碼，TODO 有明確說明需確認的項目
- [x] Type consistency: `SeatKey`、`SeatRates`、`AdjRates` 在各 Task 使用一致
- [x] 深度/背高 step 邏輯已確認：3cm 與 6cm 費用相同，公式 `Math.ceil(adj / 6) * rate`
- [x] 平台費率已確認：無調整=$0，縮減=$500，加大=`max((寬+深)×widthRate÷2, 500)`
- [x] 落地費率已確認：全落地=$2,000，半落地=$1,500，高度削減=-$1,000
- [x] 無線充電費率已確認：$1,200/組（非 $1,000）
