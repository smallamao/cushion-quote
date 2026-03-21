#!/bin/bash
# 一鍵部署 - 自動從 .env.local 載入憑證

set -e

echo "🚀 繃布報價系統 - 一鍵部署"
echo "=========================="
echo ""

# 載入 .env.local 的環境變數（使用 set -a 避免換行符問題）
if [ -f .env.local ]; then
    echo "📝 載入本地憑證..."
    set -a
    source .env.local
    set +a
    echo "✅ 憑證已載入"
    echo ""
else
    echo "❌ 錯誤：找不到 .env.local"
    exit 1
fi

# 檢查 Vercel CLI
echo "📋 檢查 Vercel CLI..."
if ! command -v vercel &> /dev/null; then
    echo "正在安裝 Vercel CLI..."
    npm install -g vercel
fi
echo "✅ Vercel CLI 已就緒"
echo ""

# 檢查登入狀態
echo "🔐 檢查 Vercel 登入狀態..."
if ! vercel whoami &> /dev/null; then
    echo "需要登入 Vercel，即將開啟瀏覽器..."
    sleep 2
    vercel login
fi
VERCEL_USER=$(vercel whoami 2>&1)
echo "✅ 已登入為：$VERCEL_USER"
echo ""

# 初次部署
echo "🚀 開始初次部署..."
vercel --yes
echo ""
echo "✅ 初次部署完成"
echo ""

# 設定環境變數
echo "⚙️  設定環境變數..."

for env in production preview development; do
    echo "  設定 $env 環境..."

    echo "$GOOGLE_SHEETS_SPREADSHEET_ID" | vercel env add GOOGLE_SHEETS_SPREADSHEET_ID $env --yes 2>/dev/null || echo "    GOOGLE_SHEETS_SPREADSHEET_ID 已存在"
    echo "$GOOGLE_SERVICE_ACCOUNT_KEY" | vercel env add GOOGLE_SERVICE_ACCOUNT_KEY $env --yes 2>/dev/null || echo "    GOOGLE_SERVICE_ACCOUNT_KEY 已存在"
    echo "$CLOUDINARY_CLOUD_NAME" | vercel env add CLOUDINARY_CLOUD_NAME $env --yes 2>/dev/null || echo "    CLOUDINARY_CLOUD_NAME 已存在"
    echo "$CLOUDINARY_API_KEY" | vercel env add CLOUDINARY_API_KEY $env --yes 2>/dev/null || echo "    CLOUDINARY_API_KEY 已存在"
    echo "$CLOUDINARY_API_SECRET" | vercel env add CLOUDINARY_API_SECRET $env --yes 2>/dev/null || echo "    CLOUDINARY_API_SECRET 已存在"
done

echo ""
echo "✅ 環境變數設定完成"
echo ""

# 部署到生產環境
echo "🎯 部署到生產環境..."
vercel --prod --yes

echo ""
echo "=================================="
echo "✅ 部署完成！🎉"
echo "=================================="
echo ""

# 顯示部署資訊
echo "🌐 您的網站："
vercel ls 2>/dev/null | head -5 || echo "   請前往 Vercel Dashboard 查看"

echo ""
echo "📋 下一步："
echo "1. 訪問網站測試功能"
echo "2. 如需自訂網域，請前往 https://vercel.com/dashboard"
echo ""
