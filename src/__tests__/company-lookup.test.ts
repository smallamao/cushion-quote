import { describe, expect, it } from "vitest";

import { companyRowToIdentity, isValidTaxId, pickCompanyRow } from "@/lib/company-lookup";

// 客戶資料庫欄序：編號 | 公司名稱 | 簡稱 | 客戶類型 | 通路 | 地址 | 統一編號 | …
const heya = ["CLI-1782742294258", "禾雅窗飾美學有限公司", "", "other", "wholesale", "新北市林口區", "62118927"];
const shanlinxi = ["CLI-0002", "山林希家具有限公司", "山林希", "軟裝店", "wholesale", "台北市", "24681357"];
// 舊資料：公司名稱與統編都沒填
const blank = ["CLI-0003", "", "", "other", "retail", "", ""];

// 沒遷移完的舊列：欄位整排位移，統編那格存的是啟用欄的 TRUE（實際存在於正式資料）
const shifted = ["CLI-1776510819864", "大予空間規劃有限公司", "", "designer", "designer", "", "TRUE"];

const rows = [heya, shanlinxi, blank, shifted];

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

describe("pickCompanyRow 名稱比對的唯一性", () => {
  // 兩家公司共用同一個簡稱時，不可以挑表上排前面的那一列
  it("同名／同簡稱有兩列時回 null，不猜", () => {
    const a = ["CLI-A", "一二三設計有限公司", "一二三", "", "", "", "11111111"];
    const b = ["CLI-B", "一二三工程行", "一二三", "", "", "", "22222222"];
    expect(pickCompanyRow([a, b], { companyName: "一二三" })).toBeNull();
  });

  it("clientId 指定得到時不受同簡稱影響", () => {
    const a = ["CLI-A", "一二三設計有限公司", "一二三", "", "", "", "11111111"];
    const b = ["CLI-B", "一二三工程行", "一二三", "", "", "", "22222222"];
    expect(pickCompanyRow([a, b], { clientId: "CLI-B", companyName: "一二三" })).toBe(b);
  });
});

describe("isValidTaxId", () => {
  it("八位數字才算數", () => {
    expect(isValidTaxId("62118927")).toBe(true);
    expect(isValidTaxId(" 62118927 ")).toBe(true);
  });

  it("擋掉欄位位移塞進來的垃圾值", () => {
    expect(isValidTaxId("TRUE")).toBe(false);
    expect(isValidTaxId("per_quote")).toBe(false);
    expect(isValidTaxId("2026-04-18")).toBe(false);
    expect(isValidTaxId("")).toBe(false);
  });

  it("擋掉長度不對的數字（電話被當統編是最危險的一種）", () => {
    expect(isValidTaxId("0912345678")).toBe(false);
    expect(isValidTaxId("1234567")).toBe(false);
    expect(isValidTaxId("0223456789")).toBe(false);
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

  // 大予空間規劃的列真的長這樣：統編欄存著 TRUE。沒擋就會預填進簽署頁。
  it("欄位位移的舊列不把 TRUE 當統編帶出去", () => {
    expect(companyRowToIdentity(shifted)).toEqual({
      clientId: "CLI-1776510819864",
      companyName: "大予空間規劃有限公司",
      taxId: "",
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
