# 部署前檢查清單

在部署到 Vercel 之前，請確認以下所有項目：

## ✅ 程式碼品質

- [ ] **本地 Build 成功**
  ```bash
  npm run build
  ```
  確認沒有 TypeScript 錯誤或 Build 失敗

- [ ] **測試通過**（如果有）
  ```bash
  npm test
  ```

- [ ] **Lint 檢查通過**
  ```bash
  npm run lint
  ```

- [ ] **所有變更已提交到 Git**
  ```bash
  git status
  git add .
  git commit -m "feat: 準備部署到 Vercel"
  git push origin main
  ```

## ✅ 環境變數準備

- [ ] **Google Sheets 設定**
  - [ ] `GOOGLE_SHEETS_SPREADSHEET_ID` - 試算表 ID 已準備
  - [ ] `GOOGLE_SERVICE_ACCOUNT_KEY` - Service Account JSON 金鑰已準備
  - [ ] Service Account 已加入 Google Sheets 分享名單（編輯者權限）
  - [ ] Google Sheets API 已在 Google Cloud Console 啟用

- [ ] **Cloudinary 設定**
  - [ ] `CLOUDINARY_CLOUD_NAME` - Cloud Name 已準備
  - [ ] `CLOUDINARY_API_KEY` - API Key 已準備
  - [ ] `CLOUDINARY_API_SECRET` - API Secret 已準備
  - [ ] Cloudinary 帳號已註冊並設定完成

## ✅ 安全性檢查

- [ ] **敏感資訊保護**
  - [ ] `.env.local` 已加入 `.gitignore`
  - [ ] `.env` 檔案已加入 `.gitignore`
  - [ ] 確認 Git Repository 中沒有敏感資訊
  - [ ] Service Account JSON 沒有被提交到 Git

- [ ] **權限設定**
  - [ ] Google Service Account 只有必要的權限
  - [ ] Cloudinary API 權限設定正確

## ✅ Vercel 專案設定

- [ ] **Vercel 帳號準備**
  - [ ] 已註冊 Vercel 帳號
  - [ ] 已連結 Git Provider（GitHub/GitLab/Bitbucket）

- [ ] **專案設定**
  - [ ] Framework Preset 設為 "Next.js"
  - [ ] Build Command: `npm run build`（預設）
  - [ ] Output Directory: `.next`（預設）
  - [ ] Install Command: `npm install`（預設）

- [ ] **環境變數設定**
  - [ ] 所有環境變數已加入 Vercel Dashboard
  - [ ] 環境變數的 Environment 設定正確（Production / Preview / Development）

## ✅ 功能完整性

- [ ] **核心功能已開發完成**
  - [ ] 案件管理（新增、編輯、刪除、查看）
  - [ ] 報價編輯器（多方案、多版本）
  - [ ] 計算器功能
  - [ ] PDF 產生功能
  - [ ] 圖片上傳功能
  - [ ] 客戶管理
  - [ ] 材料管理
  - [ ] 系統設定

- [ ] **資料一致性**
  - [ ] Google Sheets Schema 已初始化
  - [ ] 測試資料已準備（或確認 Production 資料正確）

## ✅ 文件準備

- [ ] **README.md** 已更新
  - [ ] 專案說明完整
  - [ ] 安裝步驟清楚
  - [ ] 環境變數說明完整

- [ ] **DEPLOYMENT.md** 已閱讀
  - [ ] 了解部署流程
  - [ ] 了解環境變數設定方式
  - [ ] 了解常見問題解決方案

## ✅ 部署後驗證計畫

準備以下測試案例，部署後立即驗證：

- [ ] 首頁可以正常載入
- [ ] 可以登入/存取系統
- [ ] 可以新增案件
- [ ] 可以建立報價
- [ ] 可以上傳圖片
- [ ] 可以產生 PDF
- [ ] 所有 API 端點正常運作

## ✅ 備援計畫

- [ ] **本地環境保持可運行狀態**
  - [ ] `.env.local` 已備份
  - [ ] 可以隨時回到本地開發環境

- [ ] **Database 備份**（如適用）
  - [ ] Google Sheets 有備份連結
  - [ ] 重要資料已匯出備份

## 🚀 準備部署！

所有項目都勾選完成後，即可開始部署：

### Vercel Dashboard 部署
1. 前往 https://vercel.com/new
2. Import Git Repository
3. 設定環境變數
4. 點擊 Deploy

### Vercel CLI 部署
```bash
vercel --prod
```

---

## 部署成功後的工作

- [ ] 測試所有核心功能
- [ ] 設定自訂網域（如需要）
- [ ] 設定 Vercel Analytics（可選）
- [ ] 監控錯誤和效能
- [ ] 通知團隊成員新的 Production URL

## 遇到問題？

參考以下文件：
- `docs/DEPLOYMENT.md` - 詳細部署指南
- `README.md` - 專案說明
- [Vercel 文件](https://vercel.com/docs)
- [Next.js 部署文件](https://nextjs.org/docs/deployment)
