import { NextResponse } from "next/server";

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
