import { NextResponse, after } from "next/server";

import { denyIfNotAssignee, requireSession } from "@/lib/api-auth";
import { createReply, findServiceById, listReplies } from "@/lib/after-sales-sheet";
import { getBootstrapAdminEmail } from "@/lib/auth";
import { appOrigin, buildReplyText, sendTelegram, shouldNotifyReply } from "@/lib/telegram";

// 維修記錄裡有客戶的對話與現場狀況。跟主單一樣，非 admin 只能看自己被指派的單。
async function guardService(request: Request, serviceId: string) {
  const guard = await requireSession(request);
  if (guard.denied) return guard;
  if (guard.session.role === "admin") return guard;
  const service = await findServiceById(serviceId);
  if (!service) {
    return { denied: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }) };
  }
  const notMine = denyIfNotAssignee(guard.session, service.assignedTo);
  if (notMine) return { denied: notMine };
  return guard;
}

interface RouteContext {
  params: Promise<{ serviceId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { serviceId } = await context.params;
  const guard = await guardService(request, serviceId);
  if (guard.denied) return guard.denied;
  const replies = await listReplies(serviceId);
  return NextResponse.json({ ok: true, replies });
}

export async function POST(request: Request, context: RouteContext) {
  const { serviceId } = await context.params;
  const guard = await guardService(request, serviceId);
  if (guard.denied) return guard.denied;
  const { session } = guard;

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

  // 師傅／同事回覆推老闆 Telegram（老闆 2026-11-10）；老闆自己回的不推給自己。
  // 放在回應送出之後跑，回覆的人不用等 Telegram。
  if (shouldNotifyReply(session.email, getBootstrapAdminEmail())) {
    const job = async () => {
      try {
        const service = await findServiceById(serviceId).catch(() => null);
        await sendTelegram(
          buildReplyText(
            {
              serviceId,
              clientName: service?.clientName ?? "",
              author: reply.author,
              content: reply.content,
              attachmentCount: reply.attachments.length,
            },
            appOrigin(),
          ),
        );
      } catch (err) {
        console.error("reply telegram failed", err instanceof Error ? err.message : err);
      }
    };
    try {
      after(job);
    } catch {
      void job();
    }
  }
  return NextResponse.json({ ok: true, reply }, { status: 201 });
}
