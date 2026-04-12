import { NextResponse } from "next/server";

import { DEFAULT_SETTINGS } from "@/lib/constants";
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
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ settings: DEFAULT_SETTINGS, source: "defaults" as const });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "系統設定!A2:B30",
    });
    const rows = response.data.values ?? [];
    const mapped = rows.reduce<Record<string, string>>((acc, row) => {
      const [key, value] = row;
      if (key) acc[key] = value ?? "";
      return acc;
    }, {});

    return NextResponse.json({
      settings: {
        qualityPremium: Number(mapped.quality_premium ?? DEFAULT_SETTINGS.qualityPremium),
        wasteRate: Number(mapped.default_waste_rate ?? DEFAULT_SETTINGS.wasteRate),
        fabricDiscount: Number(mapped.fabric_discount ?? DEFAULT_SETTINGS.fabricDiscount),
        channelMultipliers: {
          wholesale: Number(mapped.wholesale_multiplier ?? DEFAULT_SETTINGS.channelMultipliers.wholesale),
          designer: Number(mapped.designer_multiplier ?? DEFAULT_SETTINGS.channelMultipliers.designer),
          retail: Number(mapped.retail_multiplier ?? DEFAULT_SETTINGS.channelMultipliers.retail),
          luxury_retail: Number(mapped.luxury_retail_multiplier ?? DEFAULT_SETTINGS.channelMultipliers.luxury_retail),
        },
        taxRate: Number(mapped.tax_rate ?? DEFAULT_SETTINGS.taxRate),
        commissionMode: mapped.commission_mode || DEFAULT_SETTINGS.commissionMode,
        commissionRate: Number(mapped.commission_rate ?? DEFAULT_SETTINGS.commissionRate),
        commissionFixedAmount: Number(mapped.commission_fixed_amount ?? DEFAULT_SETTINGS.commissionFixedAmount),
        quoteValidityDays: Number(mapped.quote_validity_days ?? DEFAULT_SETTINGS.quoteValidityDays),
        companyName: mapped.company_name ?? DEFAULT_SETTINGS.companyName,
        companyFullName: mapped.company_full_name ?? DEFAULT_SETTINGS.companyFullName,
        companyPhone: mapped.company_phone ?? DEFAULT_SETTINGS.companyPhone,
        companyFax: mapped.company_fax ?? DEFAULT_SETTINGS.companyFax,
        companyAddress: mapped.company_address ?? DEFAULT_SETTINGS.companyAddress,
        companyLine: mapped.company_line ?? DEFAULT_SETTINGS.companyLine,
        companyTaxId: mapped.company_tax_id ?? DEFAULT_SETTINGS.companyTaxId,
        companyContact: mapped.company_contact ?? DEFAULT_SETTINGS.companyContact,
        companyEmail: mapped.company_email ?? DEFAULT_SETTINGS.companyEmail,
        factoryAddress: mapped.factory_address ?? DEFAULT_SETTINGS.factoryAddress,
      },
      source: "sheets" as const,
    });
  } catch {
    return NextResponse.json({ settings: DEFAULT_SETTINGS, source: "defaults" as const });
  }
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
