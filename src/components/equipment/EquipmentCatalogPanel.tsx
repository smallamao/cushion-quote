"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EquipmentModel } from "@/lib/types";

const DEFAULT_CATEGORIES = ["沙發", "型錄傢俱", "椅子", "其他"];

export function EquipmentCatalogPanel() {
  const [equipment, setEquipment] = useState<EquipmentModel[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [modelCode, setModelCode] = useState("");
  const [modelName, setModelName] = useState("");
  const [category, setCategory] = useState("沙發");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sheets/equipment", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        equipment?: EquipmentModel[];
      };
      if (json.ok) setEquipment(json.equipment ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openCreate() {
    setEditingCode(null);
    setModelCode("");
    setModelName("");
    setCategory("沙發");
    setNotes("");
    setShowForm(true);
  }

  function openEdit(e: EquipmentModel) {
    setEditingCode(e.modelCode);
    setModelCode(e.modelCode);
    setModelName(e.modelName);
    setCategory(e.category || "沙發");
    setNotes(e.notes);
    setShowForm(true);
  }

  async function handleSave() {
    if (!modelCode.trim() || !modelName.trim()) {
      alert("編號和名稱必填");
      return;
    }
    setSaving(true);
    try {
      if (editingCode) {
        const res = await fetch("/api/sheets/equipment", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelCode: editingCode,
            modelName: modelName.trim(),
            category: category.trim(),
            notes: notes.trim(),
          }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) {
          alert(json.error ?? "更新失敗");
          return;
        }
      } else {
        const res = await fetch("/api/sheets/equipment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelCode: modelCode.trim(),
            modelName: modelName.trim(),
            category: category.trim(),
            notes: notes.trim(),
          }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) {
          alert(json.error ?? "建立失敗");
          return;
        }
      }
      setShowForm(false);
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(e: EquipmentModel) {
    if (!confirm(`${e.isActive ? "停用" : "啟用"} ${e.modelCode} (${e.modelName})?`)) {
      return;
    }
    await fetch("/api/sheets/equipment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelCode: e.modelCode, isActive: !e.isActive }),
    });
    await reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">
          管理沙發款式與傢俱型錄，售後服務單建立時會從這裡選擇款式
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          新增款式
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          載入中...
        </div>
      )}

      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2 text-left">編號</th>
                <th className="px-3 py-2 text-left">名稱</th>
                <th className="px-3 py-2 text-left">分類</th>
                <th className="px-3 py-2 text-left">備註</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {equipment.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]">
                    尚無款式,點右上角「新增款式」開始建立
                  </td>
                </tr>
              ) : (
                equipment.map((e) => (
                  <tr
                    key={e.modelCode}
                    className={`border-t border-[var(--border)] ${
                      e.isActive ? "" : "opacity-50"
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{e.modelCode}</td>
                    <td className="px-3 py-2">{e.modelName}</td>
                    <td className="px-3 py-2 text-xs">{e.category || "—"}</td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {e.notes || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {e.isActive ? (
                        <span className="text-emerald-600">啟用</span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">停用</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
                          <Pencil className="mr-1 h-3 w-3" />
                          編輯
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleActive(e)}
                          className={e.isActive ? "text-red-600" : "text-emerald-600"}
                        >
                          {e.isActive ? "停用" : "啟用"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-lg)]">
            <h3 className="mb-4 text-base font-semibold">
              {editingCode ? "編輯款式" : "新增款式"}
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="mb-1 block text-xs">款式編號 *</Label>
                <Input
                  value={modelCode}
                  onChange={(e) => setModelCode(e.target.value)}
                  disabled={!!editingCode}
                  placeholder="例: LEO / HAILY / MULE"
                  className="font-mono uppercase"
                />
                {editingCode && (
                  <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                    編號是主鍵,不能修改
                  </p>
                )}
              </div>
              <div>
                <Label className="mb-1 block text-xs">款式名稱 *</Label>
                <Input
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="例: 里歐 / 海力 / 沐樂"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">分類</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2 text-sm"
                >
                  {DEFAULT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">備註</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                取消
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "儲存中..." : editingCode ? "更新" : "建立"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
