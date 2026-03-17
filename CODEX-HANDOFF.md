# CODEX 交接文件 — CushionQuote v2 春懋繃布報價系統

## 你的任務

依照 `cushion-quote-v2.1-spec.md`（v0.3 Final）實作春懋繃布工程報價系統。這是一個內部工具，給 3-4 位工廠同事使用。

## 定版規格書

**唯一依據：`cushion-quote-v2.1-spec.md`**

另有一份 `cushion-quote-v2-spec.md` 是討論過程的草稿，**請忽略**。所有決策已合併進 v2.1。

## 現有程式碼

`pricing-calculator.jsx` — 現有的報價計算器 prototype（純前端 React 元件，inline styles）。包含：
- 完整的計算邏輯（才數、工資、面料損耗、附加工程、三通路倍率）
- 作法/面料/加工/附加工程的常數定義
- UI 元件結構（可參考互動模式，但不要照搬 inline styles）

**用途**：作為 pricing-engine.ts 計算邏輯的驗證參考，以及 UI 互動流程的原型。**不要**直接複製貼上——目標是用 TypeScript + shadcn/ui 重寫。

## 關鍵技術決策（已定案，不需再議）

1. **框架**：Next.js 15 App Router（不是 Vite）
2. **API 層**：Google Sheets API 金鑰透過 Route Handlers 代理，前端不直接碰 Sheets
3. **Sheets 金鑰**：`sheets-client.ts` 為 server-only 模組，`pricing-engine.ts` 為前後端共用純函式
4. **資料模型**：報價明細拆成獨立工作表（Sheet 4），不用 JSON 塞一格
5. **泡棉類型**：不存 Sheets，由 `MethodConfig` 程式碼定義自動推導（`baseThickness === null` = 無泡棉）
6. **認證**：完全公開，無登入機制
7. **倍率精度**：slider step = 0.05
8. **PDF 中文**：Noto Sans TC 字型放 `public/fonts/`，首次載入快取

## 開發順序（依 spec §6）

1. **Phase 1**：Next.js 初始化 + Google Sheets 連接 + 材質資料庫 CRUD
2. **Phase 2**：報價計算器 UI + pricing-engine + PDF
3. **Phase 3**：三通路定價 + 系統設定
4. **Phase 4**：報價紀錄 Sheets 整合 + 部署 Vercel
5. **Phase 5**：RWD、LINE 分享等優化

## 需要注意的坑

### pricing-engine.ts
- Spec §4 有完整 TypeScript 定義和計算函式，**直接用**
- `calculateQuote()` 處理整張報價單（含附加工程百分比加價）
- 返佣計算在 `calculateQuote()` 裡，依 `commissionMode` 決定
- 急件加價是百分比型（+40%/+80%），套用在品項通路小計上

### Google Sheets
- 5 張工作表：材質資料庫、工資表、報價紀錄、報價明細、系統設定
- 報價明細用 `quote_id` 關聯報價紀錄
- 快取策略：localStorage 5 分鐘，手動重新載入按鈕
- Rate limit：Google Sheets API 60 req/min/user，注意批次操作

### PDF（@react-pdf/renderer）
- CJK 字型需手動 `Font.register()`
- 字型檔 ~4MB，首次生成等 1-2 秒
- 有 `api/pdf/route.ts` 作為 server-side 備案（如果前端方案有問題）

### UI
- 用 shadcn/ui 元件，不要用 inline styles
- 左側 Sidebar 收合式 + 頂部 Navbar（含通路快速切換）
- 報價計算器是雙欄 layout（左輸入 / 右即時摘要）

## Code Review 約定

完成後會由 Sisyphus（另一位 AI 同事）做 code review，重點會看：

1. **pricing-engine.ts 計算正確性** — 對照 spec §4 和現有 `pricing-calculator.jsx` 的邏輯
2. **型別安全** — 不允許 `as any`、`@ts-ignore`、`@ts-expect-error`
3. **API 金鑰安全** — `sheets-client.ts` 確實只在 server-side import
4. **Sheets 資料模型** — 欄位對照 spec §3 D.1 / D.1.1 / D.2
5. **UI 一致性** — 對照 spec §5 的 mockup
6. **Build 通過** — `npm run build` exit code 0，無 type error

## 不在範圍內（不要做）

- 登入/認證系統
- 3D 預覽
- LINE 分享
- 手機版 RWD（Phase 5）
- 單元測試（除非你覺得 pricing-engine 需要）

---

有任何 spec 不清楚的地方，回來問，不要猜。
