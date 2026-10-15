/**
 * 常數時間字串比對（純 JS，Edge 和 Node 都可用）。
 *
 * 長度不同直接回 false——長度本身不是機密，且讓 timingSafeEqual 收到不同長度
 * 的字串會丟例外。長度相同則逐字元 XOR 累加，不提早跳出，
 * 避免攻擊者靠回應時間差一個字元一個字元地猜出密鑰。
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
