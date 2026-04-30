#!/bin/bash
# 一鍵啟動 Next.js dev server + ngrok，並顯示 LINE Bot webhook URL

# 顏色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}=== LINE Bot 本機開發啟動腳本 ===${NC}"
echo ""

# 檢查必要工具
if ! command -v ngrok &> /dev/null; then
  echo -e "${RED}❌ 找不到 ngrok，請先安裝：brew install ngrok${NC}"
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ 請在專案根目錄執行此腳本${NC}"
  exit 1
fi

# 清理舊的背景程序
cleanup() {
  echo ""
  echo -e "${YELLOW}停止服務中...${NC}"
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true
  [ -n "$NGROK_PID" ] && kill "$NGROK_PID" 2>/dev/null || true
  echo "✅ 已停止"
}
trap cleanup EXIT INT TERM

# 啟動 Next.js dev server（背景）
echo -e "${YELLOW}▶ 啟動 Next.js dev server...${NC}"
npm run dev > /tmp/nextjs-dev.log 2>&1 &
DEV_PID=$!

# 偵測 Next.js 實際使用的 port（3000 ~ 3010）
echo -n "  等待 Next.js 啟動"
NEXT_PORT=""
for i in $(seq 1 40); do
  sleep 1
  echo -n "."
  for port in 3000 3001 3002 3003 3004 3005; do
    if curl -s "http://localhost:${port}" > /dev/null 2>&1; then
      NEXT_PORT=$port
      break 2
    fi
  done
done

if [ -z "$NEXT_PORT" ]; then
  echo ""
  echo -e "${RED}❌ Next.js 啟動逾時，請查看 log：tail -f /tmp/nextjs-dev.log${NC}"
  exit 1
fi
echo " ✅ (port ${NEXT_PORT})"

# 預熱 linebot 路由（讓 Next.js 預先編譯，避免 LINE Verify 逾時）
echo -n "  預熱 /api/linebot 路由"
for i in $(seq 1 5); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:${NEXT_PORT}/api/linebot" \
    -H "Content-Type: application/json" \
    -H "x-line-signature: warmup" \
    -d '{"destination":"warmup","events":[]}' 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "403" ]; then
    echo " ✅"
    break
  fi
  echo -n "."
  sleep 2
done

# 啟動 ngrok 指向正確的 port
echo -e "${YELLOW}▶ 啟動 ngrok (port ${NEXT_PORT})...${NC}"
ngrok http "$NEXT_PORT" > /dev/null 2>&1 &
NGROK_PID=$!

# 等待 ngrok API 就緒，抓取公開 URL
echo -n "  等待 ngrok 連線"
NGROK_URL=""
for i in $(seq 1 15); do
  sleep 1
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(next((x['public_url'] for x in t if x['proto']=='https'), ''))" 2>/dev/null || true)
  if [ -n "$NGROK_URL" ]; then
    echo " ✅"
    break
  fi
  echo -n "."
done

if [ -z "$NGROK_URL" ]; then
  echo ""
  echo -e "${YELLOW}⚠️  無法取得 ngrok URL，請手動開啟 http://localhost:4040 查看${NC}"
else
  echo ""
  echo -e "${GREEN}============================================${NC}"
  echo -e "${GREEN}  Next.js port：${NEXT_PORT}${NC}"
  echo -e "${GREEN}  LINE Bot Webhook URL：${NC}"
  echo -e "${CYAN}  ${NGROK_URL}/api/linebot${NC}"
  echo -e "${GREEN}============================================${NC}"
  echo ""
  echo "📋 複製上方網址 → LINE Developers Console → Webhook URL → Verify"
  echo "📱 ngrok 監控：http://localhost:4040"
  echo "📄 Next.js log：tail -f /tmp/nextjs-dev.log"
  echo ""
  echo -e "${YELLOW}按 Ctrl+C 停止所有服務${NC}"
fi

wait $DEV_PID
