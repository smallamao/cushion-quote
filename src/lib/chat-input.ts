/**
 * 聊天輸入框按 Enter 時，到底要送出還是換行。
 *
 * 老闆 2026-11-04 回報兩件事，其實是同一個輸入框的三個問題：
 * 1. 原本是單行 <input>，本質上換不了行（程式裡那句 `!e.shiftKey` 等於白寫）。
 * 2. 送出後文字殘留——中文選字時按的那一下 Enter 是「確認選字」，keydown 先跑把
 *    半成品送出去並清空，IME 隨後才把選完的字寫回欄位，看起來就像沒送出。
 *    這一條比殘留更嚴重的那一面是：句子還沒打完就被送出去了。
 * 3. 手機軟體鍵盤沒有 Shift+Enter，Enter 一律要當換行，送出只走按鈕（老闆指定）。
 *
 * 判斷寫成純函式才測得到——真正的 IME 事件序列在單元測試裡模擬不出來。
 */

export interface EnterKeyContext {
  key: string;
  shiftKey: boolean;
  /** IME 選字中。React 用 e.nativeEvent.isComposing，舊版 Safari 退回 keyCode 229 */
  isComposing: boolean;
  /** 觸控裝置（軟體鍵盤）：按不出 Shift+Enter */
  touchDevice: boolean;
}

export function shouldSubmitOnEnter(ctx: EnterKeyContext): boolean {
  if (ctx.key !== "Enter") return false;
  if (ctx.isComposing) return false;
  if (ctx.touchDevice) return false;
  return !ctx.shiftKey;
}
