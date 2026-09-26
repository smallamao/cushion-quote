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
  | "sent"       // 已產生連結，等客人確認
  | "confirmed"  // 客人已簽名確認
  | "disputed";  // 客人回報內容有誤，等廠務處理

/** 客人希望的收件日期時段（最多 3 組）。 */
export interface PreferredSlot {
  date: string; // YYYY-MM-DD
  period: DeliveryPeriod;
}

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
  /** 客人回報「內容有誤」時填的說明 */
  disputeNote: string;
  signerIp: string;
  signerUserAgent: string;
  createdAt: string;
  updatedAt: string;
  // ── 階段二（出貨前，司機挑日）預留欄位 ──
  driverToken: string;
  chosenDate: string;
  chosenPeriod: DeliveryPeriod | "";
}

/** 客人端只看得到這些——照片一律走 token 端點，不外洩 Trello 卡號與網址。 */
export interface PublicMaterialConfirmView {
  status: MaterialConfirmStatus;
  orderNumber: string;
  customerName: string;
  /** 預計完工日 YYYY-MM-DD（台灣時區）；空＝未設定 */
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
