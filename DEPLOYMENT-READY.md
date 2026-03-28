# 🚀 Vercel 部署準備就緒

> **狀態：✅ 已完成所有準備工作，可以開始部署**
>
> **日期：** 2026-03-28

## ✅ 完成項目

### 1. 程式碼品質
- ✅ **Build 測試通過** - `npm run build` 執行成功
- ✅ **TypeScript 錯誤已修正** - 補充 `QuotePlanRecord` 型別導入
- ✅ **Git 狀態乾淨** - 所有變更已提交

### 2. 文檔準備
- ✅ **快速指南** - `docs/VERCEL-QUICKSTART.md`
- ✅ **詳細部署文檔** - `docs/DEPLOYMENT.md`
- ✅ **部署前檢查清單** - `docs/PRE-DEPLOYMENT-CHECKLIST.md`
- ✅ **README 更新** - 加入部署區塊

### 3. 環境設定
- ✅ **環境變數清單已準備**
- ✅ **Google Sheets API 設定說明完整**
- ✅ **Cloudinary 設定說明完整**

### 4. 安全性
- ✅ **`.gitignore` 已設定** - 排除 `.env.local` 和敏感檔案
- ✅ **環境變數不在 Git** - 確認沒有敏感資訊洩漏

---

## 📋 部署所需環境變數

以下是在 Vercel Dashboard 中需要設定的環境變數：

### Google Sheets 相關

```
GOOGLE_SHEETS_SPREADSHEET_ID=<你的 Spreadsheet ID>
GOOGLE_SERVICE_ACCOUNT_KEY=<Service Account JSON - 單行格式>
```

### Cloudinary 相關

```
CLOUDINARY_CLOUD_NAME=<你的 Cloud Name>
CLOUDINARY_API_KEY=<你的 API Key>
CLOUDINARY_API_SECRET=<你的 API Secret>
```

> 💡 **注意：** `GOOGLE_SERVICE_ACCOUNT_KEY` 需要是單行 JSON 格式
>
> 轉換方式：`cat service-account.json | jq -c`

---

## 🎯 下一步

### 立即開始部署

選擇以下方式之一：

#### 選項 1：Vercel Dashboard（推薦新手）

1. 前往 https://vercel.com/new
2. 匯入 Git Repository
3. 設定環境變數
4. 點擊 Deploy

📖 **詳細步驟：** [docs/VERCEL-QUICKSTART.md](./docs/VERCEL-QUICKSTART.md)

#### 選項 2：Vercel CLI（推薦進階）

```bash
# 安裝 CLI
npm i -g vercel

# 登入
vercel login

# 部署
vercel --prod
```

📖 **詳細步驟：** [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)

---

## 📚 部署文檔導航

| 文檔 | 用途 | 適合對象 |
|------|------|----------|
| [VERCEL-QUICKSTART.md](./docs/VERCEL-QUICKSTART.md) | 5 分鐘快速部署 | 所有人 |
| [PRE-DEPLOYMENT-CHECKLIST.md](./docs/PRE-DEPLOYMENT-CHECKLIST.md) | 部署前完整檢查 | 負責部署的人 |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | 詳細部署指南與常見問題 | 遇到問題時查閱 |
| [README.md](./README.md#部署) | 專案說明與部署概覽 | 新加入的成員 |

---

## ⚠️ 重要提醒

### 部署前務必確認

1. **Google Service Account 權限**
   - Service Account 已加入 Google Sheets 分享清單
   - 擁有「編輯者」權限
   - Google Sheets API 已在 Google Cloud Console 啟用

2. **環境變數格式**
   - JSON 必須是單行字串
   - 沒有多餘的空白或換行
   - 所有引號都已正確轉義

3. **Git Repository**
   - 最新程式碼已推送
   - 沒有未提交的變更
   - 敏感資訊已排除在外

### 部署後立即測試

- [ ] 首頁可以正常載入
- [ ] 案件管理可以讀取 Google Sheets
- [ ] 新增案件功能正常
- [ ] 報價編輯器運作正常
- [ ] 圖片上傳功能正常
- [ ] PDF 產生功能正常

---

## 🔧 已知事項

### Build Warnings（可忽略）

以下警告不影響部署和運作：

1. **未使用的變數** - 測試檔案和備用程式碼
2. **圖片元素建議** - 使用 `<img>` 而非 `next/image`（有意為之，用於 PDF 產生）
3. **metadata 設定** - themeColor 建議移至 viewport（功能正常）

這些警告已被 Next.js build 接受，不會導致部署失敗。

---

## 🆘 需要協助？

### 遇到問題時

1. 先檢查 [DEPLOYMENT.md](./docs/DEPLOYMENT.md) 的「常見問題」區塊
2. 查看 Vercel Build Log 的詳細錯誤訊息
3. 確認環境變數設定正確
4. 確認 Google Sheets 權限設定

### 參考資源

- [Vercel 官方文件](https://vercel.com/docs)
- [Next.js 部署指南](https://nextjs.org/docs/deployment)
- [Google Sheets API 文件](https://developers.google.com/sheets/api)

---

## 🎉 準備完成！

所有準備工作已完成，你可以開始部署了！

**預計部署時間：** 5-10 分鐘（首次）

祝部署順利！ 🚀
