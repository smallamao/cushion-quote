import { describe, expect, it } from "vitest";

import { buildEInvoiceCandidates } from "@/app/api/sheets/einvoices/_shared";
import { AR_RANGE_DATA, PENDING_MONTHLY_RANGE_DATA } from "@/lib/ar-utils";

type Client = Parameters<typeof buildEInvoiceCandidates>[0];

function versionRow(versionId: string, taxRate: string): string[] {
  const row = Array<string>(49).fill("");
  row[0] = versionId;
  row[16] = taxRate;
  return row;
}

function arRow(arId: string, versionId: string): string[] {
  const row = Array<string>(23).fill("");
  row[0] = arId;
  row[5] = versionId;
  row[11] = "10500";
  row[15] = "active";
  return row;
}

function pendingRow(pendingId: string, versionId: string): string[] {
  const row = Array<string>(15).fill("");
  row[0] = pendingId;
  row[1] = versionId;
  row[8] = "10500";
  row[11] = "pending";
  return row;
}

/** 只回傳指定範圍的假 Sheets client，其他範圍一律空表；不碰真實資料 */
function makeClient(): Client {
  const data: Record<string, string[][]> = {
    [AR_RANGE_DATA]: [arRow("AR-TAX", "V-TAX"), arRow("AR-CASH", "V-CASH")],
    [PENDING_MONTHLY_RANGE_DATA]: [pendingRow("PM-TAX", "V-TAX"), pendingRow("PM-CASH", "V-CASH")],
  };
  const versions = [versionRow("V-TAX", "5"), versionRow("V-CASH", "0")];
  const get = async ({ range }: { range: string }) => ({
    data: { values: range.startsWith("報價版本!") ? versions : data[range] ?? [] },
  });
  return { spreadsheetId: "test", sheets: { spreadsheets: { values: { get } } } } as unknown as Client;
}

describe("buildEInvoiceCandidates", () => {
  it("清單排除稅率 0（現金價）的版本，AR 與月結都一樣", async () => {
    const candidates = await buildEInvoiceCandidates(makeClient());
    expect(candidates.map((c) => c.candidateId).sort()).toEqual(["ar:AR-TAX", "pending_monthly:PM-TAX"]);
  });

  it("直接指定 versionId 時不排除稅率 0，並沿用 5% 拆稅", async () => {
    const [candidate] = await buildEInvoiceCandidates(makeClient(), { versionId: "V-CASH" });
    expect(candidate?.versionId).toBe("V-CASH");
    expect(candidate?.taxRate).toBe(5);
  });
});
