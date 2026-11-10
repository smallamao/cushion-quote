/**
 * 背景定時查詢的節流規則（純邏輯，hook 在 hooks/usePolling.ts）。
 *
 * 🔴 2026-11-10：Vercel Hobby 每月 4 小時 Fluid Active CPU 用完，整個專案被暫停到 12/9
 *    （報價、客人簽約、師傅派工連結全掛）。最大的常駐消耗是頂端選單的兩個輪詢：
 *    未讀回覆每 15 秒、通知每 30 秒，每次都要驗登入＋讀整張試算表；
 *    系統視窗常駐開在桌面上，人不在也照跑一整天。
 */

/** 輪詢間隔：通知晚 2 分鐘到可以接受；人一回來會立刻補查 */
export const POLL_INTERVAL_MS = 2 * 60_000;
/** 這麼久沒有滑鼠／鍵盤／觸控就當作人不在，停止輪詢 */
export const IDLE_AFTER_MS = 5 * 60_000;
/** 回到畫面時，上次查詢比這個舊才補查 */
export const STALE_AFTER_MS = 30_000;

export function shouldPollNow(args: { visible: boolean; lastActivityMs: number; nowMs: number }): boolean {
  if (!args.visible) return false;
  return args.nowMs - args.lastActivityMs <= IDLE_AFTER_MS;
}

export function isStale(lastFetchMs: number, nowMs: number): boolean {
  return nowMs - lastFetchMs > STALE_AFTER_MS;
}
