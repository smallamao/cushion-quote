"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Edit2, Loader2, Plus, Trash2, X } from "lucide-react";
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
import type { FabricPurchaseOrder, FabricPOStatus, POLineItem } from "@/lib/types";

interface Props {
  poId: string;
}

const STATUS_LABEL: Record<FabricPOStatus, string> = {
  draft: "草稿",
  ordered: "已下單",
  received: "已到料",
  cancelled: "取消",
};

const STATUS_COLOR: Record<FabricPOStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  ordered: "bg-blue-100 text-blue-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function getSafeStatus(status: string | undefined): FabricPOStatus {
  if (status && status in STATUS_LABEL) return status as FabricPOStatus;
  return "draft";
}

function makeEmptyLineItem(): POLineItem {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    materialName: "",
    colorCode: "",
    quantity: 0,
    unit: "碼",
    suggestedQty: 0,
    linkedOrderNumbers: [],
    notes: "",
  };
}

export function PurchaseOrderDetailClient({ poId }: Props) {
  const router = useRouter();
  const [order, setOrder] = useState<FabricPurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editSupplierName, setEditSupplierName] = useState("");
  const [editExpectedAt, setEditExpectedAt] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLineItems, setEditLineItems] = useState<POLineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheets/purchase-orders/${encodeURIComponent(poId)}`);
      const json = (await res.json()) as {
        ok: boolean;
        order?: FabricPurchaseOrder;
        error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? "載入失敗");
      setOrder(json.order ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  function enterEditMode() {
    if (!order) return;
    setEditSupplierName(order.supplierName);
    setEditExpectedAt(order.expectedAt);
    setEditNotes(order.notes);
    setEditLineItems(order.lineItems.map((li) => ({ ...li })));
    setEditMode(true);
    setSaveError(null);
  }

  function cancelEditMode() {
    setEditMode(false);
    setSaveError(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        supplierName: editSupplierName.trim(),
        expectedAt: editExpectedAt,
        notes: editNotes,
        lineItems: editLineItems,
      };
      const res = await fetch(
        `/api/sheets/purchase-orders/${encodeURIComponent(poId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "儲存失敗");
      setEditMode(false);
      await fetchOrder();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(
    newStatus: FabricPOStatus,
    extraFields?: Partial<FabricPurchaseOrder>,
  ) {
    setStatusBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const body: Record<string, unknown> = { status: newStatus, ...extraFields };
      if (newStatus === "ordered" && !body.orderedAt) body.orderedAt = today;
      if (newStatus === "received" && !body.receivedAt) body.receivedAt = today;

      const res = await fetch(
        `/api/sheets/purchase-orders/${encodeURIComponent(poId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "更新失敗");
      await fetchOrder();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleCancel() {
    if (!confirm("確定要取消此採購單嗎？")) return;
    await handleStatusChange("cancelled");
  }

  // Edit line item helpers
  function updateEditLineItem(index: number, patch: Partial<POLineItem>) {
    setEditLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function addEditLineItem() {
    setEditLineItems((prev) => [...prev, makeEmptyLineItem()]);
  }

  function removeEditLineItem(index: number) {
    setEditLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <Button size="sm" variant="outline" onClick={() => router.push("/purchase-orders" as never)}>
          <ChevronLeft className="h-4 w-4" />
          返回
        </Button>
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "採購單不存在"}
        </div>
      </div>
    );
  }

  const safeStatus = getSafeStatus(order.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/purchase-orders" as never)}
          >
            <ChevronLeft className="h-4 w-4" />
            返回
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold font-mono text-[var(--text-primary)]">
                {order.poId}
              </h1>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[safeStatus]}`}
              >
                {STATUS_LABEL[safeStatus]}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {order.supplierName}
            </p>
          </div>
        </div>
        {!editMode && (
          <Button size="sm" variant="outline" onClick={enterEditMode}>
            <Edit2 className="h-3.5 w-3.5" />
            編輯
          </Button>
        )}
      </div>

      {/* Status Action Buttons */}
      {!editMode && (
        <div className="flex flex-wrap items-center gap-2">
          {safeStatus === "draft" && (
            <Button
              size="sm"
              onClick={() => void handleStatusChange("ordered")}
              disabled={statusBusy}
            >
              {statusBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              標記已下單
            </Button>
          )}
          {safeStatus === "ordered" && (
            <Button
              size="sm"
              onClick={() => void handleStatusChange("received")}
              disabled={statusBusy}
            >
              {statusBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              確認已到料
            </Button>
          )}
          {safeStatus !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => void handleCancel()}
              disabled={statusBusy}
            >
              取消採購單
            </Button>
          )}
        </div>
      )}

      {/* Read Mode: Basic Info */}
      {!editMode && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-3">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">基本資訊</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-[var(--text-secondary)]">供應商</p>
              <p className="font-medium">{order.supplierName || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-secondary)]">下單日</p>
              <p>{order.orderedAt || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-secondary)]">預計到料</p>
              <p>{order.expectedAt || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-secondary)]">到料日</p>
              <p>{order.receivedAt || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-secondary)]">建立時間</p>
              <p className="text-xs">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("zh-TW") : "—"}</p>
            </div>
          </div>
          {order.notes && (
            <div>
              <p className="text-xs text-[var(--text-secondary)]">備注</p>
              <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Mode Form */}
      {editMode && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-4">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">編輯基本資訊</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">供應商名稱</Label>
              <Input
                value={editSupplierName}
                onChange={(e) => setEditSupplierName(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">預計到料日</Label>
              <Input
                type="date"
                value={editExpectedAt}
                onChange={(e) => setEditExpectedAt(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">整體備注</Label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          {/* Edit Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-[var(--text-primary)]">明細</h3>
              <Button size="sm" variant="outline" onClick={addEditLineItem}>
                <Plus className="h-3.5 w-3.5" />
                新增明細
              </Button>
            </div>
            {editLineItems.map((item, index) => (
              <div
                key={item.id}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    明細 #{index + 1}
                  </span>
                  {editLineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEditLineItem(index)}
                      className="text-[var(--text-tertiary)] hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">材質名稱</Label>
                    <Input
                      value={item.materialName}
                      onChange={(e) =>
                        updateEditLineItem(index, { materialName: e.target.value })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">色號</Label>
                    <Input
                      value={item.colorCode}
                      onChange={(e) =>
                        updateEditLineItem(index, { colorCode: e.target.value })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">單位</Label>
                    <Select
                      value={item.unit}
                      onValueChange={(v) =>
                        updateEditLineItem(index, { unit: v as "碼" | "公尺" })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="碼">碼</SelectItem>
                        <SelectItem value="公尺">公尺</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">採購數量</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateEditLineItem(index, { quantity: Number(e.target.value) })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">關聯工單號碼</Label>
                    <Input
                      value={item.linkedOrderNumbers.join(", ")}
                      onChange={(e) =>
                        updateEditLineItem(index, {
                          linkedOrderNumbers: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="S808, S812"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">備注</Label>
                    <Input
                      value={item.notes}
                      onChange={(e) =>
                        updateEditLineItem(index, { notes: e.target.value })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {saveError && (
            <p className="text-xs text-red-600">{saveError}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={cancelEditMode} disabled={saving}>
              <X className="h-3.5 w-3.5" />
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              儲存
            </Button>
          </div>
        </div>
      )}

      {/* Line Items (read mode) */}
      {!editMode && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            明細 ({order.lineItems.length} 項)
          </h2>
          {order.lineItems.length === 0 && (
            <p className="text-xs text-[var(--text-tertiary)]">尚無明細</p>
          )}
          {order.lineItems.map((item, index) => (
            <div
              key={item.id ?? index}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {item.materialName || "（未命名）"}
                  </span>
                  {item.colorCode && (
                    <span className="ml-2 text-sm font-medium text-red-500">
                      {item.colorCode}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {item.quantity} {item.unit}
                  </span>
                  {item.suggestedQty > 0 && (
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      建議量：{item.suggestedQty} {item.unit}
                    </p>
                  )}
                </div>
              </div>
              {(item.linkedOrderNumbers.length > 0 || item.notes) && (
                <div className="mt-2 space-y-1">
                  {item.linkedOrderNumbers.length > 0 && (
                    <p className="text-xs text-[var(--text-secondary)]">
                      關聯工單：{item.linkedOrderNumbers.join(", ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-[var(--text-tertiary)]">{item.notes}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
