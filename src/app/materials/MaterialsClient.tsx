"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { MaterialForm } from "@/components/materials/MaterialForm";
import { MaterialTable } from "@/components/materials/MaterialTable";
import { useMaterials } from "@/hooks/useMaterials";
import type { Material } from "@/lib/types";
import { Button } from "@/components/ui/button";

export function MaterialsClient() {
  const { materials, loading, source, addMaterial, updateMaterial } =
    useMaterials();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);

  async function handleSave(material: Material) {
    if (editing) {
      await updateMaterial(material);
    } else {
      await addMaterial(material);
    }
    setShowForm(false);
    setEditing(null);
  }

  function handleEdit(material: Material) {
    setEditing(material);
    setShowForm(true);
  }

  async function handleDeactivate(material: Material) {
    if (!confirm(`確定要停用「${material.brand} ${material.colorCode}」嗎？`))
      return;
    await updateMaterial({ ...material, isActive: false });
  }

  function handleCancel() {
    setShowForm(false);
    setEditing(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            材質資料庫
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            管理面料與皮革材質
            {!loading && (
              <span className="ml-2">
                {materials.length} 筆 · 來源 {source}
              </span>
            )}
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5" />
            新增材質
          </Button>
        )}
      </div>

      {showForm && (
        <MaterialForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      <MaterialTable
        materials={materials}
        onEdit={handleEdit}
        onDeactivate={handleDeactivate}
      />
    </div>
  );
}
