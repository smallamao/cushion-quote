import "server-only";

/**
 * 推到老闆 Telegram 的內部通知（老闆 2026-11-10）。
 *
 * - 免費不限量；LINE Push 每月 200 則、推群組還按人數計費，8 月就用完了
 * - 有事件時主動推，不必開著網頁讓鈴鐺每隔幾分鐘去問伺服器
 *   （2026-11-09 Vercel Hobby 的 CPU 額度被頂端輪詢用完、全站暫停）
 * - 與客服系統（potato-sofa-cs）用同一個機器人、同一個聊天室；那邊的 lib/cs/telegram.ts 同一套寫法
 *
 * 沒設定 TELEGRAM_BOT_TOKEN／TELEGRAM_CHAT_ID 時安靜略過，不影響原本流程。
 */

const API = "https://api.telegram.org";
const MAX_CHARS = 3800; // Telegram 上限 4096，留緩衝
const REPLY_PREVIEW_CHARS = 200;
const DEFAULT_ORIGIN = "https://cushion-quote.vercel.app";

export function appOrigin(): string {
  return (process.env.APP_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, "");
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

/** 站內路徑（/quotes）補成完整網址，Telegram 才點得開 */
export function absoluteLink(link: string, origin: string): string {
  if (!link) return "";
  if (/^https?:\/\//i.test(link)) return link;
  return `${origin}${link.startsWith("/") ? "" : "/"}${link}`;
}

export function buildNotificationText(
  n: { title: string; body: string; link: string },
  origin: string,
): string {
  return [`🔔 ${n.title}`, n.body, absoluteLink(n.link, origin)].filter(Boolean).join("\n");
}

export function buildReplyText(
  r: { serviceId: string; clientName: string; author: string; content: string; attachmentCount: number },
  origin: string,
): string {
  const who = r.clientName.trim() ? `（${r.clientName.trim()}）` : "";
  const content =
    r.content.length > REPLY_PREVIEW_CHARS ? `${r.content.slice(0, REPLY_PREVIEW_CHARS)}…` : r.content;
  return [
    `💬 售後回覆 ${r.serviceId}${who}`,
    `${r.author}：${content}`,
    r.attachmentCount > 0 ? `📎 附件 ${r.attachmentCount} 個` : "",
    `${origin}/after-sales/${encodeURIComponent(r.serviceId)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 老闆自己在售後單回的不推給自己；沒設定老闆 email 時寧可多推 */
export function shouldNotifyReply(authorEmail: string, ownerEmail: string): boolean {
  const owner = ownerEmail.trim().toLowerCase();
  if (!owner) return true;
  return authorEmail.trim().toLowerCase() !== owner;
}

/** 超過上限就從換行處切開，不要硬切在句子中間 */
export function splitForTelegram(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > MAX_CHARS && current) {
      chunks.push(current);
      current = line.slice(0, MAX_CHARS);
    } else {
      current = next.slice(0, MAX_CHARS);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** 送出；沒設定回 skipped，送失敗丟錯（呼叫端自己決定要不要吞） */
export async function sendTelegram(text: string): Promise<{ sent: number; skipped?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return { sent: 0, skipped: "missing-TELEGRAM_BOT_TOKEN-or-TELEGRAM_CHAT_ID" };
  let sent = 0;
  for (const chunk of splitForTelegram(text)) {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      // 不把 token 帶進錯誤訊息（網址裡有 token，只回狀態碼與 Telegram 的說明）
      const detail = await res.text().catch(() => "");
      throw new Error(`Telegram sendMessage failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    sent += 1;
  }
  return { sent };
}
