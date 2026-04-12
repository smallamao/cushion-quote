# Wave 3D: 商品採購歷史視角 (Product Purchase History)

## 功能概述

提供「以商品為中心」的採購歷史視圖，讓使用者快速查看：
- 某商品的所有採購記錄
- 採購數量趨勢
- 單價變化趨勢
- 最近採購時間
- 常用於哪些案件

## 使用場景

1. **價格談判參考**：「上次跟這家廠商買這個布料是多少錢？」
2. **採購頻率分析**：「這個商品多久採購一次？」
3. **案件關聯查詢**：「這個商品通常用在哪些案件？」
4. **庫存規劃**：「平均每次採購多少數量？」

## UI/UX 設計

### 入口位置

#### 方式 1：採購商品清單
- **位置**：`/purchase-products` 商品表格
- **觸發**：點擊商品行最右側的「📊 歷史」按鈕
- **目標**：開啟該商品的採購歷史頁面

#### 方式 2：直接 URL
- **URL**：`/purchase-products/[productId]/history`
- **用途**：支援分享連結、書籤

### 頁面佈局

```
┌───────────────────────────────────────────────────────────┐
│  ← 返回商品列表                                             │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  商品：LY91 厚質極致涼感布                                   │
│  規格：60"W 300g/Y                                         │
│  廠商：XX布料行                                             │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  📊 採購統計摘要                                            │
│  ┌──────┬──────┬──────┬──────────┬──────────┐            │
│  │ 總次數│ 總數量│ 平均價│ 最近採購  │ 價格範圍  │            │
│  ├──────┼──────┼──────┼──────────┼──────────┤            │
│  │  12  │ 360碼│ $85  │ 2026/03  │ $80-$90  │            │
│  └──────┴──────┴──────┴──────────┴──────────┘            │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  📈 單價趨勢圖                                              │
│  [折線圖：時間軸 vs 單價]                                   │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  📦 採購明細記錄（最近 20 筆）                               │
│  ┌──────┬─────────┬─────┬──────┬─────┬──────┐            │
│  │ 日期  │ 採購單號 │ 數量 │ 單價  │ 金額 │ 案件  │            │
│  ├──────┼─────────┼─────┼──────┼─────┼──────┤            │
│  │ 03/15│ PO-0125 │ 30碼│ $85  │2550 │ P5999│            │
│  │ 02/20│ PO-0118 │ 25碼│ $85  │2125 │ P5888│            │
│  │ 01/10│ PO-0105 │ 40碼│ $80  │3200 │ P5777│            │
│  └──────┴─────────┴─────┴──────┴─────┴──────┘            │
│                                                           │
│  [載入更多...]                                             │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 互動設計

1. **點擊採購單號**：跳轉至該採購單編輯頁 `/purchases?orderId=PO-0125`
2. **點擊案件**：跳轉至該案件詳情頁 `/cases/P5999`
3. **單價趨勢圖**：Hover 顯示具體日期與單價
4. **排序**：預設按日期降序，可點擊欄位標題改為按單價、數量排序

## 技術實作

### 1. API Endpoint

**檔案**：`src/app/api/sheets/purchase-products/[productId]/history/route.ts`

**URL**：`GET /api/sheets/purchase-products/[productId]/history`

**Response**：
```typescript
{
  ok: true;
  product: {
    productId: string;
    productCode: string;
    productName: string;
    specification: string;
    unit: string;
    supplierId: string;
    supplierName: string;
  };
  summary: {
    totalPurchases: number;      // 總採購次數
    totalQuantity: number;        // 總採購數量
    averagePrice: number;         // 平均單價
    lastPurchaseDate: string;     // 最近採購日期
    minPrice: number;             // 最低單價
    maxPrice: number;             // 最高單價
  };
  history: Array<{
    orderDate: string;            // 採購日期
    orderId: string;              // 採購單號
    quantity: number;             // 採購數量
    unitPrice: number;            // 單價
    amount: number;               // 小計
    caseId: string;               // 關聯案件（可能為空）
    caseName: string;             // 案件名稱
  }>;
}
```

**實作邏輯**：
1. 從「採購商品」sheet 查詢 `productId` 取得商品資訊
2. 從「採購單明細」sheet 查詢 `productId` 符合的所有明細
3. 關聯「採購單」sheet 取得訂單日期與案件資訊
4. 計算統計摘要
5. 按日期降序排列歷史記錄

### 2. 前端頁面

**檔案**：`src/app/purchase-products/[productId]/history/page.tsx`

**使用技術**：
- **資料獲取**：使用 `useSWR` 呼叫 API
- **圖表**：使用 `recharts` 繪製折線圖
- **樣式**：Tailwind CSS + 現有 UI components

**Component 結構**：
```typescript
export default function ProductHistoryPage({ params }: { params: { productId: string } }) {
  const { data, error, isLoading } = useSWR(
    `/api/sheets/purchase-products/${params.productId}/history`,
    fetcher
  );

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage />;
  if (!data?.ok) return <NotFound />;

  return (
    <div className="container mx-auto p-6">
      <ProductHeader product={data.product} />
      <SummaryStats summary={data.summary} />
      <PriceTrendChart history={data.history} />
      <PurchaseHistoryTable history={data.history} />
    </div>
  );
}
```

### 3. 子 Component

#### 3.1 ProductHeader
顯示商品基本資訊與返回按鈕

#### 3.2 SummaryStats
統計摘要卡片（總次數、總數量、平均價等）

#### 3.3 PriceTrendChart
```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PriceTrendChartProps {
  history: PurchaseHistoryItem[];
}

export function PriceTrendChart({ history }: PriceTrendChartProps) {
  const chartData = history.map((item) => ({
    date: item.orderDate,
    price: item.unitPrice,
  })).reverse(); // 時間軸由舊到新

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="price" stroke="#8884d8" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

#### 3.4 PurchaseHistoryTable
採購明細表格，支援排序與點擊跳轉

### 4. 商品清單整合

**修改檔案**：`src/app/purchase-products/PurchaseProductsClient.tsx`

**步驟**：
1. 在商品表格最右側新增「歷史」欄位
2. 新增按鈕：
```typescript
<Link href={`/purchase-products/${product.id}/history`}>
  <Button variant="ghost" size="sm">
    <TrendingUp className="mr-1 h-3 w-3" />
    歷史
  </Button>
</Link>
```

## 資料查詢優化

### 效能考量

#### 問題：
「採購單明細」sheet 可能有數千筆資料，全表掃描會很慢

#### 解決方案（優先順序）：

1. **短期（當前實作）**：
   - 全表讀取後在記憶體中過濾（可接受，因目前資料量 < 1000 筆）
   - 快取結果 30 秒（使用 SWR 的 `revalidate` 選項）

2. **中期（資料量 > 5000 筆時）**：
   - 在 Google Sheets 新增「商品採購索引」sheet
   - 每次新增/修改採購單時同步更新索引
   - 結構：`productId | orderDate | orderId | quantity | unitPrice | amount`

3. **長期（資料量 > 50000 筆時）**：
   - 遷移至真正的資料庫（PostgreSQL + Prisma）
   - 建立索引：`CREATE INDEX idx_purchase_items_product ON purchase_items(product_id, order_date DESC);`

## 擴展性考量

### 未來可新增功能

1. **價格預測**：基於歷史資料預測未來價格趨勢（簡單移動平均）
2. **異常偵測**：單價突然上漲 >20% 時標記警示
3. **採購建議**：基於歷史頻率建議補貨時間
4. **廠商比價**：如同一商品有多個廠商，顯示價格對比
5. **匯出報表**：下載 CSV/Excel 格式的採購歷史

### 資料視覺化強化

1. **數量趨勢圖**：除了價格趨勢，也顯示採購數量趨勢
2. **月份熱力圖**：哪些月份採購頻率較高
3. **案件分佈圓餅圖**：該商品用於哪些案件類型（住宅、商業等）

## 測試計劃

### API 測試
- 正常查詢：有採購記錄的商品
- 邊界情況：從未採購過的商品（返回空歷史）
- 無效商品 ID：返回 404
- 大量資料：模擬 100+ 筆採購記錄

### UI 測試
- 圖表正確渲染（無資料、單一資料點、多資料點）
- 排序功能
- 連結跳轉（採購單、案件）
- 響應式佈局（手機、平板、桌面）

### E2E 測試
- 從商品列表 → 點擊歷史 → 查看完整歷史頁面
- 點擊採購單號 → 跳轉至採購單編輯頁
- 點擊案件 → 跳轉至案件詳情頁

## 依賴項目

### 新增 npm 套件
```json
{
  "recharts": "^2.10.0"  // 圖表庫
}
```

## 實作優先級

1. **P0 - 核心功能**：
   - API endpoint 開發
   - 基本頁面佈局
   - 統計摘要計算
   - 明細列表顯示

2. **P1 - 視覺化**：
   - 單價趨勢圖
   - 統計卡片美化

3. **P2 - 互動優化**：
   - 排序功能
   - 連結跳轉
   - 載入更多（分頁）

4. **P3 - 擴展功能**：
   - 匯出報表
   - 數量趨勢圖
   - 價格預測

## 預估工時

- API Endpoint 開發：3 小時
- 前端頁面框架：2 小時
- 圖表整合（recharts）：2 小時
- 商品列表整合：1 小時
- 測試與優化：2 小時

**總計**：約 10 小時（1.5 天）
