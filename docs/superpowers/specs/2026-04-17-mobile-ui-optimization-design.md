# 手機版操作 UI 優化 — Phase 1 Shell 層

## 背景

繃布報價系統目前沒有手機端優化。≤1080px 時 sidebar 消失但無替代導航，按鈕/輸入框觸控目標過小（32-36px），下拉面板固定寬度可能溢出。使用者以 iPhone 為主（375-430px），需要全功能可用。

## 策略

採用「由外而內 Shell 優先」策略：先修好 App Shell（導航、Header、全域觸控尺寸），讓所有頁面立刻獲得基本手機可用性。各頁面的深度優化（報價編輯器表格重排、列表卡片化等）留給後續 Phase。

## 設計目標

- 所有頁面在 375px 寬螢幕上可導航、可操作
- 觸控目標符合 Apple HIG 建議 (≥44px)
- 桌面版行為完全不變
- 不新增任何外部依賴

## 斷點體系

| 斷點 | 範圍 | 行為 |
|------|------|------|
| 手機 | ≤768px | sidebar 隱藏，漢堡選單 + 底部抽屜導航，觸控尺寸放大 |
| 平板 | 769px-1080px | sidebar 強制收合為 icon-only (56px) |
| 桌面 | ≥1081px | 現有行為不變 |

## 改動區塊

### 1. 行動導航抽屜 (MobileDrawer)

**新增檔案：** `src/components/layout/MobileDrawer.tsx`

行為：
- ≤768px 時，Header 左側顯示漢堡圖示
- 點擊漢堡 → 底部滑出深色抽屜（背景色 `--sidebar-bg: #1E1E1E`）
- 抽屜內導航項目使用 2 欄 grid 排列
- 每個項目觸控高度 ≥48px
- 點擊導航連結或背景 overlay → 關閉抽屜
- 使用 CSS `transform: translateY()` 動畫，duration 250ms
- 抽屜頂部有拖曳指示條（純裝飾，不實作手勢拖曳）

導航資料來源：
- 複用 `Sidebar.tsx` 中的 `links` 陣列（需抽取為共用常數）
- 同樣依據 `user.role` 過濾可見項目

**修改檔案：** `src/components/layout/Sidebar.tsx`
- 將 `links` 陣列抽取到 `src/components/layout/nav-links.ts`
- Sidebar 和 MobileDrawer 共用同一份導航定義

**修改檔案：** `src/app/layout.tsx`
- 在 app-shell 中引入 `<MobileDrawer />` 元件（僅此一處）

MobileDrawer 元件自行管理開關狀態：
- 內含漢堡按鈕（fixed 定位於 Header 左側，僅 ≤768px 可見）
- 內含抽屜 overlay + 選單面板
- layout.tsx 只需 `<MobileDrawer />`，無需傳遞 props

### 2. Header 手機適配

**修改檔案：** `src/app/layout.tsx`

改動：
- Header padding：`px-8` → `px-4 md:px-8`

**修改檔案：** `src/components/layout/HeaderUserMenu.tsx`

改動：
- 通知鈴鐺觸控區：`h-9 w-9` → `h-10 w-10`
- 通知面板寬度：`w-80` → `w-[calc(100vw-32px)] md:w-80`，手機上接近全寬
- 使用者選單寬度：`w-52` → `w-[calc(100vw-32px)] md:w-52`
- 下拉面板定位：手機上使用 `fixed` + `inset-x-4` 取代 `absolute right-0`，避免超出螢幕

### 3. 全域觸控尺寸升級

**修改檔案：** `src/components/ui/button.tsx`

尺寸變更（手機放大，桌面不變）：

| size | 現在 | 手機 (改後) | 桌面 (改後) |
|------|------|-------------|-------------|
| sm | h-8 (32px) | h-10 (40px) | h-8 (32px) |
| default | h-9 (36px) | h-11 (44px) | h-9 (36px) |
| lg | h-10 (40px) | h-12 (48px) | h-10 (40px) |
| icon | h-8 w-8 | h-10 w-10 | h-8 w-8 |

實作方式：Tailwind 響應式類別，如 `h-11 md:h-9`。

**修改檔案：** `src/components/ui/input.tsx`（若存在）
- 同樣邏輯，確保輸入框手機端高度 ≥44px

### 4. CSS 斷點與頁面容器

**修改檔案：** `src/app/globals.css`

新增手機斷點：

```css
@media (max-width: 768px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: none;
  }

  .page-container {
    padding: var(--space-4);
  }
}
```

調整平板斷點（已有 1080px）：
- 769px-1080px 區間：sidebar 顯示但強制 icon-only 模式

## 不在 Phase 1 範圍

以下留給後續 Phase：
- 報價編輯器 (QuoteEditor.tsx) 品項表格響應式重排
- 報價紀錄 / 採購單列表的卡片式呈現
- ProductCombobox 寬度適配 (w-[380px])
- 材質資料庫手機佈局
- 各頁面表單 grid 調整
- 佣金結算頁面手機佈局

## 測試計畫

- [ ] iPhone SE (375px) 模擬器：導航抽屜開關正常
- [ ] iPhone 15 Pro (393px) 模擬器：通知面板不溢出
- [ ] iPhone 15 Pro Max (430px) 模擬器：觸控目標可點擊
- [ ] iPad (768px) 邊界：sidebar 收合正常
- [ ] 桌面 (1200px+)：所有行為與改動前一致
- [ ] 導航抽屜：所有 11 個連結可見且可點擊
- [ ] 導航抽屜：點擊連結後自動關閉
- [ ] 導航抽屜：點擊 overlay 背景關閉
- [ ] Header 通知面板：手機上全寬顯示
- [ ] Header 使用者選單：手機上全寬顯示

## 影響檔案清單

| 檔案 | 操作 |
|------|------|
| `src/components/layout/nav-links.ts` | 新增 |
| `src/components/layout/MobileDrawer.tsx` | 新增 |
| `src/components/layout/Sidebar.tsx` | 修改（抽取 links） |
| `src/app/layout.tsx` | 修改（Header + MobileDrawer） |
| `src/components/layout/HeaderUserMenu.tsx` | 修改（寬度 + 觸控） |
| `src/components/ui/button.tsx` | 修改（響應式尺寸） |
| `src/components/ui/input.tsx` | 修改（響應式尺寸） |
| `src/app/globals.css` | 修改（斷點 + page-container） |
