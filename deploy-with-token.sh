#!/bin/bash
# 使用 Vercel Token 部署

set -e

echo "🚀 繃布報價系統 - Token 部署模式"
echo "===================================="
echo ""

# 檢查 Token
if [ -z "$VERCEL_TOKEN" ]; then
    echo "❌ 錯誤：未設定 VERCEL_TOKEN"
    echo ""
    echo "📋 請依照以下步驟取得 Token："
    echo ""
    echo "1. 前往 https://vercel.com/account/tokens"
    echo "2. 點擊「Create Token」"
    echo "3. 輸入 Token 名稱（例如：cushion-quote-deploy）"
    echo "4. 選擇 Scope：Full Account（或選擇特定專案）"
    echo "5. 點擊「Create」"
    echo "6. 複製產生的 Token"
    echo ""
    echo "然後執行："
    echo "  export VERCEL_TOKEN=你的token"
    echo "  ./deploy-with-token.sh"
    echo ""
    exit 1
fi

echo "✅ VERCEL_TOKEN 已設定"
echo ""

# 載入 .env.local
if [ -f .env.local ]; then
    echo "📝 載入本地憑證..."
    set -a
    source .env.local
    set +a
    echo "✅ 憑證已載入"
    echo ""
fi

# 檢查 Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "正在安裝 Vercel CLI..."
    npm install -g vercel
fi

# 初次部署
echo "🚀 開始部署..."
vercel --token="$VERCEL_TOKEN" --yes

echo ""
echo "✅ 初次部署完成"
echo ""

# 設定環境變數
echo "⚙️  設定環境變數..."

for env in production preview development; do
    echo "  設定 $env 環境..."

    echo "$GOOGLE_SHEETS_SPREADSHEET_ID" | vercel env add GOOGLE_SHEETS_SPREADSHEET_ID $env --token="$VERCEL_TOKEN" --yes 2>/dev/null || echo "    GOOGLE_SHEETS_SPREADSHEET_ID 已存在"
    echo "$GOOGLE_SERVICE_ACCOUNT_KEY" | vercel env add GOOGLE_SERVICE_ACCOUNT_KEY $env --token="$VERCEL_TOKEN" --yes 2>/dev/null || echo "    GOOGLE_SERVICE_ACCOUNT_KEY 已存在"
    echo "$CLOUDINARY_CLOUD_NAME" | vercel env add CLOUDINARY_CLOUD_NAME $env --token="$VERCEL_TOKEN" --yes 2>/dev/null || echo "    CLOUDINARY_CLOUD_NAME 已存在"
    echo "$CLOUDINARY_API_KEY" | vercel env add CLOUDINARY_API_KEY $env --token="$VERCEL_TOKEN" --yes 2>/dev/null || echo "    CLOUDINARY_API_KEY 已存在"
    echo "$CLOUDINARY_API_SECRET" | vercel env add CLOUDINARY_API_SECRET $env --token="$VERCEL_TOKEN" --yes 2>/dev/null || echo "    CLOUDINARY_API_SECRET 已存在"
done

echo ""
echo "✅ 環境變數設定完成"
echo ""

# 部署到生產環境
echo "🎯 部署到生產環境..."
DEPLOYMENT_URL=$(vercel --prod --token="$VERCEL_TOKEN" --yes 2>&1 | tee /dev/tty | grep -o 'https://[^ ]*' | tail -1)

echo ""
echo "===================================="
echo "✅ 部署完成！🎉"
echo "===================================="
echo ""

if [ -n "$DEPLOYMENT_URL" ]; then
    echo "🌐 您的網站："
    echo "   $DEPLOYMENT_URL"
    echo ""
fi

echo "📋 下一步："
echo "1. 訪問網站測試功能"
echo "2. 如需自訂網域，請前往 https://vercel.com/dashboard"
echo ""
