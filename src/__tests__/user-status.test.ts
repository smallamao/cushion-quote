import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { User } from "@/lib/types";

// listUsers 會打 Google Sheets，測試裡換掉
const listUsers = vi.hoisted(() => vi.fn<() => Promise<User[]>>());
vi.mock("@/lib/users-sheet", () => ({ listUsers }));

const { clearUserStatusCache, getUserStatus } = await import("@/lib/user-status");

function user(over: Partial<User>): User {
  return {
    userId: "U001",
    email: "boss@example.com",
    displayName: "老闆",
    role: "admin",
    isActive: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...over,
  };
}

beforeEach(() => {
  clearUserStatusCache();
  listUsers.mockReset();
  vi.useRealTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("getUserStatus", () => {
  it("在職帳號查得到，角色來自使用者表", async () => {
    listUsers.mockResolvedValue([user({ email: "a@example.com", role: "technician" })]);
    expect((await getUserStatus("a@example.com")).status).toEqual({
      isActive: true,
      role: "technician",
      displayName: "老闆",
    });
  });

  it("email 大小寫與空白不影響比對", async () => {
    listUsers.mockResolvedValue([user({ email: "a@example.com" })]);
    expect((await getUserStatus("  A@Example.COM  ")).status).toBeDefined();
  });

  it("停用帳號回報 isActive=false（呼叫端據此拒絕）", async () => {
    listUsers.mockResolvedValue([user({ email: "gone@example.com", isActive: false })]);
    const r = await getUserStatus("gone@example.com");
    expect(r.status?.isActive).toBe(false);
  });

  it("表上沒有這個人 → found:false（帳號被刪掉就該進不來）", async () => {
    listUsers.mockResolvedValue([user({ email: "a@example.com" })]);
    const r = await getUserStatus("stranger@example.com");
    expect(r.unavailable).toBe(false); // 表讀得到
    expect(r.status).toBeUndefined(); // 但沒有這個人
  });

  it("「查不到人」與「表讀不到」必須分得出來", async () => {
    // 這兩種情況原本都回 null，呼叫端無從分辨，結果是被刪掉的帳號照樣放行。
    listUsers.mockResolvedValue([user({ email: "a@example.com" })]);
    const missing = await getUserStatus("stranger@example.com");

    clearUserStatusCache();
    listUsers.mockResolvedValue([]); // Sheets 故障
    const broken = await getUserStatus("stranger@example.com");

    expect(missing.unavailable).toBe(false);
    expect(broken.unavailable).toBe(true);
  });

  it("60 秒內只讀一次試算表（Sheets 有讀取配額）", async () => {
    listUsers.mockResolvedValue([user({ email: "a@example.com" })]);
    await getUserStatus("a@example.com");
    await getUserStatus("a@example.com");
    await getUserStatus("a@example.com");
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it("快取過期後會重讀，降權立刻生效", async () => {
    vi.useFakeTimers();
    listUsers.mockResolvedValue([user({ email: "a@example.com", role: "admin" })]);
    expect((await getUserStatus("a@example.com")).status?.role).toBe("admin");

    // 老闆把他降成技師
    listUsers.mockResolvedValue([user({ email: "a@example.com", role: "technician" })]);
    vi.advanceTimersByTime(61 * 1000);
    expect((await getUserStatus("a@example.com")).status?.role).toBe("technician");
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("讀取失敗時沿用上一次快取，不會把全公司踢出去", async () => {
    vi.useFakeTimers();
    listUsers.mockResolvedValue([user({ email: "a@example.com" })]);
    expect((await getUserStatus("a@example.com")).status).toBeDefined();

    // Sheets 故障：listUsers 自己 catch 掉後回空陣列
    listUsers.mockResolvedValue([]);
    vi.advanceTimersByTime(61 * 1000);
    expect((await getUserStatus("a@example.com")).status).toBeDefined();
  });

  it("讀取失敗且無快取 → unavailable:true（呼叫端據此放行，見 api-auth 註解）", async () => {
    listUsers.mockResolvedValue([]);
    const r = await getUserStatus("a@example.com");
    expect(r.unavailable).toBe(true);
  });

  it("空 email 不去讀試算表", async () => {
    listUsers.mockResolvedValue([user({})]);
    expect((await getUserStatus("")).status).toBeUndefined();
    expect((await getUserStatus("   ")).status).toBeUndefined();
    expect(listUsers).not.toHaveBeenCalled();
  });
});
