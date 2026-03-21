# 使用 GitHub 部署到 Vercel（推薦）

由於您的專案已在 GitHub 上（remotra87），使用 GitHub 整合是**最簡單的部署方式**。

## 🚀 方法 1: Vercel Dashboard 匯入（最簡單）

### 步驟 1: 提交並推送當前更改

```bash
# 1. 提交當前更改
git add .
git commit -m "feat: 修復佣金結算重複問題 + 新增部署配置"

# 2. 設定 GitHub 遠端倉庫（如果尚未設定）
git remote add origin https://github.com/remotra87/cushion-quote.git

# 3. 推送到 GitHub
git push -u origin main
```

### 步驟 2: 在 Vercel 匯入專案

1. 前往 [Vercel Dashboard](https://vercel.com/new)

2. 點擊「**Import Git Repository**」

3. 選擇您的 GitHub 倉庫：`remotra87/cushion-quote`
   - 如果看不到，點擊「Adjust GitHub App Permissions」授權

4. 配置專案：
   - **Framework Preset**: Next.js（自動偵測）
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`（自動填入）

5. 設定環境變數（**重要！**）

   點擊「Environment Variables」，新增以下變數：

   ```
   GOOGLE_SHEETS_SPREADSHEET_ID = 1RSFvij68gV6KmH7AhLV61-BeQ0-rXkfwk_R0Hfc6WhU
   GOOGLE_SERVICE_ACCOUNT_KEY = [從 .env.local 複製]
   CLOUDINARY_CLOUD_NAME = dsk9jzq6r
   CLOUDINARY_API_KEY = 952232719249728
   CLOUDINARY_API_SECRET = 2uZQU3KKtaXqoFyltf8IiU6e3iA
   ```

   **每個變數都要選擇：Production, Preview, Development**

6. 點擊「**Deploy**」

完成！Vercel 會自動：
- ✅ 建置專案
- ✅ 部署到生產環境
- ✅ 提供網址

---

## 🔧 方法 2: 使用 Vercel CLI（進階）

如果您偏好命令列：

```bash
# 1. 確保已登入 Vercel（在瀏覽器中）
vercel login

# 2. 連結 GitHub 倉庫
vercel --yes

# 3. 設定環境變數（手動在 Dashboard 或使用 CLI）

# 4. 部署
vercel --prod
```

---

## 📋 提交當前更改的指令

```bash
# 檢查 Git 遠端設定
git remote -v

# 如果沒有 origin，新增：
git remote add origin https://github.com/remotra87/cushion-quote.git

# 或更新現有的 origin：
git remote set-url origin https://github.com/remotra87/cushion-quote.git

# 新增檔案
git add .gitignore
git add src/app/api/sheets/_settlement-utils.ts
git add DEPLOYMENT.md
git add DEPLOY_NOW.md
git add QUICKSTART.md
git add deploy-now.sh
git add deploy-with-token.sh
git add .env.deploy.example

# 提交
git commit -m "feat: 修復佣金結算重複問題 + 新增部署配置

- 修復 settlementKey 包含 role 導致重複新增結算記錄的問題
- 新增完整的部署文檔與自動化腳本
- 更新 .gitignore 排除敏感檔案

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# 推送到 GitHub
git push -u origin main
```

---

## 🎯 使用 GitHub 部署的優勢

1. ✅ **自動部署**：每次 `git push` 自動觸發部署
2. ✅ **預覽部署**：每個 Pull Request 都有獨立預覽網址
3. ✅ **回滾簡單**：Dashboard 一鍵回滾到任何版本
4. ✅ **無需 Token**：直接使用 GitHub 認證
5. ✅ **團隊協作**：團隊成員都能看到部署狀態

---

## 💡 建議流程

```bash
# 1. 提交更改到 GitHub
git add .
git commit -m "部署準備"
git push

# 2. 前往 Vercel Dashboard 匯入專案
# https://vercel.com/new

# 3. 完成！之後每次 git push 都會自動部署
```

---

需要我協助執行 Git 提交和推送嗎？
