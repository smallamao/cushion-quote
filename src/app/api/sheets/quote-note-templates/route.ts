import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { QUOTE_NOTE_TEMPLATES, type QuoteNoteTemplate } from "@/lib/quote-note-templates";

const SHEET = "報價補充底稿";
const RANGE_DATA = `${SHEET}!A2:B100`;

// GET /api/sheets/quote-note-templates
// 讀取自助管理的補充說明底稿；分頁不存在或為空時回傳程式內建預設
// （首次儲存時 PUT 會自動建立分頁）。
export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    const templates: QuoteNoteTemplate[] = rows
      .filter((r) => (r[0] ?? "").trim())
      .map((r) => ({
        name: (r[0] ?? "").trim(),
        lines: (r[1] ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
      }));
    if (templates.length === 0) {
      return NextResponse.json({ ok: true, templates: QUOTE_NOTE_TEMPLATES, source: "default" });
    }
    return NextResponse.json({ ok: true, templates, source: "sheet" });
  } catch {
    // 分頁尚未建立 → 用內建預設
    return NextResponse.json({ ok: true, templates: QUOTE_NOTE_TEMPLATES, source: "default" });
  }
}

// PUT /api/sheets/quote-note-templates
// Body: { templates: { name, lines[] }[] } — 整份取代（底稿數量小，全量寫入最單純）
export async function PUT(request: Request) {
  let body: { templates?: QuoteNoteTemplate[] };
  try {
    body = (await request.json()) as { templates?: QuoteNoteTemplate[] };
  } catch {
    return NextResponse.json({ ok: false, error: "格式錯誤" }, { status: 400 });
  }
  const templates = (body.templates ?? [])
    .map((t) => ({
      name: (t.name ?? "").trim(),
      lines: (t.lines ?? []).map((l) => l.trim()).filter(Boolean),
    }))
    .filter((t) => t.name);
  if (templates.length === 0) {
    return NextResponse.json({ ok: false, error: "至少需要一組底稿" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // 分頁不存在就建立
    const meta = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
      fields: "sheets.properties",
    });
    const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET);
    if (!exists) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: SHEET } } }] },
      });
    }

    // 全量取代：清空 → 表頭 + 資料
    await client.sheets.spreadsheets.values.clear({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A1:B100`,
    });
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          ["名稱", "內容（每行一句）"],
          ...templates.map((t) => [t.name, t.lines.join("\n")]),
        ],
      },
    });

    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
