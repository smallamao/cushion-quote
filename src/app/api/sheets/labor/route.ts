import { NextResponse } from "next/server";

import { METHODS } from "@/lib/constants";

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    labor: Object.values(METHODS).map((method) => ({
      methodId: method.id,
      methodName: method.label,
      description: method.desc,
      minCai: method.minCai,
      baseThickness: method.baseThickness,
      baseRate: method.baseRate,
      incrementPerHalfInch: method.incrementPerHalfInch,
      thicknessOptions: method.thicknessOptions,
    })),
  });
}
