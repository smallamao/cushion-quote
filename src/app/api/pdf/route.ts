import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = (await request.json()) as unknown;
  return NextResponse.json({
    ok: true,
    message: "前端 PDF 正常時可不走此路由，保留 server-side 備援接口。",
    payload,
  });
}
