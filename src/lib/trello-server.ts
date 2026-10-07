/**
 * 伺服器端 Trello 存取（用環境變數金鑰，不經瀏覽器 session）。
 *
 * 為什麼另外開一支：既有的 /api/trello/[...path] 與 attachment-proxy 都要求「已登入員工」，
 * 客人端的公開連結沒有帳號用不了。這裡給公開路由在伺服器端直接呼叫，
 * 卡號一律由伺服器從 token 反查，客人端永遠拿不到、也改不了。
 */
import { isTestConfirm, realCardId } from "@/lib/material-confirm-types";
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

interface TrelloLabel {
  id: string;
  name: string;
  color: string | null;
}

/**
 * 看板標籤是共用資源，所以一律「先依名稱完全相符尋找、找不到才建立」，
 * 不然每次呼叫都會多生一個同名標籤，看板很快就被洗版。
 * 記在模組層快取：Serverless 冷啟動會重查一次，成本可接受。
 */
const boardLabelCache = new Map<string, string>();

export async function ensureBoardLabel(
  boardId: string,
  name: string,
  color: string,
): Promise<string> {
  const cacheKey = `${boardId}:${name}`;
  const cached = boardLabelCache.get(cacheKey);
  if (cached) return cached;

  const labels = await trelloJson<TrelloLabel[]>(`boards/${boardId}/labels`, {
    fields: "id,name,color",
    limit: "1000",
  });
  const found = (labels ?? []).find((l) => l.name === name);
  const id =
    found?.id ??
    (await trelloJson<TrelloLabel>(`boards/${boardId}/labels`, { name, color }, { method: "POST" }))
      .id;

  boardLabelCache.set(cacheKey, id);
  return id;
}

/** 把標籤掛到卡片上。重複掛同一個標籤 Trello 會回 400，那不是錯誤，視為成功。 */
export async function addCardLabel(cardId: string, labelId: string): Promise<void> {
  try {
    await trelloJson(`cards/${cardId}/idLabels`, { value: labelId }, { method: "POST" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/already on the card/i.test(msg)) throw err;
  }
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

export function getCustomFieldText(card: BoardCardLite, fieldId: string): string {
  const v = (card.customFieldItems ?? []).find((i) => i.idCustomField === fieldId)?.value?.text;
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
/**
 * 告訴客人的「製作完成區間」＝生產週週一往後 3 天起算一週。
 * 例：生產週一 10/12 → 10/15 ～ 10/21。
 *
 * 🔴 老闆 2026-09-30 更正兩件事：
 *    ① 不是每筆用自己的排程日算，**整週共用同一個區間**
 *       （同一批一起做，逐筆給不同日期沒有意義，客人之間講起來也會亂）。
 *    ② 要往後留幾天緩衝，不能排程日當天就算完工。
 *    原本的寫法（排程日 ~ 排程日+6，due 更晚時取 due）兩點都錯，
 *    P6202 因此顯示成 10/12～10/26。
 */
const BUFFER_DAYS = 3;
const WINDOW_DAYS = 6;

function addDaysYmd(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(t)) return ymd;
  const d = new Date(t + n * 86400000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 任一天 → 所屬生產週的週一（週一為一週之始）。 */
export function weekMonday(ymd: string): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(t)) return ymd;
  const d = new Date(t);
  const dow = d.getUTCDay();            // 0=日
  const back = dow === 0 ? 6 : dow - 1; // 回推到週一
  return addDaysYmd(ymd, -back);
}

/**
 * 客人看到的「製作完成區間」。
 *
 * 🔴 一律從**生產週的週一**算，不看各筆排程日、也不看卡片 due：
 *    - 同一週一起生產，整週共用一個區間（老闆 2026-09-30 明確指正）
 *    - due 長期不可信：2026-09-27 對帳實測 17 筆對不上，而且兩邊都可能是舊的那一方
 *    - 排程日在 Numbers 與 Trello 之間零筆不一致，是唯一可信的錨點
 */
export function productionWindow(weekKeyOrScheduleYmd: string): { start: string; end: string } {
  if (!weekKeyOrScheduleYmd) return { start: "", end: "" };
  const monday = weekMonday(weekKeyOrScheduleYmd);
  const start = addDaysYmd(monday, BUFFER_DAYS);
  return { start, end: addDaysYmd(start, WINDOW_DAYS) };
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
  return productionWindow(toTaipeiYmd(getCustomFieldDate(card, SCHEDULE_DAY_FIELD)));
}

/** 該卡的色號欄原文（例「FG60213-11&LY9308A」）。客人頁判斷期貨布用。 */
export async function getCardColorCodes(cardId: string): Promise<string> {
  const card = await trelloJson<BoardCardLite>(`cards/${cardId}`, {
    fields: "name",
    customFieldItems: "true",
  });
  return getCustomFieldText(card, COLOR_FIELD);
}

/** 色號自訂欄位（生產看板）。 */
export const COLOR_FIELD = "5dc009d5351ac03fd2bfa007";

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


/**
 * 在卡片留言，但**測試單一律跳過**。
 *
 * 測試用確認單的 cardId 是 `TEST:<真卡號>`（見 material-confirm-types 的 isTestConfirm）。
 * 老闆用它走完整流程驗收，如果照常留言就會在真客人的卡片上留下測試紀錄。
 * 所有「客人確認／司機排定」的留言一律走這支，不要直接呼叫 addCardComment。
 */
export async function addCardCommentUnlessTest(cardId: string, text: string): Promise<void> {
  if (isTestConfirm(cardId)) return;
  await addCardComment(realCardId(cardId), text);
}
