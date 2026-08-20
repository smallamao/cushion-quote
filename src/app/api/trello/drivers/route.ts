import { NextResponse } from "next/server";

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

export interface DriverPhoneMap {
  shin: string;
  lou: string;
  fan: string;
  ya: string;
  fu: string;
  hang: string;
  jian: string;
}

export async function GET() {
  const phones: DriverPhoneMap = {
    shin: process.env.DRIVER_PHONE_SHIN ?? "",
    lou:  process.env.DRIVER_PHONE_LOU  ?? "",
    fan:  process.env.DRIVER_PHONE_FAN  ?? "",
    ya:   process.env.DRIVER_PHONE_YA   ?? "",
    fu:   process.env.DRIVER_PHONE_FU   ?? "",
    hang: process.env.DRIVER_PHONE_HANG ?? "",
    jian: process.env.DRIVER_PHONE_JIAN ?? "",
  };
  return NextResponse.json(phones);
}
