import { TW_HOLIDAYS } from "@/lib/tw-holidays";

// 叫料確認單的純型別（client 與 server 共用，不含 server-only 依賴）。
//
// 業務背景：訂貨單條款寫明「客戶經確認查收廠務人員叫料通知訊息後，將無法取消該筆
// 訂貨單，恕不予退還訂金款項與換貨」。叫料通知＝可否取消的分界線，因此這張確認單
// 不只是通知，而是該時點的正式證據（時間戳＋簽名＋客人當下看到的照片版本）。
//
// 流程位置：排程工作單出完 → 【叫料確認單】→ 全部客人確認 → 組件叫料單（開始花錢）。

/** 送貨時段。刻意不與到府清潔共用——清潔可排晚上，送貨沒有。 */
export type DeliveryPeriod =
  | "上午 10:00-12:00"
  | "下午 13:00-15:00"
  | "下午 15:00-17:00"
  | "傍晚 17:00-19:00"
  | "皆可";

/** 有明確時間的時段（不含「皆可」）。司機要定案時只能挑這四個。 */
export const CONCRETE_DELIVERY_PERIODS: DeliveryPeriod[] = [
  "上午 10:00-12:00",
  "下午 13:00-15:00",
  "下午 15:00-17:00",
  "傍晚 17:00-19:00",
];

export const DELIVERY_PERIODS: DeliveryPeriod[] = [
  "上午 10:00-12:00",
  "下午 13:00-15:00",
  "下午 15:00-17:00",
  "傍晚 17:00-19:00",
  "皆可",
];

export function normalizeDeliveryPeriod(v: string | undefined): DeliveryPeriod {
  return DELIVERY_PERIODS.includes(v as DeliveryPeriod) ? (v as DeliveryPeriod) : "皆可";
}

export type MaterialConfirmStatus =
  | "sent"            // 已產生連結，等客人確認
  | "confirmed"       // 客人已簽名確認，等司機挑日期
  | "disputed"        // 客人回報內容有誤，等廠務處理
  | "postponed"       // 客人現場還不能進場，要求延後備料
  | "scheduled"       // 司機已從三組挑定一組
  | "driver_rejected"; // 司機三組都不行，要另外跟客人喬

/**
 * 時段的起始整點（台灣時間）。Trello 的 due 存的是「到貨區間的開始」，
 * 出貨通知再依此加上 timeRangeHours 算出區間——沿用既有 buildShippingMsg 的慣例。
 * 「皆可」沒有明確時間，回 null：司機定案時必須挑一個具體時段。
 */
export function periodStartHour(period: DeliveryPeriod): number | null {
  switch (period) {
    case "上午 10:00-12:00": return 10;
    case "下午 13:00-15:00": return 13;
    case "下午 15:00-17:00": return 15;
    case "傍晚 17:00-19:00": return 17;
    default: return null;
  }
}

/** YYYY-MM-DD ＋ 時段 → Trello due 用的 UTC ISO（台灣 -8 小時）。 */
export function toDueIso(date: string, period: DeliveryPeriod): string | null {
  const hour = periodStartHour(period);
  if (!date || hour === null) return null;
  const t = Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00+08:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** 客人希望的收件日期時段（最多 3 組）。 */
export interface PreferredSlot {
  date: string; // YYYY-MM-DD
  period: DeliveryPeriod;
}

/**
 * 客人選「隨時可配合」時不挑日期，這個旗標代表「整段期間都行，你們安排」。
 * 老闆現行訊息的範例就有「隨時可配合」——只給日期格會逼客人亂填一個。
 */
export const ANYTIME_FLAG = "anytime";

/** 一張訂單的叫料確認 session。 */
export interface MaterialConfirm {
  token: string;          // 客人連結 token（唯一憑證）
  cardId: string;         // Trello 卡片 id（照片、留言、checklist 都靠它；客人端永遠拿不到）
  orderNumber: string;    // P6247
  customerName: string;   // 劉繼芳
  status: MaterialConfirmStatus;
  /** 該週生產週一 YYYY-MM-DD，看板用來分組 */
  weekKey: string;
  /** 預計出貨日 ISO（Trello card.due）；給客人當挑日期的參考 */
  dueDate: string;
  preferredSlots: PreferredSlot[];
  signerName: string;
  signatureUrl: string;   // Cloudinary
  confirmedAt: string;
  /** 客人回報「內容有誤」或「無法進場」時填的說明 */
  disputeNote: string;
  signerIp: string;
  signerUserAgent: string;
  createdAt: string;
  updatedAt: string;
  // ── 階段二：司機挑日 ──
  driverToken: string;
  chosenDate: string;
  chosenPeriod: DeliveryPeriod | "";
  /** 老闆實際把連結傳給客人的時間。空＝連結建好了但還沒傳出去 */
  notifiedAt: string;
  /** 同一批交給同一位司機的共用 token（一條連結含多筆） */
  driverBatchToken: string;
}

/** 客人端只看得到這些——照片一律走 token 端點，不外洩 Trello 卡號與網址。 */
export interface PublicMaterialConfirmView {
  status: MaterialConfirmStatus;
  orderNumber: string;
  customerName: string;
  /** 製作完成區間的起日 YYYY-MM-DD（＝排程日）；空＝未設定 */
  productionStart: string;
  /** 製作完成區間的迄日 YYYY-MM-DD（＝排程日+6）；空＝未設定 */
  estimatedDate: string;
  /** 照片張數；客人端用 /photo/{i} 逐張取圖 */
  photoCount: number;
  preferredSlots: PreferredSlot[];
  confirmedAt: string;
  disputeNote: string;
}

/**
 * Trello 卡片名稱 → 訂單編號＋客戶姓名。
 * 卡名慣例是「P6247 劉繼芳」；興旺板的單是 S 開頭（S1075）。
 * 抓不到編號時整串當姓名，不硬猜——寧可看板上顯示怪，也不要編號張冠李戴。
 */
export function splitOrderCardName(name: string): { orderNumber: string; customerName: string } {
  const m = name.trim().match(/^([PS]\d{3,6})\s*(.*)$/);
  if (!m) return { orderNumber: "", customerName: name.trim() };
  return { orderNumber: m[1], customerName: (m[2] ?? "").trim() };
}

/**
 * 哪幾種對帳差異會擋住「發連結給客人」。
 *
 * 🔴 出貨日（kind "due"）**不算**，理由有兩個：
 *  ① 客人頁的「預計完工」是從**排程日**推算的（排程日 ～ +6 天），不是從 Numbers 出貨欄；
 *     排程日實測 5 週零差異，完全可信。出貨日對不上不會讓客人看到錯日期。
 *  ② 客人確認之後，本機工具（sofa-production-system/tools/sync_confirm_to_numbers.py）
 *     會把 Numbers 的「日期範圍」那格改寫成**送貨日**（客人挑的 / 司機定案的），
 *     它本來就不再等於 Trello 的出貨日。拿兩個意思不同的東西比對＝製造假警報。
 *
 * 假警報比漏報更傷——老闆看過「一堆不一致」之後就不再信任對帳結果了。
 * 出貨日差異照樣會列在那一筆底下讓他看到（灰字），只是不鎖按鈕。
 */
export const GATING_DRIFT_KINDS = new Set(["date", "slot", "other"]);

/** 這筆差異會不會擋住發送。看不懂的 kind 一律當「會擋」，寧可多擋不可漏放。 */
export function isGatingDrift(kind: string): boolean {
  return kind !== "due";
}

/**
 * 「客人那一關過了沒」——叫料關卡與看板篩選的唯一判準。
 *
 * confirmed 之後的狀態（司機已排定、司機回報三組都不行）客人都已經確認過了；
 * 叫料看的是「客人確認了沒」，不是司機排到日期沒有。
 * 🔴 postponed 不算：客人明確說要延後，這筆不該跟著本週叫料。
 *
 * 前後端共用，避免看板顯示的「還差 N 張」與篩選出來的筆數對不起來。
 */
export const CUSTOMER_DONE_STATUSES = ["confirmed", "scheduled", "driver_rejected"] as const;

export function isCustomerConfirmed(status: string): boolean {
  return (CUSTOMER_DONE_STATUSES as readonly string[]).includes(status);
}

/**
 * 司機週日不配送（2026-10-01 老闆確認）。
 *
 * 客人頁會擋，送出端也要擋——前端擋得住一般人，擋不住開著舊頁籤的人，
 * 而一組不可能的日期流到司機那邊，就是白跑一趟或臨時改期。
 *
 * 🔴 日期字串一律用 UTC 解析再取星期：伺服器跑在 UTC，用本地時間解析
 *    會在跨時區時整個偏一天，把週六判成週日。
 */
export function isNonDeliveryDay(ymd: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  if (!m) return false;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() === 0;
}

/**
 * 客人頁「希望收件日」可選的最早一天。
 *
 * 🔴 是製作完成區間的**起日**，不是結束日（2026-10-01 老闆更正）。
 * 「10/15 ~ 10/21 製作完成」＝會在這段期間內完成，不是 10/21 才完成，所以 10/15 起就能選。
 * 原本拿結束日當下限，客人只看得到最後一天之後，當場來問「10/19 是不行的對嗎？」
 *
 * 已經過了的日期不給選，所以還要再跟今天取較晚的那個。
 */
export function earliestDeliveryDate(
  productionStart: string,
  estimatedDate: string,
  todayYmd: string,
): string {
  const first = productionStart || estimatedDate || "";
  return first && first > todayYmd ? first : todayYmd;
}

/**
 * 這天是不是國定假日；是的話回假日名稱（「春節」「補假」…），不是回空字串。
 *
 * 🔴 國定假日**不硬擋**（2026-10-01 老闆拍板）：司機大哥的行程不固定，
 *    有些假日他跑、有些不跑，硬擋會把他其實能跑的日子也關掉。
 *    所以只顯示「需另外確認」的提示，客人照樣送得出去，由司機排車時定奪。
 *    —— 這跟週日不同，週日是確定不跑，那個是硬擋。
 *
 * 表外的日期回空字串＝不提示。假日表只涵蓋到 tw-holidays.ts 標的年度，
 * 過期時寧可少提示也不要給錯資訊；更新方式見該檔頭。
 */
export function holidayName(ymd: string): string {
  return TW_HOLIDAYS[ymd] ?? "";
}

/**
 * 測試用確認單。
 *
 * 老闆 2026-10-01：「測試案例那筆被我移除了，而且我測試之後不知道怎麼重製。」
 * 他需要能隨時重做一筆來走完整流程（客人簽名 → 司機挑日），而且不可以弄髒真實訂單。
 *
 * 做法＝測試單的 cardId 存成 `TEST:<真卡號>`：
 *  - 看板是用「真卡號」去對照工作表的（byCard.get(card.id)），**對不上這個前綴**，
 *    所以測試單絕對不會蓋掉、也不會顯示在任何一週的真實訂單上。
 *  - 照片、製作區間照樣讀得到——用 realCardId() 還原回真卡號去抓。
 *  - 🔴 但是回寫 Trello（留言、待辦打勾、改出貨日）一律跳過，
 *    否則測試會在真客人的卡片上留下紀錄。
 */
export const TEST_CARD_PREFIX = "TEST:";

export function isTestConfirm(cardId: string): boolean {
  return (cardId ?? "").startsWith(TEST_CARD_PREFIX);
}

/** `TEST:abc123` → `abc123`；本來就是真卡號就原樣回傳。 */
export function realCardId(cardId: string): string {
  return isTestConfirm(cardId) ? cardId.slice(TEST_CARD_PREFIX.length) : (cardId ?? "");
}
