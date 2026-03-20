# b-code-quality.md

## 目的
確保程式碼符合 Next.js 15 規範及專案特定的定價邏輯。

## 前置需求
- 已安裝依賴。

## 執行步驟
1. 檢查是否使用了 `@/lib/types` 中定義的型別。
2. 確認 API Route 都有適當的錯誤處理。
3. 檢查 `useCallback` 與 `useMemo` 是否正確應用於頻繁渲染的報價編輯器。

## 檢查項目
- [ ] 無未使用的 Import。
- [ ] 報價重算邏輯不影響非 `autoPriced` 品項。
- [ ] 所有數值運算都有使用 `Math.round` 或 `roundPriceToTens`。
