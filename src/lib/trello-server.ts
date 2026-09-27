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

/** 排程日自訂欄位（與排程系統同一個欄位 id）。 */
export const SCHEDULE_DAY_FIELD = "5dbffb41d3233f81ca015792";

/**
 * 客人頁要顯示的「預計完工日」。
 *
 * 🔴 不能只看卡片 due：實查 2026-10-12 那週 10 張單，**5 張的出貨日比排程日還早**
 * （例 P6260 排程 10/13、出貨仍是舊的 10/03）。照 due 顯示會叫客人挑一個東西還沒做完的
 * 日期。取「出貨日、排程日」較晚者，兩個都沒有就回空字串不硬編。
 * 另外一律當下重抓，老闆改了日期客人頁就跟著對，不吃建連結當下的快照。
 */
/** 生產週長度：排程日當天起算一週（Numbers 的「日期範圍」就是這個，例 排程 10/14 → 10/14-20）。 */
const PRODUCTION_WEEK_DAYS = 6;

function addDaysYmd(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(t)) return ymd;
  const d = new Date(t + n * 86400000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * 客人看到的「預計完工日」。
 *
 * 🔴 不可以只看卡片 due。2026-09-27 對帳實測：排程日在 Numbers 與 Trello 之間
 * **零筆不一致**，但出貨日有 17 筆對不上（P6260 排程 10/13、due 仍是舊的 10/03），
 * 而且兩邊都可能是舊的那一方（P6010 的 Numbers 日期範圍還停在 6/30-7/5）。
 * 唯一可信的是排程日，所以基準取「排程日那週的最後一天」＝ Numbers 日期範圍的迄日。
 *
 * due 比生產週結束還晚時才採用 due——那代表老闆刻意排得更後面，不能擅自提前承諾。
 */
export function pickEstimatedDate(dueYmd: string, scheduleYmd: string): string {
  if (!scheduleYmd) return dueYmd || "";
  const weekEnd = addDaysYmd(scheduleYmd, PRODUCTION_WEEK_DAYS);
  if (!dueYmd) return weekEnd;
  return dueYmd > weekEnd ? dueYmd : weekEnd;
}

export interface ProductionWindow {
  /** 製作起日＝排程日 */
  start: string;
  /** 製作完成日＝排程日+6，或 due 更晚時取 due */
  end: string;
}

/**
 * 客人訊息上寫的「【10/8 ～ 10/14 製作完成】」那段區間。
 * 起日＝排程日（Numbers 與 Trello 零差異，可信），迄日見 pickEstimatedDate。
 */
export async function getCardProductionWindow(cardId: string): Promise<ProductionWindow> {
  const card = await trelloJson<BoardCardLite>(`cards/${cardId}`, {
    fields: "due",
    customFieldItems: "true",
  });
  const sched = toTaipeiYmd(getCustomFieldDate(card, SCHEDULE_DAY_FIELD));
  const due = toTaipeiYmd(card.due ?? "");
  return { start: sched, end: pickEstimatedDate(due, sched) };
}

// ── 司機頁需要的配送資訊 ─────────────────────────────

const CF = {
  COMMUNITY_NAME: "60de85e6d4389c54299831bb",
  PRIMARY_CONTACT_NAME: "68dbc601cb33326044f58b0c",
  PRIMARY_CONTACT_PHONE: "68dbc64de823fab14eff02ab",
  SECONDARY_CONTACT_NAME: "68dbc658fe59d273e97395a4",
  SECONDARY_CONTACT_PHONE: "68dbc662112596182820b8e4",
} as const;

export interface DeliveryInfo {
  orderNumber: string;
  customerName: string;
  /** 地址（含社區名與【無電梯】等註記） */
  address: string;
  /** 現場註記，例：無電梯、室內梯、扶手現場組裝 */
  notes: string[];
  primaryPhone: string;
  primaryName: string;
  secondaryPhone: string;
  secondaryName: string;
  /** 卡片描述裡非地址、非電話的行＝品項 */
  items: string[];
}

interface CardDetail {
  id: string;
  name: string;
  desc: string;
  labels?: Array<{ name?: string }>;
  customFieldItems?: BoardCardLite["customFieldItems"];
}

function cfText(card: CardDetail, fieldId: string): string {
  return (card.customFieldItems ?? []).find((i) => i.idCustomField === fieldId)?.value?.text ?? "";
}

/** 「開頭像電話號碼」的行＝聯絡資訊（含 0958575724/許惠婷 這種斜線格式）。 */
function looksLikePhoneLine(line: string): boolean {
  const first = line.split(/[/\s]/)[0] ?? "";
  return /^0\d{8,9}$/.test(first.replace(/-/g, ""));
}

/**
 * 司機頁要顯示的配送資訊。欄位取法刻意對齊既有的司機確認訊息
 * （`buildDriverConfirmBlock`）——司機看慣什麼就給什麼，不另創格式。
 */
export async function getDeliveryInfo(cardId: string): Promise<DeliveryInfo> {
  const card = await trelloJson<CardDetail>(`cards/${cardId}`, {
    fields: "name,desc,labels",
    customFieldItems: "true",
  });

  const lines = (card.desc ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const address = lines[0] ?? "";
  const community = cfText(card, CF.COMMUNITY_NAME);

  const labelNames = (card.labels ?? []).map((l) => l.name ?? "");
  const notes: string[] = [];
  if (labelNames.some((n) => n.includes("組裝"))) notes.push("扶手現場組裝");
  if (labelNames.some((n) => n.includes("無電梯"))) notes.push("無電梯");
  if (labelNames.some((n) => n.includes("室內梯"))) notes.push("室內梯");

  const orderNumber = (card.name.match(/[PS]\d{3,6}/) ?? [""])[0];
  const rest = lines.slice(1);

  const primaryPhone = cfText(card, CF.PRIMARY_CONTACT_PHONE) || (rest.find(looksLikePhoneLine) ?? "").split(/[/\s]/)[0] || "";
  const primaryName = cfText(card, CF.PRIMARY_CONTACT_NAME) || card.name.replace(orderNumber, "").trim();

  return {
    orderNumber,
    customerName: card.name.replace(orderNumber, "").trim(),
    address: community ? `${address}〔${community}〕` : address,
    notes,
    primaryPhone,
    primaryName,
    secondaryPhone: cfText(card, CF.SECONDARY_CONTACT_PHONE).split("/")[0]?.trim() ?? "",
    secondaryName: cfText(card, CF.SECONDARY_CONTACT_NAME),
    items: rest.filter((l) => !looksLikePhoneLine(l)),
  };
}

/** 設定卡片出貨日（Trello due）。 */
export async function setCardDue(cardId: string, dueIso: string): Promise<void> {
  await trelloJson(`cards/${cardId}`, { due: dueIso }, { method: "PUT" });
}
