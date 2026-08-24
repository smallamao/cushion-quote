"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, Save, ShoppingCart, Upload, X } from "lucide-react";

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
import { useUsers } from "@/hooks/useUsers";
import { useClients } from "@/hooks/useClients";
import { useCompanies } from "@/hooks/useCompanies";
import { ClientCombobox } from "@/components/quote-editor/ClientCombobox";
import type {
  CustomOrder,
  OrderDeliveryMethod,
  OrderInvoiceStatus,
  OrderItemCategory,
  OrderStatus,
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/lib/types";
import { attributedPurchaseAmount } from "@/lib/purchase-order-link";
import { readJson } from "@/lib/read-json";
import { FinanceTab } from "./FinanceTab";
import { LinkedPurchasesSection } from "./LinkedPurchasesSection";
import { generateWorkOrderJpgBlob } from "@/components/pdf/WorkOrderPDF";
import { WorkorderTab } from "./WorkorderTab";

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
  { value: "繃布裱板", label: "繃布裱板" },
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

/** 從 start 起算 total 天的連續日期，回傳「第一天以外」的那幾天（＝extraInstallDates） */
function consecutiveExtraDays(start: string, total: number): string[] {
  if (!start || total < 2) return [];
  const days: string[] = [];
  const d = new Date(`${start}T00:00:00`);
  if (Number.isNaN(d.getTime())) return [];
  for (let i = 1; i < total; i++) {
    d.setDate(d.getDate() + 1);
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return days;
}

export function OrderDetailClient({ orderId }: Props) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { clients, loading: clientsLoading } = useClients();
  const { companies } = useCompanies();
  const { users } = useUsers();
  const isAdmin = user?.role === "admin";

  const [order, setOrder] = useState<CustomOrder | null>(null);
  const [draft, setDraft] = useState<CustomOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"basic" | "workorder" | "finance">("basic");
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [notionResult, setNotionResult] = useState<{ ok: boolean; message: string } | null>(null);
  // 關聯採購單（供財務頁計入成本 + 反查區塊顯示）；一次抓、兩處共用
  const [linkedPurchases, setLinkedPurchases] = useState<PurchaseOrder[]>([]);
  const [linkedPurchaseItems, setLinkedPurchaseItems] = useState<Record<string, PurchaseOrderItem[]>>({});
  const [linkedPurchasesLoading, setLinkedPurchasesLoading] = useState(true);

  // Load order on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/sheets/orders/${orderId}`, {
          cache: "no-store",
        });
        const json = (await readJson<{
          ok: boolean;
          order?: CustomOrder;
          error?: string;
        }>(res));
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

  // 抓此訂單的關聯採購單（relatedOrderId 相符）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLinkedPurchasesLoading(true);
      try {
        const res = await fetch(
          `/api/sheets/purchases?relatedOrderId=${encodeURIComponent(orderId)}&includeItems=true`,
          { cache: "no-store" },
        );
        const json = (await readJson<{ ok?: boolean;
          orders?: PurchaseOrder[];
          itemsByOrder?: Record<string, PurchaseOrderItem[]>;
        }>(res));
        if (!cancelled) {
          setLinkedPurchases(json.orders ?? []);
          setLinkedPurchaseItems(json.itemsByOrder ?? {});
        }
      } catch {
        if (!cancelled) {
          setLinkedPurchases([]);
          setLinkedPurchaseItems({});
        }
      } finally {
        if (!cancelled) setLinkedPurchasesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // 關聯採購單成本：排除已取消，且「只計入備註歸屬於本單的品項」。
  // 一張採購單常混採多張訂單的料，整張金額計入會虛增本單成本（詳見 purchase-order-link）。
  const orderRef = { orderNumber: order?.orderNumber, caseId: order?.caseId };
  const linkedPurchaseCost = linkedPurchases
    .filter((p) => p.status !== "cancelled")
    .reduce((s, p) => s + attributedPurchaseAmount(p, linkedPurchaseItems[p.orderId], orderRef), 0);

  const updateDraft = useCallback(<K extends keyof CustomOrder>(
    key: K,
    value: CustomOrder[K],
  ) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  // LINE 對話直達：取客戶主檔主要聯絡人的 lineChatUrl
  const lineChatUrl = draft?.clientId
    ? companies.find((c) => c.id === draft.clientId)?.primaryContact?.lineChatUrl ?? ""
    : "";

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
      const json = (await readJson<{
        ok: boolean;
        order?: CustomOrder;
        error?: string;
      }>(res));
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
      const json = (await readJson<{ ok: boolean; order?: CustomOrder; error?: string }>(res));
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

  async function handleNotionSync() {
    if (!order) return;
    setNotionSyncing(true);
    setNotionResult(null);
    try {
      // Generate work order JPG and upload to Cloudinary
      let jpgUrl: string | undefined;
      try {
        const jpgBlob = await generateWorkOrderJpgBlob({ order });
        const fd = new FormData();
        fd.append("file", new File([jpgBlob], "workorder.jpg", { type: "image/jpeg" }));
        fd.append("folder", "notion-workorders");
        const upRes = await fetch("/api/upload", { method: "POST", body: fd });
        const upJson = (await readJson<{ ok?: boolean; url?: string }>(upRes));
        jpgUrl = upJson.url;
      } catch {
        // Non-fatal: sync without image if JPG generation fails
      }

      const res = await fetch("/api/notion/sync-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, jpgUrl }),
      });
      const json = (await readJson<{ ok: boolean; action?: string; notionUrl?: string; error?: string }>(res));
      if (!json.ok) {
        setNotionResult({ ok: false, message: json.error ?? "同步失敗" });
        return;
      }
      const label = json.action === "updated" ? "已更新" : "已建立";
      setNotionResult({ ok: true, message: `Notion ${label}` });
      if (json.notionUrl) window.open(json.notionUrl, "_blank");
    } catch (err) {
      setNotionResult({ ok: false, message: err instanceof Error ? err.message : "同步失敗" });
    } finally {
      setNotionSyncing(false);
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

        {/* Status quick buttons + Notion sync — admin only */}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-1.5">
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
            <div className="ml-1 h-4 w-px bg-[var(--border)]" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/purchases/new?fromOrder=${encodeURIComponent(orderId)}` as never)}
              className="h-7 text-xs"
              title="以此工單品項建立採購單，自動帶入建議布料用量並關聯訂單"
            >
              <ShoppingCart className="mr-1 h-3 w-3" />
              建立採購單
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={notionSyncing}
              onClick={() => void handleNotionSync()}
              className="h-7 text-xs"
            >
              {notionSyncing
                ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                : <Upload className="mr-1 h-3 w-3" />}
              同步到 Notion
            </Button>
          </div>
        )}
      </div>
      {notionResult && (
        <div className={`rounded-md px-3 py-2 text-sm ${notionResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {notionResult.message}
        </div>
      )}

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

                {/* 客戶 */}
                <div>
                  <Label>客戶</Label>
                  <ClientCombobox
                    value={draft.clientId ?? ""}
                    clients={clients}
                    loading={clientsLoading}
                    fallbackName={draft.clientName}
                    onChange={(id) => {
                      if (id === "__new__" || id === "") {
                        updateDraft("clientId", "");
                      } else {
                        updateDraft("clientId", id);
                        const c = clients.find((x) => x.id === id);
                        if (c) updateDraft("clientName", c.companyName);
                      }
                    }}
                  />
                  <Input
                    className="mt-1.5"
                    value={draft.clientName}
                    onChange={(e) => updateDraft("clientName", e.target.value)}
                    placeholder="客戶名稱（散客可直接打字）"
                  />
                  {lineChatUrl && (
                    <a
                      href={lineChatUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-green-300 bg-white px-2.5 py-1 text-xs text-green-700 hover:bg-green-50"
                      title="開啟此客戶的 LINE 官方帳號對話"
                    >
                      💬 開啟 LINE 對話
                    </a>
                  )}
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    從客戶資料庫選可統一名稱、歸戶對帳；散客直接在下方打字即可。
                  </p>
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
                  {/* 安裝負責師傅：指派後該師傅在「我的行程」看得到這張安裝 */}
                  <div>
                    <Label>安裝師傅</Label>
                    <Select
                      value={draft.installAssignedTo || "__unassigned__"}
                      onValueChange={(v) =>
                        updateDraft("installAssignedTo", v === "__unassigned__" ? "" : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="選擇師傅" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned__">— 未指派 —</SelectItem>
                        {users
                          .filter((u) => u.isActive)
                          .map((u) => (
                            <SelectItem key={u.userId} value={u.displayName}>
                              {u.displayName}
                            </SelectItem>
                          ))}
                        {draft.installAssignedTo &&
                          !users.some((u) => u.displayName === draft.installAssignedTo) && (
                            <SelectItem value={draft.installAssignedTo}>
                              {draft.installAssignedTo}（舊資料）
                            </SelectItem>
                          )}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                      指派後,該師傅在「我的行程」就能看到這張安裝(含地址/品項/工單)。
                    </p>
                  </div>
                  {/* 案場現場資訊：只給師傅派工用（不會印在施工工單上）*/}
                  <div className="md:col-span-2">
                    <Label>案場地址</Label>
                    <Input
                      value={draft.installAddress ?? ""}
                      onChange={(e) => updateDraft("installAddress", e.target.value)}
                      placeholder="師傅導航用（關聯案件會自動帶入）"
                    />
                  </div>
                  <div>
                    <Label>現場聯絡人</Label>
                    <Input
                      value={draft.installContactName ?? ""}
                      onChange={(e) => updateDraft("installContactName", e.target.value)}
                      placeholder="例：王先生"
                    />
                  </div>
                  <div>
                    <Label>聯絡電話</Label>
                    <Input
                      value={draft.installContactPhone ?? ""}
                      onChange={(e) => updateDraft("installContactPhone", e.target.value)}
                      placeholder="師傅一鍵撥號用"
                    />
                  </div>
                  {/* 跨多天施工：逐日列出（可跳日，例：週三＋週五），行事曆只標實際施工日 */}
                  <div>
                    <Label>額外安裝日（選填）</Label>
                    <div className="space-y-1.5">
                      {(draft.extraInstallDates ?? []).map((d, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <Input
                            type="date"
                            value={d}
                            onChange={(e) =>
                              updateDraft(
                                "extraInstallDates",
                                (draft.extraInstallDates ?? []).map((x, j) =>
                                  j === i ? e.target.value : x,
                                ),
                              )
                            }
                          />
                          <button
                            type="button"
                            className="shrink-0 rounded p-1.5 text-[var(--text-tertiary)] hover:bg-red-50 hover:text-red-500"
                            title="移除這一天"
                            onClick={() =>
                              updateDraft(
                                "extraInstallDates",
                                (draft.extraInstallDates ?? []).filter((_, j) => j !== i),
                              )
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full text-xs"
                        onClick={() =>
                          updateDraft("extraInstallDates", [
                            ...(draft.extraInstallDates ?? []),
                            draft.installDate || "",
                          ])
                        }
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        新增安裝日
                      </Button>

                      {/* 連續天數快捷：最常見的情況一鍵補齊，補完仍可個別改/刪 */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                          連續施工
                        </span>
                        {[2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            disabled={!draft.installDate}
                            title={
                              draft.installDate
                                ? `從安裝日起連續 ${n} 天（自動補後面 ${n - 1} 天）`
                                : "請先填安裝/出貨日"
                            }
                            onClick={() =>
                              updateDraft(
                                "extraInstallDates",
                                consecutiveExtraDays(draft.installDate, n),
                              )
                            }
                            className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
                          >
                            {n} 天
                          </button>
                        ))}
                        {(draft.extraInstallDates?.length ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => updateDraft("extraInstallDates", [])}
                            className="ml-auto shrink-0 text-xs text-[var(--text-tertiary)] hover:text-red-500"
                          >
                            清除
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                      連續施工按天數一鍵補齊；要跳日（例：週三＋週五）就用「新增安裝日」逐日選，
                      或補完後刪掉中間那天。行事曆只會標實際施工的那幾天。
                    </p>
                  </div>
                  {/* 只有「料先進場、之後才安裝」才需要填，否則留空＝與上面同一天 */}
                  <div>
                    <Label>出貨日（選填）</Label>
                    <Input
                      type="date"
                      value={draft.shipDate ?? ""}
                      onChange={(e) => updateDraft("shipDate", e.target.value)}
                    />
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                      只有「物料先進場、之後才約安裝」才填。留空＝出貨當天即安裝。
                    </p>
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
          <WorkorderTab
            draft={draft}
            updateDraft={updateDraft}
            onWorkOrderPdfSaved={(url, updatedAt) => {
              setOrder((prev) => (prev ? { ...prev, workOrderPdfUrl: url, workOrderPdfUpdatedAt: updatedAt } : prev));
              setDraft((prev) => (prev ? { ...prev, workOrderPdfUrl: url, workOrderPdfUpdatedAt: updatedAt } : prev));
            }}
            onSave={handleSave}
            saving={saving}
            isDirty={isDirty}
          />
        </TabsContent>

        {/* Tab C: 財務 */}
        <TabsContent value="finance">
          <div className="space-y-6">
            <FinanceTab
              draft={draft}
              updateDraft={updateDraft}
              onSave={handleSave}
              saving={saving}
              isDirty={isDirty}
              linkedPurchaseCost={linkedPurchaseCost}
            />
            <LinkedPurchasesSection
              orderId={orderId}
              purchases={linkedPurchases}
              itemsByOrder={linkedPurchaseItems}
              orderRef={orderRef}
              loading={linkedPurchasesLoading}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
