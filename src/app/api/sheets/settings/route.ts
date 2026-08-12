import { NextResponse } from "next/server";

import { loadSystemSettings } from "@/lib/settings-sheet";
import { getSheetsClient } from "@/lib/sheets-client";
import type { SystemSettings } from "@/lib/types";

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
];

export async function GET() {
  return NextResponse.json(await loadSystemSettings());
}

export async function PUT(request: Request) {
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

    return NextResponse.json({ ok: true, source: "sheets" as const });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
