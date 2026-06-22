import type { FabricPurchaseOrder, POLineItem } from "@/lib/types";

function parseJsonSafe<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

export function isoNow(): string {
  return new Date().toISOString();
}

// Sheets columns: A=poId B=supplierName C=status D=lineItems(JSON)
// E=orderedAt F=expectedAt G=receivedAt H=notes I=createdAt J=updatedAt
export const PO_SHEET = "採購單";
export const PO_RANGE_FULL = "採購單!A:J";
export const PO_RANGE_DATA = "採購單!A2:J2000";
export const PO_RANGE_IDS = "採購單!A2:A2000";
export function PO_ROW_RANGE(row: number): string {
  return `採購單!A${row}:J${row}`;
}

export function generatePoId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const nums = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function poRowToRecord(row: string[]): FabricPurchaseOrder {
  return {
    poId: row[0] ?? "",
    supplierName: row[1] ?? "",
    status: (row[2] as FabricPurchaseOrder["status"]) || "draft",
    lineItems: parseJsonSafe<POLineItem[]>(row[3], []),
    orderedAt: row[4] ?? "",
    expectedAt: row[5] ?? "",
    receivedAt: row[6] ?? "",
    notes: row[7] ?? "",
    createdAt: row[8] ?? "",
    updatedAt: row[9] ?? "",
  };
}

export function poRecordToRow(po: FabricPurchaseOrder): string[] {
  return [
    po.poId,
    po.supplierName,
    po.status,
    JSON.stringify(po.lineItems),
    po.orderedAt,
    po.expectedAt,
    po.receivedAt,
    po.notes,
    po.createdAt,
    po.updatedAt,
  ];
}
