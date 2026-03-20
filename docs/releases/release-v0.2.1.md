# 發布報告 v0.2.1

## 發布資訊
- 版本號：v0.2.1
- 發布時間：2026-03-20 19:35
- 分支：main
- Commit Hash：ed1faa25f301bd9b2ea9af9a87948536a46a3d52

## 本次變更摘要
- **核心邏輯修正**：解決切換佣金模式導致歷史報價金額跳動的問題。引入 `autoPriced` 標記隔離歷史品項。
- **文檔系統建置**：生成 9 個功能模組詳細說明文檔與開發提示詞。
- **測試與品質**：修復單元測試中的 Schema 欄位不一致問題，通過全量 Lint 檢查。
- **版本同步**：統一 package.json 與側邊欄顯示版號。

## 更新的檔案清單

### 功能文檔
| 檔案路徑 | 變更類型 |
|---------|---------|
| `docs/features/01-dashboard.md` | 新增 |
| `docs/features/02-order-management.md` | 新增 |
| `docs/features/03-date-scheduling.md` | 新增 |
| `docs/features/04-work-orders.md` | 新增 |
| `docs/features/05-material-analysis.md` | 新增 |
| `docs/features/06-purchase-reverse.md` | 新增 |
| `docs/features/07-shipping-schedule.md` | 新增 |
| `docs/features/08-pos-quotation.md` | 新增 |
| `docs/features/09-system-settings.md` | 新增 |
| `docs/prompts/*.md` | 新增 (5 份) |

### 程式碼與配置
| 檔案路徑 | 變更類型 |
|---------|---------|
| `src/components/quote-editor/QuoteEditor.tsx` | 修改 (邏輯保護) |
| `src/components/quote-editor/CalculatorModal.tsx` | 修改 (標記 autoPriced) |
| `src/lib/types.ts` | 修改 (新增型別欄位) |
| `src/__tests__/v2-utils.test.ts` | 修改 (修復測試) |
| `src/app/api/sheets/_v2-utils.ts` | 修改 (對齊 Schema) |
| `package.json` | 修改 (升版) |
| `src/components/layout/Sidebar.tsx` | 修改 (升版顯示) |
| `README.md` | 修改 (結構更新) |
| `CLAUDE.md` | 修改 (架構指南) |

## 品質檢查結果
- 程式碼問題：src 目錄下 0 Error。
- 單元測試：68/68 Passed。
- 版本同步：✅ package.json (0.2.1) = Sidebar (0.2.1)。

## 備註
- 此版本為 V2 架構的重要穩定版，建議所有環境同步更新。
