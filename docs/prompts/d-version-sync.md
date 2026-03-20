# d-version-sync.md

## 目的
確保所有地方的版本號碼完全一致。

## 檢查項目
- [ ] `package.json` 中的 `version` 欄位。
- [ ] `src/components/layout/Sidebar.tsx` (或頁尾) 顯示的版號。
- [ ] `README.md` 中的版本說明。

## 執行步驟
1. 讀取 `package.json` 版本。
2. 全域搜尋該版本字串，確認同步更新。
