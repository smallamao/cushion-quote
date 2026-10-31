import { describe, expect, it } from "vitest";

import { parseDeliveryRegion } from "@/lib/delivery-region";

/** 案例全部取自 2026-10-31 的真實卡片描述，不是假想字串。 */
describe("parseDeliveryRegion", () => {
  it("標準地址抓得到縣市與行政區", () => {
    const r = parseDeliveryRegion("新北市新店區中興路二段39號20F 沙發279cm");
    expect(r.city).toBe("新北市");
    expect(r.district).toBe("新店區");
    expect(r.label).toBe("新北市新店區");
    expect(r.isRemote).toBe(false);
  });

  it("臺／台視為同一個縣市", () => {
    expect(parseDeliveryRegion("臺北市大安區").city).toBe("台北市");
    expect(parseDeliveryRegion("台北市大安區").city).toBe("台北市");
  });

  it("真實案例：縣市後直接接路名（新竹市埔頂一路）→ 標區未明，不要亂猜", () => {
    const r = parseDeliveryRegion("新竹市埔頂一路500號三F-一 沙發275cmL型一組");
    expect(r.city).toBe("新竹市");
    expect(r.district).toBe("");
    expect(r.label).toBe("新竹市（區未明）");
    expect(r.isRemote).toBe(true);
  });

  it("真實案例：開頭就是行政區、沒有縣市（板橋區文化路）", () => {
    const r = parseDeliveryRegion("板橋區文化路一段31號4F 沙發210cm");
    expect(r.district).toBe("板橋區");
    expect(r.city).toBe("");
    expect(r.label).toBe("板橋區（縣市未明）");
  });

  it("北北桃以外算遠程——排車要特別處理", () => {
    expect(parseDeliveryRegion("花蓮縣玉里鎮中山路1號").isRemote).toBe(true);
    expect(parseDeliveryRegion("新竹縣竹北市光明六路").isRemote).toBe(true);
    expect(parseDeliveryRegion("桃園市八德區豐田一路111號").isRemote).toBe(false);
  });

  it("完全抓不到就回「需確認」，不得硬湊一個區域", () => {
    for (const bad of ["", "   ", "沙發279cm一字型一只", undefined]) {
      const r = parseDeliveryRegion(bad);
      expect(r.unknown).toBe(true);
      expect(r.label).toBe("需確認");
    }
  });
});
