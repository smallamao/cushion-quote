# 繃布報價系統 (Cushion Quote V2)

> **版本：v0.3.2** | 最後更新：2026-03-22

本專案是為「馬鈴薯沙發」開發的專業繃布報價與訂單管理系統。

## 核心功能
- **彈性報價系統**：支援多品項、多版本管理。
- **智慧計算器**：自動計算面料裁切、損耗與總成本。
- **施工加給分級**：根據安裝高度與板片尺寸自動計算工資加給。
- **多片組合輸入** ✨NEW：整面÷分片模式，自動計算單片尺寸與才數進位對比。
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

## 📝 版本紀錄

### v0.3.2 (2026-03-22) - 多片組合輸入模式
- ✨ 新增「整面÷分片」輸入模式
- ✨ 支援橫切/直切兩種分片方向
- ✨ 才數進位模式對比（逐片進位 vs 整面進位）
- 🔧 報價計算器新增輸入模式切換器
- 📊 Google Sheets 擴展 6 個新欄位（32 欄）
- ✅ 116 個單元測試全部通過

### v0.3.1 (2026-03-22) - 施工加給分級制
- ✨ 新增安裝高度分級（一般/中高/高空）
- ✨ 新增板片尺寸分級（標準/大型/超大型）
- ✨ 自動計算施工加給（兩維度百分比相加）
- 🔧 報價計算器新增施工條件選擇器
- 📊 Google Sheets 擴展 3 個新欄位（26 欄）

詳細變更請見 [CHANGELOG.md](./CHANGELOG.md)

## 開發指令
```bash
npm install     # 安裝依賴
npm run dev     # 啟動開發環境
npm run build   # 構建生產版本
npm run lint    # 程式碼品質檢查
npm test        # 執行測試套件
```

## 部署

### Vercel 部署（推薦）

本專案已針對 Vercel 平台優化，支援一鍵部署。

**快速開始：**
1. 📖 [5 分鐘快速指南](./docs/VERCEL-QUICKSTART.md)
2. 📋 [部署前檢查清單](./docs/PRE-DEPLOYMENT-CHECKLIST.md)
3. 📚 [完整部署文檔](./docs/DEPLOYMENT.md)

**部署狀態：**
- ✅ Build 測試通過
- ✅ TypeScript 編譯無錯誤
- ✅ 環境變數設定完整
- ✅ 部署文檔已準備

[![部署到 Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/cushion-quote)

### 資料庫遷移

升級到 v0.3.2 後，需依序執行以下遷移腳本：

```bash
# v0.3.1 遷移（如果尚未執行）
curl -X POST http://localhost:3000/api/sheets/migrate-v03

# v0.3.2 遷移（新增 6 個欄位）
curl -X POST http://localhost:3000/api/sheets/migrate-v032

# 生產環境
curl -X POST https://your-domain.vercel.app/api/sheets/migrate-v03
curl -X POST https://your-domain.vercel.app/api/sheets/migrate-v032
```

遷移腳本為冪等操作，可安全重複執行。
