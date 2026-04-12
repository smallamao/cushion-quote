# Wave 3B: 月對帳報表 PDF (Monthly Supplier Statement)

## 功能概述

自動產生與廠商的月對帳報表 PDF，列出當月所有採購單明細、總金額、付款狀態，供雙方核對帳務。

## 使用場景

1. **月底對帳**：每月底與廠商核對當月採購總額
2. **付款憑證**：作為付款申請的附件
3. **帳務稽核**：會計部門查核採購記錄
4. **廠商關係管理**：提供廠商清晰的對帳明細

## 業務流程

```
使用者操作
    ↓
選擇廠商 + 月份
    ↓
系統查詢該廠商該月的所有採購單
    ↓
計算總金額、付款狀態統計
    ↓
產生 PDF（類似現有報價單 PDF）
    ↓
下載或預覽 PDF
```

## UI/UX 設計

### 入口位置

#### 方式 1：廠商管理頁
- **位置**：`/suppliers` 廠商列表
- **觸發**：每個廠商行新增「對帳報表」按鈕
- **流程**：點擊 → 開啟 Modal → 選擇月份 → 產生 PDF

#### 方式 2：API 直接呼叫
- **URL**：`GET /api/sheets/suppliers/[supplierId]/statement?month=2026-03`
- **用途**：供自動化排程或外部系統使用

### Modal 設計

```
┌─────────────────────────────────────────┐
│  產生對帳報表 - XX布料行                  │
├─────────────────────────────────────────┤
│                                         │
│  選擇月份：                               │
│  [  2026-03  ▼ ]                        │
│                                         │
│  預覽範圍：                               │
│  2026/03/01 - 2026/03/31                │
│                                         │
│  符合採購單：5 筆                         │
│  預估總額：NT$ 125,000                   │
│                                         │
│  [取消]              [產生 PDF]          │
└─────────────────────────────────────────┘
```

## PDF 報表設計

### 版面配置

參考現有 `QuotePDF.tsx` 與 `PurchaseOrderPDF.tsx` 的樣式。

```
┌───────────────────────────────────────────────────┐
│                                                   │
│  [公司 Logo]              月對帳報表               │
│                                                   │
│  廠商：XX布料行                                     │
│  聯絡人：王小明                                     │
│  電話：02-1234-5678                                │
│  對帳期間：2026 年 3 月（2026/03/01 - 2026/03/31） │
│  報表產生時間：2026/04/01 10:30                    │
│                                                   │
├───────────────────────────────────────────────────┤
│                                                   │
│  採購明細                                          │
│  ┌────┬──────┬──────┬──────┬────────┬──────┐    │
│  │ #  │ 日期  │ 單號  │ 案件  │ 金額    │ 狀態  │    │
│  ├────┼──────┼──────┼──────┼────────┼──────┤    │
│  │ 1  │03/05 │PO123 │P5999 │ 25,000 │ 已收貨│    │
│  │ 2  │03/12 │PO125 │P5888 │ 30,000 │ 已收貨│    │
│  │ 3  │03/18 │PO128 │P5777 │ 20,000 │ 已確認│    │
│  │ 4  │03/25 │PO132 │P5666 │ 35,000 │ 草稿  │    │
│  │ 5  │03/28 │PO135 │P5555 │ 15,000 │ 已收貨│    │
│  └────┴──────┴──────┴──────┴────────┴──────┘    │
│                                                   │
│  統計摘要                                          │
│  ┌────────────┬──────┬────────┐                  │
│  │ 狀態        │ 筆數  │ 金額    │                  │
│  ├────────────┼──────┼────────┤                  │
│  │ 草稿        │  1   │ 35,000 │                  │
│  │ 已下單      │  0   │      0 │                  │
│  │ 已收貨      │  3   │ 70,000 │                  │
│  │ 已確認      │  1   │ 20,000 │                  │
│  ├────────────┼──────┼────────┤                  │
│  │ **總計**    │  5   │125,000 │                  │
│  └────────────┴──────┴────────┘                  │
│                                                   │
│  備註：                                            │
│  - 草稿單尚未確認，實際金額可能變動                 │
│  - 已收貨但未確認的單據請盡速確認                   │
│                                                   │
├───────────────────────────────────────────────────┤
│                                                   │
│  廠商簽章：_____________    日期：_____________    │
│  本公司簽章：___________    日期：_____________    │
│                                                   │
└───────────────────────────────────────────────────┘
```

## 技術實作

### 1. API Endpoint

**檔案**：`src/app/api/sheets/suppliers/[supplierId]/statement/route.ts`

**URL**：`GET /api/sheets/suppliers/[supplierId]/statement?month=2026-03`

**Query Parameters**：
- `month` (必填)：格式 `YYYY-MM`（例如 `2026-03`）

**Response**：
- **Content-Type**：`application/pdf`
- **Headers**：`Content-Disposition: attachment; filename="statement-XX布料行-2026-03.pdf"`
- **Body**：PDF binary stream

**實作邏輯**：
1. 驗證 `supplierId` 與 `month` 格式
2. 從「廠商」sheet 查詢廠商資訊
3. 從「採購單」sheet 查詢該廠商該月的所有訂單
   - 篩選條件：`supplierId === params.supplierId && orderDate.startsWith(month)`
4. 計算統計摘要（按狀態分組）
5. 使用 `@react-pdf/renderer` 產生 PDF
6. 回傳 PDF stream

### 2. PDF Component

**檔案**：`src/components/pdf/SupplierStatementPDF.tsx`

**使用技術**：`@react-pdf/renderer`（現有依賴，無需新增）

**Component 結構**：
```typescript
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

interface SupplierStatementPDFProps {
  supplier: {
    supplierId: string;
    name: string;
    shortName: string;
    contactPerson: string;
    phone: string;
    address: string;
  };
  month: string;  // "2026-03"
  orders: Array<{
    orderDate: string;
    orderId: string;
    caseId: string;
    caseNameSnapshot: string;
    totalAmount: number;
    status: PurchaseOrderStatus;
  }>;
  summary: {
    draft: { count: number; amount: number };
    ordered: { count: number; amount: number };
    received: { count: number; amount: number };
    confirmed: { count: number; amount: number };
    total: { count: number; amount: number };
  };
  generatedAt: string;  // ISO timestamp
}

export function SupplierStatementPDF(props: SupplierStatementPDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header supplier={props.supplier} month={props.month} generatedAt={props.generatedAt} />
        <OrderList orders={props.orders} />
        <SummaryTable summary={props.summary} />
        <Footer />
      </Page>
    </Document>
  );
}
```

### 3. 前端整合

**修改檔案**：`src/app/suppliers/SuppliersClient.tsx`

**步驟**：
1. 新增狀態：`const [statementModalOpen, setStatementModalOpen] = useState(false);`
2. 新增狀態：`const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);`
3. 在廠商表格新增「對帳報表」按鈕欄位
4. 建立 `StatementModal` component

**StatementModal Component**：
```typescript
interface StatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier;
}

function StatementModal({ isOpen, onClose, supplier }: StatementModalProps) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth()); // "2026-03"
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(
        `/api/sheets/suppliers/${supplier.supplierId}/statement?month=${selectedMonth}`
      );
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement-${supplier.shortName}-${selectedMonth}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      onClose();
    } catch (error) {
      alert('產生 PDF 失敗');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Modal content as shown in UI design */}
    </Dialog>
  );
}
```

### 4. 月份選擇器

**使用**：HTML5 `<input type="month">` 或自訂下拉選單

**選項產生**：
```typescript
function getAvailableMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push(month);
  }
  return months;
}
```

## 資料查詢邏輯

### 範圍篩選

**問題**：如何篩選「2026 年 3 月」的訂單？

**解決方案**：
```typescript
const startDate = `${month}-01`;  // "2026-03-01"
const endDate = `${month}-31`;    // "2026-03-31" (簡化，不考慮月底日期差異)

const ordersInMonth = allOrders.filter((order) =>
  order.supplierId === supplierId &&
  order.orderDate >= startDate &&
  order.orderDate <= endDate
);
```

### 統計計算

```typescript
function calculateSummary(orders: PurchaseOrder[]) {
  const summary = {
    draft: { count: 0, amount: 0 },
    ordered: { count: 0, amount: 0 },
    received: { count: 0, amount: 0 },
    confirmed: { count: 0, amount: 0 },
    total: { count: orders.length, amount: 0 },
  };

  for (const order of orders) {
    summary[order.status].count++;
    summary[order.status].amount += order.totalAmount;
    summary.total.amount += order.totalAmount;
  }

  return summary;
}
```

## 樣式設計

### PDF 樣式

參考現有 PDF 的樣式常數：
- 使用 Noto Sans TC 字體（支援中文）
- 顏色：主色調使用品牌色
- 表格：邊框 1px，內距 8px
- 頁邊距：上下左右各 40px

```typescript
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'NotoSansTC',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2pt solid #333',
    paddingBottom: 10,
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    marginVertical: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1pt solid #ddd',
    paddingVertical: 8,
  },
  // ... more styles
});
```

## 擴展性考量

### 未來可新增功能

1. **付款狀態欄位**：
   - 新增「已付款」、「部分付款」、「未付款」欄位
   - 需擴展「採購單」schema 加入 `paymentStatus` 與 `paidAmount`

2. **多月份範圍**：
   - 支援「2026-01 ~ 2026-03」季度報表
   - 支援「2026」年度報表

3. **對帳差異標記**：
   - 允許廠商回報實際金額
   - 系統比對差異並標記

4. **自動發送**：
   - 每月自動產生 PDF
   - 透過 Email 發送給廠商

5. **歷史對帳查詢**：
   - 儲存已產生的對帳報表
   - 提供歷史報表下載

### 資料結構擴展

如需記錄對帳歷史，可新增「對帳記錄」sheet：

| 欄位 | 說明 |
|------|------|
| statementId | 對帳單 ID |
| supplierId | 廠商 ID |
| month | 對帳月份（YYYY-MM） |
| totalAmount | 總金額 |
| orderCount | 採購單筆數 |
| generatedAt | 產生時間 |
| pdfUrl | PDF 檔案 URL（如使用 Vercel Blob） |
| status | 狀態（待確認、已確認、有差異） |

## 測試計劃

### API 測試
- 正常查詢：有採購單的廠商 + 月份
- 無資料情況：該月無採購單（產生空白報表）
- 無效廠商 ID：返回 404
- 日期範圍邊界：月初、月底的訂單正確包含

### PDF 測試
- 中文字體正確顯示
- 表格排版正確（無溢位）
- 多頁處理（如訂單 > 20 筆）
- 檔名正確（包含廠商名稱與月份）

### E2E 測試
- 從廠商列表 → 點擊對帳報表 → 選擇月份 → 產生 PDF → 下載成功

## 安全性考量

1. **權限檢查**：只有管理員可產生對帳報表（目前暫無權限機制）
2. **資料驗證**：確保 `month` 格式正確，防止 injection
3. **速率限制**：防止大量產生 PDF 造成 server 負載（未來考慮）

## 實作優先級

1. **P0 - 核心功能**：
   - API endpoint 開發
   - PDF component 開發
   - 基本樣式與排版
   - 廠商管理頁整合

2. **P1 - 資料完整性**：
   - 統計摘要計算
   - 多頁處理（訂單 > 20 筆）

3. **P2 - 體驗優化**：
   - 月份選擇器 UI
   - 預覽範圍顯示
   - 產生進度提示

4. **P3 - 擴展功能**：
   - 付款狀態欄位
   - 多月份範圍
   - 對帳歷史記錄

## 預估工時

- API Endpoint 開發：2 小時
- PDF Component 開發：4 小時
- 廠商管理頁整合：2 小時
- Modal UI 開發：1 小時
- 測試與優化：2 小時

**總計**：約 11 小時（1.5 天）

## 參考現有檔案

- **QuotePDF.tsx**：報價單 PDF 樣式參考
- **PurchaseOrderPDF.tsx**：採購單 PDF 樣式參考
- **Noto Sans TC 字體設定**：已在現有 PDF 中配置，直接使用
