import { NextResponse } from "next/server";

import posConfig from "@/config/pos-config.json";

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(posConfig);
}
