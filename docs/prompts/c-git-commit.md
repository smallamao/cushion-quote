# c-git-commit.md

## 目的
規範 Git Commit 格式，方便自動化產生 ChangeLog。

## 執行步驟
1. 使用 `git status` 確認變更。
2. 撰寫格式：`<type>: <description>`。

## 輸出格式
- `feat`: 新功能
- `fix`: 修復 Bug
- `docs`: 文檔變更
- `style`: 格式調整
- `refactor`: 重構
- `release`: 版本發布

## 使用範例
`release: v0.2.0 - 加入新版報價編輯器與定價保護機制`
