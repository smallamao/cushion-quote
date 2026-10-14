import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import {
  createEquipment,
  listEquipment,
  updateEquipment,
} from "@/lib/equipment-sheet";

// 🔴 2026-10-15 修補：/api/sheets/equipment 整個前綴在師傅白名單裡（售後單要選
//    設備型號），但白名單是前綴比對、不分方法，而這支的 POST／PATCH 原本零驗證。
//    結果師傅直接打 API 就能新增或停用設備型號——畫面上他做不到的事。
//    GET 維持開放（選型號要用），寫入限 admin。

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

export async function GET() {
  const equipment = await listEquipment();
  return NextResponse.json({ ok: true, equipment });
}

export async function POST(request: Request) {
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;

  let body: {
    modelCode?: string;
    modelName?: string;
    category?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!body.modelCode?.trim() || !body.modelName?.trim()) {
    return NextResponse.json(
      { ok: false, error: "modelCode 和 modelName 必填" },
      { status: 400 },
    );
  }
  try {
    const equipment = await createEquipment({
      modelCode: body.modelCode,
      modelName: body.modelName,
      category: body.category ?? "",
      notes: body.notes ?? "",
    });
    return NextResponse.json({ ok: true, equipment }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "建立失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;

  let body: {
    modelCode?: string;
    modelName?: string;
    category?: string;
    notes?: string;
    isActive?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!body.modelCode) {
    return NextResponse.json({ ok: false, error: "modelCode required" }, { status: 400 });
  }
  const patch: Partial<{
    modelName: string;
    category: string;
    notes: string;
    isActive: boolean;
  }> = {};
  if (body.modelName !== undefined) patch.modelName = body.modelName;
  if (body.category !== undefined) patch.category = body.category;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.isActive !== undefined) patch.isActive = body.isActive;
  const equipment = await updateEquipment(body.modelCode, patch);
  if (!equipment) {
    return NextResponse.json({ ok: false, error: "設備不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, equipment });
}
