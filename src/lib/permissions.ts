// 權限白名單「單一事實來源」。
//
// 這個檔案刻意不 import 任何 server-only / node 模組，
// 才能同時被 Edge runtime 的 middleware.ts 與 server 端的 auth.ts 共用。
// （過去 middleware 與 auth.ts 各自維護一份，兩份逐漸走鐘：
//   middleware 多放行了案件／報價版本／庫存／商品／供應商／行事曆。）

/**
 * 非 admin 角色（師傅等）可訪問的路徑 prefix — 白名單，其餘一律拒絕。
 *
 * 目前開放：售後服務（含我的行程）＋ 設備型錄 API（售後單選型號用）。
 * 靜態資源與公開路徑另由 middleware 的 isPublicPath 處理。
 */
export const TECHNICIAN_ALLOWED_PREFIXES = [
  "/after-sales",
  "/my-schedule", // 師傅自己的派工行程（資料來源就是售後服務）
  "/login",
  "/api/auth",
  "/api/sheets/after-sales",
  "/api/sheets/equipment", // 售後單選設備型號
  "/api/upload", // 現場照片／簽名上傳
] as const;

/** 僅 admin 可訪問（即使誤加進白名單也擋下） */
const ADMIN_ONLY_PREFIXES = [
  "/admin",
  "/settings",
  "/api/sheets/users",
  "/api/sheets/_debug",
  "/api/sheets/debug-",
] as const;

export function isAdminOnly(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
}

/** 非 admin 角色能不能訪問此路徑 */
export function canTechnicianAccess(pathname: string): boolean {
  if (isAdminOnly(pathname)) return false;
  return TECHNICIAN_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}
