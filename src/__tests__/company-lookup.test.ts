import { describe, expect, it } from "vitest";

import { companyRowToIdentity, pickCompanyRow } from "@/lib/company-lookup";

// 客戶資料庫欄序：編號 | 公司名稱 | 簡稱 | 客戶類型 | 通路 | 地址 | 統一編號 | …
const heya = ["CLI-1782742294258", "禾雅窗飾美學有限公司", "", "other", "wholesale", "新北市林口區", "62118927"];
const shanlinxi = ["CLI-0002", "山林希家具有限公司", "山林希", "軟裝店", "wholesale", "台北市", "24681357"];
// 舊資料：公司名稱與統編都沒填
const blank = ["CLI-0003", "", "", "other", "retail", "", ""];

const rows = [heya, shanlinxi, blank];

describe("pickCompanyRow", () => {
  it("以 clientId 找到對應公司", () => {
    expect(pickCompanyRow(rows, { clientId: "CLI-1782742294258" })).toBe(heya);
  });

  it("clientId 找不到時退回公司全名比對", () => {
    expect(pickCompanyRow(rows, { clientId: "CLI-NOPE", companyName: "山林希家具有限公司" })).toBe(shanlinxi);
  });

  it("名稱比對也吃簡稱", () => {
    expect(pickCompanyRow(rows, { companyName: "山林希" })).toBe(shanlinxi);
  });

  it("兩個鍵都空就回 null", () => {
    expect(pickCompanyRow(rows, {})).toBeNull();
    expect(pickCompanyRow(rows, { clientId: "  ", companyName: "" })).toBeNull();
  });

  // 散客的 clientNameSnapshot 是空字串。若拿空字串去比，會誤中主檔裡
  // 任何一列沒填公司名的資料，把別人的統編帶進散客的簽署頁。
  it("空的公司名稱不可比中沒填公司名的那一列", () => {
    expect(pickCompanyRow(rows, { companyName: "" })).toBeNull();
    expect(pickCompanyRow(rows, { companyName: "   " })).toBeNull();
  });

  it("查無對應回 null", () => {
    expect(pickCompanyRow(rows, { clientId: "CLI-X", companyName: "不存在公司" })).toBeNull();
  });

  it("比對前會去除前後空白", () => {
    expect(pickCompanyRow(rows, { clientId: " CLI-0002 " })).toBe(shanlinxi);
    expect(pickCompanyRow(rows, { companyName: " 禾雅窗飾美學有限公司 " })).toBe(heya);
  });
});

describe("companyRowToIdentity", () => {
  it("取出編號、公司名稱、統編", () => {
    expect(companyRowToIdentity(heya)).toEqual({
      clientId: "CLI-1782742294258",
      companyName: "禾雅窗飾美學有限公司",
      taxId: "62118927",
    });
  });

  it("欄位缺漏時回空字串而不是 undefined", () => {
    expect(companyRowToIdentity(["CLI-0009"])).toEqual({
      clientId: "CLI-0009",
      companyName: "",
      taxId: "",
    });
  });
});
