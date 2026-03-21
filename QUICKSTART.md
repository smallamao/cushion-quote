# 快速部署指南 - 5 分鐘上線

## 🎯 最快路徑

如果您已經準備好所有憑證，只需 5 個步驟即可完成部署：

### 步驟 1: 安裝 Vercel CLI

```bash
npm install -g vercel
```

### 步驟 2: 登入 Vercel

```bash
vercel login
```

### 步驟 3: 部署專案

```bash
# 在專案根目錄執行
vercel

# 選擇設定：
# ? Link to existing project? N
# ? What's your project's name? cushion-quote
```

### 步驟 4: 設定環境變數

前往 [Vercel Dashboard](https://vercel.com/dashboard) → 選擇專案 → Settings → Environment Variables

依照 `.env.production.template` 檔案新增以下變數：

```
GOOGLE_SHEETS_SPREADSHEET_ID=你的試算表ID
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
CLOUDINARY_CLOUD_NAME=你的cloud_name
CLOUDINARY_API_KEY=你的API_key
CLOUDINARY_API_SECRET=你的API_secret
```

每個變數的 Environments 都選擇：**Production, Preview, Development**

### 步驟 5: 重新部署

```bash
vercel --prod
```

完成！🎉 您的系統已上線。

---

## 📋 憑證準備清單

如果您還沒有憑證，請先完成以下準備：

### Google Sheets API

1. [Google Cloud Console](https://console.cloud.google.com/) → 建立專案
2. 啟用 Google Sheets API
3. 建立 Service Account → 下載 JSON 金鑰
4. 將 Service Account email 加入試算表編輯者
5. 取得試算表 ID（從網址）

詳細步驟請參考 [DEPLOYMENT.md](./DEPLOYMENT.md)

### Cloudinary

1. [Cloudinary](https://cloudinary.com/) → 註冊免費帳號
2. Dashboard → 複製 Cloud Name, API Key, API Secret

---

## 🔍 驗證部署

部署完成後，訪問您的 Vercel 網址（例如：`https://cushion-quote.vercel.app`）

測試以下功能：

- [ ] 首頁載入正常
- [ ] 能開啟案件管理頁面
- [ ] 能開啟報價編輯器
- [ ] 能上傳圖片
- [ ] 能建立新報價並儲存到 Google Sheets

---

## 🆘 遇到問題？

### 常見錯誤

**Google Sheets 錯誤**
```
Error: The caller does not have permission
```
→ 檢查 Service Account email 是否已加入試算表編輯者

**Cloudinary 錯誤**
```
Error: Must supply cloud_name
```
→ 檢查環境變數名稱是否正確

**建置失敗**
```
Type error: ...
```
→ 執行 `npm run build` 檢查本地建置

### 查看日誌

```bash
# CLI 查看即時日誌
vercel logs --follow

# Dashboard 查看
Deployments → 選擇部署 → Runtime Logs
```

---

## 📚 完整文檔

更多詳細資訊請參考：

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 完整部署指南
- [.env.production.template](./.env.production.template) - 環境變數範本
- [vercel-env-setup.sh](./vercel-env-setup.sh) - 環境變數快速設定腳本

---

## 🎓 下一步

部署成功後，您可以：

1. **設定自訂網域**
   - Vercel Dashboard → Settings → Domains
   - 新增您的網域（例如：`quote.yourcompany.com`）
   - 設定 DNS CNAME 記錄

2. **啟用 Git 自動部署**
   ```bash
   git remote add origin https://github.com/你的帳號/cushion-quote.git
   git push -u origin main
   ```
   之後每次 `git push` 會自動觸發部署

3. **監控系統運行**
   - Vercel Dashboard → Analytics
   - 查看頁面瀏覽量、效能指標

---

**需要協助？**

請參考 [DEPLOYMENT.md](./DEPLOYMENT.md) 的「常見問題排解」章節。
