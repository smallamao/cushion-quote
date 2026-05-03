"use client";

import { useState } from "react";
import { Plus, Pencil, Check, X, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDrivers } from "@/hooks/useDrivers";
import type { DriverRecord } from "@/lib/drivers-sheet";

type EditState = Omit<DriverRecord, "key">;

const EMPTY_EDIT: EditState = {
  title: "",
  confirmTitle: "",
  phoneNumber: "",
  labelId: "",
  active: true,
};

function DriverRow({
  driver,
  onSave,
  onToggleActive,
}: {
  driver: DriverRecord;
  onSave: (patch: Partial<Omit<DriverRecord, "key">>) => Promise<void>;
  onToggleActive: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>({
    title: driver.title,
    confirmTitle: driver.confirmTitle,
    phoneNumber: driver.phoneNumber,
    labelId: driver.labelId,
    active: driver.active,
  });
  const [saving, setSaving] = useState(false);

  function field(key: keyof EditState, label: string, placeholder = "") {
    return (
      <div>
        <Label className="text-[11px]">{label}</Label>
        <Input
          value={String(form[key])}
          onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="h-7 text-xs"
        />
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-[var(--accent)] bg-[var(--bg-elevated)] p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {field("title", "稱呼（排程出貨顯示）", "例：羅先生 [0725-ED]")}
          {field("confirmTitle", "確認單稱謂", "例：阿伯～")}
          {field("phoneNumber", "電話", "例：0933208509")}
          {field("labelId", "Trello Label ID", "5d00c0ff...")}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
            />
            啟用
          </label>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              <X className="mr-1 h-3 w-3" />取消
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              <Check className="mr-1 h-3 w-3" />
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${!driver.active ? "opacity-40" : "border-[var(--border)]"}`}>
      <div className="w-5 font-mono text-[10px] text-[var(--text-tertiary)]">{driver.key}</div>
      <div className="min-w-0 flex-1">
        <span className="font-medium">{driver.title}</span>
        {driver.confirmTitle && (
          <span className="ml-2 text-xs text-[var(--text-tertiary)]">{driver.confirmTitle}</span>
        )}
      </div>
      <div className="text-xs text-[var(--text-secondary)]">{driver.phoneNumber || "—"}</div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => void onToggleActive()}
          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
        >
          {driver.active ? "停用" : "啟用"}
        </button>
      </div>
    </div>
  );
}

export function DriversManagementPanel() {
  const { drivers, loading, error, reload } = useDrivers();
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState<DriverRecord>({ ...EMPTY_EDIT, key: "" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [seeding, setSeeding] = useState(false);

  async function handleSeedDefaults() {
    setSeeding(true);
    try {
      const res = await fetch("/api/sheets/drivers/seed", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) { alert(json.error ?? "匯入失敗"); return; }
      reload();
    } catch {
      alert("網路錯誤");
    } finally {
      setSeeding(false);
    }
  }

  async function handleSave(key: string, patch: Partial<Omit<DriverRecord, "key">>) {
    await fetch(`/api/sheets/drivers/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    reload();
  }

  async function handleToggle(driver: DriverRecord) {
    await fetch(`/api/sheets/drivers/${driver.key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !driver.active }),
    });
    reload();
  }

  async function handleAdd() {
    setAddError("");
    if (!newForm.key.trim() || !newForm.title.trim()) {
      setAddError("key 與稱呼為必填");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/sheets/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) { setAddError(json.error ?? "新增失敗"); return; }
      setShowAdd(false);
      setNewForm({ ...EMPTY_EDIT, key: "" });
      reload();
    } finally {
      setAdding(false);
    }
  }

  function newField(key: keyof DriverRecord, label: string, placeholder = "") {
    return (
      <div>
        <Label className="text-[11px]">{label}</Label>
        <Input
          value={String(newForm[key])}
          onChange={(e) => setNewForm((p) => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="h-7 text-xs"
        />
      </div>
    );
  }

  if (loading) return <p className="py-4 text-xs text-[var(--text-tertiary)]">載入中…</p>;
  if (error) return <p className="py-4 text-xs text-red-600">{error}</p>;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {drivers.map((d) => (
          <DriverRow
            key={d.key}
            driver={d}
            onSave={(patch) => handleSave(d.key, patch)}
            onToggleActive={() => handleToggle(d)}
          />
        ))}
        {drivers.length === 0 && (
          <div className="py-4">
            <p className="text-xs text-[var(--text-tertiary)]">尚無司機資料。</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => void handleSeedDefaults()}
              disabled={seeding}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              {seeding ? "匯入中…" : "載入預設司機資料"}
            </Button>
          </div>
        )}
      </div>

      {showAdd ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
          <p className="mb-2 text-xs font-medium">新增司機</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {newField("key", "key（唯一識別）", "例：lou")}
            {newField("title", "稱呼", "例：羅先生 [0725-ED]")}
            {newField("confirmTitle", "確認單稱謂", "例：阿伯～")}
            {newField("phoneNumber", "電話", "例：0933208509")}
            {newField("labelId", "Trello Label ID", "5d00c0ff...")}
          </div>
          {addError && <p className="mt-1.5 text-xs text-red-600">{addError}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setAddError(""); }}>取消</Button>
            <Button size="sm" onClick={() => void handleAdd()} disabled={adding}>
              {adding ? "新增中…" : "確認新增"}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />新增司機
        </Button>
      )}
    </div>
  );
}
