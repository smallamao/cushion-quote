# Vercel 部署快速指南

> 5 分鐘快速部署到 Vercel

## 前置準備

確認你有：
1. ✅ Vercel 帳號（[註冊](https://vercel.com/signup)）
2. ✅ Git Repository（GitHub/GitLab/Bitbucket）
3. ✅ 所有環境變數準備好

## Step 1: 推送程式碼到 Git

```bash
git add .
git commit -m "feat: 準備部署"
git push origin main
```

## Step 2: 匯入專案到 Vercel

### 方式 A：透過 Dashboard（推薦新手）

1. 前往 https://vercel.com/new
2. 選擇你的 Git Provider
3. 選擇這個 Repository
4. 點擊 **Import**

### 方式 B：透過 CLI（推薦進階使用者）

```bash
# 安裝 Vercel CLI
npm i -g vercel

# 登入
vercel login

# 部署
vercel
```

## Step 3: 設定環境變數

在 Vercel Dashboard 中，找到 **Settings** > **Environment Variables**

加入以下環境變數：

| 變數名稱 | 說明 | 範例值 |
|---------|------|--------|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Google Sheets ID | `1RSFvij68gV6KmH7AhLV61-BeQ0-rXkfwk_R0Hfc6WhU` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Service Account JSON（單行） | `{"type":"service_account",...}` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Cloud Name | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | `123456789012345` |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | `your-api-secret` |

### 💡 小技巧：轉換 JSON 為單行

```bash
# macOS/Linux
cat service-account.json | jq -c

# 或手動移除所有換行符號
```

## Step 4: 重新部署

設定完環境變數後：

1. 前往 **Deployments** 頁面
2. 點擊最新的 Deployment
3. 點擊右上角的 **⋯** > **Redeploy**

## Step 5: 驗證部署

部署成功後，Vercel 會給你一個網址，例如：
```
https://cushion-quote-abc123.vercel.app
```

測試以下功能：
- [ ] 首頁載入正常
- [ ] 案件管理可以存取 Google Sheets
- [ ] 新增案件功能正常
- [ ] 圖片上傳功能正常

## 🎉 完成！

你的應用程式已經成功部署到 Vercel！

---

## 進階設定（可選）

### 自訂網域

1. 前往 **Settings** > **Domains**
2. 加入你的網域
3. 按照指示設定 DNS

### Analytics

1. 前往 **Analytics** 頁面
2. 啟用 Vercel Analytics
3. 監控網站效能和使用情況

### 環境設定

建議為不同環境設定不同的環境變數：

- **Production**: 正式環境資料
- **Preview**: 測試環境資料
- **Development**: 本地開發用（可選）

---

## 常見問題

### Q: 部署失敗，顯示 Build Error
**A:** 檢查以下項目：
1. 本地執行 `npm run build` 確認沒有錯誤
2. 確認 `package.json` 中的依賴版本正確
3. 檢查 Vercel Build Log 的詳細錯誤訊息

### Q: 環境變數沒有生效
**A:**
1. 確認環境變數已加入且沒有拼字錯誤
2. 重新部署（Redeploy）讓變數生效
3. 確認 JSON 格式正確（特別是 GOOGLE_SERVICE_ACCOUNT_KEY）

### Q: Google Sheets API 回傳 403 錯誤
**A:**
1. 確認 Service Account 已加入 Sheets 分享清單
2. 確認 Service Account 有編輯權限
3. 確認 Google Sheets API 已啟用

### Q: 圖片上傳失敗
**A:**
1. 確認 Cloudinary 環境變數正確
2. 檢查 Cloudinary 帳號配額是否足夠
3. 確認 API Secret 沒有多餘的空白或換行

---

## 需要更多協助？

- 📖 詳細部署指南：[DEPLOYMENT.md](./DEPLOYMENT.md)
- ✅ 部署前檢查：[PRE-DEPLOYMENT-CHECKLIST.md](./PRE-DEPLOYMENT-CHECKLIST.md)
- 📚 Vercel 文件：https://vercel.com/docs
- 🚀 Next.js 部署：https://nextjs.org/docs/deployment

---

## 下一步

部署成功後，你可以：

1. ✨ 設定自訂網域
2. 📊 啟用 Analytics
3. 🔔 設定部署通知
4. 🔐 設定額外的安全措施
5. 🚀 優化效能和 SEO

祝部署順利！🎉
