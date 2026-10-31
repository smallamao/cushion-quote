/**
 * Google Sheets 寫入配額（每分鐘每人 60 次）用完時的重試。
 * 只重試配額錯誤；其他錯誤立即拋出，避免把真正的問題拖慢。
 * 退避總長控制在 20 秒內，搭配路由的 maxDuration = 60。
 */
export const SHEETS_RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isSheetsQuotaError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "string") return /quota exceeded|resource_exhausted/i.test(err);
  if (typeof err !== "object") return false;
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown }; message?: unknown };
  if (e.code === 429 || e.code === "429" || e.status === 429 || e.response?.status === 429) return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /quota exceeded|resource_exhausted/i.test(message);
}

export interface SheetsRetryOptions {
  sleep?: (ms: number) => Promise<void>;
  /** 絕對時間（epoch ms）：下一次等待會超過就不再重試，直接拋出原錯誤 */
  deadline?: number;
  now?: () => number;
}

/** 只試一次、不重試（用於「盡力而為」且不可佔用時間預算的寫入） */
export const SHEETS_NO_RETRY: SheetsRetryOptions = { deadline: 0 };

export async function withSheetsRetry<T>(
  fn: () => Promise<T>,
  options: SheetsRetryOptions = {},
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = SHEETS_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isSheetsQuotaError(err)) throw err;
      if (options.deadline !== undefined && now() + delay > options.deadline) throw err;
      await sleep(delay);
    }
  }
}
