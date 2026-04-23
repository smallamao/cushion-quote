import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { InventoryLot, InventoryTransaction, PurchaseUnit } from "@/lib/types";

const LOT_SHEET = "庫存批次";
const LOT_RANGE_FULL = `${LOT_SHEET}!A:I`;
const LOT_RANGE_DATA = `${LOT_SHEET}!A2:I`;
const TX_SHEET = "庫存異動";
const TX_RANGE_DATA = `${TX_SHEET}!A2:P`;

function rowToLot(row: string[]): InventoryLot {
  return {
    lotId: row[0] ?? "",
    inventoryId: row[1] ?? "",
    productId: row[2] ?? "",
    sourceRef: row[3] ?? "",
    description: row[4] ?? "",
    initialQty: Number(row[5] ?? 0),
    unit: (row[6] as PurchaseUnit) ?? "碼",
    createdAt: row[7] ?? "",
    notes: row[8] ?? "",
  };
}

function lotToRow(lot: InventoryLot): string[] {
  return [
    lot.lotId,
    lot.inventoryId,
    lot.productId,
    lot.sourceRef,
    lot.description,
    String(lot.initialQty),
    lot.unit,
    lot.createdAt,
    lot.notes,
  ];
}

function rowToTransaction(row: string[]): Pick<InventoryTransaction, "lotId" | "quantityDelta"> {
  return {
    lotId: row[15] ?? "",
    quantityDelta: Number(row[7] ?? 0),
  };
}

async function generateLotId(
  client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>,
  now = new Date(),
): Promise<string> {
  const dateToken = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `LOT-${dateToken}-`;
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `${LOT_SHEET}!A2:A`,
  });
  const ids = (response.data.values ?? []).flat() as string[];
  const maxSeq = ids
    .filter((id) => id.startsWith(prefix))
    .reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const inventoryId = searchParams.get("inventoryId")?.trim() ?? "";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ lots: [] as InventoryLot[] });
  }

  try {
    const [lotsRes, txRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: LOT_RANGE_DATA,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: TX_RANGE_DATA,
      }),
    ]);

    const lots = (lotsRes.data.values ?? [])
      .map(rowToLot)
      .filter((l) => l.lotId && (!inventoryId || l.inventoryId === inventoryId));

    const txs = (txRes.data.values ?? [])
      .map(rowToTransaction)
      .filter((t) => t.lotId);

    // Compute remainingQty per lot
    const remainingMap = new Map<string, number>();
    for (const tx of txs) {
      if (!tx.lotId) continue;
      remainingMap.set(tx.lotId, (remainingMap.get(tx.lotId) ?? 0) + tx.quantityDelta);
    }

    const lotsWithRemaining = lots.map((lot) => ({
      ...lot,
      remainingQty: remainingMap.get(lot.lotId) ?? 0,
    }));

    return NextResponse.json({ lots: lotsWithRemaining });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<InventoryLot>;

  if (!payload.inventoryId || !payload.productId) {
    return NextResponse.json(
      { ok: false, error: "inventoryId and productId are required" },
      { status: 400 },
    );
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const now = new Date();
    const lot: InventoryLot = {
      lotId: payload.lotId?.trim() || (await generateLotId(client, now)),
      inventoryId: payload.inventoryId.trim(),
      productId: payload.productId.trim(),
      sourceRef: payload.sourceRef?.trim() ?? "",
      description: payload.description?.trim() ?? "",
      initialQty: Number(payload.initialQty ?? 0),
      unit: payload.unit ?? "碼",
      createdAt: now.toISOString(),
      notes: payload.notes?.trim() ?? "",
    };

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: LOT_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [lotToRow(lot)] },
    });

    return NextResponse.json({ ok: true, lot }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
