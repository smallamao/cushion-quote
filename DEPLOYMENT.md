# 繃布報價系統 - 部署指南

## 📋 前置準備

### 1. Google Sheets API 設定

#### 步驟 A: 建立 Service Account

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案或選擇現有專案
3. 啟用 **Google Sheets API**
   - 導航至「API 和服務」→「程式庫」
   - 搜尋「Google Sheets API」
   - 點擊「啟用」
4. 建立憑證
   - 導航至「API 和服務」→「憑證」
   - 點擊「建立憑證」→「服務帳戶」
   - 填寫服務帳戶名稱（例如：`cushion-quote-bot`）
   - 角色選擇「編輯者」
   - 點擊「完成」
5. 下載 JSON 金鑰
   - 在服務帳戶列表中，點擊剛建立的帳戶
   - 切換到「金鑰」標籤
   - 點擊「新增金鑰」→「建立新的金鑰」
   - 選擇「JSON」格式
   - 下載並**妥善保管** JSON 檔案

#### 步驟 B: 授權試算表存取

1. 開啟您的 Google Sheets 試算表
2. 點選右上角「共用」按鈕
3. 將 Service Account 的 email 加入編輯者
   - Email 格式：`cushion-quote-bot@project-id.iam.gserviceaccount.com`
   - 可在下載的 JSON 檔案中找到 `client_email` 欄位
4. 權限設定為「編輯者」
5. 取消勾選「通知使用者」（因為是機器人帳戶）
6. 點擊「共用」完成

#### 步驟 C: 取得試算表 ID

從試算表網址取得 ID：
```
https://docs.google.com/spreadsheets/d/1RSFvij68gV6KmH7AhLV61-BeQ0-rXkfwk_R0Hfc6WhU/edit
                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                     這是試算表 ID
```

### 2. Cloudinary 設定

1. 註冊 [Cloudinary](https://cloudinary.com/)（免費方案）
2. 登入後進入 Dashboard
3. 記錄以下資訊：
   - **Cloud Name**
   - **API Key**
   - **API Secret**

---

## 🚀 部署到 Vercel

### 方法 1: 使用 Vercel CLI（推薦）

#### 步驟 1: 安裝 Vercel CLI

```bash
npm install -g vercel
```

#### 步驟 2: 登入 Vercel

```bash
vercel login
```

選擇登入方式（GitHub、GitLab、Bitbucket 或 Email）

#### 步驟 3: 初次部署

```bash
# 在專案根目錄執行
vercel

# 按照提示操作：
# ? Set up and deploy "~/繃布報價"? [Y/n] y
# ? Which scope do you want to deploy to? (選擇你的帳號)
# ? Link to existing project? [y/N] n
# ? What's your project's name? cushion-quote
# ? In which directory is your code located? ./
```

#### 步驟 4: 設定環境變數

部署成功後，前往 Vercel Dashboard：

1. 選擇專案「cushion-quote」
2. 點選「Settings」→「Environment Variables」
3. 新增以下變數：

**Google Sheets API**
```
Name: GOOGLE_SHEETS_SPREADSHEET_ID
Value: 你的試算表ID
Environments: Production, Preview, Development (全選)
```

```
Name: GOOGLE_SERVICE_ACCOUNT_KEY
Value: {"type":"service_account","project_id":"...完整的JSON內容..."}
Environments: Production, Preview, Development (全選)
```

⚠️ **重要**：`GOOGLE_SERVICE_ACCOUNT_KEY` 必須是**單行壓縮的 JSON**，不能有換行符號。

**Cloudinary**
```
Name: CLOUDINARY_CLOUD_NAME
Value: 你的cloud_name
Environments: Production, Preview, Development (全選)
```

```
Name: CLOUDINARY_API_KEY
Value: 你的API_key
Environments: Production, Preview, Development (全選)
```

```
Name: CLOUDINARY_API_SECRET
Value: 你的API_secret
Environments: Production, Preview, Development (全選)
```

#### 步驟 5: 重新部署（套用環境變數）

```bash
vercel --prod
```

---

### 方法 2: 使用 Git 自動部署

#### 步驟 1: 推送到 GitHub

```bash
# 初始化 Git（如果還沒有）
git init
git add .
git commit -m "Initial commit"

# 推送到 GitHub
git remote add origin https://github.com/你的帳號/cushion-quote.git
git branch -M main
git push -u origin main
```

#### 步驟 2: 在 Vercel 匯入專案

1. 前往 [Vercel Dashboard](https://vercel.com/dashboard)
2. 點擊「Add New...」→「Project」
3. 選擇「Import Git Repository」
4. 選擇你的 GitHub repository
5. 點擊「Import」
6. 設定如下：
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`（自動偵測）
   - **Output Directory**: `.next`（自動偵測）
7. 在「Environment Variables」區塊新增所有環境變數（同方法 1 步驟 4）
8. 點擊「Deploy」

#### 步驟 3: 自動部署設定

完成後，每次 `git push` 到 `main` 分支會自動觸發部署。

---

## 🌐 自訂網域（選用）

### 步驟 1: 在 Vercel 新增網域

1. 進入專案「Settings」→「Domains」
2. 點擊「Add」
3. 輸入你的網域（例如：`quote.yourcompany.com`）
4. 點擊「Add」

### 步驟 2: 設定 DNS

根據 Vercel 的指示，到你的 DNS 服務商（例如 Cloudflare、GoDaddy）新增記錄：

**使用子網域（推薦）**
```
Type: CNAME
Name: quote
Value: cname.vercel-dns.com
```

**使用根網域**
```
Type: A
Name: @
Value: 76.76.21.21
```

### 步驟 3: 驗證

DNS 生效後（通常 5-30 分鐘），Vercel 會自動配置 SSL 憑證。

---

## ✅ 部署後檢查

### 1. 測試系統功能

訪問你的部署網址，測試以下功能：

- [ ] 首頁載入正常
- [ ] 案件管理頁面能開啟
- [ ] 客戶管理頁面能開啟
- [ ] 報價編輯器能開啟
- [ ] 能建立新報價
- [ ] 圖片上傳功能正常（Cloudinary）
- [ ] 資料能正確寫入 Google Sheets

### 2. 檢查環境變數

如果功能異常，檢查：

```bash
# 在 Vercel Dashboard 檢查環境變數
# Settings → Environment Variables

# 確認所有變數都已設定且沒有拼字錯誤
```

### 3. 查看部署日誌

```bash
# 使用 CLI 查看即時日誌
vercel logs --follow

# 或在 Vercel Dashboard
# Deployments → 選擇最新部署 → Runtime Logs
```

---

## 🔧 常見問題排解

### 問題 1: Google Sheets API 錯誤

**錯誤訊息**：`The caller does not have permission`

**解決方法**：
1. 確認 Service Account email 已加入試算表編輯者
2. 確認 `GOOGLE_SERVICE_ACCOUNT_KEY` 格式正確（單行 JSON）
3. 確認試算表 ID 正確

### 問題 2: Cloudinary 圖片無法上傳

**錯誤訊息**：`Cloudinary configuration not found`

**解決方法**：
1. 檢查環境變數名稱是否正確
2. 確認 API Key 和 Secret 沒有多餘空格
3. 重新部署專案

### 問題 3: 建置失敗

**錯誤訊息**：`Type error: ...`

**解決方法**：
```bash
# 在本地先測試建置
npm run build

# 確認沒有 TypeScript 錯誤
npm run lint
```

### 問題 4: 環境變數未生效

**解決方法**：
```bash
# 修改環境變數後必須重新部署
vercel --prod

# 或在 Vercel Dashboard 觸發 Redeploy
```

---

## 📊 監控與維護

### 查看分析數據

Vercel Dashboard → Analytics

- 頁面瀏覽量
- API 請求次數
- 效能指標

### 查看錯誤日誌

```bash
# CLI 查看
vercel logs

# Dashboard 查看
Deployments → 選擇部署 → Runtime Logs
```

### 回滾版本

```bash
# CLI 回滾
vercel rollback

# Dashboard 回滾
Deployments → 選擇穩定版本 → Promote to Production
```

---

## 💰 成本估算

**免費方案限制**（Vercel Hobby）：
- ✅ 100 GB 頻寬/月
- ✅ 無限部署
- ✅ 自動 HTTPS
- ✅ 自訂網域

**Google Sheets API**：
- ✅ 免費（每日配額：500 請求/100 秒）

**Cloudinary**：
- ✅ 免費方案（25 GB 儲存、25 GB 頻寬）

**總計**：約 **$0/月**（小型使用）

---

## 📝 後續維護

### 更新部署

```bash
# 修改程式碼後
git add .
git commit -m "feat: 新增功能"
git push

# Vercel 自動部署
```

### 手動觸發部署

```bash
# 不修改程式碼，只想重新部署
vercel --prod --force
```

---

## 🆘 支援

- [Vercel 文件](https://vercel.com/docs)
- [Next.js 文件](https://nextjs.org/docs)
- [Google Sheets API 文件](https://developers.google.com/sheets/api)
- [Cloudinary 文件](https://cloudinary.com/documentation)

---

**部署完成！🎉**

你的繃布報價系統現在已經上線，可以透過網址存取了。
