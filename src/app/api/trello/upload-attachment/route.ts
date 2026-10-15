import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

export async function POST(request: Request) {
  // 🔴 2026-10-15 第二輪稽核：/api/sheets 以外的端點在第一輪被整批漏掉——
  //    我的掃描範圍只做了 /api/sheets/**。這些端點一樣碰公司憑證與營運資料
  //    （Trello／Notion 金鑰、舊系統代理、司機電話、AI 助理工具），
  //    而且同樣只靠 middleware 那一道門。route 層再驗一次。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const formData = await request.formData();
  const cardId = formData.get("cardId");
  const file = formData.get("file");

  if (!cardId || typeof cardId !== "string") {
    return NextResponse.json({ error: "missing cardId" }, { status: 400 });
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }

  const trelloForm = new FormData();
  trelloForm.append("file", file);

  const url = `https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url, { method: "POST", body: trelloForm });
  const data = await res.json() as unknown;
  return NextResponse.json(data, { status: res.status });
}
