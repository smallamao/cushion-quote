import type { FlexQuoteItem, VersionLineRecord } from "@/lib/types";
import { buildSplitItemFields } from "@/lib/split-panel-metadata";

/**
 * 把已儲存的報價版本明細 (VersionLineRecord) 轉成報價編輯器／PDF 用的 FlexQuoteItem。
 * 供 QuoteEditor（載入版本）與 QuotePreviewDrawer（產報價單 PDF）共用，確保口徑一致。
 */
export function toFlexItemsFromVersion(lines: VersionLineRecord[]): FlexQuoteItem[] {
  return lines.map((line) => ({
    id: crypto.randomUUID(),
    name: line.itemName,
    spec: line.spec,
    qty: line.qty || 1,
    unit: line.unit,
    unitPrice: line.unitPrice,
    amount: line.lineAmount,
    isCostItem: line.isCostItem,
    notes: line.notes,
    imageUrl: line.imageUrl,
    specImageUrl: line.specImageUrl,
    materialId: line.materialId,
    autoPriced: false,
    costPerUnit: line.estimatedUnitCost,
    ...buildSplitItemFields(line),
  }));
}
