import type { Method } from "@/lib/types";

export interface CutPiece {
  name: string;
  widthCm: number;
  lengthCm: number;
  qty: number;
  material: "primary" | "secondary";
}

export interface FabricLayoutResult {
  cutPieces: CutPiece[];
  primaryPieces: CutPiece[];
  totalLengthCm: number;
  exactYards: number;
  roundedYards: number;
}

const CM_PER_YARD = 91.44;
const DEFAULT_FABRIC_WIDTH = 137;
const SEAM = 5;

// W=寬度cm, L=深度cm, H=泡棉厚度cm
export function getCutPieces(method: Method, W: number, L: number, H: number): CutPiece[] {
  const pieces: CutPiece[] = [];

  switch (method) {
    case "flat":
      pieces.push({ name: "主體", widthCm: W + SEAM, lengthCm: L + SEAM, qty: 1, material: "primary" });
      break;

    case "single_headboard":
      pieces.push({ name: "主體 (含包邊)", widthCm: W + H + SEAM, lengthCm: L + H + SEAM, qty: 1, material: "primary" });
      break;

    case "removable_headboard":
      pieces.push({ name: "正面", widthCm: W + SEAM, lengthCm: L + SEAM, qty: 2, material: "primary" });
      pieces.push({ name: "側邊條 (上/左/右)", widthCm: H + SEAM, lengthCm: W + L * 2 + 10, qty: 1, material: "primary" });
      pieces.push({ name: "拉鍊蓋片", widthCm: 5, lengthCm: W + 10, qty: 2, material: "primary" });
      break;

    case "single_daybed":
      pieces.push({ name: "正面", widthCm: W + SEAM, lengthCm: L + SEAM, qty: 1, material: "primary" });
      pieces.push({ name: "底面 (天鵝絨)", widthCm: W + SEAM, lengthCm: L + SEAM, qty: 1, material: "secondary" });
      pieces.push({ name: "側邊條", widthCm: H + SEAM, lengthCm: (W + L) * 2 + SEAM, qty: 1, material: "primary" });
      pieces.push({ name: "拉鍊蓋片", widthCm: 5, lengthCm: W + 10, qty: 2, material: "primary" });
      break;

    case "double_daybed":
      pieces.push({ name: "正面", widthCm: W + SEAM, lengthCm: L + SEAM, qty: 1, material: "primary" });
      pieces.push({ name: "底面", widthCm: W + SEAM, lengthCm: L + SEAM, qty: 1, material: "primary" });
      pieces.push({ name: "側邊條", widthCm: H + SEAM, lengthCm: (W + L) * 2 + SEAM, qty: 1, material: "primary" });
      pieces.push({ name: "拉鍊蓋片", widthCm: 5, lengthCm: W + 10, qty: 2, material: "primary" });
      break;

    case "foam_core":
      break;
  }

  return pieces;
}

interface LayoutPiece {
  w: number;
  h: number;
}

function splitPiece(piece: LayoutPiece, maxLength: number): LayoutPiece[] {
  if (piece.h <= maxLength) return [piece];
  const segments = Math.ceil(piece.h / maxLength);
  const segmentHeight = piece.h / segments;
  return Array.from({ length: segments }, () => ({ w: piece.w, h: segmentHeight }));
}

// FFDH shelf packing: arrange pieces on fixed-width fabric roll, return total length (cm)
function shelfPack(pieces: LayoutPiece[], fabricWidth: number): number {
  if (pieces.length === 0) return 0;

  const sorted = [...pieces].sort((a, b) => b.h - a.h);
  const shelves: { height: number; remainingWidth: number }[] = [];

  for (const piece of sorted) {
    let placed = false;
    for (const shelf of shelves) {
      if (piece.w <= shelf.remainingWidth && piece.h <= shelf.height) {
        shelf.remainingWidth -= piece.w;
        placed = true;
        break;
      }
    }

    if (!placed) {
      shelves.push({ height: piece.h, remainingWidth: fabricWidth - piece.w });
    }
  }

  return shelves.reduce((sum, s) => sum + s.height, 0);
}

export function calculateFabricUsage(
  cutPieces: CutPiece[],
  itemQty: number,
  fabricWidth: number = DEFAULT_FABRIC_WIDTH,
): FabricLayoutResult {
  const primaryPieces = cutPieces.filter((p) => p.material === "primary");

  if (primaryPieces.length === 0) {
    return { cutPieces, primaryPieces, totalLengthCm: 0, exactYards: 0, roundedYards: 0 };
  }

  const layoutPieces: LayoutPiece[] = [];

  for (const piece of primaryPieces) {
    const totalCount = piece.qty * itemQty;
    for (let i = 0; i < totalCount; i++) {
      let w = Math.min(piece.widthCm, piece.lengthCm);
      let h = Math.max(piece.widthCm, piece.lengthCm);

      if (w > fabricWidth) {
        [w, h] = [h, w];
      }

      if (w > fabricWidth) {
        const segments = Math.ceil(w / fabricWidth);
        const segmentWidth = w / segments;
        for (let s = 0; s < segments; s++) {
          layoutPieces.push(...splitPiece({ w: segmentWidth, h }, fabricWidth));
        }
      } else {
        layoutPieces.push(...splitPiece({ w, h }, fabricWidth));
      }
    }
  }

  const totalLengthCm = shelfPack(layoutPieces, fabricWidth);
  const exactYards = Math.round((totalLengthCm / CM_PER_YARD) * 100) / 100;
  const roundedYards = Math.ceil(exactYards);

  return { cutPieces, primaryPieces, totalLengthCm, exactYards, roundedYards };
}

export function calculateFabric(
  method: Method,
  widthCm: number,
  lengthCm: number,
  thicknessIn: number,
  qty: number,
  fabricWidth: number = DEFAULT_FABRIC_WIDTH,
): FabricLayoutResult {
  const thicknessCm = thicknessIn * 2.54;
  const cutPieces = getCutPieces(method, widthCm, lengthCm, thicknessCm);
  return calculateFabricUsage(cutPieces, qty, fabricWidth);
}
