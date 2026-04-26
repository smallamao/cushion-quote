const WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1] as const;

/**
 * 台灣統一編號 checksum 驗證（加權數 [1,2,1,2,1,2,4,1]）。
 * 第 7 位為 7 時，有 +0 或 +1 兩種合法計算。
 */
export function isValidTaiwanTaxId(taxId: string): boolean {
  if (!/^\d{8}$/.test(taxId)) return false;
  const digits = taxId.split("").map(Number);
  const productSum = (extraForSeventh: 0 | 1): number =>
    digits.reduce((sum, digit, i) => {
      let product = digit * WEIGHTS[i];
      if (i === 6) product += extraForSeventh;
      return sum + Math.floor(product / 10) + (product % 10);
    }, 0);
  if (digits[6] === 7) {
    return productSum(0) % 10 === 0 || productSum(1) % 10 === 0;
  }
  return productSum(0) % 10 === 0;
}

export function validateTaiwanTaxId(taxId: string): string | null {
  const trimmed = taxId.trim();
  if (!trimmed) return "統一編號為必填";
  if (!/^\d{8}$/.test(trimmed)) return "統一編號必須為 8 位數字";
  if (!isValidTaiwanTaxId(trimmed)) return "統一編號格式有誤（checksum 驗證失敗）";
  return null;
}

interface CompanyLookupCacheEntry {
  fetchedAt: number;
  name: string;
  address: string;
}

const COMPANY_LOOKUP_CACHE = new Map<string, CompanyLookupCacheEntry>();
const COMPANY_LOOKUP_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 透過經濟部商工登記公示資料 API 用統編查公司名稱與地址。
 * 24h cache。
 */
export async function lookupCompanyByTaxId(
  taxId: string,
): Promise<{ name: string; address: string } | null> {
  if (!isValidTaiwanTaxId(taxId)) return null;

  const cached = COMPANY_LOOKUP_CACHE.get(taxId);
  if (cached && Date.now() - cached.fetchedAt < COMPANY_LOOKUP_TTL_MS) {
    return { name: cached.name, address: cached.address };
  }

  try {
    const url = `https://data.gcis.nat.gov.tw/od/data/api/5F64D864-61CB-4D0D-8AD9-492047CC1EA6?$format=json&$filter=Business_Accounting_NO%20eq%20${taxId}&$skip=0&$top=1`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<Record<string, unknown>>;
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) return null;
    const name = typeof row.Company_Name === "string" ? row.Company_Name.trim() : "";
    const address =
      typeof row.Company_Location === "string" ? row.Company_Location.trim() : "";
    if (!name && !address) return null;
    const entry: CompanyLookupCacheEntry = { fetchedAt: Date.now(), name, address };
    COMPANY_LOOKUP_CACHE.set(taxId, entry);
    return { name, address };
  } catch {
    return null;
  }
}
