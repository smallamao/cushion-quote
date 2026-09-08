import type { FlexQuoteItem, OrderItem, VersionLineRecord } from "@/lib/types";
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

/**
 * 把報價版本明細轉成訂製訂單品項（供「報價成立 → 建立訂製訂單」帶入品項用）。
 * 只帶客戶看得到、且非內部成本列的品項；依 lineNo 排序。
 * 對應：名稱←itemName、尺寸規格←spec、數量←qty+單位、備註←notes、色號←該筆材質代碼。
 * 泡棉在報價中是獨立一筆品項，會原樣成為一筆訂單品項（不塞進 foamSpec 欄位）。
 *
 * @param materialCodeById 材質 id → 代碼（色號）對照，缺表時色號留空。
 */
export function versionLinesToOrderItems(
  lines: VersionLineRecord[],
  materialCodeById: Map<string, string> = new Map(),
): OrderItem[] {
  return lines
    .filter((line) => line.showOnQuote && !line.isCostItem && line.itemName.trim() !== "")
    .slice()
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((line, i) => {
      const code = line.materialId ? materialCodeById.get(line.materialId) ?? "" : "";
      const qty = line.qty > 0 ? `${line.qty}${line.unit ?? ""}` : "";
      const note = line.notes?.trim() ?? "";
      return {
        id: `item-${i + 1}`,
        name: line.itemName,
        dimensions: line.spec ?? "",
        quantity: qty,
        foamSpec: "",
        foamColor: null,
        itemType: "normal" as const,
        colorCode: code || undefined,
        subNote: note || undefined,
      };
    });
}
