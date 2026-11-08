import { NOTION_API, notionHeaders } from "@/lib/notion-order";

/**
 * 展示間參觀預約（Notion「預約紀錄」資料庫）。
 *
 * 老闆 2026-11-08：常常是**開車時接到電話**要記預約，沒辦法操作後台也沒辦法打字進
 * Notion。所以這支的使用情境是「對 LINE 講一句話就建好」，不是填表單。
 *
 * 🔴 select / multi_select 一律鎖白名單。Notion 的 select 只要填進沒看過的值就會
 *    自動新增一個選項——「需求」欄現在混著「0912676392」「訂單編號:P3782，想試坐乳膠
 *    墊感覺」「測試需求」這些垃圾選項，就是這樣來的。助手不可以再製造新選項。
 */

/** 資料庫 ID。沒設環境變數就用標題去找，省掉一道人工設定。 */
const BOOKING_DB_TITLE = "預約紀錄";
let cachedDbId: string | null = null;

export async function bookingDatabaseId(): Promise<string | null> {
  const fromEnv = process.env.NOTION_BOOKING_DB_ID;
  if (fromEnv) return fromEnv;
  if (cachedDbId) return cachedDbId;
  if (!process.env.NOTION_TOKEN) return null;

  const res = await fetch(`${NOTION_API}/search`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      query: BOOKING_DB_TITLE,
      filter: { value: "database", property: "object" },
      page_size: 10,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results?: { id: string; title?: { plain_text: string }[] }[];
  };
  const hit = (data.results ?? []).find(
    (d) => (d.title ?? []).map((t) => t.plain_text).join("") === BOOKING_DB_TITLE,
  );
  cachedDbId = hit?.id ?? null;
  return cachedDbId;
}

/** 來源：只用既有選項，不要製造新的。 */
export const BOOKING_SOURCES = [
  "電話",
  "LINE",
  "FB",
  "Mail",
  "網頁",
  "自己來",
  "自助預約",
] as const;

/** 狀態：既有選項裡乾淨、建單當下用得到的那些。 */
export const BOOKING_STATUSES = [
  "預約參觀",
  "自行參觀",
  "預約未到",
  "取消預約",
  "無預約",
] as const;

/** 需求：既有選項裡語意正常的那些（被污染的不列入）。 */
export const BOOKING_NEEDS = [
  "新建案",
  "新建案(預售屋)",
  "新建案(訂製沙發)",
  "舊換新",
  "汰舊換新",
  "汰舊換新(訂製沙發)",
  "搬新家",
  "搬新家(訂製沙發)",
  "老屋整修",
  "臥榻",
  "椅墊訂製",
  "換皮",
  "修復沙發",
  "更換坐墊",
  "其他",
] as const;

export interface BookingInput {
  /** 客人稱呼，例如「黃小姐」 */
  name?: string;
  /** 參觀時間，YYYY-MM-DDTHH:mm（台灣時間）或 YYYY-MM-DD */
  visitAt?: string;
  source?: string;
  phone?: string;
  status?: string;
  need?: string;
  /** 配送區域，例如「新北市中和區」 */
  area?: string;
  /** 預計訂製沙發尺寸，自由文字 */
  sofaSize?: string;
  notes?: string;
}

export interface NormalizedBooking {
  name: string;
  visitAt: string | null;
  visitLabel: string;
  source: string;
  phone: string;
  status: string;
  need: string;
  area: string;
  sofaSize: string;
  notes: string;
}

export interface BookingValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  booking?: NormalizedBooking;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 2026-11-10T14:30 → 11/10（一）14:30。給人看的，不要印 ISO。 */
export function formatVisitLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, hh, mm] = m;
  // 用 Date.UTC 取「這個日曆日」的星期：給帶 +08:00 的字串再讀 getUTCDay()
  // 會退回前一天（2026-11-10T00:00+08:00 的 UTC 是 11-09），上次就是這樣把六算成五。
  const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  const w = Number.isNaN(day.getTime()) ? "" : `（${WEEKDAYS[day.getUTCDay()]}）`;
  const time = hh ? ` ${hh}:${mm}` : "";
  return `${Number(mo)}/${Number(d)}${w}${time}`;
}

/** 補上 +08:00；只有日期就不帶時間。回 null 代表格式不對。 */
export function normalizeVisitAt(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  return `${m[1]}T${m[2]}:${m[3]}:00+08:00`;
}

export function validateBooking(input: BookingInput, now: Date = new Date()): BookingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = (input.name ?? "").trim();
  if (!name) errors.push("缺客人稱呼");

  const visitAt = normalizeVisitAt(input.visitAt);
  if (!visitAt && (input.visitAt ?? "").trim()) {
    errors.push(`參觀時間「${input.visitAt}」看不懂，要 YYYY-MM-DDTHH:mm`);
  }
  if (!input.visitAt) errors.push("缺參觀時間");

  const pick = (value: string | undefined, allowed: readonly string[], label: string, fallback: string) => {
    const v = (value ?? "").trim();
    if (!v) return fallback;
    if (allowed.includes(v)) return v;
    // 🔴 不直接丟進 Notion——那會新增一個選項
    errors.push(`${label}「${v}」不在既有選項裡。可用：${allowed.join("、")}`);
    return fallback;
  };

  const source = pick(input.source, BOOKING_SOURCES, "來源", "電話");
  const status = pick(input.status, BOOKING_STATUSES, "狀態", "預約參觀");
  const need = input.need ? pick(input.need, BOOKING_NEEDS, "需求", "") : "";

  if (visitAt) {
    const t = new Date(visitAt.length === 10 ? `${visitAt}T23:59:59+08:00` : visitAt);
    if (!Number.isNaN(t.getTime()) && t.getTime() < now.getTime()) {
      warnings.push("這個時間已經過去了，確認一下是不是日期講錯");
    }
  }

  if (errors.length > 0) return { ok: false, errors, warnings };

  return {
    ok: true,
    errors,
    warnings,
    booking: {
      name,
      visitAt,
      visitLabel: visitAt ? formatVisitLabel(visitAt) : "",
      source,
      phone: (input.phone ?? "").trim(),
      status,
      need,
      area: (input.area ?? "").trim(),
      sofaSize: (input.sofaSize ?? "").trim(),
      notes: (input.notes ?? "").trim(),
    },
  };
}

function text(v: string) {
  return { rich_text: [{ text: { content: v } }] };
}

/** 組 Notion properties。空值不送——免得把既有欄位清掉或建出空選項。 */
export function buildBookingProperties(b: NormalizedBooking): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Name: { title: [{ text: { content: b.name } }] },
    來源: { select: { name: b.source } },
    狀態: { multi_select: [{ name: b.status }] },
  };
  if (b.visitAt) props.參觀時間 = { date: { start: b.visitAt } };
  if (b.phone) props.聯絡電話 = text(b.phone);
  if (b.need) props.需求 = { select: { name: b.need } };
  if (b.area) props.配送區域 = text(b.area);
  if (b.sofaSize) props.預計訂製沙發尺寸 = text(b.sofaSize);
  if (b.notes) props.內部備註 = text(b.notes);
  return props;
}

/** 唸給人聽的一行確認。開車時是用聽的，不要給欄位名稱列表。 */
export function describeBooking(b: NormalizedBooking): string {
  const bits = [b.name, b.visitLabel, b.phone && `電話 ${b.phone}`, `來源${b.source}`, b.status];
  if (b.need) bits.push(b.need);
  if (b.area) bits.push(b.area);
  return bits.filter(Boolean).join("　");
}

export interface BookingResult {
  ok: boolean;
  message: string;
  pageUrl?: string;
}

/** Notion 回傳的頁面，只取我們要讀回驗證的欄位。 */
interface NotionPage {
  id?: string;
  url?: string;
  properties?: Record<string, unknown>;
}

function readTitle(props: Record<string, unknown> | undefined): string {
  const p = props?.Name as { title?: { plain_text: string }[] } | undefined;
  return (p?.title ?? []).map((t) => t.plain_text).join("");
}

function readDate(props: Record<string, unknown> | undefined): string {
  const p = props?.參觀時間 as { date?: { start?: string } } | undefined;
  return p?.date?.start ?? "";
}

/**
 * 建立一筆預約，然後**讀回驗證**。
 * Notion 的 200 不保證欄位都進去了（select 名稱不符會被忽略），所以一定要讀回來比對。
 */
export async function createBooking(input: BookingInput): Promise<BookingResult> {
  if (!process.env.NOTION_TOKEN) {
    return { ok: false, message: "❌ 尚未設定 NOTION_TOKEN，無法寫入 Notion。" };
  }
  const dbId = await bookingDatabaseId();
  if (!dbId) return { ok: false, message: "❌ 找不到 Notion「預約紀錄」資料庫。" };

  const v = validateBooking(input);
  if (!v.ok || !v.booking) {
    return { ok: false, message: `❌ 還差一點：${v.errors.join("；")}` };
  }
  const b = v.booking;

  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({ parent: { database_id: dbId }, properties: buildBookingProperties(b) }),
  });
  const created = (await res.json()) as NotionPage & { message?: string };
  if (!res.ok || !created.id) {
    return { ok: false, message: `❌ 建立失敗：${created.message ?? res.status}` };
  }

  // 讀回驗證：API 回 200 不等於欄位真的落地
  const check = await fetch(`${NOTION_API}/pages/${created.id}`, { headers: notionHeaders() });
  const page = (await check.json()) as NotionPage;
  const savedName = readTitle(page.properties);
  const savedDate = readDate(page.properties);
  const mismatches: string[] = [];
  if (savedName !== b.name) mismatches.push(`稱呼存成「${savedName}」`);
  if (b.visitAt && !savedDate.startsWith(b.visitAt.slice(0, 16))) {
    mismatches.push(`時間存成「${savedDate}」`);
  }

  const lines = [`✅ 預約已建立：${describeBooking(b)}`];
  if (v.warnings.length) lines.push(`⚠️ ${v.warnings.join("；")}`);
  if (mismatches.length) lines.push(`⚠️ 讀回來跟送出的不一樣：${mismatches.join("、")}`);
  if (page.url) lines.push(page.url);

  return { ok: mismatches.length === 0, message: lines.join("\n"), pageUrl: page.url };
}

/** 查預約：預設看今天起算之後的，給「今天有誰要來」這種問題用。 */
export async function queryBookings(args: {
  date?: string;
  from?: string;
  limit?: number;
}): Promise<string> {
  if (!process.env.NOTION_TOKEN) return "❌ 尚未設定 NOTION_TOKEN。";
  const dbId = await bookingDatabaseId();
  if (!dbId) return "❌ 找不到 Notion「預約紀錄」資料庫。";

  const day = (args.date ?? "").trim();
  // 指定某一天就要給完整的一天，預設 10 筆會把當天後面的客人吃掉
  //（2026-11-08 實測：問「今天有誰要來」剛好回 10 筆，正好是上限）
  const limit = Math.min(Math.max(Number(args.limit ?? (day ? 100 : 10)), 1), 100);
  const from = (args.from ?? "").trim();

  const filter = day
    ? {
        and: [
          { property: "參觀時間", date: { on_or_after: `${day}T00:00:00+08:00` } },
          { property: "參觀時間", date: { before: `${day}T23:59:59+08:00` } },
        ],
      }
    : from
      ? { property: "參觀時間", date: { on_or_after: `${from}T00:00:00+08:00` } }
      : undefined;

  const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      ...(filter ? { filter } : {}),
      sorts: [{ property: "參觀時間", direction: "ascending" }],
      page_size: limit,
    }),
  });
  if (!res.ok) return `❌ 查詢失敗：${res.status}`;
  const data = (await res.json()) as { results?: NotionPage[]; has_more?: boolean };
  const rows = data.results ?? [];
  if (rows.length === 0) return day ? `${day} 沒有預約。` : "查無預約紀錄。";

  const lines = rows.map((p) => {
    const props = p.properties ?? {};
    const phone = (props.聯絡電話 as { rich_text?: { plain_text: string }[] } | undefined)?.rich_text
      ?.map((t) => t.plain_text)
      .join("");
    const source = (props.來源 as { select?: { name?: string } } | undefined)?.select?.name ?? "";
    const status = ((props.狀態 as { multi_select?: { name: string }[] } | undefined)?.multi_select ?? [])
      .map((o) => o.name)
      .join("、");
    const when = readDate(props);
    return `${when ? formatVisitLabel(when) : "(未填時間)"}　${readTitle(props) || "(無名)"}${
      phone ? `　${phone}` : ""
    }${source ? `　來源${source}` : ""}${status ? `　${status}` : ""}`;
  });
  // 被截斷就要講，不然使用者會以為這就是全部
  const more = data.has_more ? `（還有更多沒列出，目前上限 ${limit} 筆）` : "";
  return `${day ? `${day} ` : ""}共 ${rows.length} 筆預約${more}：\n${lines.join("\n")}`;
}
