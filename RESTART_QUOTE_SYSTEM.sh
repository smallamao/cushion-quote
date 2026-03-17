#!/bin/bash

# --- 繃布報價系統 (Cushion Quote System) 啟動腳本 ---

# 1. 設定專案路徑 (自動獲取目前目錄)
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR" || exit

echo "🚀 正在準備啟動 繃布報價系統..."
echo "📍 目錄: $PROJECT_DIR"

# 2. 終止可能殘留的進程 (Port 3001)
echo "🔍 檢查 Port 3001 並釋放進程..."
lsof -ti:3001 | xargs kill -9 2>/dev/null

# 3. 清除 Next.js 快取 (選配)
if [ "$1" == "--clean" ]; then
    echo "🧹 執行完全清理 (.next 快取)..."
    rm -rf .next
fi

# 4. 檢查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 找不到 node_modules，正在執行 npm install..."
    npm install
fi

# 5. 啟動開發伺服器 (指定 Port 3001)
echo "✨ 系統即將在 http://localhost:3001 啟動..."
echo "💡 提示：使用 3001 埠號是為了避免與「排程系統」(Port 3000) 衝突。"
npm run dev -- -p 3001
