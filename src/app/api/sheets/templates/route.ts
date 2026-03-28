import { NextRequest, NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { FlexQuoteItem, QuoteTemplate, TemplateRecord } from "@/lib/types";

const SHEET_NAME = "報價範本";

// 將 Google Sheets 列轉換為 QuoteTemplate 物件
function rowToTemplate(row: string[]): QuoteTemplate {
  const [templateId, templateName, description, itemsJson, isActive, createdAt, updatedAt] = row;

  let items: FlexQuoteItem[] = [];
  try {
    items = itemsJson ? JSON.parse(itemsJson) : [];
  } catch (e) {
    console.error("Failed to parse items JSON:", e);
  }

  return {
    templateId: templateId || "",
    templateName: templateName || "",
    description: description || "",
    items,
    isActive: isActive === "TRUE" || isActive === "true",
    createdAt: createdAt || "",
    updatedAt: updatedAt || "",
  };
}

// 將 QuoteTemplate 轉換為 Google Sheets 列
function templateToRow(template: QuoteTemplate): string[] {
  return [
    template.templateId,
    template.templateName,
    template.description,
    JSON.stringify(template.items),
    template.isActive ? "TRUE" : "FALSE",
    template.createdAt,
    template.updatedAt,
  ];
}

// GET: 獲取所有範本
export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET_NAME}!A2:G`,
    });

    const rows = response.data.values || [];
    const templates = rows.map(rowToTemplate).filter((t) => t.templateId && t.isActive);

    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST: 新增或更新範本
export async function POST(request: NextRequest) {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { template }: { template: QuoteTemplate } = body;

    if (!template || !template.templateName) {
      return NextResponse.json({ ok: false, error: "缺少必要欄位" }, { status: 400 });
    }

    // 如果沒有 templateId，生成新的
    if (!template.templateId) {
      // 獲取現有範本以生成新 ID
      const response = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: `${SHEET_NAME}!A2:A`,
      });

      const existingIds = (response.data.values || []).map((row) => row[0] || "");
      const maxNum = Math.max(0, ...existingIds.map((id) => parseInt(id.replace("TPL-", "") || "0")));
      template.templateId = `TPL-${String(maxNum + 1).padStart(3, "0")}`;
      template.createdAt = new Date().toISOString();
    }

    // 更新時間
    template.updatedAt = new Date().toISOString();

    // 檢查是否已存在
    const allResponse = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET_NAME}!A2:G`,
    });

    const allRows = allResponse.data.values || [];
    const existingIndex = allRows.findIndex((row) => row[0] === template.templateId);

    if (existingIndex >= 0) {
      // 更新現有範本
      const rowNumber = existingIndex + 2; // +2 因為從 A2 開始，且索引從 0 開始
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `${SHEET_NAME}!A${rowNumber}:G${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [templateToRow(template)] },
      });
    } else {
      // 新增範本
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: `${SHEET_NAME}!A2`,
        valueInputOption: "RAW",
        requestBody: { values: [templateToRow(template)] },
      });
    }

    return NextResponse.json({ ok: true, template });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// DELETE: 刪除範本（軟刪除，設為 isActive = false）
export async function DELETE(request: NextRequest) {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get("templateId");

    if (!templateId) {
      return NextResponse.json({ ok: false, error: "缺少 templateId" }, { status: 400 });
    }

    // 獲取所有範本
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET_NAME}!A2:G`,
    });

    const rows = response.data.values || [];
    const index = rows.findIndex((row) => row[0] === templateId);

    if (index < 0) {
      return NextResponse.json({ ok: false, error: "找不到範本" }, { status: 404 });
    }

    // 軟刪除：設為 isActive = FALSE
    const rowNumber = index + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET_NAME}!E${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [["FALSE"]] },
    });

    return NextResponse.json({ ok: true, templateId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
