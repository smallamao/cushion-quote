import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

import posConfig from "@/config/pos-config.json";

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 🔴 2026-10-15 第二輪稽核：/api/sheets 以外的端點在第一輪被整批漏掉——
  //    我的掃描範圍只做了 /api/sheets/**。這些端點一樣碰公司憑證與營運資料
  //    （Trello／Notion 金鑰、舊系統代理、司機電話、AI 助理工具），
  //    而且同樣只靠 middleware 那一道門。route 層再驗一次。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  return NextResponse.json(posConfig);
}
