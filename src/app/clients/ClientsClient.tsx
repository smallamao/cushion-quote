"use client";

import { Loader2, Pencil, Plus, Save, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useClients } from "@/hooks/useClients";
import {
  CHANNEL_LABELS,
  CLIENT_TYPE_LABELS,
} from "@/lib/constants";
import type {
  Channel,
  Client,
  ClientType,
  CommissionMode,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_CLIENT: Client = {
  id: "",
  companyName: "",
  shortName: "",
  clientType: "other",
  channel: "wholesale",
  contactName: "",
  phone: "",
  phone2: "",
  lineId: "",
  email: "",
  address: "",
  taxId: "",
  commissionMode: "default",
  commissionRate: 0,
  paymentTerms: "",
  defaultNotes: "",
  isActive: true,
  createdAt: "",
  updatedAt: "",
  notes: "",
};

export function ClientsClient() {
  const { clients, loading, addClient, updateClient } = useClients();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.companyName, c.shortName, c.contactName, c.phone, c.taxId].some(
        (f) => f.toLowerCase().includes(q),
      ),
    );
  }, [clients, keyword]);

  function handleEdit(client: Client) {
    setEditing(client);
    setShowForm(true);
  }

  async function handleSave(client: Client) {
    if (editing) {
      await updateClient(client);
    } else {
      await addClient(client);
    }
    setShowForm(false);
    setEditing(null);
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
            客戶管理
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {loading ? "載入中..." : `${clients.length} 位客戶`}
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5" />
            新增客戶
          </Button>
        )}
      </div>

      {showForm && (
        <ClientForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      <div className="card-surface overflow-hidden rounded-[var(--radius-lg)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <Input
            placeholder="搜尋公司、聯絡人、電話、統編⋯"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="max-w-xs"
          />
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            載入中...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-2.5">公司名稱</th>
                  <th className="px-4 py-2.5">類型</th>
                  <th className="px-4 py-2.5">通路</th>
                  <th className="px-4 py-2.5">聯絡人</th>
                  <th className="px-4 py-2.5">電話</th>
                  <th className="px-4 py-2.5">統編</th>
                  <th className="w-12 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => (
                  <tr key={client.id}>
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {client.companyName}
                      </div>
                      {client.shortName && (
                        <div className="text-xs text-[var(--text-secondary)]">
                          {client.shortName}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {CLIENT_TYPE_LABELS[client.clientType]}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {CHANNEL_LABELS[client.channel].label}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {client.contactName}
                    </td>
                    <td className="px-4 py-2.5 text-sm">{client.phone}</td>
                    <td className="px-4 py-2.5 text-sm font-mono">
                      {client.taxId || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(client)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]"
                    >
                      {clients.length === 0
                        ? "尚無客戶資料"
                        : "無符合搜尋條件的客戶"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ClientForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Client;
  onSave: (client: Client) => Promise<void>;
  onCancel: () => void;
}) {
  const isEdit = Boolean(initial);
  const [draft, setDraft] = useState<Client>(
    initial ?? { ...EMPTY_CLIENT, id: `CLI-${Date.now()}` },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<Client>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit() {
    if (!draft.companyName.trim()) {
      setError("公司名稱為必填");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-surface rounded-[var(--radius-lg)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
        <span className="text-sm font-medium">
          {isEdit ? "編輯客戶" : "新增客戶"}
        </span>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-4 px-6 py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>公司名稱 *</Label>
            <Input
              value={draft.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
            />
          </div>
          <div>
            <Label>簡稱</Label>
            <Input
              value={draft.shortName}
              onChange={(e) => update({ shortName: e.target.value })}
            />
          </div>
          <div>
            <Label>客戶類型</Label>
            <Select
              value={draft.clientType}
              onValueChange={(v) =>
                update({ clientType: v as ClientType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CLIENT_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>預設通路</Label>
            <Select
              value={draft.channel}
              onValueChange={(v) => update({ channel: v as Channel })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["wholesale", "designer", "retail"] as const).map((ch) => (
                  <SelectItem key={ch} value={ch}>
                    {CHANNEL_LABELS[ch].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>聯絡人</Label>
            <Input
              value={draft.contactName}
              onChange={(e) => update({ contactName: e.target.value })}
            />
          </div>
          <div>
            <Label>電話</Label>
            <Input
              value={draft.phone}
              onChange={(e) => update({ phone: e.target.value })}
            />
          </div>
          <div>
            <Label>電話 2</Label>
            <Input
              value={draft.phone2}
              onChange={(e) => update({ phone2: e.target.value })}
            />
          </div>
          <div>
            <Label>LINE</Label>
            <Input
              value={draft.lineId}
              onChange={(e) => update({ lineId: e.target.value })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={draft.email}
              onChange={(e) => update({ email: e.target.value })}
            />
          </div>
          <div>
            <Label>地址</Label>
            <Input
              value={draft.address}
              onChange={(e) => update({ address: e.target.value })}
            />
          </div>
          <div>
            <Label>統一編號</Label>
            <Input
              value={draft.taxId}
              onChange={(e) => update({ taxId: e.target.value })}
            />
          </div>
          <div>
            <Label>佣金模式</Label>
            <Select
              value={draft.commissionMode}
              onValueChange={(v) =>
                update({ commissionMode: v as CommissionMode | "default" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">跟隨系統設定</SelectItem>
                <SelectItem value="price_gap">賺價差</SelectItem>
                <SelectItem value="rebate">返佣</SelectItem>
                <SelectItem value="none">無佣金</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>備註</Label>
          <Input
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </div>

        {error && (
          <p className="text-xs text-[var(--error)]">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" disabled={saving} onClick={handleSubmit}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
