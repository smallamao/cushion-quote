import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

export async function POST(request: Request) {
  // 🔴 2026-10-15 第二輪稽核：/api/sheets 以外的端點在第一輪被整批漏掉——
  //    我的掃描範圍只做了 /api/sheets/**。這些端點一樣碰公司憑證與營運資料
  //    （Trello／Notion 金鑰、舊系統代理、司機電話、AI 助理工具），
  //    而且同樣只靠 middleware 那一道門。route 層再驗一次。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const payload = (await request.json()) as unknown;
  return NextResponse.json({
    ok: true,
    message: "前端 PDF 正常時可不走此路由，保留 server-side 備援接口。",
    payload,
  });
}
