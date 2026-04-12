"use client";

import { ArrowLeft, Eye, PackagePlus, Plus, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import {
  buildPurchasePdfFileName,
  generatePurchasePdfBlob,
} from "@/components/pdf/PurchaseOrderPDF";
import { fetchPurchaseOrder, usePurchases } from "@/hooks/usePurchases";
import { usePurchaseProducts } from "@/hooks/usePurchaseProducts";
import { useSettings } from "@/hooks/useSettings";
import { useSuppliers } from "@/hooks/useSuppliers";
import {
  parsePurchasePasteText,
  resolveParsedLines,
  summarizeCaseRefs,
  detectPrimaryCaseId,
} from "@/lib/purchase-paste-parser";
import type {
  CaseRecord,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseUnit,
  Supplier,
} from "@/lib/types";

const UNIT_OPTIONS: PurchaseUnit[] = [
  "碼",
  "才",
  "米",
  "只",
  "片",
  "件",
  "組",
  "包",
  "個",
];

const STATUS_OPTIONS: PurchaseOrderStatus[] = [
  "draft",
  "sent",
  "confirmed",
  "received",
  "cancelled",
];

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "草稿",
  sent: "已送出",
  confirmed: "已確認",
  received: "已到貨",
  cancelled: "已取消",
};

interface EditableItem {
  itemId: string;
  productId: string;
  productCode: string;
  productName: string;
  specification: string;
  unit: PurchaseUnit;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  notes: string;
  matched: boolean;
  warning?: string;
}

interface ReceiveDraftItem {
  itemId: string;
  quantity: number;
  receivedQuantity: number;
  receiveNow: number;
}

function emptyItem(): EditableItem {
  return {
    itemId: "",
    productId: "",
    productCode: "",
    productName: "",
    specification: "",
    unit: "碼",
    quantity: 0,
    receivedQuantity: 0,
    unitPrice: 0,
    notes: "",
    matched: true,
  };
}

function buildSnapshot(supplier: Supplier | null): PurchaseOrder["supplierSnapshot"] {
  if (!supplier) {
    return {
      name: "",
      shortName: "",
      contactPerson: "",
      phone: "",
      fax: "",
      email: "",
      taxId: "",
      address: "",
      paymentMethod: "",
      paymentTerms: "",
    };
  }
  return {
    name: supplier.name,
    shortName: supplier.shortName,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    fax: supplier.fax,
    email: supplier.email,
    taxId: supplier.taxId,
    address: supplier.address,
    paymentMethod: supplier.paymentMethod,
    paymentTerms: supplier.paymentTerms,
  };
}

interface Props {
  orderId?: string;
}

export function PurchaseEditorClient({ orderId }: Props) {
  const router = useRouter();
  const { suppliers, loading: loadingSuppliers } = useSuppliers();
  const { products, loading: loadingProducts } = usePurchaseProducts();
  const { settings } = useSettings();
  const { orders, createOrder, updateOrder, receiveOrderItems } = usePurchases();

  const isEditing = Boolean(orderId);
  const factoryAddress =
    settings.factoryAddress || "236新北市土城區廣福街77巷6-6號";

  const [supplierId, setSupplierId] = useState("");
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [linkedCaseId, setLinkedCaseId] = useState("none");
  const [orderDate, setOrderDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [shippingFee, setShippingFee] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<PurchaseOrderStatus>("draft");
  const [items, setItems] = useState<EditableItem[]>([emptyItem()]);
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(Boolean(orderId));
  const [orderLoadError, setOrderLoadError] = useState("");
  const [originalCreatedAt, setOriginalCreatedAt] = useState("");
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [receiveOccurredAt, setReceiveOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiveReferenceNumber, setReceiveReferenceNumber] = useState("");
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveDraftItems, setReceiveDraftItems] = useState<ReceiveDraftItem[]>([]);

  // Preview next order ID for new orders (server will still authoritative-assign)
  const previewNextOrderId = useMemo(() => {
    if (isEditing) return orderId ?? "";
    const dateStr = (orderDate || new Date().toISOString().slice(0, 10))
      .replace(/-/g, "")
      .slice(0, 8);
    const prefix = `PS-${dateStr}-`;
    const sameDay = orders
      .map((o) => o.orderId)
      .filter((id) => id?.startsWith(prefix));
    const maxSeq = sameDay.reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) && seq > max ? seq : max;
    }, 0);
    return `${prefix}${String(maxSeq + 1).padStart(2, "0")}`;
  }, [isEditing, orderId, orderDate, orders]);

  // Initialize default delivery address from settings (only on first render)
  useEffect(() => {
    if (!isEditing && !deliveryAddress) {
      setDeliveryAddress(factoryAddress);
    }
  }, [factoryAddress, isEditing, deliveryAddress]);

  // Load existing order in edit mode
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/sheets/cases", { cache: "no-store" });
        if (!response.ok) throw new Error("load cases");
        const payload = (await response.json()) as { cases: CaseRecord[] };
        setCases(payload.cases);
      } catch {
        setCases([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!orderId) return;
    void (async () => {
      setLoadingOrder(true);
      setOrderLoadError("");
      const data = await fetchPurchaseOrder(orderId);
      if (!data) {
        setOrderLoadError("採購單資料載入失敗，請重新整理後再試");
        setLoadingOrder(false);
        return;
      }
      setSupplierId(data.order.supplierId);
      setLinkedCaseId(data.order.caseId || "none");
      setOrderDate(data.order.orderDate);
      setExpectedDeliveryDate(data.order.expectedDeliveryDate);
      setDeliveryAddress(data.order.deliveryAddress);
      setShippingFee(data.order.shippingFee);
      setTaxAmount(data.order.taxAmount);
      setNotes(data.order.notes);
      setStatus(data.order.status);
      setOriginalCreatedAt(data.order.createdAt);
      setItems(
        data.items.map((it) => ({
          itemId: it.itemId,
          productId: it.productId,
          productCode: it.productSnapshot?.productCode ?? "",
          productName: it.productSnapshot?.productName ?? "",
          specification: it.productSnapshot?.specification ?? "",
          unit: it.productSnapshot?.unit ?? "碼",
          quantity: it.quantity,
          receivedQuantity: it.receivedQuantity,
          unitPrice: it.unitPrice,
          notes: it.notes,
          matched: true,
        })),
      );
      setShowPaste(false);
      setLoadingOrder(false);
    })();
  }, [orderId]);

  const supplier = suppliers.find((s) => s.supplierId === supplierId) || null;
  const linkedCase = cases.find((item) => item.caseId === linkedCaseId) || null;
  const supplierProducts = useMemo(
    () => products.filter((p) => p.supplierId === supplierId),
    [products, supplierId]
  );

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0),
    [items]
  );
  const totalAmount = subtotal + shippingFee + taxAmount;
  const receivableItems = useMemo(
    () => items.filter((item) => item.productId && item.quantity > item.receivedQuantity),
    [items],
  );
  const blockedReceiveItems = useMemo(
    () => items.filter((item) => !item.productId && item.quantity > item.receivedQuantity),
    [items],
  );

  function handleParse() {
    if (!pasteText.trim()) return;
    if (!supplierId) {
      alert("請先選擇廠商");
      return;
    }
    const lines = parsePurchasePasteText(pasteText);
    const resolved = resolveParsedLines(lines, supplierProducts);

    const newItems: EditableItem[] = resolved.map((r) => ({
      itemId: "",
      productId: r.productId,
      productCode: r.productCode,
      productName: r.productName,
      specification: r.specification,
      unit: r.unit,
      quantity: r.quantity,
      receivedQuantity: 0,
      unitPrice: r.unitPrice,
      notes: r.notes,
      matched: r.matched,
      warning: r.warning,
    }));

    // Replace empty items with parsed; otherwise append
    const isEmpty = items.every(
      (i) => !i.productCode && !i.productName && i.quantity === 0
    );
    setItems(isEmpty ? newItems : [...items, ...newItems]);

    // Auto-fill notes with case refs if empty
    const refs = summarizeCaseRefs(lines);
    if (!notes && refs) setNotes(refs);

    // Smart case detection: auto-select if only one case detected or most common
    const detectedCaseId = detectPrimaryCaseId(lines);
    if (detectedCaseId && linkedCaseId === "none") {
      // Check if detected case exists in available cases
      const caseExists = cases.some((c) => c.caseId === detectedCaseId);
      if (caseExists) {
        setLinkedCaseId(detectedCaseId);
      }
    }

    setPasteText("");
    setShowPaste(false);
  }

  function updateItem(index: number, patch: Partial<EditableItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addBlankItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function selectProduct(index: number, productId: string) {
    const product = supplierProducts.find((p) => p.id === productId);
    if (!product) return;
    updateItem(index, {
      productId: product.id,
      productCode: product.productCode,
      productName: product.productName,
      specification: product.specification,
      unit: product.unit,
      unitPrice: product.unitPrice,
      matched: true,
      warning: undefined,
    });
  }

  async function handleSave() {
    if (!supplierId) {
      alert("請選擇廠商");
      return;
    }
    const validItems = items.filter((it) => it.productCode && it.quantity > 0);
    if (validItems.length === 0) {
      alert("請至少新增一筆有效品項");
      return;
    }
    setSaving(true);
    try {
      const orderItems: PurchaseOrderItem[] = validItems.map((it, idx) => ({
        itemId: it.itemId || "",
        orderId: orderId ?? "",
        sortOrder: idx + 1,
        productId: it.productId,
        productSnapshot: {
          productCode: it.productCode,
          productName: it.productName,
          specification: it.specification,
          unit: it.unit,
        },
        quantity: it.quantity,
        receivedQuantity: it.receivedQuantity,
        unitPrice: it.unitPrice,
        amount: Math.round(it.quantity * it.unitPrice * 100) / 100,
        notes: it.notes,
      }));

      const order: PurchaseOrder = {
        orderId: orderId ?? "",
        orderDate,
        supplierId,
        caseId: linkedCaseId === "none" ? "" : linkedCaseId,
        caseNameSnapshot: linkedCase?.caseName ?? "",
        supplierSnapshot: buildSnapshot(supplier),
        subtotal,
        shippingFee,
        taxAmount,
        totalAmount,
        notes,
        status,
        deliveryAddress,
        expectedDeliveryDate,
        createdAt: originalCreatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (isEditing) {
        await updateOrder(order, orderItems);
        router.push(`/purchases/${order.orderId}`);
      } else {
        const result = await createOrder(order, orderItems);
        router.push(`/purchases/${result.order.orderId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "儲存失敗";
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  function openReceiveDialog() {
    if (!isEditing || !orderId) return;
    if (blockedReceiveItems.length > 0) {
      alert("有未對應採購商品的品項，請先完成商品對應後再收貨入庫");
      return;
    }
    if (receivableItems.length === 0) {
      alert("目前沒有可收貨的品項");
      return;
    }

    setReceiveOccurredAt(new Date().toISOString().slice(0, 10));
    setReceiveReferenceNumber("");
    setReceiveNotes("");
    setReceiveDraftItems(
      receivableItems.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        receiveNow: item.quantity - item.receivedQuantity,
      })),
    );
    setReceiveDialogOpen(true);
  }

  function updateReceiveDraft(itemId: string, receiveNow: number) {
    setReceiveDraftItems((prev) =>
      prev.map((item) => (item.itemId === itemId ? { ...item, receiveNow } : item)),
    );
  }

  async function handleReceiveSubmit() {
    if (!orderId) return;

    const positiveItems = receiveDraftItems.filter((item) => item.receiveNow > 0);
    if (positiveItems.length === 0) {
      alert("請至少輸入一筆本次收貨數量");
      return;
    }

    const invalidItem = positiveItems.find(
      (item) => item.receivedQuantity + item.receiveNow > item.quantity,
    );
    if (invalidItem) {
      alert(`收貨數量超過剩餘可收數量：${invalidItem.itemId}`);
      return;
    }

    setReceiving(true);
    try {
      const result = await receiveOrderItems(
        orderId,
        positiveItems.map((item) => ({
          itemId: item.itemId,
          receivedQuantity: item.receiveNow,
          occurredAt: receiveOccurredAt,
          referenceNumber: receiveReferenceNumber,
          notes: receiveNotes,
        })),
      );

      setItems((prev) =>
        prev.map((item) => {
          const updated = result.items.find((receivedItem) => receivedItem.itemId === item.itemId);
          return updated ? { ...item, receivedQuantity: updated.receivedQuantity } : item;
        }),
      );
      setStatus(result.order.status);
      setReceiveDialogOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "收貨入庫失敗");
    } finally {
      setReceiving(false);
    }
  }

  function buildPreviewOrder(): {
    order: PurchaseOrder;
    orderItems: PurchaseOrderItem[];
  } | null {
    if (!supplierId) {
      alert("請先選擇廠商");
      return null;
    }
    const validItems = items.filter((it) => it.productCode && it.quantity > 0);
    if (validItems.length === 0) {
      alert("沒有可預覽的品項");
      return null;
    }
    const orderItems: PurchaseOrderItem[] = validItems.map((it, idx) => ({
      itemId: it.itemId || `tmp-${idx + 1}`,
      orderId: orderId ?? "",
      sortOrder: idx + 1,
      productId: it.productId,
      productSnapshot: {
        productCode: it.productCode,
        productName: it.productName,
        specification: it.specification,
        unit: it.unit,
      },
      quantity: it.quantity,
      receivedQuantity: it.receivedQuantity,
      unitPrice: it.unitPrice,
      amount: Math.round(it.quantity * it.unitPrice * 100) / 100,
      notes: it.notes,
    }));
    const order: PurchaseOrder = {
      orderId: orderId ?? previewNextOrderId,
      orderDate,
      supplierId,
      caseId: linkedCaseId === "none" ? "" : linkedCaseId,
      caseNameSnapshot: linkedCase?.caseName ?? "",
      supplierSnapshot: buildSnapshot(supplier),
      subtotal,
      shippingFee,
      taxAmount,
      totalAmount,
      notes,
      status,
      deliveryAddress,
      expectedDeliveryDate,
      createdAt: originalCreatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { order, orderItems };
  }

  async function handlePreviewPdf() {
    const built = buildPreviewOrder();
    if (!built) return;
    setPdfPreviewOpen(true);
    setPdfLoading(true);
    setPdfBlob(null);
    try {
      const blob = await generatePurchasePdfBlob({
        order: built.order,
        items: built.orderItems,
        settings,
      });
      setPdfBlob(blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "PDF 預覽失敗";
      alert(msg);
      setPdfPreviewOpen(false);
    } finally {
      setPdfLoading(false);
    }
  }

  const pdfFileName = useMemo(() => {
    const id = orderId ?? previewNextOrderId;
    return buildPurchasePdfFileName({
      orderId: id,
      supplierSnapshot: buildSnapshot(supplier),
      orderDate,
    } as PurchaseOrder);
  }, [orderId, previewNextOrderId, supplier, orderDate]);

  const unmatchedCount = items.filter((it) => !it.matched).length;

  if (isEditing && !loadingOrder && orderLoadError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/purchases"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回採購單
          </Link>
        </div>

        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            編輯採購單 {orderId}
          </h1>
          <p className="mt-1 text-xs text-red-600">{orderLoadError}</p>
        </div>

        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            目前無法安全載入這張採購單，因此已暫停編輯操作。請重新整理後再試。
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/purchases")}>返回列表</Button>
            <Button size="sm" onClick={() => router.refresh()}>重新載入</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/purchases"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回採購單
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {isEditing && status !== "cancelled" && (
            <Button
              variant="outline"
              size="sm"
              onClick={openReceiveDialog}
              disabled={loadingOrder || receivableItems.length === 0 || saving}
            >
              <PackagePlus className="h-3.5 w-3.5" />
              收貨入庫
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/purchases")}
          >
            取消
          </Button>
          <Button variant="outline" size="sm" onClick={handlePreviewPdf}>
            <Eye className="h-3.5 w-3.5" />
            預覽 PDF
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || loadingOrder}>
            {saving ? "儲存中…" : isEditing ? "儲存變更" : "建立採購單"}
          </Button>
        </div>
      </div>

      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {isEditing
            ? `編輯採購單 ${orderId}`
            : `新增採購單 ${previewNextOrderId}`}
        </h1>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          {isEditing
            ? "修改採購單內容後按「儲存變更」；收貨請使用「收貨入庫」"
            : "選擇廠商後可貼上明細自動解析，或手動新增品項（採購單號將於儲存時確認）"}
        </p>
        {loadingOrder && (
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">採購單資料載入中…</p>
        )}
        {!loadingOrder && orderLoadError && (
          <p className="mt-1 text-xs text-red-600">{orderLoadError}</p>
        )}
      </div>

      {/* Order header form */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="mb-1 block text-xs">廠商 *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSuppliers ? "載入中…" : "選擇廠商"} />
              </SelectTrigger>
              <SelectContent>
                {suppliers
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <SelectItem key={s.supplierId} value={s.supplierId}>
                      {s.shortName || s.name} ({s.supplierId})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">採購日期 *</Label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">關聯案件</Label>
            <Select value={linkedCaseId} onValueChange={setLinkedCaseId}>
              <SelectTrigger>
                <SelectValue placeholder="選擇案件（可略過）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不綁定案件</SelectItem>
                {cases.map((item) => (
                  <SelectItem key={item.caseId} value={item.caseId}>
                    {item.caseId} — {item.caseName || item.clientNameSnapshot || "未命名案件"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">到貨日期</Label>
            <Input
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1 block text-xs">交貨地址</Label>
            <Input
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">狀態</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as PurchaseOrderStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Paste parser section */}
      {showPaste ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--accent)] bg-[var(--accent-muted)]/30 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Wand2 className="h-4 w-4 text-[var(--accent)]" />
                貼上明細快速解析
              </h2>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                每行一筆，格式：<code className="rounded bg-[var(--bg-subtle)] px-1">商品編號 數量y #案件</code>
                ，例如 <code className="rounded bg-[var(--bg-subtle)] px-1">LY9802 15y #P5999</code>
                ，可用 <code className="rounded bg-[var(--bg-subtle)] px-1">+</code> 拆分多單位（如 <code className="rounded bg-[var(--bg-subtle)] px-1">3件+10y</code>）
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPaste(false)}
              className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              關閉
            </button>
          </div>
          <Textarea
            rows={6}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`LY9802 15y #P5999\nLY3139-5 6.5y #P6005\nS6901 3件+10y #P6002`}
            className="font-mono text-xs"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {!supplierId && "⚠️ 請先選擇廠商，解析時會比對該廠商的商品庫"}
            </span>
            <Button size="sm" onClick={handleParse} disabled={!pasteText.trim()}>
              <Wand2 className="h-3.5 w-3.5" />
              解析並加入
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowPaste(true)}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          + 顯示貼上解析器
        </button>
      )}

      {/* Items table */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            品項明細 ({items.length})
            {unmatchedCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                {unmatchedCount} 筆未對應商品
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={addBlankItem}>
            <Plus className="h-3.5 w-3.5" />
            新增空白列
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="px-2 py-2 text-left font-medium w-10">#</th>
              <th className="px-2 py-2 text-left font-medium">商品</th>
              <th className="px-2 py-2 text-left font-medium w-20">單位</th>
              <th className="px-2 py-2 text-right font-medium w-20">訂購</th>
              <th className="px-2 py-2 text-right font-medium w-20">實收</th>
              <th className="px-2 py-2 text-right font-medium w-24">單價</th>
              <th className="px-2 py-2 text-right font-medium w-24">金額</th>
              <th className="px-2 py-2 text-left font-medium w-28">備註</th>
              <th className="px-2 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.map((it, idx) => (
              <tr key={idx} className={!it.matched ? "bg-amber-50/50" : ""}>
                <td className="px-2 py-2 text-xs text-[var(--text-tertiary)]">
                  {idx + 1}
                </td>
                <td className="px-2 py-1.5">
                  {it.matched && it.productCode ? (
                    <Select
                      value={it.productId}
                      onValueChange={(v) => selectProduct(idx, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue>
                          <span className="font-mono">{it.productCode}</span>
                          {it.productName && (
                            <span className="ml-1 text-[var(--text-tertiary)]">
                              {it.productName}
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {supplierProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="font-mono">{p.productCode}</span>
                            {" — "}
                            {p.productName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-0.5">
                      <Input
                        placeholder="商品編號"
                        value={it.productCode}
                        onChange={(e) =>
                          updateItem(idx, { productCode: e.target.value })
                        }
                        className="h-7 text-xs font-mono"
                      />
                      {it.warning && (
                        <div className="text-[10px] text-amber-600">⚠ {it.warning}</div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <Select
                    value={it.unit}
                    onValueChange={(v) => updateItem(idx, { unit: v as PurchaseUnit })}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    step="0.5"
                    value={it.quantity || ""}
                    onChange={(e) =>
                      updateItem(idx, { quantity: Number(e.target.value) || 0 })
                    }
                    className="h-7 text-right text-xs font-mono"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    step="0.5"
                    value={it.receivedQuantity || ""}
                    readOnly
                    disabled
                    className={`h-7 text-right text-xs font-mono ${
                      it.receivedQuantity > 0 && it.receivedQuantity !== it.quantity
                        ? "bg-amber-50 border-amber-300"
                        : ""
                    }`}
                    placeholder="請用收貨入庫"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    step="1"
                    value={it.unitPrice || ""}
                    onChange={(e) =>
                      updateItem(idx, { unitPrice: Number(e.target.value) || 0 })
                    }
                    className="h-7 text-right text-xs font-mono"
                  />
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-xs">
                  ${(it.quantity * it.unitPrice).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    value={it.notes}
                    onChange={(e) => updateItem(idx, { notes: e.target.value })}
                    className="h-7 text-xs"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-[var(--text-tertiary)] hover:text-red-500"
                    aria-label="刪除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals + notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="mb-1 block text-xs">附註（案件編號）</Label>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="例：P5999, P6005, S847"
            className="text-xs"
          />
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">小計</span>
              <span className="font-mono">${subtotal.toLocaleString("zh-TW")}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">運費</span>
              <Input
                type="number"
                value={shippingFee || ""}
                onChange={(e) => setShippingFee(Number(e.target.value) || 0)}
                className="h-7 w-24 text-right font-mono text-xs"
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">稅額</span>
              <Input
                type="number"
                value={taxAmount || ""}
                onChange={(e) => setTaxAmount(Number(e.target.value) || 0)}
                className="h-7 w-24 text-right font-mono text-xs"
              />
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-base font-semibold">
              <span>合計</span>
              <span className="font-mono text-[var(--accent)]">
                ${totalAmount.toLocaleString("zh-TW")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {loadingProducts && supplierId && (
        <div className="text-xs text-[var(--text-tertiary)]">商品庫載入中…</div>
      )}

      <PDFPreviewModal
        open={pdfPreviewOpen}
        onOpenChange={setPdfPreviewOpen}
        pdfBlob={pdfBlob}
        fileName={pdfFileName}
        loading={pdfLoading}
      />

      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>收貨入庫</DialogTitle>
            <DialogDescription>
              本次收貨會同步更新採購單實收數量、庫存主檔與庫存異動紀錄。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label className="mb-1 block text-xs">收貨日期</Label>
                <Input
                  type="date"
                  value={receiveOccurredAt}
                  onChange={(e) => setReceiveOccurredAt(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">單據編號</Label>
                <Input
                  value={receiveReferenceNumber}
                  onChange={(e) => setReceiveReferenceNumber(e.target.value)}
                  placeholder="例如：RCV-20260410-01"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">待收入庫</Label>
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                  共 {receivableItems.length} 筆，未輸入數量者不會入庫
                </div>
              </div>
            </div>

            {blockedReceiveItems.length > 0 && (
              <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                尚有 {blockedReceiveItems.length} 筆品項未對應採購商品，無法進行收貨入庫。
              </div>
            )}

            <div className="max-h-[360px] overflow-auto rounded-[var(--radius-md)] border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">品項</th>
                    <th className="px-3 py-2 text-right font-medium">訂購</th>
                    <th className="px-3 py-2 text-right font-medium">已收</th>
                    <th className="px-3 py-2 text-right font-medium">剩餘</th>
                    <th className="px-3 py-2 text-right font-medium">本次收貨</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {receiveDraftItems.map((draft) => {
                    const item = items.find((entry) => entry.itemId === draft.itemId);
                    if (!item) return null;
                    const remaining = draft.quantity - draft.receivedQuantity;
                    return (
                      <tr key={draft.itemId}>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs text-[var(--text-primary)]">{item.productCode}</div>
                          <div className="text-xs text-[var(--text-secondary)]">{item.productName}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{draft.quantity}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{draft.receivedQuantity}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{remaining}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            max={remaining}
                            step="0.5"
                            value={draft.receiveNow || ""}
                            onChange={(e) => updateReceiveDraft(draft.itemId, Number(e.target.value) || 0)}
                            className="h-8 text-right text-xs font-mono"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <Label className="mb-1 block text-xs">備註</Label>
              <Textarea
                rows={3}
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="本次收貨的補充說明，會寫入庫存異動紀錄"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialogOpen(false)} disabled={receiving}>
              取消
            </Button>
            <Button onClick={handleReceiveSubmit} disabled={receiving}>
              {receiving ? "入庫中…" : "確認收貨入庫"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
