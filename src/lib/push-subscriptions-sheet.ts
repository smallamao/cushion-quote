import "server-only";

import { getSheetsClient } from "@/lib/sheets-client";

/**
 * 推播訂閱清單。
 *
 * 🔴 一「裝置＋瀏覽器」一列，不是一個人一列：老闆手機（已加主畫面）和 Mac 上的
 * 瀏覽器各自會產生不同的 endpoint，兩邊都要存才會兩邊都收到。
 * endpoint 當主鍵（瀏覽器保證唯一），重新訂閱同一裝置就覆蓋原列、不會長出重複。
 */
const SHEET = "推播訂閱";
const RANGE_FULL = `${SHEET}!A:F`;
const RANGE_DATA = `${SHEET}!A2:F`;
const ROW_RANGE = (n: number) => `${SHEET}!A${n}:F${n}`;
const HEADERS = ["endpoint", "p256dh", "auth", "label", "createdAt", "lastOkAt"];

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** 給人看的裝置名稱，例如「iPhone · Safari」。 */
  label: string;
  createdAt: string;
  lastOkAt: string;
}

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

async function ensureSheet(client: SheetsClient): Promise<void> {
  const meta = await client.sheets.spreadsheets.get({ spreadsheetId: client.spreadsheetId });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === SHEET);
  if (exists) return;
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

function toRecord(r: string[]): PushSubscriptionRecord {
  return {
    endpoint: r[0] ?? "",
    p256dh: r[1] ?? "",
    auth: r[2] ?? "",
    label: r[3] ?? "",
    createdAt: r[4] ?? "",
    lastOkAt: r[5] ?? "",
  };
}

function toRow(s: PushSubscriptionRecord): string[] {
  return [s.endpoint, s.p256dh, s.auth, s.label, s.createdAt, s.lastOkAt];
}

/** 連同列號一起回傳，呼叫端要就地更新或刪除時才有辦法定位。 */
async function readAll(
  client: SheetsClient,
): Promise<Array<{ rec: PushSubscriptionRecord; rowNumber: number }>> {
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_DATA,
  });
  return ((res.data.values ?? []) as string[][])
    .map((r, i) => ({ rec: toRecord(r), rowNumber: i + 2 }))
    .filter((x) => x.rec.endpoint);
}

export async function listPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const client = await getSheetsClient();
  if (!client) return [];
  try {
    await ensureSheet(client);
    return (await readAll(client)).map((x) => x.rec);
  } catch {
    return [];
  }
}

/** 新增或更新一筆訂閱（以 endpoint 為準）。 */
export async function savePushSubscription(
  s: Pick<PushSubscriptionRecord, "endpoint" | "p256dh" | "auth" | "label">,
): Promise<void> {
  const client = await getSheetsClient();
  if (!client) throw new Error("Sheets 未設定");
  await ensureSheet(client);
  const all = await readAll(client);
  const found = all.find((x) => x.rec.endpoint === s.endpoint);
  const now = new Date().toISOString();

  if (found) {
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: ROW_RANGE(found.rowNumber),
      valueInputOption: "RAW",
      requestBody: { values: [toRow({ ...found.rec, ...s, lastOkAt: now })] },
    });
    return;
  }
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: [toRow({ ...s, createdAt: now, lastOkAt: now })] },
  });
}

/**
 * 移除訂閱。推播被推播服務回報 404/410（使用者取消授權、或 App 被移除）時也會走這裡，
 * 不清掉的話每次送通知都要對死掉的 endpoint 重試一次。
 */
export async function deletePushSubscription(endpoint: string): Promise<boolean> {
  const client = await getSheetsClient();
  if (!client) return false;
  try {
    await ensureSheet(client);
    const all = await readAll(client);
    const found = all.find((x) => x.rec.endpoint === endpoint);
    if (!found) return false;
    const meta = await client.sheets.spreadsheets.get({ spreadsheetId: client.spreadsheetId });
    const sheetId = (meta.data.sheets ?? []).find((s) => s.properties?.title === SHEET)?.properties
      ?.sheetId;
    if (sheetId == null) return false;
    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: found.rowNumber - 1,
                endIndex: found.rowNumber,
              },
            },
          },
        ],
      },
    });
    return true;
  } catch {
    return false;
  }
}
