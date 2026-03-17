import { NextResponse } from "next/server";

import { METHODS } from "@/lib/constants";

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
