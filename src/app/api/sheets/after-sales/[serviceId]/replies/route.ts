import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { createReply, listReplies } from "@/lib/after-sales-sheet";

function getSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  return verifySession(token);
}

interface RouteContext {
  params: Promise<{ serviceId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  const { serviceId } = await context.params;
  const replies = await listReplies(serviceId);
  return NextResponse.json({ ok: true, replies });
}

export async function POST(request: Request, context: RouteContext) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  const { serviceId } = await context.params;

  let body: { content?: string; attachments?: string[]; occurredAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!body.content?.trim()) {
    return NextResponse.json({ ok: false, error: "content required" }, { status: 400 });
  }
  const reply = await createReply({
    serviceId,
    author: session.displayName,
    content: body.content.trim(),
    attachments: body.attachments ?? [],
    occurredAt: body.occurredAt,
  });
  if (!reply) {
    return NextResponse.json({ ok: false, error: "建立失敗" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reply }, { status: 201 });
}
