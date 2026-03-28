# Vercel 部署指南

## 環境變數設定

在 Vercel 專案設定中，需要設定以下環境變數：

### 1. Google Sheets 設定

**GOOGLE_SHEETS_SPREADSHEET_ID**
```
你的 Google Sheets 試算表 ID
範例：1RSFvij68gV6KmH7AhLV61-BeQ0-rXkfwk_R0Hfc6WhU
```

**GOOGLE_SERVICE_ACCOUNT_KEY**
```json
完整的 Google Service Account JSON（需要是單行字串）
包含：type, project_id, private_key_id, private_key, client_email, client_id, auth_uri, token_uri 等欄位
```

### 2. Cloudinary 設定（圖片上傳功能）

**CLOUDINARY_CLOUD_NAME**
```
你的 Cloudinary Cloud Name
範例：dsk9jzq6r
```

**CLOUDINARY_API_KEY**
```
你的 Cloudinary API Key
範例：952232719249728
```

**CLOUDINARY_API_SECRET**
```
你的 Cloudinary API Secret
範例：2uZQU3KKtaXqoFyltf8IiU6e3iA
```

## 部署步驟

### 方式一：透過 Vercel Dashboard

1. 登入 [Vercel Dashboard](https://vercel.com)
2. 點擊 "Add New Project"
3. 匯入你的 Git Repository
4. 在 "Environment Variables" 區塊中加入上述所有環境變數
5. 點擊 "Deploy"

### 方式二：透過 Vercel CLI

```bash
# 安裝 Vercel CLI（如果還沒安裝）
npm i -g vercel

# 登入 Vercel
vercel login

# 部署到 Production
vercel --prod

# 設定環境變數（初次部署後）
vercel env add GOOGLE_SHEETS_SPREADSHEET_ID
vercel env add GOOGLE_SERVICE_ACCOUNT_KEY
vercel env add CLOUDINARY_CLOUD_NAME
vercel env add CLOUDINARY_API_KEY
vercel env add CLOUDINARY_API_SECRET
```

## 部署前檢查清單

- [ ] 確認 `npm run build` 本地可以成功執行
- [ ] 確認 `.env.local` 中的所有環境變數都已準備好
- [ ] 確認 Google Service Account 有權限存取 Google Sheets
- [ ] 確認 Cloudinary 帳號設定正確
- [ ] 確認 `.gitignore` 已排除 `.env.local` 和敏感檔案
- [ ] 推送最新程式碼到 Git Repository

## Google Service Account 權限設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 啟用 Google Sheets API
3. 建立 Service Account
4. 下載 JSON 金鑰檔案
5. 將 Service Account 的 email 加入到你的 Google Sheets 分享設定中（編輯者權限）

## Cloudinary 設定

1. 註冊 [Cloudinary](https://cloudinary.com/) 帳號（免費方案即可）
2. 在 Dashboard 中取得 Cloud Name, API Key, API Secret
3. 建議設定：
   - Upload preset: 設為 unsigned（或使用 signed upload）
   - 資料夾結構：可在上傳時指定 folder 參數

## 常見問題

### Q: 部署後 Google Sheets API 回傳 403 錯誤
A: 檢查 Service Account 是否已加入 Sheets 分享名單，並擁有編輯權限。

### Q: 圖片上傳失敗
A: 檢查 Cloudinary 環境變數是否正確設定，特別是 API Secret。

### Q: Build 失敗
A: 本地先執行 `npm run build` 確認沒有 TypeScript 錯誤。

### Q: 環境變數沒有生效
A: 在 Vercel Dashboard 中重新部署（Deployments → Redeploy）。

## 注意事項

1. **環境變數格式**：Vercel 環境變數中的 JSON 需要是單行字串，可以用以下方式轉換：
   ```bash
   cat service-account.json | jq -c
   ```

2. **Production vs Preview**：建議為 Preview 和 Production 設定不同的環境變數（例如使用測試用的 Google Sheets）。

3. **安全性**：絕對不要將 `.env.local` 或包含敏感資訊的檔案提交到 Git。

## 部署後驗證

部署成功後，測試以下功能：

- [ ] 首頁載入正常
- [ ] 案件管理頁面可以讀取 Google Sheets 資料
- [ ] 新增案件功能正常
- [ ] 報價編輯器可以正常操作
- [ ] 圖片上傳功能正常（Cloudinary）
- [ ] PDF 產生功能正常

## 效能優化建議

1. 啟用 Vercel Analytics（可選）
2. 設定適當的 Caching Headers
3. 考慮使用 Vercel Edge Functions 提升 API 回應速度
4. 監控 Build 時間和 Bundle Size

## 支援

如有問題，請查看：
- [Vercel 文件](https://vercel.com/docs)
- [Next.js 部署文件](https://nextjs.org/docs/deployment)
- 專案 README.md
