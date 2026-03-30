import type { CaiRoundingMode, FlexQuoteItem, PanelInputMode, SplitDirection, VersionLineRecord } from "@/lib/types";

type SplitLineFields = Pick<
  VersionLineRecord,
  "panelInputMode" | "surfaceWidthCm" | "surfaceHeightCm" | "splitDirection" | "splitCount" | "caiRoundingMode" | "customSplitSizesCsv"
>;

type SplitItemFields = Pick<
  FlexQuoteItem,
  "panelInputMode" | "surfaceWidthCm" | "surfaceHeightCm" | "splitDirection" | "splitCount" | "caiRoundingMode" | "customSplitSizes"
>;

export function parseCustomSplitSizesCsv(csv: string): number[] {
  return csv
    .split(",")
    .map((size) => Number(size.trim()))
    .filter((size) => Number.isFinite(size) && size > 0);
}

export function formatCustomSplitSizesCsv(customSplitSizes?: number[]): string {
  return customSplitSizes?.join(",") ?? "";
}

export function buildSplitItemFields(line: SplitLineFields): SplitItemFields {
  return {
    panelInputMode: (line.panelInputMode as PanelInputMode) || undefined,
    surfaceWidthCm: line.surfaceWidthCm || undefined,
    surfaceHeightCm: line.surfaceHeightCm || undefined,
    splitDirection: (line.splitDirection as SplitDirection) || undefined,
    splitCount: line.splitCount || undefined,
    caiRoundingMode: (line.caiRoundingMode as CaiRoundingMode) || undefined,
    customSplitSizes: line.customSplitSizesCsv ? parseCustomSplitSizesCsv(line.customSplitSizesCsv) : undefined,
  };
}

export function buildSplitLineFields(item: SplitItemFields): SplitLineFields {
  return {
    panelInputMode: item.panelInputMode ?? "",
    surfaceWidthCm: item.surfaceWidthCm ?? 0,
    surfaceHeightCm: item.surfaceHeightCm ?? 0,
    splitDirection: item.splitDirection ?? "",
    splitCount: item.splitCount ?? 0,
    caiRoundingMode: item.caiRoundingMode ?? "",
    customSplitSizesCsv: formatCustomSplitSizesCsv(item.customSplitSizes),
  };
}
