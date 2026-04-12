"use client";

import { FileText, Pencil, Plus, Save, X } from "lucide-react";
import { useMemo, useState } from "react";

import { StatementModal } from "@/components/suppliers/StatementModal";
import { useSuppliers } from "@/hooks/useSuppliers";
import type { Supplier } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_SUPPLIER: Supplier = {
  supplierId: "",
  name: "",
  shortName: "",
  contactPerson: "",
  phone: "",
  mobile: "",
  fax: "",
  email: "",
  taxId: "",
  address: "",
  paymentMethod: "",
  paymentTerms: "",
  notes: "",
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

function generateSupplierId(existing: Supplier[]): string {
  const nums = existing
    .map((s) => {
      const m = s.supplierId.match(/^PS(\d+)$/);
      return m ? Number(m[1]) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `PS${String(max + 1).padStart(3, "0")}`;
}

export function SuppliersClient() {
  const { suppliers, loading, addSupplier, updateSupplier } = useSuppliers();
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Supplier>(EMPTY_SUPPLIER);
  const [editing, setEditing] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return suppliers
      .filter((s) => showInactive || s.isActive)
      .filter((s) => {
        if (!q) return true;
        return [s.name, s.shortName, s.contactPerson, s.phone, s.mobile, s.taxId, s.supplierId]
          .some((f) => (f || "").toLowerCase().includes(q));
      })
      .sort((a, b) => a.supplierId.localeCompare(b.supplierId));
  }, [suppliers, keyword, showInactive]);

  function openNew() {
    setDraft({ ...EMPTY_SUPPLIER, supplierId: generateSupplierId(suppliers) });
    setEditing(false);
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setDraft({ ...s });
    setEditing(true);
    setShowForm(true);
  }

  function openStatementModal(supplier: Supplier) {
    setStatementSupplier(supplier);
    setStatementModalOpen(true);
  }

  function closeStatementModal() {
    setStatementModalOpen(false);
    setStatementSupplier(null);
  }

  async function handleSave() {
    if (!draft.name.trim()) {
      alert("請輸入廠商名稱");
      return;
    }
    if (editing) {
      await updateSupplier(draft);
    } else {
      await addSupplier(draft);
    }
    setShowForm(false);
  }

  function update<K extends keyof Supplier>(key: K, value: Supplier[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            廠商管理
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {loading ? "載入中..." : `${filtered.length} / ${suppliers.length} 家廠商`}
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> 新增廠商
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋名稱 / 簡稱 / 聯絡人 / 電話 / 統編"
          className="max-w-sm"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          顯示停用廠商
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--text-secondary)]">
            <tr>
              <th className="px-3 py-2 text-left">編號</th>
              <th className="px-3 py-2 text-left">廠商名稱</th>
              <th className="px-3 py-2 text-left">簡稱</th>
              <th className="px-3 py-2 text-left">聯絡人</th>
              <th className="px-3 py-2 text-left">電話 / 行動</th>
              <th className="px-3 py-2 text-left">統編</th>
              <th className="px-3 py-2 text-left">付款</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.supplierId}
                className={`border-t border-[var(--border)] ${
                  s.isActive ? "" : "text-[var(--text-tertiary)]"
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs">{s.supplierId}</td>
                <td className="px-3 py-2">{s.name}</td>
                <td className="px-3 py-2">{s.shortName}</td>
                <td className="px-3 py-2">{s.contactPerson}</td>
                <td className="px-3 py-2 text-xs">
                  {s.phone}
                  {s.mobile ? (
                    <>
                      <br />
                      {s.mobile}
                    </>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{s.taxId}</td>
                <td className="px-3 py-2 text-xs">
                  {s.paymentMethod}
                  {s.paymentTerms ? ` / ${s.paymentTerms}` : ""}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openStatementModal(s)}
                      title="產生對帳報表"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-[var(--text-tertiary)]"
                >
                  {loading ? "載入中..." : "沒有符合條件的廠商"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-[var(--surface)] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {editing ? "編輯廠商" : "新增廠商"}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>廠商編號</Label>
                <Input
                  value={draft.supplierId}
                  onChange={(e) => update("supplierId", e.target.value)}
                  disabled={editing}
                />
              </div>
              <div>
                <Label>狀態</Label>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => update("isActive", e.target.checked)}
                  />
                  啟用中
                </label>
              </div>
              <div>
                <Label>廠商全名 *</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => update("name", e.target.value)}
                />
              </div>
              <div>
                <Label>廠商簡稱</Label>
                <Input
                  value={draft.shortName}
                  onChange={(e) => update("shortName", e.target.value)}
                />
              </div>
              <div>
                <Label>聯絡人</Label>
                <Input
                  value={draft.contactPerson}
                  onChange={(e) => update("contactPerson", e.target.value)}
                />
              </div>
              <div>
                <Label>統一編號</Label>
                <Input
                  value={draft.taxId}
                  onChange={(e) => update("taxId", e.target.value)}
                />
              </div>
              <div>
                <Label>電話</Label>
                <Input
                  value={draft.phone}
                  onChange={(e) => update("phone", e.target.value)}
                />
              </div>
              <div>
                <Label>行動電話</Label>
                <Input
                  value={draft.mobile}
                  onChange={(e) => update("mobile", e.target.value)}
                />
              </div>
              <div>
                <Label>傳真</Label>
                <Input
                  value={draft.fax}
                  onChange={(e) => update("fax", e.target.value)}
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  value={draft.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Label>地址</Label>
                <Input
                  value={draft.address}
                  onChange={(e) => update("address", e.target.value)}
                />
              </div>
              <div>
                <Label>付款方式</Label>
                <Input
                  value={draft.paymentMethod}
                  onChange={(e) => update("paymentMethod", e.target.value)}
                  placeholder="電匯 / 支票 / 現金"
                />
              </div>
              <div>
                <Label>付款條件</Label>
                <Input
                  value={draft.paymentTerms}
                  onChange={(e) => update("paymentTerms", e.target.value)}
                  placeholder="月結 30"
                />
              </div>
              <div className="md:col-span-2">
                <Label>備註</Label>
                <Textarea
                  value={draft.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                取消
              </Button>
              <Button onClick={handleSave}>
                <Save className="mr-1 h-4 w-4" /> 儲存
              </Button>
            </div>
          </div>
        </div>
      )}

      <StatementModal
        isOpen={statementModalOpen}
        onClose={closeStatementModal}
        supplier={statementSupplier}
      />
    </div>
  );
}
