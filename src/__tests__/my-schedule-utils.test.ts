import { describe, expect, it } from "vitest";
import {
  afterSalesPatchFor,
  filterTechnicianPatch,
  visibleServicesFor,
  groupByDate,
  sortDateGroups,
  buildMapsUrl,
} from "@/lib/schedule-utils";
import type { AfterSalesService } from "@/lib/types";

const base: AfterSalesService = {
  serviceId: "AS-20260525-01",
  receivedDate: "2026-05-25",
  relatedOrderNo: "",
  shipmentDate: "",
  clientName: "測試客戶",
  clientPhone: "",
  clientContact2: "",
  clientPhone2: "",
  deliveryAddress: "台北市信義區信義路五段7號",
  modelCode: "",
  modelNameSnapshot: "",
  issueDescription: "",
  issuePhotos: [],
  status: "scheduled",
  assignedTo: "師父A",
  scheduledDate: "2026-05-26",
  dispatchNotes: "",
  completedDate: "",
  completionNotes: "",
  completionPhotos: [],
  createdAt: "",
  updatedAt: "",
  createdBy: "",
};

describe("filterTechnicianPatch", () => {
  it("allows status=in_progress", () => {
    const result = filterTechnicianPatch({ status: "in_progress" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filtered).toEqual({ status: "in_progress" });
    }
  });

  it("allows all completion fields together and returns only those fields", () => {
    const result = filterTechnicianPatch({
      status: "completed",
      completionNotes: "固定好了",
      completedDate: "2026-05-25",
      completionPhotos: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filtered).toEqual({
        status: "completed",
        completionNotes: "固定好了",
        completedDate: "2026-05-25",
        completionPhotos: [],
      });
    }
  });

  it("rejects a non-allowed field (assignedTo)", () => {
    expect(filterTechnicianPatch({ assignedTo: "other" }).ok).toBe(false);
  });

  it("rejects status=pending", () => {
    expect(filterTechnicianPatch({ status: "pending" }).ok).toBe(false);
  });

  it("rejects status=scheduled", () => {
    expect(filterTechnicianPatch({ status: "scheduled" }).ok).toBe(false);
  });

  it("rejects mix of allowed + forbidden fields", () => {
    expect(filterTechnicianPatch({ status: "completed", clientName: "hack" }).ok).toBe(false);
  });
});

describe("groupByDate", () => {
  it("groups two services on the same date", () => {
    const s1 = { ...base, serviceId: "S1", scheduledDate: "2026-05-26" };
    const s2 = { ...base, serviceId: "S2", scheduledDate: "2026-05-26" };
    const s3 = { ...base, serviceId: "S3", scheduledDate: "2026-05-27" };
    const groups = groupByDate([s1, s2, s3]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.date === "2026-05-26")?.items).toHaveLength(2);
    expect(groups.find((g) => g.date === "2026-05-27")?.items).toHaveLength(1);
  });

  it("excludes services with no scheduledDate", () => {
    expect(groupByDate([{ ...base, scheduledDate: "" }])).toHaveLength(0);
  });
});

describe("sortDateGroups", () => {
  it("puts today before future dates", () => {
    const groups = [
      { date: "2099-01-01", items: [] },
      { date: "2026-05-25", items: [] },
    ];
    // Inject today as "2026-05-25" so the test is deterministic
    const sorted = sortDateGroups(groups, "2026-05-25");
    expect(sorted[0].date).toBe("2026-05-25");
    expect(sorted[1].date).toBe("2099-01-01");
  });

  it("puts future dates before past dates", () => {
    const groups = [
      { date: "2024-01-01", items: [] },
      { date: "2099-01-01", items: [] },
    ];
    const sorted = sortDateGroups(groups);
    const futureIdx = sorted.findIndex((g) => g.date === "2099-01-01");
    const pastIdx = sorted.findIndex((g) => g.date === "2024-01-01");
    expect(futureIdx).toBeLessThan(pastIdx);
  });

  it("sorts multiple future dates ascending", () => {
    const groups = [
      { date: "2099-03-01", items: [] },
      { date: "2099-01-01", items: [] },
      { date: "2099-02-01", items: [] },
    ];
    const sorted = sortDateGroups(groups);
    expect(sorted.map((g) => g.date)).toEqual(["2099-01-01", "2099-02-01", "2099-03-01"]);
  });

  it("sorts multiple past dates descending", () => {
    const groups = [
      { date: "2020-01-01", items: [] },
      { date: "2022-01-01", items: [] },
      { date: "2021-01-01", items: [] },
    ];
    const sorted = sortDateGroups(groups);
    expect(sorted.map((g) => g.date)).toEqual(["2022-01-01", "2021-01-01", "2020-01-01"]);
  });
});

describe("buildMapsUrl", () => {
  it("returns google maps base for empty array", () => {
    expect(buildMapsUrl([])).toBe("https://www.google.com/maps");
  });

  it("builds a dir url for one address", () => {
    const url = buildMapsUrl(["台北市信義區信義路五段7號"]);
    expect(url).toContain("/maps/dir/");
    expect(url).toContain(encodeURIComponent("台北市信義區信義路五段7號"));
  });

  it("encodes all addresses in multi-stop url in order", () => {
    const url = buildMapsUrl(["地址A", "地址B", "地址C"]);
    expect(url).toBe(
      `https://www.google.com/maps/dir/${encodeURIComponent("地址A")}/${encodeURIComponent("地址B")}/${encodeURIComponent("地址C")}`,
    );
  });
});

describe("visibleServicesFor — 售後單清單依角色過濾", () => {
  const services = [
    { ...base, serviceId: "AS-1", assignedTo: "阿明" },
    { ...base, serviceId: "AS-2", assignedTo: " 阿明 " },
    { ...base, serviceId: "AS-3", assignedTo: "阿華" },
    { ...base, serviceId: "AS-4", assignedTo: "" },
  ];
  const ids = (list: AfterSalesService[]) => list.map((s) => s.serviceId);

  it("admin 看全部", () => {
    expect(ids(visibleServicesFor("admin", "老闆", services))).toEqual(["AS-1", "AS-2", "AS-3", "AS-4"]);
  });

  it.each(["technician", "craftsman", "sales"])("%s 只看指派給自己的（前後空白不影響）", (role) => {
    expect(ids(visibleServicesFor(role, "阿明", services))).toEqual(["AS-1", "AS-2"]);
  });

  it.each(["craftsman", "technician", "weird", undefined])("%s 拿不到自己名字時回空，不退化成全部", (role) => {
    expect(visibleServicesFor(role, "  ", services)).toEqual([]);
  });

  it("未指派的單不屬於任何非 admin", () => {
    expect(ids(visibleServicesFor("craftsman", "阿華", services))).toEqual(["AS-3"]);
  });
});

describe("afterSalesPatchFor — 售後單 PATCH 欄位依角色過濾", () => {
  it("admin 整包通過", () => {
    const body = { clientName: "改名", assignedTo: "阿華", status: "pending" };
    expect(afterSalesPatchFor("admin", body)).toEqual({ ok: true, filtered: body });
  });

  it.each(["technician", "craftsman", "sales", "weird", null])("%s 只能改完工欄位", (role) => {
    expect(afterSalesPatchFor(role, { status: "completed", completionNotes: "OK" })).toEqual({
      ok: true,
      filtered: { status: "completed", completionNotes: "OK" },
    });
    expect(afterSalesPatchFor(role, { status: "in_progress" }).ok).toBe(true);
    expect(afterSalesPatchFor(role, { assignedTo: "自己" }).ok).toBe(false);
    expect(afterSalesPatchFor(role, { clientPhone: "0900" }).ok).toBe(false);
    expect(afterSalesPatchFor(role, { status: "cancelled" }).ok).toBe(false);
    expect(afterSalesPatchFor(role, { status: "scheduled" }).ok).toBe(false);
  });
});
