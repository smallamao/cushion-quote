import { NextResponse } from "next/server";

import posConfig from "@/config/pos-config.json";

export async function GET() {
  return NextResponse.json(posConfig);
}
