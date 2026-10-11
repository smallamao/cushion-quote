import "server-only";

import { randomUUID } from "node:crypto";

import { after } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { sendPushToAll } from "@/lib/web-push-server";

const SHEET = "通知";
const RANGE_FULL = `${SHEET}!A:F`;
const RANGE_DATA = `${SHEET}!A2:F`;
const HEADERS = ["id", "type", "title", "body", "link", "createdAt"];

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
}

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

async function ensureSheet(client: SheetsClient): Promise<void> {
  const meta = await client.sheets.spreadsheets.get({ spreadsheetId: client.spreadsheetId });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === SHEET);
  if (!exists) {
    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET } } }] },
    });
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
  }
}

/**
 * 推播是「順便」做的，不能讓它拖慢觸發流程：
 * 用 after() 延到回應送出之後才跑，客人按下送出的等待時間不受影響。
 * after() 只能在請求情境內呼叫，排程或腳本呼叫到這裡會丟錯，退回不等待的呼叫。
 */
function schedulePush(n: Pick<AppNotification, "type" | "title" | "body" | "link">): void {
  const job = async () => {
    try {
      await sendPushToAll({ title: n.title, body: n.body, link: n.link, tag: n.type });
    } catch {
      /* best-effort：推播失敗不影響已寫入的通知 */
    }
  };
  try {
    after(job);
  } catch {
    void job();
  }
}

/** 寫入一則後台通知（best-effort，不拋錯以免拖累呼叫端流程），並推播到已訂閱的裝置。 */
export async function appendNotification(
  n: Pick<AppNotification, "type" | "title" | "body" | "link">,
): Promise<void> {
  const client = await getSheetsClient();
  if (!client) return;
  try {
    await ensureSheet(client);
    const row = [randomUUID(), n.type, n.title, n.body, n.link, new Date().toISOString()];
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  } catch {
    /* best-effort */
  }
  // 寫入失敗也照推：鈴鐺沒記到至少手機要響，不要兩邊一起沉默
  schedulePush(n);
}

export async function listRecentNotifications(limit = 30): Promise<AppNotification[]> {
  const client = await getSheetsClient();
  if (!client) return [];
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    const items = ((res.data.values ?? []) as string[][])
      .filter((r) => r[0])
      .map((r) => ({
        id: r[0] ?? "",
        type: r[1] ?? "",
        title: r[2] ?? "",
        body: r[3] ?? "",
        link: r[4] ?? "",
        createdAt: r[5] ?? "",
      }));
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items.slice(0, limit);
  } catch {
    return [];
  }
}
