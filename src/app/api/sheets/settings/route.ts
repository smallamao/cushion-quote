import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";

import { requireAdmin } from "@/lib/api-auth";

import { loadSystemSettings } from "@/lib/settings-sheet";
import { getSheetsClient } from "@/lib/sheets-client";
import type { SystemSettings } from "@/lib/types";

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

const SETTINGS_MAP: Array<{ key: string; extract: (s: SystemSettings) => string }> = [
  { key: "quality_premium", extract: (s) => String(s.qualityPremium) },
  { key: "default_waste_rate", extract: (s) => String(s.wasteRate) },
  { key: "fabric_discount", extract: (s) => String(s.fabricDiscount) },
  { key: "wholesale_multiplier", extract: (s) => String(s.channelMultipliers.wholesale) },
  { key: "designer_multiplier", extract: (s) => String(s.channelMultipliers.designer) },
  { key: "retail_multiplier", extract: (s) => String(s.channelMultipliers.retail) },
  { key: "luxury_retail_multiplier", extract: (s) => String(s.channelMultipliers.luxury_retail) },
  { key: "tax_rate", extract: (s) => String(s.taxRate) },
  { key: "commission_mode", extract: (s) => s.commissionMode },
  { key: "commission_rate", extract: (s) => String(s.commissionRate) },
  { key: "commission_fixed_amount", extract: (s) => String(s.commissionFixedAmount) },
  { key: "quote_validity_days", extract: (s) => String(s.quoteValidityDays) },
  { key: "company_name", extract: (s) => s.companyName },
  { key: "company_full_name", extract: (s) => s.companyFullName },
  { key: "company_phone", extract: (s) => s.companyPhone },
  { key: "company_fax", extract: (s) => s.companyFax },
  { key: "company_address", extract: (s) => s.companyAddress },
  { key: "company_line", extract: (s) => s.companyLine },
  { key: "company_tax_id", extract: (s) => s.companyTaxId },
  { key: "company_contact", extract: (s) => s.companyContact },
  { key: "company_email", extract: (s) => s.companyEmail },
  { key: "factory_address", extract: (s) => s.factoryAddress },
  { key: "sign_faq", extract: (s) => s.signFaq ?? "" },
];

export async function GET(request: Request) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  return NextResponse.json(await loadSystemSettings());
}

export async function PUT(request: Request) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const payload = (await request.json()) as SystemSettings;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定，無法儲存設定" }, { status: 503 });
  }

  try {
    const values = SETTINGS_MAP.map((entry) => [entry.key, entry.extract(payload)]);

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `系統設定!A2:B${values.length + 1}`,
      valueInputOption: "RAW",
      requestBody: { values },
    });

    appendAuditLog({
      actor: guard.session.email,
      action: "update",
      targetType: "settings",
      targetId: "system",
      // 全域定價一改，之後每一張報價都跟著變。這支是整組覆寫（SETTINGS_MAP 全部
      // 重寫一遍），所以記下寫入後的實際值，才看得出那次把什麼改成什麼。
      summary: values.map(([k, v]) => `${k}=${v}`).join("、"),
    });
    return NextResponse.json({ ok: true, source: "sheets" as const });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
