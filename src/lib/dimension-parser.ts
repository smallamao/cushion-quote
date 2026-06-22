export interface ParsedDimension {
  widthCm: number;
  heightCm: number;
  qty: number;
}

export interface FabricCalculationResult {
  suggestedQty: number;
  unit: "碼" | "公尺";
  breakdown: ParsedDimension[];
  totalAreaCm2: number;
  fabricWidthCm: number;
  wrapCm: number;
  wasteRate: number;
}

export function parseDimensionLines(text: string): ParsedDimension[] {
  if (!text?.trim()) return [];
  const results: ParsedDimension[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Match: w197 x 48 x 5cm *1pcs OR w234.5×71.5×5 cm OR 96 x 176cm *5
    const dimMatch = line.match(/w?(\d+\.?\d*)\s*[x×]\s*(\d+\.?\d*)/i);
    if (!dimMatch) continue;
    const qtyMatch = line.match(/\*\s*(\d+)/);
    results.push({
      widthCm: parseFloat(dimMatch[1]),
      heightCm: parseFloat(dimMatch[2]),
      qty: qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
    });
  }
  return results;
}

export function calculateFabricNeeded({
  dimensions,
  fabricWidthCm = 145,
  wrapCm = 10,
  wasteRate = 0.1,
  unit = "碼",
}: {
  dimensions: string;
  fabricWidthCm?: number;
  wrapCm?: number;
  wasteRate?: number;
  unit?: "碼" | "公尺";
}): FabricCalculationResult {
  const breakdown = parseDimensionLines(dimensions);
  const totalAreaCm2 = breakdown.reduce((sum, d) => {
    return sum + (d.widthCm + 2 * wrapCm) * (d.heightCm + 2 * wrapCm) * d.qty;
  }, 0);
  const totalLengthCm = totalAreaCm2 / fabricWidthCm;
  const withWaste = totalLengthCm * (1 + wasteRate);
  const suggestedQty =
    unit === "碼"
      ? Math.ceil((withWaste / 91.44) * 10) / 10
      : Math.ceil((withWaste / 100) * 10) / 10;
  return { suggestedQty, unit, breakdown, totalAreaCm2, fabricWidthCm, wrapCm, wasteRate };
}
