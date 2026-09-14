/**
 * Notion 報價頁的標題＝該頁的唯一鍵（同步時以標題比對既有頁）。
 *
 * 散客標題帶 S 編號（「S993 鄭鳳珍」），新案子會拿到新編號，天然唯一。
 * B2B 沒有 S 編號，標題只剩公司名 → 同一家公司的每個案子都會覆蓋前一頁
 * （禾雅窗飾報過 5 次，Notion 上只剩最後一次，2026-09-14 發現）。
 * 因此沒有 S 編號時補上案名，讓每個案子各自成頁。
 */
export function buildNotionTitle(
  clientName: string,
  projectName: string,
  quoteName: string,
): string {
  const base = (clientName ?? "").trim();
  if (!base || /^S\d{3}/.test(base)) return base;

  const label = (projectName || quoteName || "").trim();
  if (!label) return base;

  // 案名慣例常以公司簡稱開頭（「禾雅窗飾｜新莊案…」），與前面的全名重複；去掉它。
  const [head, ...rest] = label.split("｜");
  const deduped = rest.length > 0 && base.startsWith(head.trim()) ? rest.join("｜").trim() : label;

  return deduped ? `${base}｜${deduped}` : base;
}
