import { isPublicLinkExpired } from "@/lib/public-link-expiry";
import type { CleaningSlotPeriod } from "@/lib/types";

/**
 * 到府清潔時段的收斂規則。
 *
 * 🔴 2026-10-19 實際踩到的洞：客人可以填「皆可」（而那是最自然的回答），
 *    師傅那頁卻只能「點客人給的某一格」，送出時不帶任何時間。
 *    結果是確認完的時段還是「皆可」——售後單的 scheduledTime 空白，
 *    師傅口頭說的「週四 13:00 後」沒有任何地方存得下。
 *
 *    後端其實早就支援 body.period 覆寫，缺的是讓師傅輸入的地方。
 */

/** 可以當成「確認結果」的時段。「皆可」不算——那不是一個可執行的時間。 */
export function isConfirmablePeriod(v: string | undefined): v is CleaningSlotPeriod {
  return v === "上午" || v === "下午" || v === "晚上";
}

/** 備註最多留這麼長，避免有人把整段對話貼進欄位 */
const NOTE_MAX = 24;

/**
 * 組出要寫進售後單 scheduledTime 的字串。
 *
 * 時段本身只有四種，存不下「13:00 後」這種真實限制，所以用
 * 「下午（13:00 後）」的形式把師傅講的細節一起留住——派工單上看得到，
 * 不必再回頭翻 LINE。
 */
export function composeScheduledTime(
  period: CleaningSlotPeriod,
  note: string | undefined,
): string {
  const trimmed = (note ?? "").trim().replace(/^[（(]|[）)]$/g, "").trim();
  if (!trimmed) return period;
  return `${period}（${trimmed.slice(0, NOTE_MAX)}）`;
}

/** 媒合成功之後，連結還能再活幾天 */
export const CONFIRMED_LINK_TTL_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * 清潔連結（客人端與師傅端）是不是該失效了。
 *
 * 老闆 2026-10-19：「客戶端＋師傅端皆已確認，代表媒合成功、售後服務單也成立了，
 * 這兩個連結應該七天後失效。」`confirmed` 這個狀態的定義就是兩邊都完成——
 * 中途任何一邊沒好（awaiting_customer／awaiting_tech／tech_rejected）都不算。
 *
 * 為什麼不是單純「確認日 +7 天」：如果客人約的是三週後，照確認日算，連結會在
 * 師傅到府**之前**就死掉，當天查無地址電話。所以取「確認時間」與「預約到府日」
 * 較晚的那個再 +7 天，一般情況（當週到府）結果一樣，遠期預約不會提前斷掉。
 *
 * 尚未媒合成功時沿用 lib/public-link-expiry 的 90 天通用規則。
 */
export function isCleaningLinkExpired(
  session: {
    status: string;
    createdAt: string;
    updatedAt: string;
    confirmedDate: string;
  },
  nowMs: number = Date.now(),
): boolean {
  if (session.status !== "confirmed") {
    return isPublicLinkExpired(session.createdAt, nowMs);
  }
  // 確認當下的時間；壞資料時退回建立時間，不要變成永久有效
  const confirmedAt = Date.parse(session.updatedAt);
  const visitAt = session.confirmedDate ? Date.parse(`${session.confirmedDate}T23:59:59Z`) : NaN;
  const candidates = [confirmedAt, visitAt].filter((t) => !Number.isNaN(t));
  if (candidates.length === 0) return isPublicLinkExpired(session.createdAt, nowMs);
  const from = Math.max(...candidates);
  return nowMs - from > CONFIRMED_LINK_TTL_DAYS * DAY_MS;
}

/** 客人必須提供的時段組數 */
export const REQUIRED_SLOT_COUNT = 3;

/**
 * 檢查客人送出的「方便到府時段」。回傳錯誤訊息，通過則回 null。
 *
 * 🔴 強制三組（老闆 2026-10-31）：只選一組的客人會把那天當成「師傅一定會到」，
 * 師傅排不進去就得重發連結、重新溝通一輪，溝通成本全回到內勤身上。
 * 叫料確認那條流程 2026-10-29 已經改成強制三組，清潔這條當時漏掉。
 *
 * 前端與 API 共用同一份規則：前端擋一般操作，API 擋開著舊頁籤或手動送請求的人，
 * 兩邊訊息也因此一致。
 */
export function validateProposedSlots(slots: { date: string }[]): string | null {
  const filled = slots.filter((s) => s.date);
  if (filled.length < REQUIRED_SLOT_COUNT) {
    return `請完整填寫${REQUIRED_SLOT_COUNT === 3 ? "三" : REQUIRED_SLOT_COUNT}組方便的日期時段`;
  }
  // 三組填同一天等於沒給選擇
  if (new Set(filled.map((s) => s.date)).size < filled.length) {
    return "三組請填不同的日期，師傅才有得選";
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 貼給客人／師傅的文案（老闆 2026-10-31：原本按鈕只複製網址，還要自己打字）
 * ──────────────────────────────────────────────────────────────────────────── */

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 2026-11-21 → 11/21（五） */
export function formatSlotDate(date: string): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

/**
 * 從「問題描述」裡抓出布料那一行。
 *
 * 🔴 只抓這一行，不是整段倒給師傅：問題描述裡還有 LINE 對話連結與內部備註，
 * 外部師傅不該拿到。抓不到就不顯示，不要瞎猜——布料決定清潔方式與藥劑，
 * 寫錯比沒寫更危險。
 */
export function extractFabricLine(issueDescription: string | undefined): string {
  const m = (issueDescription ?? "").match(/^\s*布料[：:]\s*(.+?)\s*$/m);
  return m ? m[1] : "";
}

/** ① 貼給客人：請他選三組時段 */
export function buildCustomerSlotMessage(url: string): string {
  return [
    "您好～我們幫您開好到府清潔的單了 😊",
    "麻煩點下面連結選三組方便的時間（不同日期），",
    "我們跟師傅確認後會再回覆您確定的日期：",
    "",
    url,
    "",
    "※ 最快可安排後天（師傅需要前置時間）",
    "※ 這是您方便的時間，不是確定的到府日",
  ].join("\n");
}

export interface TechSlotMessageInput {
  serviceId: string;
  clientName?: string;
  phone?: string;
  phone2?: string;
  address?: string;
  model?: string;
  fabric?: string;
  slots: { date: string; period: string }[];
  url: string;
}

/** ② 貼給師傅：客人已選好，請他確認 */
export function buildTechSlotMessage(input: TechSlotMessageInput): string {
  const lines: string[] = [`【到府清潔】${input.serviceId}`];
  if (input.clientName) lines.push(`客戶：${input.clientName}`);
  if (input.address) lines.push(`地址：${input.address}`);
  if (input.phone) {
    lines.push(`電話：${input.phone}${input.phone2 ? `（備用 ${input.phone2}）` : ""}`);
  }
  // 用「品項」不用「沙發」：modelNameSnapshot 常常自己就以「沙發」開頭，會變成「沙發：沙發 265cm…」
  if (input.model) lines.push(`品項：${input.model}`);
  // 布料決定清潔方式與藥劑，有抓到就一定要讓師傅看到
  if (input.fabric) lines.push(`布料：${input.fabric}`);
  lines.push("", "客人希望時段：");
  for (const s of input.slots) lines.push(`· ${formatSlotDate(s.date)} ${s.period}`);
  lines.push(
    "",
    "可以的話麻煩點連結確認，要選上午／下午／晚上：",
    input.url,
  );
  return lines.join("\n");
}
