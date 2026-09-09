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

/** PDF 多方案時取代合計區塊的說明句 */
export function multiOptionNote(includeTax: boolean): string {
  return `本報價為多方案報價，各方案金額如上，請擇一；金額${includeTax ? "已含" : "未含"}營業稅。`;
}
