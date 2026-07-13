// 採購單 ↔ 訂製訂單 關聯（一張採購單可綁多張訂單，涵蓋批量叫貨）。
// 儲存策略：沿用「關聯訂單ID」單一欄位（Sheets col row[16]），以逗號分隔多個 orderId。
// 單值舊資料（"ORD-xxx"）即 1 元素清單，完全相容；空字串＝未綁定。

/** 解析逗號分隔的關聯訂單字串 → 去空白、去空值、去重的 orderId 陣列 */
export function parseRelatedOrderIds(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** 序列化回逗號分隔字串（存回 Sheets） */
export function joinRelatedOrderIds(ids: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.join(",");
}

/** 判斷某採購單的關聯訂單字串是否包含指定 orderId */
export function relatedOrderIncludes(raw: string | undefined | null, orderId: string): boolean {
  return parseRelatedOrderIds(raw).includes(orderId);
}
