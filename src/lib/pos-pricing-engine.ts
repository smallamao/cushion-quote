export type AdjRates = { depthPer6cm: number; heightPer6cm: number; widthPer1cm: number }
export type SeatKey = "1人" | "2人" | "3人"
export type SeatRates = Record<SeatKey, AdjRates>

// Parses POS_底價 sheet rows → nested lookup basePrices[style][seatType][materialId] = price
export function parsePosBasePrices(
  rows: string[][]
): Record<string, Record<string, Record<string, number>>> {
  const [header, ...dataRows] = rows;
  const matCols = header.slice(2); // after 款式, 座位
  const result: Record<string, Record<string, Record<string, number>>> = {};
  for (const row of dataRows) {
    const style = row[0];
    const seatType = row[1];
    if (!style || !seatType) continue;
    if (!result[style]) result[style] = {};
    result[style][seatType] = {};
    matCols.forEach((matId, i) => {
      const price = Number(row[i + 2]);
      if (!isNaN(price) && price > 0) result[style][seatType][matId] = price;
    });
  }
  return result;
}

// Parses POS_調整費率 sheet rows → adjRates[materialId] = { "1人": {...}, "2人": {...}, "3人": {...} }
export function parsePosAdjRates(rows: string[][]): Record<string, SeatRates> {
  const [, ...dataRows] = rows;
  const result: Record<string, SeatRates> = {};
  for (const row of dataRows) {
    const matIds = row[1].split(",").map((s) => s.trim());
    const rates: SeatRates = {
      "1人": { depthPer6cm: Number(row[2]), heightPer6cm: Number(row[3]), widthPer1cm: Number(row[8]) },
      "2人": { depthPer6cm: Number(row[4]), heightPer6cm: Number(row[5]), widthPer1cm: Number(row[8]) },
      "3人": { depthPer6cm: Number(row[6]), heightPer6cm: Number(row[7]), widthPer1cm: Number(row[8]) },
    };
    for (const matId of matIds) result[matId] = rates;
  }
  return result;
}

export interface PosAdjustments {
  widthAdjCm: number
  depthAdjCm: number        // 0~+18, step=3; 3cm and 6cm cost the same (1 unit)
  heightAdjCm: number       // 0~+12, step=3; 3cm and 6cm cost the same (1 unit)
  platformWidthAdj: number
  platformDepthAdj: number
  groundOption: "none" | "full" | "half"
  heightReduction: boolean
  removeArmrestCount: number
  usbCount: number
  wirelessChargeCount: number
  slideRailCount: number
}

export interface PosCostBreakdown {
  basePrice: number
  widthCost: number
  depthCost: number
  heightCost: number
  groundCost: number
  heightReductionDiscount: number
  platformCost: number
  armrestDiscount: number
  usbCost: number
  wirelessCost: number
  slideRailCost: number
  subtotal: number
  deposit: number
}

export function calcPosCost(
  basePrice: number,
  adjRates: SeatRates,
  seatKey: SeatKey,
  adj: PosAdjustments,
): PosCostBreakdown {
  const rates = adjRates[seatKey];

  const widthCost = adj.widthAdjCm * rates.widthPer1cm;
  // Both depth and height: 3cm and 6cm cost the same (ceil to nearest 6cm unit)
  const depthCost = Math.ceil(adj.depthAdjCm / 6) * rates.depthPer6cm;
  const heightCost = Math.ceil(adj.heightAdjCm / 6) * rates.heightPer6cm;

  const groundCost =
    adj.groundOption === "full" ? 2000 :
    adj.groundOption === "half" ? 1500 : 0;
  const heightReductionDiscount = adj.heightReduction ? -1000 : 0;

  // Platform: charged only when dimensions change
  const platIncrease = Math.max(0, adj.platformWidthAdj) + Math.max(0, adj.platformDepthAdj);
  const platformCost =
    platIncrease > 0
      ? Math.max(Math.floor((platIncrease * rates.widthPer1cm) / 2), 500)
      : adj.platformWidthAdj !== 0 || adj.platformDepthAdj !== 0
      ? 500
      : 0;

  const armrestDiscount = adj.removeArmrestCount * -1500;
  const usbCost = adj.usbCount * 1500;
  const wirelessCost = adj.wirelessChargeCount * 1200;
  const slideRailCost = adj.slideRailCount * 1000;

  const subtotal =
    basePrice + widthCost + depthCost + heightCost +
    groundCost + heightReductionDiscount + platformCost +
    armrestDiscount + usbCost + wirelessCost + slideRailCost;
  const deposit = Math.round(subtotal * 0.3);

  return {
    basePrice, widthCost, depthCost, heightCost,
    groundCost, heightReductionDiscount, platformCost,
    armrestDiscount, usbCost, wirelessCost, slideRailCost,
    subtotal, deposit,
  };
}
