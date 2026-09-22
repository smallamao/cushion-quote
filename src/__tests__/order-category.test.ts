import { describe, expect, it } from "vitest";

import { classifyOrderCategory, inferDeliveryMethod } from "@/lib/order-category";

describe("classifyOrderCategory", () => {
  it("臥榻墊", () => {
    expect(classifyOrderCategory("訂製臥榻墊\n\nW214.5 x 90 x 5cm")).toBe("臥榻墊");
  });

  it("坐背墊", () => {
    expect(classifyOrderCategory("訂製坐背墊\n\n坐墊 W58.5 x 55 x 10cm")).toBe("坐/背墊");
  });

  it("泡棉更換", () => {
    expect(classifyOrderCategory("坐墊泡棉更換\n\nW82 x 70 x 20cm")).toBe("泡棉內裏");
  });

  it("換皮走維修", () => {
    expect(classifyOrderCategory("沙發整組換皮\n（三人座・兩側電動）")).toBe("維修");
  });

  it("布套", () => {
    expect(classifyOrderCategory("沙發外布套訂製")).toBe("皮/布套");
  });

  it("床頭繃布走繃布裱板", () => {
    expect(classifyOrderCategory("主臥床頭繃布軟裝工程")).toBe("繃布裱板");
  });

  it("到府清潔", () => {
    expect(classifyOrderCategory("到府清潔保養")).toBe("到府清潔");
  });

  it("判不出來回空字串，交給人工選", () => {
    expect(classifyOrderCategory("送件運費")).toBe("");
    expect(classifyOrderCategory("")).toBe("");
  });

  it("第一句判不出來時才看補充語料", () => {
    expect(classifyOrderCategory("工程項目一式", "訂製臥榻墊 170×110×7cm")).toBe("臥榻墊");
  });
});

describe("inferDeliveryMethod", () => {
  it("自行送件算自運", () => {
    expect(inferDeliveryMethod(["自行送件\n（客人自載至工廠）"])).toBe("自運");
    expect(inferDeliveryMethod(["自運 來回運費", "客人自行送達與載回"])).toBe("自運");
  });

  // 「自行取件可免」是免運的選項說明，不是客人真的要自取——有收運費就是宅配
  it("自行取件可免只是選項說明，不可判成自運", () => {
    expect(inferDeliveryMethod(["送件運費", "成品配送；自行取件可免"])).toBe("宅配");
  });

  it("有送件運費算宅配", () => {
    expect(inferDeliveryMethod(["訂製臥榻墊", "送件運費\n（桃園・單程一趟）"])).toBe("宅配");
  });

  // 同一張單常同時有「來回搬運」與「到府安裝」，這種要算到府施工不是宅配
  it("到府施工優先於宅配", () => {
    expect(inferDeliveryMethod(["來回搬運（土城・有電梯）", "到府安裝定位"])).toBe("到府施工");
  });

  it("判不出來回空字串", () => {
    expect(inferDeliveryMethod(["訂製臥榻墊 W214.5 x 90 x 5cm"])).toBe("");
    expect(inferDeliveryMethod([])).toBe("");
  });
});
