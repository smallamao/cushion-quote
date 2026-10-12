import { NextRequest, NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import { ORDER_RANGE_DATA, ORDER_SHEET, orderRowToRecord } from "@/lib/order-utils";
import {
  NOTION_API,
  buildNotionProperties,
  findNotionPageForOrder,
  notionHeaders,
} from "@/lib/notion-order";

async function upsertImageBlock(pageId: string, imageUrl: string): Promise<void> {
  const blocksRes = await fetch(`${NOTION_API}/blocks/${pageId}/children`, { headers: notionHeaders() });
  if (blocksRes.ok) {
    const blocksData = (await blocksRes.json()) as { results?: { id: string; type: string }[] };
    for (const block of blocksData.results ?? []) {
      if (block.type === "image") {
        await fetch(`${NOTION_API}/blocks/${block.id}`, { method: "DELETE", headers: notionHeaders() });
      }
    }
  }
  await fetch(`${NOTION_API}/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({
      children: [{ type: "image", image: { type: "external", external: { url: imageUrl } } }],
    }),
  });
}

export async function POST(req: NextRequest) {
  const { orderId, jpgUrl } = (await req.json()) as { orderId: string; jpgUrl?: string };
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });

  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_ORDER_DB_ID;
  if (!token || !dbId) return NextResponse.json({ ok: false, error: "Notion 未設定" }, { status: 503 });

  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "Sheets 未設定" }, { status: 503 });

  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: ORDER_RANGE_DATA,
  });
  const rows = (res.data.values ?? []) as string[][];
  const row = rows.find((r) => r[0] === orderId);
  if (!row) return NextResponse.json({ ok: false, error: "訂單不存在" }, { status: 404 });

  const order = orderRowToRecord(row);
  const properties = buildNotionProperties(order);

  const existingId = order.notionPageId || (await findNotionPageForOrder(order, dbId));

  let notionPageId: string;
  let action: "created" | "updated";

  if (existingId) {
    const upRes = await fetch(`${NOTION_API}/pages/${existingId}`, {
      method: "PATCH",
      headers: notionHeaders(),
      body: JSON.stringify({ properties }),
    });
    if (!upRes.ok) {
      const err = (await upRes.json()) as { message?: string };
      return NextResponse.json({ ok: false, error: err.message ?? "Notion 更新失敗" }, { status: 500 });
    }
    notionPageId = existingId;
    action = "updated";
  } else {
    const crRes = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify({ parent: { database_id: dbId }, properties }),
    });
    if (!crRes.ok) {
      const err = (await crRes.json()) as { message?: string };
      return NextResponse.json({ ok: false, error: err.message ?? "Notion 建立失敗" }, { status: 500 });
    }
    const page = (await crRes.json()) as { id: string };
    notionPageId = page.id;
    action = "created";
  }

  // 推上 Notion 看板＝這張單已經開完內容，所以「待建立內容」在此自動轉「排程/生產中」。
  //
  // 為什麼用這個時間點而不是「填了交期」（老闆 2026-10-12 指正）：
  // 訂製品大多是**做好才通知客人**，交期欄常常到最後才填，拿它當訊號會讓單子
  // 一直卡在「待建立內容」。按同步是人刻意做的動作，而且本來就在流程裡，
  // 不算新增人工步驟。交期那條保留當保底，誰先到算誰。
  const advanceStatus = order.status === "pending_setup";

  const writes: { range: string; values: string[][] }[] = [];
  const rowIndex = rows.findIndex((r) => r[0] === orderId);
  if (rowIndex !== -1) {
    // 首次同步把 pageId 存回訂單（唯一鍵綁定）；之後狀態變更直接用 ID 更新，不再靠名稱比對
    if (order.notionPageId !== notionPageId) {
      writes.push({ range: `${ORDER_SHEET}!AV${rowIndex + 2}`, values: [[notionPageId]] });
    }
    if (advanceStatus) {
      // 狀態在第 9 欄（index 8）＝ I 欄
      writes.push({ range: `${ORDER_SHEET}!I${rowIndex + 2}`, values: [["production"]] });
    }
  }
  if (writes.length > 0) {
    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: writes },
    });
  }

  if (jpgUrl) {
    await upsertImageBlock(notionPageId, jpgUrl);
  }

  const notionUrl = `https://notion.so/${notionPageId.replace(/-/g, "")}`;
  // 回傳狀態讓訂單頁即時更新，不必重新整理才看到已轉為「排程/生產中」
  return NextResponse.json({
    ok: true,
    action,
    notionPageId,
    notionUrl,
    status: advanceStatus ? "production" : order.status,
    statusAdvanced: advanceStatus,
  });
}
