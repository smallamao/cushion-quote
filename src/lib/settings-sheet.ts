import "server-only";

import { DEFAULT_SETTINGS } from "@/lib/constants";
import { getSheetsClient } from "@/lib/sheets-client";
import type { CommissionMode, SystemSettings } from "@/lib/types";

const COMMISSION_MODES: readonly CommissionMode[] = ["price_gap", "rebate", "fixed", "none"];

function toCommissionMode(value: string | undefined): CommissionMode {
  return value && COMMISSION_MODES.includes(value as CommissionMode)
    ? (value as CommissionMode)
    : DEFAULT_SETTINGS.commissionMode;
}

export interface LoadedSystemSettings {
  settings: SystemSettings;
  source: "sheets" | "defaults";
}

/**
 * 伺服器端讀取「系統設定」工作表並轉成 SystemSettings；無 Sheets 連線或讀取失敗時回傳 DEFAULT_SETTINGS。
 *
 * 設定頁 GET 與其他需要公司資訊的 server 流程（如採購單 PDF footer、預設交貨地址）共用同一份，
 * 避免各處各自塞 DEFAULT_SETTINGS —— 那會造成「改了設定卻沒跟到」（如採購單電話仍印預設值）。
 */
export async function loadSystemSettings(): Promise<LoadedSystemSettings> {
  const client = await getSheetsClient();
  if (!client) return { settings: DEFAULT_SETTINGS, source: "defaults" };

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

    return {
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
        commissionMode: toCommissionMode(mapped.commission_mode),
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
      source: "sheets",
    };
  } catch {
    return { settings: DEFAULT_SETTINGS, source: "defaults" };
  }
}
