/**
 * 排車規則。全部來自老闆 2026-11-01 的口述，並以 Trello 歷史出貨日驗證過。
 *
 * 🔴 這些是「規則」不是「演算法」——系統照規則提示，排車仍由人決定。
 *    每週只有 5～8 筆，順不順路取決於現場狀況，自動指派會給出要人重排的結果。
 */

/**
 * 一天幾趟的「常態」——超過只是值得看一眼，不是異常。
 *
 * 近四個月 87 個出貨日共 182 趟：中位數 2、九成在 4 以內。
 * 🔴 這是**需求**造成的分布，不是能力上限（老闆 2026-11-08 更正）：
 *    「訂單量不多，大部分都只有排到 5-6 趟」。拿歷史載量當產能天花板是
 *    推論錯誤——歷史是在「人工避免壓同一天」的排法下產生的。
 */
export const SOFT_CAP = 4;

/**
 * 一天幾趟的能力上限（單一司機）。
 *
 * 🔴 老闆 2026-11-08 原話：「如果區域都距離不遠、時段都安排很順，一天是真的
 *    可以到八趟，只是訂單量不多大部分都只有排到 5-6 趟。」
 *    歷史最大值支持這個數字：阿信單日最多 7 趟（做過兩次）。
 *
 * 🔴 先前這裡是 6，註解寫「老闆口述上限 5～6」——那是**記錯**，把常態當成了
 *    上限，會讓系統把阿信跑第 7 趟當異常。
 *
 * 上限跟區域距離綁在一起：阿富跑台東單日最多 1 趟（一趟就耗掉一天），
 * 簡先生最多 3 趟。所以這個 8 只適用於「區域集中」的情形，
 * 判斷仍然留給人——見 suggestDriver 與各司機的歷史最大值。
 */
export const HARD_CAP = 8;

/**
 * 🔴 這裡原本有 `MAX_ROUTES = 3`（一天最多幾條路線，用「跨幾個縣市」近似），
 *    2026-11-09 移除。理由是實測它既不會觸發、度量方式也錯：
 *
 *    - 219 個「司機×日」組合裡，只有 1 天跨到 4 個縣市——門檻形同從不作用。
 *    - 跨縣市是**常態**不是例外：2 趟的日子裡，跨 2 市（34 天）比跨 1 市（30 天）還多。
 *    - 縣市數跟「順不順路」沒有對應：三峽＋瑞芳都算新北（1 市）但相距很遠，
 *      而 2026-02-07 阿信跑了 7 趟、跨苗栗＋新北＋桃園（3 市）照樣順。
 *
 *    老闆說的「一次兩趟一起順趟下去」是距離與時序的概念，不是行政區數量。
 *    在沒有真實車程資料之前，系統只呈現「今天跨了哪些縣市」讓人判斷，不給門檻。
 */

/** 完工後最多寄放兩週。老闆：「避免放置超過二周」。 */
export const MAX_STORAGE_DAYS = 14;

/** 排定後提前幾天通知客人。老闆：「2-3 天」。 */
export const NOTIFY_LEAD_DAYS = 3;

/**
 * 依配送縣市建議司機。
 *   阿富   東部（花蓮、台東）
 *   葉先生 南部（高雄）回頭車，要配合車次
 *   阿信   主力，北部與其餘地區；排不下時由簡先生支援
 */
export function suggestDriver(city: string): { name: string; note: string } {
  const c = (city ?? "").replace(/^臺/, "台");
  if (c === "花蓮縣" || c === "台東縣") return { name: "阿富", note: "東部固定路線" };
  if (c === "高雄市") return { name: "葉先生", note: "回頭車，需配合車次" };
  if (["台北市", "新北市", "桃園市", "新竹市", "新竹縣"].includes(c)) {
    return { name: "阿信", note: "排不下可請簡先生支援" };
  }
  if (!c) return { name: "", note: "地址未解析，需人工確認" };
  return { name: "阿信", note: "不在固定路線上，需確認" };
}

/**
 * 製作完成到配送之間放太久。
 * dueDate＝預計出貨（製作完成）日，deliveryYmd＝打算排的配送日。
 */
export function isStorageOverdue(dueDate: string, deliveryYmd: string): boolean {
  const due = Date.parse(`${(dueDate ?? "").slice(0, 10)}T00:00:00+08:00`);
  const del = Date.parse(`${deliveryYmd}T00:00:00+08:00`);
  if (!Number.isFinite(due) || !Number.isFinite(del)) return false;
  return (del - due) / 86_400_000 > MAX_STORAGE_DAYS;
}

/**
 * 從 Trello 清單推出製作階段。
 *
 * 🔴 實際順序（老闆 2026-11-08 更正）：
 *      Order 訂單 → 【發叫料確認、收集三組預選時段】→ 生成排程工作單
 *      → Production 排程 → 待出貨 → 已出貨
 *
 *    所以待排車的單**本來就大多還在「Order 訂單」**——收時段發生在進生產之前。
 *    先前誤以為那是「不該出現在排車清單」，是把順序搞反了。
 *
 *    真正的異常只有一種：卡片已經在「已出貨／已完成」，叫料確認單卻還掛著待排車，
 *    代表東西早就送出去、資料沒結案（2026-11-08 實查 3 筆）。
 *
 *    階段本身仍要顯示：配送日逼近時，你得知道師傅做完了沒——
 *    那個答案就在卡片位置，不必逐筆去問人。
 */
export type StageKey = "pre_production" | "in_production" | "ready" | "shipped" | "unknown";

export interface ProductionStage {
  key: StageKey;
  label: string;
  /** 還在流程中、值得排車；已出貨或已完成的不算 */
  plannable: boolean;
}

const STAGE_BY_LIST: Record<string, ProductionStage> = {
  // 收集時段時的正常位置，不是異常
  "5cf6a0115e65d9317a0ee5e8": { key: "pre_production", label: "待排生產", plannable: true },
  "5cefef9f9c7cca170f5b823b": { key: "pre_production", label: "待排生產", plannable: true },
  "5ceff0069ddcad59eb4b3eba": { key: "in_production", label: "製作中", plannable: true },
  "5db80ff546d13017935c55a9": { key: "ready", label: "✅ 待出貨", plannable: true },
  // 已經送出去了還掛在待排車＝資料沒結案
  "5f70224034d940207767d3a5": { key: "shipped", label: "已出貨", plannable: false },
  "5cefefb35c4b448c9a7af5d3": { key: "shipped", label: "已出貨", plannable: false },
  "5cefefdeb0649542b6330fc9": { key: "shipped", label: "已完成", plannable: false },
};

export function productionStage(idList: string | undefined): ProductionStage {
  return (
    STAGE_BY_LIST[idList ?? ""] ?? { key: "unknown", label: "位置不明", plannable: false }
  );
}

/**
 * 一天的趟數分到各司機頭上。
 *
 * 🔴 容量**每位司機各自算**（老闆 2026-11-09 拍板）。先前是算當天總趟數，
 *    那在兩種情況下都給錯答案：
 *      - 阿富跑台東那一趟會吃掉台北的額度 → 誤報「偏多」
 *      - 5 趟全壓在阿信一個人身上，看起來跟兩人各 2-3 趟一樣安全 → 該報的沒報
 *    實測各司機單日最大值差很多：阿信 7、簡先生 3、阿富 1（台東一趟耗一天）。
 *
 * 未指派的單**不併入任何人**，單獨回報。猜成主力司機會把別人的趟數算到
 * 阿信頭上，比留白更糟（同 delivery-region.ts「抓不到就不猜」的理由）。
 */
export function driverLoad(booked: readonly { assignedDriver: string }[]): {
  perDriver: Array<{ name: string; trips: number }>;
  unassigned: number;
  /** 單一司機的最高趟數——示警看這個，不看總數 */
  peak: { name: string; trips: number } | null;
} {
  const counts = new Map<string, number>();
  let unassigned = 0;
  for (const b of booked) {
    if (!b.assignedDriver) { unassigned++; continue; }
    counts.set(b.assignedDriver, (counts.get(b.assignedDriver) ?? 0) + 1);
  }
  const perDriver = [...counts.entries()]
    .map(([name, trips]) => ({ name, trips }))
    .sort((a, b) => b.trips - a.trips);
  return { perDriver, unassigned, peak: perDriver[0] ?? null };
}
