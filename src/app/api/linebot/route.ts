import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET ?? "";
const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

/**
 * 允許用 LINE 操作系統的 userId 清單（逗號分隔）。
 *
 * 這條管道能建立售後單、採購單、查客戶名冊與報價金額。驗簽章只證明「訊息真的來自
 * LINE 平台」，不代表「說話的人是我們的人」——所以必須再認人。清單沒設時一律拒絕
 * （fail-closed），並把收到的 userId 記進 log，方便把自己的 ID 加進來。
 * 2026-10-15 弱點分析。
 */
const ALLOWED_USER_IDS = new Set(
  (process.env.LINE_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** 開發票會真的送到加值中心開出去，不可逆。一則聊天訊息不該觸發它。 */
const BLOCKED_TOOLS = ["create_invoice"] as const;

function verifySignature(body: string, signature: string): boolean {
  if (!CHANNEL_SECRET) return false;
  const expected = createHmac("sha256", CHANNEL_SECRET).update(body).digest("base64");
  // 常數時間比對：避免用回應時間差逐字猜出簽章
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function replyToLine(replyToken: string, text: string): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

interface LineTextMessage {
  type: "text";
  text: string;
}

interface LineEvent {
  type: string;
  replyToken?: string;
  message?: LineTextMessage | { type: string };
  source?: { userId?: string; type?: string };
}

interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 403 });
  }

  let parsed: LineWebhookBody;
  try {
    parsed = JSON.parse(body) as LineWebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  for (const event of parsed.events) {
    if (event.type !== "message") continue;
    if (!event.replyToken) continue;
    if (!event.message || event.message.type !== "text") continue;

    const text = (event.message as LineTextMessage).text.trim();
    if (!text) continue;

    // 群組／多人聊天室一律不處理。群組裡誰都能打字，而 userId 可能根本不會送來。
    const sourceType = event.source?.type ?? "unknown";
    if (sourceType !== "user") {
      console.warn(`[linebot] 忽略非一對一來源：source.type=${sourceType}`);
      continue;
    }

    const userId = event.source?.userId;
    if (!userId || !ALLOWED_USER_IDS.has(userId)) {
      // 不回覆：這個帳號可能對外，回「無權限」只會讓客人困惑，也等於告訴外人這裡有系統。
      console.warn(
        `[linebot] 拒絕未授權 userId=${userId ?? "(none)"}；` +
          `目前允許 ${ALLOWED_USER_IDS.size} 個。要開通請把這個 ID 加進 LINE_ALLOWED_USER_IDS。`,
      );
      continue;
    }

    const { runAgent } = await import("@/lib/agent-tools");
    const reply = await runAgent(text, userId, { blockedTools: BLOCKED_TOOLS }).catch(
      (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        return `❌ 發生錯誤：${msg}`;
      },
    );

    await replyToLine(event.replyToken, reply);
  }

  return NextResponse.json({ ok: true });
}
