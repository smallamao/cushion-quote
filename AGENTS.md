# 繃布報價系統 - 開發指南

## 專案架構
- `src/app`: 頁面路由與 API。
- `src/components`: UI 元件，分為核心功能區塊與共用 UI。
- `src/lib`: 核心邏輯層（定價引擎、裁切計算、Sheets 客戶端）。
- `src/hooks`: 封裝過的資料獲取與操作邏輯。
- `docs/features`: 詳細的功能規格文檔。

## 開發規範
- **型別定義**: 優先在 `src/lib/types.ts` 定義資料結構。
- **UI 元件**: 使用 `src/components/ui` 中的基礎元件。
- **報價邏輯**: 修改售價計算前，務必查閱 `src/lib/pricing-engine.ts`。
- **資料庫**: 本系統以 Google Sheets 為主要資料來源，Schema 定義於 `src/app/api/sheets/init/route.ts`。

## 核心設計原則
- **歷史不可變性**: 已儲存的歷史報價版本，單價不應受全域設定變動而自動重算。
- **自動化優先**: 透過計算器輸入的品項應盡可能自動推算成本與售價。
