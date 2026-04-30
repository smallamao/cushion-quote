import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET ?? "";
const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

function verifySignature(body: string, signature: string): boolean {
  if (!CHANNEL_SECRET) return false;
  const hash = createHmac("sha256", CHANNEL_SECRET).update(body).digest("base64");
  return hash === signature;
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

    const { runAgent } = await import("@/lib/agent-tools");
    const userId = event.source?.userId ?? "anonymous";
    const reply = await runAgent(text, userId).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      return `❌ 發生錯誤：${msg}`;
    });

    await replyToLine(event.replyToken, reply);
  }

  return NextResponse.json({ ok: true });
}
