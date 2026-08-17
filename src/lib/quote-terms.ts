/** 稅金聲明行「已含 ↔ 未含」對調（勾選=已含、取消=未含）；找不到標準行就原字串回傳。 */
function swapTaxLine(terms: string, taxIncluded: boolean): string {
  return terms.replace(
    /本報價(?:已|未)含營業稅金/g,
    `本報價${taxIncluded ? "已" : "未"}含營業稅金`,
  );
}

/** 重新編號：每個非空行開頭的「N.」序號依序改成 1. 2. 3.…（空行保留、序號後接不斷行空白）。 */
function renumberTerms(terms: string): string {
  let n = 0;
  return terms
    .split("\n")
    .map((line) => {
      const stripped = line.replace(/^\s*\d+\.\s*/, "");
      if (stripped.trim() === "") return line;
      n += 1;
      return `${n}. ${stripped}`;
    })
    .join("\n");
}

/**
 * 依「營業稅」勾選狀態調整報價條款：
 * - 含稅：只把稅金行改回「本報價已含營業稅金」；其他行一律不動（逾期罰則不還原）。
 * - 未稅：移除「逾期罰則」整行、把稅金行改成「未含」、並重新編號。
 *
 * 只動標準的稅金行與逾期罰則行；付款方式 / 訂金 / 履約期限等手動編輯內容一律保留。
 * 稅金行或逾期罰則行若被刪除或改寫過（比對不到），該部分就不處理，不新增、不亂插。
 */
export function applyTaxModeToTerms(terms: string, taxIncluded: boolean): string {
  if (taxIncluded) {
    return swapTaxLine(terms, true);
  }
  const withoutPenalty = terms
    .split("\n")
    .filter((line) => !line.includes("逾期罰則"))
    .join("\n");
  return renumberTerms(swapTaxLine(withoutPenalty, false));
}
