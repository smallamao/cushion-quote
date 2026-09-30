import { describe, it, expect } from "vitest";

import { balanceLastSchedule, sumScheduleAmounts } from "@/lib/ar-utils";

type Row = { label: string; amount: number };

describe("ar 編輯分期：自動算尾款", () => {
  describe("sumScheduleAmounts", () => {
    it("加總各期金額", () => {
      expect(sumScheduleAmounts([{ amount: 30000 }, { amount: 29000 }])).toBe(59000);
    });

    it("可排除指定一期", () => {
      expect(sumScheduleAmounts([{ amount: 30000 }, { amount: 29000 }], 1)).toBe(30000);
    });

    it("空陣列為 0、非數值視為 0", () => {
      expect(sumScheduleAmounts([])).toBe(0);
      expect(sumScheduleAmounts([{ amount: Number.NaN }, { amount: 100 }])).toBe(100);
    });
  });

  describe("balanceLastSchedule", () => {
    it("老闆案例：118,000 打了 30,000 / 29,000，尾款自動算出 59,000", () => {
      const rows: Row[] = [
        { label: "訂金", amount: 30000 },
        { label: "期中款", amount: 29000 },
        { label: "尾款", amount: 0 },
      ];
      const out = balanceLastSchedule(rows, 118000);
      expect(out[2].amount).toBe(59000);
      expect(sumScheduleAmounts(out)).toBe(118000);
    });

    it("補完後合計必定等於總額", () => {
      const out = balanceLastSchedule(
        [{ amount: 1 }, { amount: 2 }, { amount: 999 }],
        22500,
      );
      expect(sumScheduleAmounts(out)).toBe(22500);
    });

    it("只有一期時，該期即為全額", () => {
      const out = balanceLastSchedule([{ label: "全額", amount: 0 }] as Row[], 22500);
      expect(out[0].amount).toBe(22500);
    });

    it("前面各期已超過總額時，最後一期為 0 而非負數", () => {
      const out = balanceLastSchedule(
        [{ amount: 100000 }, { amount: 50000 }, { amount: 7777 }],
        118000,
      );
      expect(out[2].amount).toBe(0);
      // 仍然不符總額 → 畫面會顯示「不符」提醒使用者調整
      expect(sumScheduleAmounts(out)).not.toBe(118000);
    });

    it("不更動其他期的金額與欄位", () => {
      const rows: Row[] = [
        { label: "訂金", amount: 30000 },
        { label: "尾款", amount: 123 },
      ];
      const out = balanceLastSchedule(rows, 118000);
      expect(out[0]).toEqual({ label: "訂金", amount: 30000 });
      expect(out[1].label).toBe("尾款");
      expect(out[1].amount).toBe(88000);
    });

    it("不就地修改原陣列（避免 React state 被污染）", () => {
      const rows: Row[] = [{ label: "訂金", amount: 30000 }, { label: "尾款", amount: 0 }];
      const out = balanceLastSchedule(rows, 118000);
      expect(rows[1].amount).toBe(0); // 原物件不變
      expect(out).not.toBe(rows);
    });

    it("空陣列不會壞掉", () => {
      expect(balanceLastSchedule([], 118000)).toEqual([]);
    });
  });
});
