/**
 * 伺服器端 Trello 存取（用環境變數金鑰，不經瀏覽器 session）。
 *
 * 為什麼另外開一支：既有的 /api/trello/[...path] 與 attachment-proxy 都要求「已登入員工」，
 * 客人端的公開連結沒有帳號用不了。這裡給公開路由在伺服器端直接呼叫，
 * 卡號一律由伺服器從 token 反查，客人端永遠拿不到、也改不了。
 */
import "server-only";

const TRELLO_KEY = process.env.TRELLO_KEY?.trim();
const TRELLO_TOKEN = process.env.TRELLO_TOKEN?.trim();
const TRELLO_BASE = "https://api.trello.com/1";

export interface TrelloAttachmentLite {
  id: string;
  name: string;
  mimeType: string | null;
  url: string;
  downloadUrl?: string | null;
  isUpload?: boolean;
  date: string;
  previews?: Array<{ url: string; width?: number; height?: number }>;
}

function assertConfigured(): void {
  if (!TRELLO_KEY || !TRELLO_TOKEN) throw new Error("TRELLO_KEY / TRELLO_TOKEN 未設定");
}

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const qs = new URLSearchParams(params);
  qs.set("key", TRELLO_KEY ?? "");
  qs.set("token", TRELLO_TOKEN ?? "");
  return `${TRELLO_BASE}/${path}?${qs.toString()}`;
}

async function trelloJson<T>(
  path: string,
  params: Record<string, string> = {},
  init?: RequestInit,
): Promise<T> {
  assertConfigured();
  const res = await fetch(buildUrl(path, params), { cache: "no-store", ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`Trello ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Trello 回應非 JSON: ${text.slice(0, 150)}`);
  }
}

function isImage(a: TrelloAttachmentLite): boolean {
  return (a.mimeType ?? "").startsWith("image/") || (a.previews ?? []).length > 0;
}

/** 該卡的圖片附件，依 Trello 原始順序（＝上傳順序）。 */
export async function getCardImageAttachments(cardId: string): Promise<TrelloAttachmentLite[]> {
  const all = await trelloJson<TrelloAttachmentLite[]>(`cards/${cardId}/attachments`, {
    fields: "id,name,mimeType,url,previews,date,isUpload",
  });
  return (all ?? []).filter(isImage);
}

/** 清單縮圖鎖定的寬度：看得出是哪張單即可，點開才載原圖。 */
const LIST_PREVIEW_TARGET_WIDTH = 900;

/**
 * 一個附件可能有多個可取圖網址（各尺寸 preview ＋ 原圖），依用途排序後逐一嘗試。
 * 上傳檔要用 downloadUrl（attachment.url 對 S3 後端的檔案需要 OAuth）。
 *
 * 🔴 放大檢視一律「原圖優先」：Trello 的 preview 會被大幅降尺寸——2026-09-26 實測
 * P6247 的 image.png 最大 preview 只有 571x774／55KB，原檔 553KB，手寫訂貨單縮到
 * 那個尺寸客人根本看不清楚，而這張頁面是要他據以簽名負責的。preview 只當退路。
 */
export function candidateUrls(a: TrelloAttachmentLite, preferFull: boolean): string[] {
  const previews = [...(a.previews ?? [])].sort((x, y) => (x.width ?? 0) - (y.width ?? 0));
  const base = (a.isUpload && a.downloadUrl ? a.downloadUrl : a.url) || "";
  if (preferFull) {
    const largestFirst = previews.slice().reverse().map((p) => p.url);
    return Array.from(new Set([base, ...largestFirst].filter(Boolean)));
  }
  // 清單：挑最接近目標寬度的 preview，其餘由近而遠當退路，原圖擺最後。
  const byCloseness = previews
    .slice()
    .sort(
      (x, y) =>
        Math.abs((x.width ?? 0) - LIST_PREVIEW_TARGET_WIDTH) -
        Math.abs((y.width ?? 0) - LIST_PREVIEW_TARGET_WIDTH),
    )
    .map((p) => p.url);
  return Array.from(new Set([...byCloseness, base].filter(Boolean)));
}

export interface FetchedImage {
  body: ArrayBuffer;
  contentType: string;
}

/** 取單一附件的圖檔位元組。逐一嘗試候選網址，全部失敗才回 null。 */
export async function fetchAttachmentImage(
  a: TrelloAttachmentLite,
  preferFull = true,
): Promise<FetchedImage | null> {
  assertConfigured();
  for (const raw of candidateUrls(a, preferFull)) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    // S3 預簽網址帶 Authorization 會被 S3 拒絕
    const isS3 = parsed.hostname.includes("s3.amazonaws.com");
    const headers: Record<string, string> = isS3
      ? {}
      : { Authorization: `OAuth oauth_consumer_key="${TRELLO_KEY}", oauth_token="${TRELLO_TOKEN}"` };
    try {
      const res = await fetch(parsed.toString(), { cache: "no-store", headers });
      if (!res.ok) continue;
      return {
        body: await res.arrayBuffer(),
        contentType: res.headers.get("content-type") ?? a.mimeType ?? "image/jpeg",
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function addCardComment(cardId: string, text: string): Promise<void> {
  await trelloJson(`cards/${cardId}/actions/comments`, { text }, { method: "POST" });
}

interface TrelloChecklist {
  id: string;
  name: string;
}

/**
 * 找「待辦事項」清單，沒有就建一個。
 * （2026-09-26 實查：71 張進行中訂單有 66 張已經有這份清單，訂金/尾款/材料到貨都走這裡。）
 */
export async function ensureTodoChecklist(cardId: string, name = "待辦事項"): Promise<string> {
  const lists = await trelloJson<TrelloChecklist[]>(`cards/${cardId}/checklists`, { fields: "id,name" });
  const found = (lists ?? []).find((c) => c.name === name);
  if (found) return found.id;
  const created = await trelloJson<TrelloChecklist>(
    `cards/${cardId}/checklists`,
    { name },
    { method: "POST" },
  );
  return created.id;
}

export async function addCheckItem(
  checklistId: string,
  name: string,
  checked: boolean,
): Promise<void> {
  await trelloJson(
    `checklists/${checklistId}/checkItems`,
    { name, checked: checked ? "true" : "false", pos: "bottom" },
    { method: "POST" },
  );
}

/** 民國年日期標籤，對齊老闆既有寫法：`115/9/26`。 */
export function rocDateLabel(d: Date = new Date()): string {
  // 以台灣時間計算（伺服器在 UTC）
  const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${tw.getUTCFullYear() - 1911}/${tw.getUTCMonth() + 1}/${tw.getUTCDate()}`;
}

/** ISO → 台灣時區的 YYYY-MM-DD。 */
export function toTaipeiYmd(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const tw = new Date(t + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${tw.getUTCFullYear()}-${pad(tw.getUTCMonth() + 1)}-${pad(tw.getUTCDate())}`;
}

// ── 看板用：依排程日撈該週訂單 ─────────────────────────────

export interface BoardCardLite {
  id: string;
  name: string;
  due: string | null;
  idList: string;
  customFieldItems?: Array<{
    idCustomField: string;
    value?: { text?: string; date?: string } | null;
  }>;
}

/** 整塊板的卡片（含自訂欄位）。一次呼叫，之後在記憶體內篩。 */
export async function getBoardCards(boardId: string): Promise<BoardCardLite[]> {
  return trelloJson<BoardCardLite[]>(`boards/${boardId}/cards`, {
    fields: "name,due,idList",
    customFieldItems: "true",
  });
}

export function getCustomFieldDate(card: BoardCardLite, fieldId: string): string {
  const v = (card.customFieldItems ?? []).find((i) => i.idCustomField === fieldId)?.value?.date;
  return v ?? "";
}
