import { describe, it, expect } from "vitest";
import {
  SHEET_HEADERS,
  generateRemnantId,
  remnantToRow,
  rowToRemnant,
} from "@/lib/fabric-remnants-sheet";
import type { FabricRemnant } from "@/lib/types";

const sample: FabricRemnant = {
  id: "RMN-20260910-AB12",
  productId: "prod-1",
  productCode: "2200A76",
  productName: "以色列貓抓布",
  specification: "A76 米色",
  supplierName: "米盧",
  series: "2200",
  lengthYd: 2.5,
  pieceType: "裁剩",
  receivedDate: "2026-09-05",
  source: "S958",
  location: "A架第3格",
  notes: "邊角有小記號",
  isActive: true,
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
};

describe("fabric-remnants-sheet", () => {
  it("欄數與表頭一致（16 欄 A:P）", () => {
    expect(SHEET_HEADERS).toHaveLength(16);
    expect(remnantToRow(sample)).toHaveLength(16);
  });

  it("row ↔ record 往返一致", () => {
    expect(rowToRemnant(remnantToRow(sample))).toEqual(sample);
  });

  it("啟用預設 TRUE；FALSE 才是停用", () => {
    const row = remnantToRow(sample);
    expect(rowToRemnant(row).isActive).toBe(true);
    row[13] = "FALSE";
    expect(rowToRemnant(row).isActive).toBe(false);
    expect(rowToRemnant([]).isActive).toBe(true); // 空值視為在庫
  });

  it("類型非「整支」一律當「裁剩」", () => {
    expect(rowToRemnant(["x", "", "", "", "", "", "", "1", "整支"]).pieceType).toBe("整支");
    expect(rowToRemnant(["x", "", "", "", "", "", "", "1", ""]).pieceType).toBe("裁剩");
    expect(rowToRemnant(["x", "", "", "", "", "", "", "1", "亂填"]).pieceType).toBe("裁剩");
  });

  it("ID 格式 RMN-YYYYMMDD-XXXX", () => {
    expect(generateRemnantId(new Date("2026-09-10T00:00:00Z"))).toMatch(/^RMN-20260910-[0-9A-Z]{4}$/);
  });
});
