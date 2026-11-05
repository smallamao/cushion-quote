// 銀行對帳（唯讀核對）：把永豐往來明細的每筆入帳，拿去跟應收帳款裡「已經記好的收款」對照。
//
// 🔴 這支只讀不寫。老闆是在客人回報匯款時就把收款記進應收分期（末五碼填在 paymentRef，
//    舊資料則寫在備註裡，例「…(18173) 囉」），所以銀行明細只拿來「驗證」那些紀錄，
//    不能再寫回應收——寫回去就會重複入帳。舊版「核對入帳」的寫回流程已整個移除。
//
// 演算法照 2026-11 用八～十一月真實資料驗過的參考腳本移植：
//   43 筆靠「末五碼＋金額」、8 筆靠「備註單號＋金額」對上。

import type { ARWithSchedules, ARPaymentMethod, BankTransaction, CustomOrder } from "@/lib/types";
import { BANK_ACCOUNTS, type BankAccount } from "@/lib/remittance";

/**
 * ✅ 一致與分筆入帳的金額容許差：有末五碼或單號佐證時，差 $50 內算一致
 * （客人匯款常被扣 15～30 元手續費）。
 */
export const AMOUNT_TOLERANCE = 50;
/**
 * 🔍 可能是：沒有末五碼／單號佐證，只靠金額＋日期推測，所以金額必須完全相同
 * （差 < $1）。放寬到 $50 的話，常見整數金額（例 $3,000）會互相誤認。
 */
export const POSSIBLE_AMOUNT_TOLERANCE = 1;
/** 區間最後幾天記的收款，銀行可能隔個營業日才入帳 → 不列 ❌，改列「可能跨月入帳」 */
export const CROSS_PERIOD_DAYS = 2;
/** 「可能是」：沒有末五碼／單號佐證時，系統收款日與銀行入帳日最多差幾天 */
export const POSSIBLE_DAY_WINDOW = 5;
/** 分筆入帳：同一個末五碼／單號的幾筆入帳，彼此最多相隔幾天還算同一次付款 */
export const SPLIT_DAY_WINDOW = 14;
/** 分筆入帳最多嘗試幾筆的組合（2^n 種組合，避免畫面卡住） */
const SPLIT_MAX_ROWS = 12;

export type VerifyCategory =
  | "missing_in_system" // ❗ 銀行有入帳、系統沒記錄
  | "amount_mismatch" // ⚠️ 金額不符
  | "possible" // 🔍 可能是（需老闆確認）
  | "ok" // ✅ 一致
  | "non_order"; // ⚪ 非訂單款

/** 系統端一筆「已記收款」的分期，附上對帳需要的衍生欄位 */
export interface VerifySchedule {
  scheduleId: string;
  arId: string;
  caseId: string;
  label: string;
  receivedAmount: number;
  /** YYYY-MM-DD */
  receivedDate: string;
  paymentMethod: ARPaymentMethod;
  receivingAccountId: string;
  /** 有效末五碼：paymentRef，沒有就從備註裡找獨立的 5 位數 */
  ref: string;
  clientName: string;
  orderNumbers: string[];
}

export interface BankVerifyRow {
  tx: BankTransaction;
  category: VerifyCategory;
  /** 對上的依據，例「末五碼＋金額」「分筆入帳」「內部帳戶轉入」 */
  reason: string;
  /** 備註裡匯款帳號的末五碼（自家帳戶轉入時仍會填，但不拿來比對） */
  last5: string;
  isInternal: boolean;
  /** 自家帳戶轉入時，是 BANK_ACCOUNTS 的哪個帳戶（顯示用；非自家為空字串） */
  ownAccountId: string;
  /** 備註裡的訂單編號（S882 / P1455 / L019） */
  orderNumber: string;
  /** 從備註單號找到的訂單客戶名（系統沒記錄時也能看出是誰） */
  orderClientName: string;
  /** ✅／🔍：對上的分期；⚠️：金額對不上的候選分期 */
  schedules: VerifySchedule[];
  /** 已知的應收帳款（❗ 時用來連到應收明細頁） */
  arId: string;
  note: string;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface BankVerifyResult {
  rows: BankVerifyRow[];
  /** ❌ 系統有記、銀行沒看到 */
  systemOnly: VerifySchedule[];
  /** 收款日落在明細涵蓋區間的最後幾天、銀行還沒看到：可能下一期才入帳，只提示不算 ❌ */
  crossPeriod: VerifySchedule[];
  /** 上傳檔案涵蓋的日期區間（相連的已合併） */
  coverage: DateRange[];
  /** 涵蓋區間之間的空檔（例：上傳了八月、十月，缺九月） */
  gaps: DateRange[];
  debitCount: number;
  dateFrom: string;
  dateTo: string;
}

type OrderLite = Pick<CustomOrder, "orderId" | "orderNumber" | "caseId" | "clientName">;

const nfkc = (s: string | undefined | null): string => (s ?? "").normalize("NFKC");

// ── 從字串擷取 ───────────────────────────────────────────────

/** 備註裡的匯款帳號（銀行代碼＋帳號，10～19 位數）。連續數字優先，找不到再容許中間夾空白或連字號。 */
export function extractMemoAccount(memo: string): string {
  const text = nfkc(memo);
  const contiguous = text.match(/\d{10,19}/);
  if (contiguous) return contiguous[0];
  const spaced = text.match(/\d[\d \-]{8,}\d/);
  if (!spaced) return "";
  const digits = spaced[0].replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 19 ? digits : "";
}

export function extractLast5(memo: string): string {
  const acct = extractMemoAccount(memo);
  return acct ? acct.slice(-5) : "";
}

/**
 * 訂單編號：P／S／L 加 3～6 位數。全形先轉半形；字母後的多餘前導零去掉，
 * 但至少保留 3 位數（P001455 → P1455、S0882 → S882、L019 不變）。
 * 先照原樣找，找不到再去掉空白找（客人會打成「S 8 7 8」）。
 */
export function extractOrderNumber(text: string): string {
  const upper = nfkc(text).toUpperCase();
  // 前面不能緊貼英文字母（「CHANG PS 0912…」去空白後的 PS09…不是單號），
  // 後面不能再接數字（「L12345678901」是帳號不是單號）。前面可以接數字：
  // 「帳號 S 8 7 8」去空白後單號正好緊貼在帳號後面。
  const re = /(?<![A-Z])([PSL])0*(\d{3,6})(?!\d)/;
  const m = upper.match(re) ?? upper.replace(/\s+/g, "").match(re);
  return m ? `${m[1]}${m[2]}` : "";
}

/** 分期的有效末五碼：paymentRef 優先，舊資料從備註裡找獨立的 5 位數 */
export function scheduleRef(paymentRef: string, notes: string): string {
  const ref = nfkc(paymentRef).trim();
  if (ref) return ref;
  const m = nfkc(notes).match(/(?<!\d)(\d{5})(?!\d)/);
  return m ? m[1] : "";
}

const digitsOf = (s: string): string => nfkc(s).replace(/\D/g, "");

function sameAccount(a: string, b: string): boolean {
  if (!a || !b) return false;
  // 永豐帳號有時前面補 0、有時含分行碼，用「一方是另一方的結尾」比對
  return a.endsWith(b) || b.endsWith(a);
}

/**
 * 銀行 CSV 第 1 行的帳號文字（例「168-018-0008591-8【大戶】新台幣」）對應到哪些收款帳戶 id。
 * 同一個帳號在 BANK_ACCOUNTS 可能有兩個 id（台新／台新簡式），全部回傳。
 */
export function accountIdsForCsv(
  accountText: string,
  accounts: readonly BankAccount[] = BANK_ACCOUNTS,
): string[] {
  const m = nfkc(accountText).match(/\d[\d\-]{6,}\d/);
  const digits = m ? m[0].replace(/\D/g, "") : "";
  if (!digits) return [];
  return accounts.filter((a) => sameAccount(digitsOf(a.accountNumber), digits)).map((a) => a.id);
}

/** 自家帳戶末五碼 → 帳戶 id（同末五碼的第一個） */
function ownLast5Map(accounts: readonly BankAccount[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of accounts) {
    const last5 = digitsOf(a.accountNumber).slice(-5);
    if (last5.length === 5 && !map.has(last5)) map.set(last5, a.id);
  }
  return map;
}

/** 摘要或備註一看就不是客人付款：利息、大戶回饋、刷退／退款 */
const NON_ORDER_RE = /利息|回饋|退款|刷退|退刷|紅利|現金回饋/;

export function isNonOrderCredit(tx: BankTransaction): boolean {
  return NON_ORDER_RE.test(nfkc(tx.description)) || NON_ORDER_RE.test(nfkc(tx.memo));
}

// ── 系統端資料 ───────────────────────────────────────────────

/**
 * 把應收（含分期）與訂製訂單攤平成對帳用的分期清單。
 * AR 的 clientNameSnapshot 常是空的，客戶名改從同案件的訂單補；
 * 訂單編號靠 caseId 與 AR 的 relatedOrderIds（B2B 合併請款）連過去。
 */
export function buildVerifySchedules(ars: ARWithSchedules[], orders: OrderLite[]): VerifySchedule[] {
  const byCase = new Map<string, OrderLite[]>();
  const byId = new Map<string, OrderLite>();
  for (const o of orders) {
    byId.set(o.orderId, o);
    if (!o.caseId) continue;
    byCase.set(o.caseId, [...(byCase.get(o.caseId) ?? []), o]);
  }

  return ars.flatMap((ar) => {
    const related = (ar.relatedOrderIds ?? []).map((id) => byId.get(id)).filter((o): o is OrderLite => !!o);
    const linked = [...(ar.caseId ? byCase.get(ar.caseId) ?? [] : []), ...related];
    const orderNumbers = [...new Set(linked.map((o) => extractOrderNumber(o.orderNumber)).filter(Boolean))];
    const clientName = ar.clientNameSnapshot || linked.find((o) => o.clientName)?.clientName || "";
    return ar.schedules.map((s) => ({
      scheduleId: s.scheduleId,
      arId: ar.arId,
      caseId: ar.caseId,
      label: s.label,
      receivedAmount: s.receivedAmount || 0,
      receivedDate: (s.receivedDate ?? "").slice(0, 10),
      paymentMethod: s.paymentMethod,
      receivingAccountId: s.receivingAccountId ?? "",
      ref: scheduleRef(s.paymentRef ?? "", s.notes ?? ""),
      clientName,
      orderNumbers,
    }));
  });
}

// ── 比對 ───────────────────────────────────────────────────

function dayDiff(a: string, b: string): number {
  const ta = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const tb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / 86_400_000;
}

function addDays(date: string, days: number): string {
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** 把各檔的日期區間合併（重疊或相鄰的接起來），並找出中間的空檔 */
export function mergeRanges(ranges: DateRange[]): { coverage: DateRange[]; gaps: DateRange[] } {
  const sorted = ranges.filter((r) => r.from && r.to).sort((a, b) => a.from.localeCompare(b.from));
  const coverage: DateRange[] = [];
  for (const r of sorted) {
    const last = coverage[coverage.length - 1];
    if (last && r.from <= addDays(last.to, 1)) {
      coverage[coverage.length - 1] = { from: last.from, to: r.to > last.to ? r.to : last.to };
    } else {
      coverage.push({ ...r });
    }
  }
  const gaps = coverage.slice(1).map((r, i) => ({ from: addDays(coverage[i].to, 1), to: addDays(r.from, -1) }));
  return { coverage, gaps };
}

function feeNote(credit: number, recorded: number): string {
  const diff = recorded - credit;
  if (diff > 0) return `少 $${diff.toLocaleString()}（手續費）`;
  if (diff < 0) return `多 $${(-diff).toLocaleString()}`;
  return "";
}

interface Working {
  tx: BankTransaction;
  credit: number;
  last5: string;
  isInternal: boolean;
  orderNumber: string;
  orderClientName: string;
  orderArIds: string[];
  /** 末五碼或單號有指到東西（決定是 ⚠️ 還是走金額＋日期） */
  refCands: VerifySchedule[];
  orderCands: VerifySchedule[];
  ownAccountId: string;
  result: Omit<BankVerifyRow, "tx" | "last5" | "isInternal" | "ownAccountId" | "orderNumber" | "orderClientName"> | null;
}

function uniqueSchedules(list: VerifySchedule[]): VerifySchedule[] {
  return [...new Map(list.map((s) => [s.scheduleId, s])).values()];
}

/** 從候選裡挑一筆未被用掉、金額最接近且在容許範圍內的分期 */
function pickClosest(cands: VerifySchedule[], used: Set<string>, credit: number): VerifySchedule | null {
  const ok = cands
    .filter((s) => !used.has(s.scheduleId) && Math.abs(s.receivedAmount - credit) <= AMOUNT_TOLERANCE)
    .sort((a, b) => Math.abs(a.receivedAmount - credit) - Math.abs(b.receivedAmount - credit));
  return ok[0] ?? null;
}

/** 在幾筆入帳裡找一個組合（≥2 筆、彼此相隔 ≤14 天），總額與目標差 ≤50 */
function findSplitSubset(rows: Working[], target: number): Working[] | null {
  const pool = rows.slice(0, SPLIT_MAX_ROWS);
  let best: Working[] | null = null;
  for (let mask = 1; mask < 1 << pool.length; mask++) {
    const picked = pool.filter((_, i) => mask & (1 << i));
    if (picked.length < 2) continue;
    const dates = picked.map((w) => w.tx.txDate).sort();
    if (dayDiff(dates[0], dates[dates.length - 1]) > SPLIT_DAY_WINDOW) continue;
    const sum = picked.reduce((acc, w) => acc + w.credit, 0);
    if (Math.abs(sum - target) > AMOUNT_TOLERANCE) continue;
    if (!best || picked.length < best.length) best = picked;
  }
  return best;
}

export interface VerifyOptions {
  /** 上傳的 CSV 帳號文字（第 1 行），用來篩「系統有記、銀行沒看到」 */
  accountTexts?: string[];
  /** 各檔涵蓋的日期區間；沒給就用交易最早～最晚日 */
  ranges?: DateRange[];
  /** 老闆自己的帳戶（預設 BANK_ACCOUNTS） */
  ownAccounts?: readonly BankAccount[];
}

export function verifyBankTransactions(
  transactions: BankTransaction[],
  schedules: VerifySchedule[],
  orders: OrderLite[],
  options: VerifyOptions = {},
): BankVerifyResult {
  const ownAccounts = options.ownAccounts ?? BANK_ACCOUNTS;
  const ownLast5 = ownLast5Map(ownAccounts);
  const received = schedules.filter((s) => s.receivedAmount > 0);
  const used = new Set<string>();

  const orderByNumber = new Map<string, OrderLite>();
  for (const o of orders) {
    const no = extractOrderNumber(o.orderNumber);
    if (no && !orderByNumber.has(no)) orderByNumber.set(no, o);
  }
  const arIdsByCase = new Map<string, string[]>();
  for (const s of schedules) {
    const list = arIdsByCase.get(s.caseId) ?? [];
    if (!list.includes(s.arId)) arIdsByCase.set(s.caseId, [...list, s.arId]);
  }

  const debitCount = transactions.filter((t) => !t.credit && t.debit).length;
  const dates = transactions.map((t) => t.txDate).sort();
  const { coverage, gaps } = mergeRanges(
    options.ranges ?? (dates.length ? [{ from: dates[0], to: dates[dates.length - 1] }] : []),
  );
  const dateFrom = coverage[0]?.from ?? "";
  const dateTo = coverage[coverage.length - 1]?.to ?? "";

  const nonOrder: BankVerifyRow[] = [];
  const work: Working[] = [];
  for (const tx of transactions) {
    if (!tx.credit || tx.credit <= 0) continue;
    const memoAcct = extractMemoAccount(tx.memo);
    const rawLast5 = memoAcct ? memoAcct.slice(-5) : "";
    const isInternal = !!rawLast5 && ownLast5.has(rawLast5);
    const orderNumber = extractOrderNumber(tx.memo);
    const order = orderNumber ? orderByNumber.get(orderNumber) : undefined;
    const base = {
      tx,
      last5: rawLast5,
      isInternal,
      ownAccountId: isInternal ? ownLast5.get(rawLast5) ?? "" : "",
      orderNumber,
      orderClientName: order?.clientName ?? "",
    };
    if (isNonOrderCredit(tx)) {
      nonOrder.push({ ...base, category: "non_order", reason: tx.description || "非訂單款", schedules: [], arId: "", note: "" });
      continue;
    }
    // 自家帳戶轉入的末五碼不拿來比對（顯示用的 last5 仍保留原值）
    const last5 = isInternal ? "" : rawLast5;
    work.push({
      ...base,
      credit: tx.credit,
      orderArIds: order ? arIdsByCase.get(order.caseId) ?? [] : [],
      refCands: last5 ? received.filter((s) => s.ref === last5) : [],
      orderCands: orderNumber && order ? received.filter((s) => s.orderNumbers.includes(orderNumber)) : [],
      result: null,
    });
  }

  const settle = (w: Working, s: VerifySchedule, reason: string, category: VerifyCategory) => {
    used.add(s.scheduleId);
    w.result = { category, reason, schedules: [s], arId: s.arId, note: feeNote(w.credit, s.receivedAmount) };
  };

  // 1. 末五碼＋金額（最強的證據先吃）
  for (const w of work) {
    const s = pickClosest(w.refCands, used, w.credit);
    if (s) settle(w, s, "末五碼＋金額", "ok");
  }
  // 2. 備註單號＋金額
  for (const w of work) {
    if (w.result) continue;
    const s = pickClosest(w.orderCands, used, w.credit);
    if (s) settle(w, s, "備註單號＋金額", "ok");
  }
  // 3. 分筆入帳：同一個末五碼／單號的幾筆加起來等於一筆分期
  const pending = () => work.filter((w) => !w.result && (w.refCands.length > 0 || w.orderCands.length > 0));
  const candidatesInPending = uniqueSchedules(pending().flatMap((w) => [...w.refCands, ...w.orderCands]));
  for (const s of candidatesInPending) {
    if (used.has(s.scheduleId)) continue;
    const related = pending().filter((w) => w.refCands.includes(s) || w.orderCands.includes(s));
    if (related.length < 2) continue;
    const subset = findSplitSubset(related, s.receivedAmount);
    if (!subset) continue;
    used.add(s.scheduleId);
    const total = subset.reduce((acc, w) => acc + w.credit, 0);
    const fee = feeNote(total, s.receivedAmount);
    const note = `${subset.length} 筆合計 $${total.toLocaleString()}${fee ? `，${fee}` : ""}`;
    for (const w of subset) {
      w.result = { category: "ok", reason: "分筆入帳", schedules: [s], arId: s.arId, note };
    }
  }
  // 4. 末五碼或單號有指到東西、但金額對不上 → ⚠️
  for (const w of work) {
    if (w.result) continue;
    const cands = uniqueSchedules([...w.refCands, ...w.orderCands]);
    const free = cands
      .filter((s) => !used.has(s.scheduleId))
      .sort((a, b) => Math.abs(a.receivedAmount - w.credit) - Math.abs(b.receivedAmount - w.credit));
    if (free.length > 0) {
      // 吃掉金額最接近的那筆：差額只在 ⚠️ 顯示，不要同一筆收款又出現在 ❌
      const s = free[0];
      used.add(s.scheduleId);
      const diff = w.credit - s.receivedAmount;
      w.result = {
        category: "amount_mismatch",
        reason: w.refCands.length > 0 ? "末五碼對上、金額不符" : "備註單號對上、金額不符",
        schedules: [s],
        arId: s.arId,
        note: `銀行 ${diff > 0 ? "多" : "少"} $${Math.abs(diff).toLocaleString()}`,
      };
    } else if (cands.length > 0) {
      // 這位客人記過的收款都已對給別筆入帳 → 這筆多半是還沒記的另一期（例：尾款）
      w.result = {
        category: "missing_in_system",
        reason: "客人認得、這筆沒記錄",
        schedules: [],
        arId: cands[0].arId,
        note: "同末五碼／單號的其他收款已對上，這筆可能是尚未記錄的另一期或重複匯款",
      };
    } else if (w.orderArIds.length > 0) {
      // 單號找得到應收，但那張應收還沒有任何一筆已收款
      w.result = {
        category: "missing_in_system",
        reason: "備註單號對上、應收沒有收款紀錄",
        schedules: [],
        arId: w.orderArIds[0],
        note: "",
      };
    }
  }
  // 5. 沒有末五碼／單號佐證：金額完全相同＋日期 ±5 天只剩唯一一筆 → 🔍（不自動認定）
  //    分期記了別的末五碼，就不是這筆（客人帳號不同）。
  //    自家帳戶轉入也走同一套嚴格規則（老闆 2026-11 決定）：客人常先匯到陳涵儀等
  //    自己的帳戶、再轉進大戶。那筆的匯款人是老闆自己，看不出客人末五碼，
  //    所以不做末五碼排除；對不到或不只一筆就歸 ⚪，不吃掉任何收款。
  for (const w of work) {
    if (w.result) continue;
    const customerLast5 = w.isInternal ? "" : w.last5;
    const near = received.filter(
      (s) =>
        !used.has(s.scheduleId) &&
        !(s.ref && customerLast5 && s.ref !== customerLast5) &&
        Math.abs(s.receivedAmount - w.credit) < POSSIBLE_AMOUNT_TOLERANCE &&
        !!s.receivedDate &&
        dayDiff(s.receivedDate, w.tx.txDate) <= POSSIBLE_DAY_WINDOW,
    );
    if (w.isInternal) {
      if (near.length === 1) {
        settle(w, near[0], "可能是（自己帳戶轉入）", "possible");
      } else {
        w.result = {
          category: "non_order",
          reason: "內部帳戶轉入",
          schedules: [],
          arId: "",
          note: near.length > 1 ? `金額相同 ${near.length} 筆` : "",
        };
      }
    } else if (near.length === 1) {
      settle(w, near[0], "金額＋日期相近（需確認）", "possible");
    } else if (near.length > 1) {
      w.result = {
        category: "possible",
        reason: `金額相同 ${near.length} 筆（需人工判斷）`,
        schedules: near,
        arId: "",
        note: "",
      };
    } else {
      w.result = { category: "missing_in_system", reason: "系統查無", schedules: [], arId: "", note: "" };
    }
  }

  const rows: BankVerifyRow[] = [
    ...work.map((w) => ({
      tx: w.tx,
      last5: w.last5,
      isInternal: w.isInternal,
      ownAccountId: w.ownAccountId,
      orderNumber: w.orderNumber,
      orderClientName: w.orderClientName,
      ...(w.result as NonNullable<Working["result"]>),
    })),
    ...nonOrder,
  ].sort((a, b) => `${a.tx.txDate}T${a.tx.txTime}`.localeCompare(`${b.tx.txDate}T${b.tx.txTime}`));

  // ❌ 系統有記、銀行沒看到
  const csvAccountIds = new Set((options.accountTexts ?? []).flatMap((t) => accountIdsForCsv(t, ownAccounts)));
  const unseen = received
    .filter(
      (s) =>
        !used.has(s.scheduleId) &&
        !!s.receivedDate &&
        (s.paymentMethod === "transfer" || !s.paymentMethod) &&
        (!s.receivingAccountId || csvAccountIds.has(s.receivingAccountId)),
    )
    .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));
  // 只看明細真正涵蓋的日期（缺月份的空檔不算銀行沒看到）
  const coveringRange = (s: VerifySchedule) =>
    coverage.find((r) => s.receivedDate >= r.from && s.receivedDate <= r.to);
  const isNearEnd = (s: VerifySchedule, r: DateRange) =>
    s.receivedDate > addDays(r.to, -CROSS_PERIOD_DAYS);
  const systemOnly = unseen.filter((s) => {
    const r = coveringRange(s);
    return !!r && !isNearEnd(s, r);
  });
  const crossPeriod = unseen.filter((s) => {
    const r = coveringRange(s);
    return !!r && isNearEnd(s, r);
  });

  return { rows, systemOnly, crossPeriod, coverage, gaps, debitCount, dateFrom, dateTo };
}

/** 備註裡的長串數字（帳號）只留末五碼：7000024411500765241 → …65241 */
export function maskMemo(memo: string): string {
  // 連續 8 位以上，或夾空白／連字號但總共 ≥10 位數字，都當帳號遮掉
  // （一段裡有連續 8 位以上就只遮那幾段，以免把帳號後面的其他數字併進末五碼）
  return nfkc(memo).replace(/\d[\d \-]*\d/g, (run) => {
    if (/\d{8,}/.test(run)) return run.replace(/\d{8,}/g, (d) => `…${d.slice(-5)}`);
    const digits = run.replace(/\D/g, "");
    return digits.length >= 10 ? `…${digits.slice(-5)}` : run;
  });
}
