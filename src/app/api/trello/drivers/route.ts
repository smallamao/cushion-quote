import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

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

export async function GET(request: Request) {
  // 🔴 2026-10-15 第二輪稽核：/api/sheets 以外的端點在第一輪被整批漏掉——
  //    我的掃描範圍只做了 /api/sheets/**。這些端點一樣碰公司憑證與營運資料
  //    （Trello／Notion 金鑰、舊系統代理、司機電話、AI 助理工具），
  //    而且同樣只靠 middleware 那一道門。route 層再驗一次。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


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
