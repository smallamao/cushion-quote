# 繃布報價系統 (Cushion Quote V2)

本專案是為「馬鈴薯沙發」開發的專業繃布報價與訂單管理系統。

## 核心功能
- **彈性報價系統**：支援多品項、多版本管理。
- **智慧計算器**：自動計算面料裁切、損耗與總成本。
- **佣金與利潤管理**：支援多種佣金模式（賺價差、返佣、固定金額）。
- **PDF 報價單與裁切表**：一鍵產生施工用單據。
- **Google Sheets 雲端存儲**：作為資料庫，方便非工程人員直接查閱數據。

## 技術棧
- **框架**: Next.js 15 (App Router)
- **語言**: TypeScript
- **UI**: Tailwind CSS + Radix UI (Shadcn UI)
- **PDF**: @react-pdf/renderer
- **Backend**: Google Sheets API + Cloudinary (圖片)

## 功能模組文檔 (Detailed Docs)
- [📊 儀表板](./docs/features/01-dashboard.md)
- [📋 訂單管理](./docs/features/02-order-management.md)
- [📆 日期排程](./docs/features/03-date-scheduling.md)
- [🏭 工作單據](./docs/features/04-work-orders.md)
- [📦 材料分析](./docs/features/05-material-analysis.md)
- [🧮 採購逆向](./docs/features/06-purchase-reverse.md)
- [🚚 出貨排程](./docs/features/07-shipping-schedule.md)
- [💰 POS 報價](./docs/features/08-pos-quotation.md)
- [⚙️ 系統設定](./docs/features/09-system-settings.md)

## 開發指令
```bash
npm install     # 安裝依賴
npm run dev     # 啟動開發環境
npm run build   # 構建生產版本
npm run lint    # 程式碼品質檢查
```
