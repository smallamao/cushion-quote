/**
 * 多方案報價判定。
 *
 * 老闆的做法：同一份報價放多個方案（標準／高支撐兩檔、乳膠加價選項…）給客人選，
 * 客人定案後再開一個「確認方案」的新版本。多方案那版的「總額」是所有方案相加，
 * 對客人是個嚇人的假數字（六月起 19 張多方案只成交 2 張），所以：
 * - PDF 不顯示合計，改一句「各方案金額如上，請擇一」
 * - 系統內部以「最低方案金額」顯示與統計
 * - 不可直接改「已接受」或產生簽署連結，要先建確認方案的新版本
 */

export interface OptionLineLike {
  itemName?: string;
  spec?: string;
  lineAmount?: number;
  isCostItem?: boolean;
  showOnQuote?: boolean;
}

export interface OptionMeta {
  isMultiOption: boolean;
  optionMinAmount: number;
}

const ADDON_PATTERN = /升級|加價選項|加購|選配|加價/;

/** 品名第一行（去空白）當作「同一品項的不同檔」的分組鍵 */
function optionGroupKey(line: OptionLineLike): string {
  return (line.itemName ?? "").split("\n")[0].replace(/\s+/g, "").trim();
}

/** 對外顯示的品項：不是工本費、也沒被設為不顯示 */
function isVisibleLine(line: OptionLineLike): boolean {
  return line.showOnQuote !== false && !line.isCostItem;
}

export function isAddonLine(line: OptionLineLike): boolean {
  return ADDON_PATTERN.test(`${line.itemName ?? ""} ${line.spec ?? ""}`);
}

/**
 * 依明細推算多方案旗標與最低方案金額：
 * - 對外顯示的非工本費品項，依品名第一行分組；同組 ≥2 行＝有多檔
 * - 有加價選項行也算多方案（客人未必加購，合計仍失真）
 * - 最低方案金額＝各組取最低金額後加總；加價選項不計
 */
export function deriveOptionMeta(lines: OptionLineLike[]): OptionMeta {
  const visible = lines.filter(isVisibleLine);
  const addons = visible.filter(isAddonLine);
  const regular = visible.filter((l) => !isAddonLine(l));

  const groups = new Map<string, number[]>();
  for (const line of regular) {
    const key = optionGroupKey(line);
    const amount = Number(line.lineAmount) || 0;
    groups.set(key, [...(groups.get(key) ?? []), amount]);
  }

  const hasTiers = [...groups.values()].some((amounts) => amounts.length >= 2);
  const optionMinAmount = [...groups.values()].reduce((sum, amounts) => sum + Math.min(...amounts), 0);

  return {
    isMultiOption: hasTiers || addons.length > 0,
    optionMinAmount: Math.round(optionMinAmount),
  };
}

const OPTION_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/**
 * PDF 項次欄要印的方案標籤，回傳與輸入等長的陣列（null＝沿用數字項次）。
 *
 * 項次印「1、2」時客人會讀成「兩樣商品各買一件」：S987 彭桂香把兩檔
 * $20,000 與 $21,500 加成 $41,000，直接放棄成交。同組多檔改印
 * 「方案一／方案二」，加價選項印「加購」，讓每一列自己說清楚是替代還是加買。
 */
export function deriveOptionLabels(lines: OptionLineLike[]): (string | null)[] {
  const groupSizes = new Map<string, number>();
  for (const line of lines) {
    if (!isVisibleLine(line) || isAddonLine(line)) continue;
    const key = optionGroupKey(line);
    groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
  }

  const used = new Map<string, number>();
  return lines.map((line) => {
    if (!isVisibleLine(line)) return null;
    if (isAddonLine(line)) return "加購";

    const key = optionGroupKey(line);
    if ((groupSizes.get(key) ?? 0) < 2) return null;

    const ordinal = (used.get(key) ?? 0) + 1;
    used.set(key, ordinal);
    return `方案${OPTION_NUMERALS[ordinal - 1] ?? ordinal}`;
  });
}

/** 列表／統計用：多方案顯示最低方案金額，其餘用版本總額 */
export function displayAmountOf(version: {
  totalAmount: number;
  isMultiOption?: boolean;
  optionMinAmount?: number;
}): number {
  if (version.isMultiOption && (version.optionMinAmount ?? 0) > 0) return version.optionMinAmount!;
  return version.totalAmount;
}

/**
 * PDF 多方案時取代合計區塊的說明句。
 *
 * 多方案不顯示小計／稅額／總額，表上看到的是**各行的未稅金額**。
 * 因此含稅單也必須寫「未含營業稅、另加 N%」——寫成「已含」會讓客人以為
 * 方案價就是最終價，請款時才發現多 5%（禾雅窗飾 2026-09-14 發現）。
 */
export function multiOptionNote(includeTax: boolean, taxRate = 5): string {
  const base = "本報價為多方案報價，各方案金額如上，請擇一；";
  return includeTax
    ? `${base}上列金額均未含營業稅，結算時另加 ${taxRate}%。`
    : `${base}金額未含營業稅。`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 差額呈現（2026-10-30）
 *
 * 多方案被客人讀成加總已經發生兩次（S987 彭桂香 $20,000＋$21,500 讀成 $41,000
 * 後放棄；2026-10-29 又一次）。2026-09-09 加的粗框警語證明無效——問題不是客人
 * 沒看到字，是「金額」欄裡上下並列兩個絕對金額，那是「兩樣東西各買一件」的通用讀法。
 *
 * 所以同一組方案只印最低那檔的絕對金額，其餘印「升級 +$X」：紙上只剩一個絕對
 * 金額，相加也沒有第二個數字可加，而把差額加上去剛好等於該檔的正確價格。
 *
 * 例外是價差大的那一類（164 張裡約 8%）：S1008 蔡昀蓁「接縫爆線修補 $3,500」與
 * 「整張換皮 $7,800」不是同一件東西的等級差，寫「升級 +$4,300」會讓客人以為
 * 修補做完再補差額就能換皮。這類維持原本的絕對金額呈現。
 * ──────────────────────────────────────────────────────────────────────────── */

/** 超過這個價差倍數就不是「升級」而是不同做法，不可用差額呈現 */
export const DELTA_MAX_RATIO = 2;

export interface PresentationLineLike extends OptionLineLike {
  qty?: number;
  unitPrice?: number;
}

export type OptionRowKind = "tier" | "addon" | "normal";

export interface OptionRow {
  kind: OptionRowKind;
  /** 項次欄要印的字；null＝沿用數字項次 */
  label: string | null;
  /** 這一組是否用差額呈現（false＝維持絕對金額，價差過大的那類） */
  useDelta: boolean;
  /** 是否為該組的基準檔（印絕對金額的那一列） */
  isBase: boolean;
  /** 該組基準檔的標籤——差額是「與這一案相比」。基準檔＝金額最低者，
      品項順序若是高價在前就不是「方案一」，所以不可在版面端寫死 */
  baseLabel: string | null;
  /** 與基準檔的金額差；基準檔為 0 */
  deltaAmount: number;
  /** 與基準檔的單價差；同組數量不一致時為 null（無法逐件比較） */
  deltaUnitPrice: number | null;
  /** 是否為該組第一列——要在它上面插入分組標題 */
  groupStart: boolean;
  /** 同組共幾檔 */
  groupSize: number;
}

export interface OptionPresentation {
  rows: OptionRow[];
  hasDeltaGroup: boolean;
  hasAbsoluteGroup: boolean;
  hasAddon: boolean;
  /** 最低方案合計＝各組最低檔＋一般品項（不含加購） */
  baseTotal: number;
  /** 所有方案組都用差額呈現時才可顯示合計，否則合計講不清楚是哪一案 */
  canShowBaseTotal: boolean;
}

interface GroupInfo {
  rows: number[];
  minAmount: number;
  maxAmount: number;
  baseIndex: number;
  baseUnitPrice: number;
  sameQty: boolean;
  useDelta: boolean;
}

/**
 * 算出 PDF 表格每一列要怎麼印。
 *
 * 分組與加購判定沿用 deriveOptionMeta／deriveOptionLabels 的規則（品名第一行為
 * 分組鍵、ADDON_PATTERN 為加購），差別只在多回傳差額與分組邊界。
 */
export function deriveOptionPresentation(lines: PresentationLineLike[]): OptionPresentation {
  const amountOf = (l: PresentationLineLike) => Number(l.lineAmount) || 0;

  // 先分組：只有對外顯示、非加購的品項才參與分檔
  const groups = new Map<string, GroupInfo>();
  lines.forEach((line, idx) => {
    if (!isVisibleLine(line) || isAddonLine(line)) return;
    const key = optionGroupKey(line);
    const g = groups.get(key);
    if (g) g.rows.push(idx);
    else
      groups.set(key, {
        rows: [idx],
        minAmount: 0,
        maxAmount: 0,
        baseIndex: idx,
        baseUnitPrice: 0,
        sameQty: true,
        useDelta: false,
      });
  });

  for (const g of groups.values()) {
    const amounts = g.rows.map((i) => amountOf(lines[i]));
    g.minAmount = Math.min(...amounts);
    g.maxAmount = Math.max(...amounts);
    // 基準檔＝金額最低者，同價時取先出現的，確保差額不會是負數
    g.baseIndex = g.rows[amounts.indexOf(g.minAmount)];
    g.baseUnitPrice = Number(lines[g.baseIndex].unitPrice) || 0;
    const baseQty = Number(lines[g.baseIndex].qty) || 0;
    g.sameQty = g.rows.every((i) => (Number(lines[i].qty) || 0) === baseQty);
    // 價差過大＝不同做法而非升級，維持絕對金額
    g.useDelta = g.rows.length >= 2 && g.minAmount > 0 && g.maxAmount / g.minAmount <= DELTA_MAX_RATIO;
  }

  const seenGroup = new Set<string>();
  let seenAddon = false;
  const used = new Map<string, number>();

  // 先配方案標籤，才知道各組的基準檔叫什麼（基準檔＝金額最低，不一定是方案一）
  const tierLabels = new Map<number, string>();
  lines.forEach((line, idx) => {
    if (!isVisibleLine(line) || isAddonLine(line)) return;
    const key = optionGroupKey(line);
    const g = groups.get(key);
    if (!g || g.rows.length < 2) return;
    const ordinal = (used.get(key) ?? 0) + 1;
    used.set(key, ordinal);
    tierLabels.set(idx, `方案${OPTION_NUMERALS[ordinal - 1] ?? ordinal}`);
  });

  const rows: OptionRow[] = lines.map((line, idx) => {
    const blank: OptionRow = {
      kind: "normal",
      label: null,
      useDelta: false,
      isBase: false,
      baseLabel: null,
      deltaAmount: 0,
      deltaUnitPrice: null,
      groupStart: false,
      groupSize: 1,
    };

    if (!isVisibleLine(line)) return blank;

    if (isAddonLine(line)) {
      const first = !seenAddon;
      seenAddon = true;
      return { ...blank, kind: "addon", label: "加購", groupStart: first };
    }

    const key = optionGroupKey(line);
    const g = groups.get(key);
    if (!g || g.rows.length < 2) return blank;

    const first = !seenGroup.has(key);
    seenGroup.add(key);

    const isBase = idx === g.baseIndex;
    return {
      kind: "tier",
      label: tierLabels.get(idx) ?? null,
      useDelta: g.useDelta,
      isBase,
      baseLabel: tierLabels.get(g.baseIndex) ?? null,
      deltaAmount: isBase ? 0 : amountOf(line) - g.minAmount,
      deltaUnitPrice:
        isBase || !g.sameQty ? null : (Number(line.unitPrice) || 0) - g.baseUnitPrice,
      groupStart: first,
      groupSize: g.rows.length,
    };
  });

  const tierGroups = [...groups.values()].filter((g) => g.rows.length >= 2);
  const normalTotal = rows.reduce(
    (sum, r, idx) => (r.kind === "normal" && isVisibleLine(lines[idx]) ? sum + amountOf(lines[idx]) : sum),
    0,
  );
  const baseTotal = tierGroups.reduce((sum, g) => sum + g.minAmount, normalTotal);

  return {
    rows,
    hasDeltaGroup: tierGroups.some((g) => g.useDelta),
    hasAbsoluteGroup: tierGroups.some((g) => !g.useDelta),
    hasAddon: seenAddon,
    baseTotal: Math.round(baseTotal),
    canShowBaseTotal: tierGroups.length > 0 && tierGroups.every((g) => g.useDelta),
  };
}

/**
 * 差額呈現時取代 multiOptionNote 的說明句。
 *
 * 稅的講法必須與 multiOptionNote 一致：含稅單也要寫「未含營業稅、另加 N%」，
 * 寫成「已含」會讓客人以為方案價就是最終價，請款時才發現多 5%
 * （禾雅窗飾 2026-09-14 發現）。
 */
export function deltaOptionNote(includeTax: boolean, taxRate = 5): string {
  const base = "各方案請擇一，表上只標示與最低方案的差額，金額不需相加；";
  return includeTax
    ? `${base}上列金額均未含營業稅，結算時另加 ${taxRate}%。`
    : `${base}金額未含營業稅。`;
}
