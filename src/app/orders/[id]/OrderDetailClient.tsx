"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Plus, Save, Trash2, X } from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type {
  CustomOrder,
  OrderDeliveryMethod,
  OrderInvoiceStatus,
  OrderItem,
  OrderItemCategory,
  OrderNote,
  OrderStatus,
} from "@/lib/types";

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "圖片上傳失敗");
  return json.url;
}

interface Props {
  orderId: string;
}

const STATUS_OPTIONS: Array<{ value: OrderStatus; label: string }> = [
  { value: "production", label: "排程/生產中" },
  { value: "waiting", label: "待出貨" },
  { value: "completed", label: "完成" },
  { value: "cancelled", label: "取消" },
];

const INVOICE_OPTIONS: Array<{ value: OrderInvoiceStatus; label: string }> = [
  { value: "pending", label: "待開" },
  { value: "issued", label: "已開" },
  { value: "exempt", label: "免開" },
];

const CATEGORY_OPTIONS: Array<{ value: OrderItemCategory; label: string }> = [
  { value: "坐/背墊", label: "坐/背墊" },
  { value: "臥榻墊", label: "臥榻墊" },
  { value: "縫布裱板", label: "縫布裱板" },
  { value: "到府清潔", label: "到府清潔" },
  { value: "到府施工", label: "到府施工" },
  { value: "訂製沙發", label: "訂製沙發" },
  { value: "泡棉內裏", label: "泡棉內裏" },
  { value: "皮/布套", label: "皮/布套" },
  { value: "維修", label: "維修" },
  { value: "大和樂活", label: "大和樂活" },
];

const DELIVERY_OPTIONS: Array<{ value: OrderDeliveryMethod; label: string }> = [
  { value: "自運", label: "自運" },
  { value: "宅配", label: "宅配" },
  { value: "到府施工", label: "到府施工" },
];

const STATUS_QUICK_BUTTONS = STATUS_OPTIONS;

export function OrderDetailClient({ orderId }: Props) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const isAdmin = user?.role === "admin";

  const [order, setOrder] = useState<CustomOrder | null>(null);
  const [draft, setDraft] = useState<CustomOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"basic" | "workorder" | "finance">("basic");
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Load order on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/sheets/orders/${orderId}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok: boolean;
          order?: CustomOrder;
          error?: string;
        };
        if (cancelled) return;
        if (!json.ok || !json.order) {
          setError(json.error ?? "載入失敗");
          return;
        }
        setOrder(json.order);
        setDraft(json.order);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const updateDraft = useCallback(<K extends keyof CustomOrder>(
    key: K,
    value: CustomOrder[K],
  ) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const isDirty =
    draft !== null &&
    order !== null &&
    JSON.stringify(draft) !== JSON.stringify(order);

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(`/api/sheets/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await res.json()) as {
        ok: boolean;
        order?: CustomOrder;
        error?: string;
      };
      if (!json.ok) {
        setSaveResult({ ok: false, message: json.error ?? "儲存失敗" });
        return;
      }
      const saved = json.order ?? draft;
      setOrder(saved);
      setDraft(saved);
      setSaveResult({ ok: true, message: "已儲存" });
      setTimeout(() => setSaveResult(null), 3000);
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err instanceof Error ? err.message : "儲存失敗",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickStatus(newStatus: OrderStatus) {
    if (!order) return;
    setStatusChanging(true);
    try {
      const res = await fetch(`/api/sheets/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = (await res.json()) as { ok: boolean; order?: CustomOrder; error?: string };
      if (!json.ok) {
        setSaveResult({ ok: false, message: json.error ?? "狀態更新失敗" });
        return;
      }
      const updated = json.order ?? { ...order, status: newStatus };
      setOrder(updated);
      setDraft((prev) => (prev ? { ...prev, status: newStatus } : prev));
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err instanceof Error ? err.message : "狀態更新失敗",
      });
    } finally {
      setStatusChanging(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-[var(--text-secondary)]">載入中...</p>
      </div>
    );
  }

  if (error || !order || !draft) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/orders" as never)}>
          <ArrowLeft className="mr-1 h-3 w-3" />
          返回訂單列表
        </Button>
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error || "找不到此訂單"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/orders" as never)}
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            返回訂單列表
          </Button>
          <h1 className="text-xl font-bold">訂單詳情: {orderId}</h1>
        </div>

        {/* Status quick buttons — admin only */}
        {isAdmin && (
          <div className="flex flex-wrap gap-1.5">
            {STATUS_QUICK_BUTTONS.map((btn) => (
              <button
                key={btn.value}
                type="button"
                disabled={statusChanging}
                onClick={() => void handleQuickStatus(btn.value)}
                className={[
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  order.status === btn.value
                    ? btn.value === "cancelled"
                      ? "bg-gray-400 text-white"
                      : "bg-[var(--accent)] text-white"
                    : btn.value === "cancelled"
                      ? "bg-[var(--bg-subtle)] text-gray-400 hover:bg-gray-100"
                      : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
                  statusChanging ? "opacity-50 cursor-not-allowed" : "",
                ].join(" ")}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Save result feedback */}
      {saveResult && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            saveResult.ok
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {saveResult.message}
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <TabsList>
          <TabsTrigger value="basic">基本資訊</TabsTrigger>
          <TabsTrigger value="workorder">工單細節</TabsTrigger>
          <TabsTrigger value="finance">財務</TabsTrigger>
        </TabsList>

        {/* Tab A: 基本資訊 */}
        <TabsContent value="basic">
          <div className="space-y-6">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* 工單編號 */}
                <div>
                  <Label>工單編號</Label>
                  <Input
                    value={draft.orderNumber}
                    onChange={(e) => updateDraft("orderNumber", e.target.value)}
                    placeholder="例 P3705"
                  />
                </div>

                {/* 訂製內容 */}
                <div>
                  <Label>訂製內容</Label>
                  <Input
                    value={draft.orderTitle}
                    onChange={(e) => updateDraft("orderTitle", e.target.value)}
                    placeholder="訂單標題說明"
                  />
                </div>

                {/* 品項分類 */}
                <div>
                  <Label>品項分類</Label>
                  <Select
                    value={draft.itemCategory || "__unset__"}
                    onValueChange={(v) =>
                      updateDraft(
                        "itemCategory",
                        v === "__unset__" ? "" : (v as OrderItemCategory),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="未設定" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">— 未設定 —</SelectItem>
                      {CATEGORY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 配送方式 */}
                <div>
                  <Label>配送方式</Label>
                  <Select
                    value={draft.deliveryMethod || "__unset__"}
                    onValueChange={(v) =>
                      updateDraft(
                        "deliveryMethod",
                        v === "__unset__" ? "" : (v as OrderDeliveryMethod),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="未設定" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">— 未設定 —</SelectItem>
                      {DELIVERY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 訂單狀態 */}
                <div>
                  <Label>訂單狀態</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(v) => updateDraft("status", v as OrderStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 日期區塊 */}
              <div className="mt-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  日期
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <Label>下單日</Label>
                    <Input
                      type="date"
                      value={draft.orderDate}
                      onChange={(e) => updateDraft("orderDate", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>向廠商下單日</Label>
                    <Input
                      type="date"
                      value={draft.supplierOrderDate}
                      onChange={(e) =>
                        updateDraft("supplierOrderDate", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label>生產期限</Label>
                    <Input
                      type="date"
                      value={draft.productionDueDate}
                      onChange={(e) =>
                        updateDraft("productionDueDate", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label>安裝/出貨日</Label>
                    <Input
                      type="date"
                      value={draft.installDate}
                      onChange={(e) => updateDraft("installDate", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>完成日</Label>
                    <Input
                      type="date"
                      value={draft.completedDate}
                      onChange={(e) =>
                        updateDraft("completedDate", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              {/* 其他 */}
              <div className="mt-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  其他
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* 開票狀態 */}
                  <div>
                    <Label>開票狀態</Label>
                    <Select
                      value={draft.invoiceStatus}
                      onValueChange={(v) =>
                        updateDraft("invoiceStatus", v as OrderInvoiceStatus)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INVOICE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 已歸檔 */}
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      id="isArchived"
                      type="checkbox"
                      checked={draft.isArchived}
                      onChange={(e) =>
                        updateDraft("isArchived", e.target.checked)
                      }
                      className="h-4 w-4 rounded border-[var(--border)]"
                    />
                    <Label htmlFor="isArchived" className="cursor-pointer">
                      已歸檔
                    </Label>
                  </div>

                  {/* 內部備忘 */}
                  <div className="md:col-span-2">
                    <Label>內部備忘</Label>
                    <Textarea
                      rows={3}
                      value={draft.internalNotes}
                      onChange={(e) =>
                        updateDraft("internalNotes", e.target.value)
                      }
                      placeholder="僅內部可見的備忘..."
                    />
                  </div>
                </div>
              </div>

              {/* 唯讀資訊 */}
              {(order.caseId || order.versionId) && (
                <div className="mt-5 rounded-md bg-[var(--bg-subtle)] p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                    來源資訊（唯讀）
                  </h3>
                  <div className="flex flex-col gap-1 text-sm">
                    {order.caseId && (
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-tertiary)]">關聯案件:</span>
                        <Link
                          href={`/cases?caseId=${encodeURIComponent(order.caseId)}`}
                          className="text-[var(--accent)] underline"
                        >
                          {order.caseId}
                        </Link>
                      </div>
                    )}
                    {order.versionId && (
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-tertiary)]">關聯報價:</span>
                        <Link
                          href={`/quotes?versionId=${encodeURIComponent(order.versionId)}`}
                          className="text-[var(--accent)] underline"
                        >
                          {order.versionId}
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <Button onClick={() => void handleSave()} disabled={saving || !isDirty}>
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1 h-4 w-4" />
                )}
                儲存變更
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Tab B: 工單細節 */}
        <TabsContent value="workorder">
          <div className="space-y-6">

            {/* 材料區塊 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                材料
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>布料/材料名稱</Label>
                  <Input
                    value={draft.materialName}
                    onChange={(e) => updateDraft("materialName", e.target.value)}
                    placeholder="例：GX-202 皮"
                  />
                </div>
                <div>
                  <Label>色號</Label>
                  <Input
                    value={draft.materialCode}
                    onChange={(e) => updateDraft("materialCode", e.target.value)}
                    placeholder="例：#3B2C"
                  />
                </div>
                <div>
                  <Label>交期說明</Label>
                  <Input
                    value={draft.deadline}
                    onChange={(e) => updateDraft("deadline", e.target.value)}
                    placeholder="例：急單，做好出"
                  />
                </div>
                <div>
                  <Label>安裝/出貨日（Tab A 設定）</Label>
                  <Input
                    value={draft.installDate}
                    readOnly
                    className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] cursor-default"
                  />
                </div>
              </div>

              {/* 材料圖片 */}
              <div className="mt-4">
                <Label>材料圖片</Label>
                <div className="mt-1 flex items-start gap-4">
                  {draft.materialImageUrl ? (
                    <div className="relative">
                      <img
                        src={draft.materialImageUrl}
                        alt="材料"
                        className="h-28 w-28 rounded border object-cover"
                      />
                      <button
                        type="button"
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white shadow"
                        onClick={() => updateDraft("materialImageUrl", "")}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded border border-dashed border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-tertiary)]">
                      <ImagePlus className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)]">
                        <ImagePlus className="h-4 w-4" />
                        {uploading ? "上傳中..." : "上傳圖片"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={uploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploading(true);
                          try {
                            const url = await uploadFile(file);
                            updateDraft("materialImageUrl", url);
                          } catch (err) {
                            setSaveResult({
                              ok: false,
                              message: err instanceof Error ? err.message : "上傳失敗",
                            });
                          } finally {
                            setUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                    {uploading && (
                      <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        上傳中...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 品項清單 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                品項清單
              </h3>
              <div className="space-y-3">
                {draft.items.map((item: OrderItem) => (
                  <div
                    key={item.id}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-3"
                  >
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-xs">名稱</Label>
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            updateDraft(
                              "items",
                              draft.items.map((it: OrderItem) =>
                                it.id === item.id ? { ...it, name: e.target.value } : it,
                              ),
                            );
                          }}
                          placeholder="品項名稱"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">數量</Label>
                        <Input
                          value={item.quantity}
                          onChange={(e) => {
                            updateDraft(
                              "items",
                              draft.items.map((it: OrderItem) =>
                                it.id === item.id ? { ...it, quantity: e.target.value } : it,
                              ),
                            );
                          }}
                          placeholder="數量"
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <Label className="text-xs">尺寸</Label>
                      <Input
                        value={item.dimensions}
                        onChange={(e) => {
                          updateDraft(
                            "items",
                            draft.items.map((it: OrderItem) =>
                              it.id === item.id ? { ...it, dimensions: e.target.value } : it,
                            ),
                          );
                        }}
                        placeholder="例：60×60×10 cm"
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-xs">泡棉規格</Label>
                        <Input
                          value={item.foamSpec}
                          onChange={(e) => {
                            updateDraft(
                              "items",
                              draft.items.map((it: OrderItem) =>
                                it.id === item.id ? { ...it, foamSpec: e.target.value } : it,
                              ),
                            );
                          }}
                          placeholder="例：45D 高彈"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">顏色</Label>
                        <Select
                          value={item.foamColor ?? ""}
                          onValueChange={(v) => {
                            updateDraft(
                              "items",
                              draft.items.map((it: OrderItem) =>
                                it.id === item.id
                                  ? {
                                      ...it,
                                      foamColor: (v === "" ? null : v) as OrderItem["foamColor"],
                                    }
                                  : it,
                              ),
                            );
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="無" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">無</SelectItem>
                            <SelectItem value="orange">橘</SelectItem>
                            <SelectItem value="red">紅</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() =>
                          updateDraft(
                            "items",
                            draft.items.filter((it: OrderItem) => it.id !== item.id),
                          )
                        }
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        刪除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  const newItem: OrderItem = {
                    id: crypto.randomUUID(),
                    name: "",
                    dimensions: "",
                    quantity: "",
                    foamSpec: "",
                    foamColor: null,
                  };
                  updateDraft("items", [...draft.items, newItem]);
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                新增品項
              </Button>
            </div>

            {/* 特殊備註 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                特殊備註
              </h3>
              <div className="space-y-2">
                {draft.notes.map((note: OrderNote) => (
                  <div
                    key={note.id}
                    className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-3"
                  >
                    <div className="flex-1">
                      <Input
                        value={note.text}
                        onChange={(e) => {
                          updateDraft(
                            "notes",
                            draft.notes.map((n: OrderNote) =>
                              n.id === note.id ? { ...n, text: e.target.value } : n,
                            ),
                          );
                        }}
                        placeholder="備註文字"
                      />
                    </div>
                    <div className="w-24 shrink-0">
                      <Select
                        value={note.color}
                        onValueChange={(v) => {
                          updateDraft(
                            "notes",
                            draft.notes.map((n: OrderNote) =>
                              n.id === note.id
                                ? { ...n, color: v as OrderNote["color"] }
                                : n,
                            ),
                          );
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="black">黑</SelectItem>
                          <SelectItem value="red">紅</SelectItem>
                          <SelectItem value="orange">橘</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 pt-1">
                      <input
                        id={`warn-${note.id}`}
                        type="checkbox"
                        checked={note.isWarning}
                        onChange={(e) => {
                          updateDraft(
                            "notes",
                            draft.notes.map((n: OrderNote) =>
                              n.id === note.id
                                ? { ...n, isWarning: e.target.checked }
                                : n,
                            ),
                          );
                        }}
                        className="h-4 w-4 rounded border-[var(--border)]"
                      />
                      <label htmlFor={`warn-${note.id}`} className="text-sm">⚠️</label>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 pt-1 text-[var(--text-tertiary)] hover:text-red-500"
                      onClick={() =>
                        updateDraft(
                          "notes",
                          draft.notes.filter((n: OrderNote) => n.id !== note.id),
                        )
                      }
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  const newNote: OrderNote = {
                    id: crypto.randomUUID(),
                    text: "",
                    color: "black",
                    isWarning: false,
                  };
                  updateDraft("notes", [...draft.notes, newNote]);
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                新增備註
              </Button>
            </div>

            {/* 附圖 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                附圖
              </h3>
              {draft.photos.length > 0 && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {draft.photos.map((url: string, i: number) => (
                    <div key={i} className="relative">
                      <img
                        src={url}
                        className="h-24 w-full rounded border object-cover"
                        alt=""
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5"
                        onClick={() =>
                          updateDraft(
                            "photos",
                            draft.photos.filter((_: string, j: number) => j !== i),
                          )
                        }
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)]">
                  <ImagePlus className="h-4 w-4" />
                  {uploading ? "上傳中..." : "上傳附圖"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={uploading}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    setUploading(true);
                    try {
                      const urls = await Promise.all(files.map(uploadFile));
                      updateDraft("photos", [...draft.photos, ...urls]);
                    } catch (err) {
                      setSaveResult({
                        ok: false,
                        message: err instanceof Error ? err.message : "上傳失敗",
                      });
                    } finally {
                      setUploading(false);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
              {uploading && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  上傳中...
                </span>
              )}
            </div>

            {/* 儲存按鈕 */}
            <div className="flex justify-end">
              <Button onClick={() => void handleSave()} disabled={saving || !isDirty}>
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1 h-4 w-4" />
                )}
                儲存變更
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Tab C: 財務 (placeholder) */}
        <TabsContent value="finance">
          <div className="space-y-6">
            <div className="p-8 text-center text-muted-foreground">
              此功能即將推出
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void handleSave()} disabled={saving || !isDirty}>
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1 h-4 w-4" />
                )}
                儲存變更
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
