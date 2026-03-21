# 立即部署 - 一鍵完成

## 🚀 方法 1: 使用環境變數（推薦）

最安全的方式，憑證不會寫入檔案：

```bash
# 1. 設定環境變數
export GOOGLE_SHEETS_SPREADSHEET_ID="你的試算表ID"
export GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"..."}'
export CLOUDINARY_CLOUD_NAME="你的cloud_name"
export CLOUDINARY_API_KEY="你的API_key"
export CLOUDINARY_API_SECRET="你的API_secret"

# 2. 執行部署
./deploy.sh
```

完成！腳本會自動：
- ✅ 檢查並安裝 Vercel CLI
- ✅ 引導您登入 Vercel（僅第一次需要）
- ✅ 初次部署
- ✅ 設定所有環境變數
- ✅ 部署到生產環境
- ✅ 顯示網站網址

---

## 📝 方法 2: 編輯腳本

如果您偏好直接修改檔案：

```bash
# 1. 編輯 deploy.sh
nano deploy.sh

# 找到這幾行，填入您的憑證：
SPREADSHEET_ID="${GOOGLE_SHEETS_SPREADSHEET_ID:-你的試算表ID}"
SERVICE_ACCOUNT_KEY='${GOOGLE_SERVICE_ACCOUNT_KEY:-{"type":"service_account",...}}'
CLOUDINARY_CLOUD="${CLOUDINARY_CLOUD_NAME:-你的cloud_name}"
CLOUDINARY_KEY="${CLOUDINARY_API_KEY:-你的API_key}"
CLOUDINARY_SECRET="${CLOUDINARY_API_SECRET:-你的API_secret}"

# 2. 儲存後執行
./deploy.sh

# 3. 部署完成後刪除腳本（安全考量）
rm deploy.sh
```

---

## 🔑 憑證準備指南

### Google Sheets API

**試算表 ID**（從網址取得）：
```
https://docs.google.com/spreadsheets/d/1RSFvij68gV6KmH7AhLV61-BeQ0-rXkfwk_R0Hfc6WhU/edit
                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                  這是您的試算表 ID
```

**Service Account JSON 金鑰**（必須是單行）：

```bash
# 如果您有 service-account.json 檔案
cat service-account.json | jq -c

# 輸出範例（複製整行）：
{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@...iam.gserviceaccount.com",...}
```

### Cloudinary

登入 [Cloudinary Dashboard](https://cloudinary.com/console)，複製：
- **Cloud Name**
- **API Key**
- **API Secret**

---

## 📋 完整範例

```bash
# 複製此模板，填入您的實際憑證後執行

export GOOGLE_SHEETS_SPREADSHEET_ID="1RSFvij68gV6KmH7AhLV61-BeQ0-rXkfwk_R0Hfc6WhU"

export GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"my-project-123","private_key_id":"abc123...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----\n","client_email":"my-bot@my-project-123.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/my-bot%40my-project-123.iam.gserviceaccount.com"}'

export CLOUDINARY_CLOUD_NAME="dsk9jzq6r"
export CLOUDINARY_API_KEY="952232719249728"
export CLOUDINARY_API_SECRET="2uZQU3KKtaXqoFyltf8IiU6e3iA"

./deploy.sh
```

---

## ⚠️ 常見問題

### Q: 腳本執行後顯示「permission denied」
```bash
# 解決方法：
chmod +x deploy.sh
./deploy.sh
```

### Q: 如何取得單行 JSON？
```bash
# 方法 1: 使用 jq
cat service-account.json | jq -c

# 方法 2: 線上工具
# 訪問 https://www.text-utils.com/json-formatter/
# 選擇 "Minify" 模式
```

### Q: 需要重新部署嗎？
```bash
# 不需要重新執行整個腳本，只需：
vercel --prod
```

### Q: 如何查看部署狀態？
```bash
# 查看即時日誌
vercel logs --follow

# 或訪問 Vercel Dashboard
# https://vercel.com/dashboard
```

---

## 🎯 部署完成後

### 測試功能

訪問部署網址，確認：
- [ ] 首頁載入正常
- [ ] 能開啟案件管理
- [ ] 能建立新報價
- [ ] 圖片上傳功能正常
- [ ] 資料能儲存到 Google Sheets

### 設定自訂網域（選用）

1. 前往 [Vercel Dashboard](https://vercel.com/dashboard)
2. 選擇專案 → Settings → Domains
3. 新增您的網域
4. 根據指示設定 DNS

---

## 🆘 需要協助？

詳細文檔：
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 完整部署指南
- [QUICKSTART.md](./QUICKSTART.md) - 快速開始

**立即開始部署！** 🚀
