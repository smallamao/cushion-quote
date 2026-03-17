"use client";

import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FilePlus,
  GripVertical,
  ImagePlus,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useClients } from "@/hooks/useClients";
import { useSettings } from "@/hooks/useSettings";
import {
  CHANNEL_LABELS,
  DEFAULT_TERMS,
  ITEM_TEMPLATES,
} from "@/lib/constants";
import type {
  Channel,
  Client,
  FlexQuoteItem,
  ItemUnit,
  QuoteLineRecord,
  QuoteStatus,
} from "@/lib/types";
import { formatCurrency, slugDate } from "@/lib/utils";
import { generatePDFBlob } from "@/components/pdf/QuotePDF";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import { CalculatorModal } from "@/components/quote-editor/CalculatorModal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const UNIT_OPTIONS: ItemUnit[] = ["只", "式", "件", "才", "組", "碼", "張", "片"];

const COL_WIDTH_KEY = "quote-table-column-widths";
const AUTO_DRAFT_KEY = "quote-auto-draft";
const COL_MIN = { itemName: 150, spec: 120 } as const;
const COL_DEFAULT = { itemName: 200, spec: 160 } as const;

interface AutoDraft {
  savedAt: string;
  quoteId: string;
  isEditMode: boolean;
  selectedClientId: string;
  companyName: string;
  contactName: string;
  phone: string;
  taxId: string;
  projectName: string;
  email: string;
  address: string;
  channel: Channel;
  items: FlexQuoteItem[];
  description: string;
  descriptionImageUrl: string;
  includeTax: boolean;
  termsTemplate: string;
}

function createEmptyItem(): FlexQuoteItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    spec: "",
    qty: 1,
    unit: "只",
    unitPrice: 0,
    amount: 0,
    isCostItem: false,
    notes: "",
  };
}

function generateQuoteId(): string {
  return `PQ${slugDate()}-01`;
}

interface SortableQuoteItemRowProps {
  item: FlexQuoteItem;
  index: number;
  colWidths: { itemName: number; spec: number };
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onUpdateItem: (id: string, patch: Partial<FlexQuoteItem>) => void;
  onRemoveItem: (id: string) => void;
  onHandleImageUpload: (id: string, file: File) => void;
}

function SortableQuoteItemRow({
  item,
  index,
  colWidths,
  expanded,
  onToggleExpand,
  onUpdateItem,
  onRemoveItem,
  onHandleImageUpload,
}: SortableQuoteItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <>
      <tr
        ref={setNodeRef}
        style={rowStyle}
        className={`border-b border-[var(--border)] last:border-b-0 ${
          isDragging ? "relative z-10 bg-[var(--bg-elevated)] shadow-[var(--shadow-md)]" : ""
        }`}
      >
        <td className="px-3 py-2 text-center text-xs text-[var(--text-secondary)]">
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              className="cursor-grab rounded-[var(--radius-sm)] p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)] active:cursor-grabbing"
              aria-label={`拖曳排序第 ${index + 1} 項`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <span>{index + 1}</span>
          </div>
        </td>
        <td
          className="px-3 py-2"
          style={{ width: colWidths.itemName, minWidth: COL_MIN.itemName }}
        >
          <textarea
            rows={2}
            value={item.name}
            onChange={(e) =>
              onUpdateItem(item.id, { name: e.target.value })
            }
            placeholder="商品名稱 / 描述"
            className="w-full resize-none rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1 text-sm leading-snug text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] hover:border-[var(--border)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"
          />
          <div className="flex items-center gap-2 px-1">
            {item.isCostItem && (
              <span className="text-[11px] text-[var(--error)]">
                此為工本費支出
              </span>
            )}
            <button
              type="button"
              onClick={() => onToggleExpand(item.id)}
              className={`flex items-center gap-0.5 text-[11px] transition-colors ${
                expanded || item.notes || item.imageUrl
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <MessageSquare className="h-3 w-3" />
              {item.notes ? "備註" : expanded ? "收起" : "備註"}
            </button>
          </div>
        </td>
        <td
          className="px-3 py-2"
          style={{ width: colWidths.spec, minWidth: COL_MIN.spec }}
        >
          <input
            value={item.spec}
            onChange={(e) =>
              onUpdateItem(item.id, { spec: e.target.value })
            }
            placeholder="規格 / 材質"
            className="w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] hover:border-[var(--border)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min={1}
            value={item.qty}
            onChange={(e) =>
              onUpdateItem(item.id, {
                qty: Math.max(1, Number(e.target.value)),
              })
            }
            className="w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1 text-right text-sm text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </td>
        <td className="px-3 py-2">
          <Select
            value={item.unit}
            onValueChange={(v) =>
              onUpdateItem(item.id, { unit: v as ItemUnit })
            }
          >
            <SelectTrigger className="h-7 border-transparent bg-transparent text-xs hover:border-[var(--border)]">
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
        <td className="px-3 py-2">
          <input
            type="number"
            min={0}
            value={item.unitPrice}
            onChange={(e) =>
              onUpdateItem(item.id, {
                unitPrice: Number(e.target.value),
              })
            }
            className="w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1 text-right text-sm text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </td>
        <td className="px-3 py-2 text-right text-sm font-medium text-[var(--text-primary)]">
          {formatCurrency(item.amount)}
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={() => onRemoveItem(item.id)}
            className="rounded-[var(--radius-sm)] p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--error-light)] hover:text-[var(--error)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr
          style={rowStyle}
          className={`border-b border-[var(--border)] last:border-b-0 ${
            isDragging ? "bg-[var(--bg-elevated)]" : ""
          }`}
        >
          <td />
          <td colSpan={6} className="px-3 pb-3">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">備註</div>
                <textarea
                  rows={2}
                  value={item.notes}
                  onChange={(e) => onUpdateItem(item.id, { notes: e.target.value })}
                  placeholder="內部備註，不會顯示在報價單上..."
                  className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div className="w-32 shrink-0">
                <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">參考圖片</div>
                {item.imageUrl ? (
                  <div className="group relative">
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-16 w-full rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => onUpdateItem(item.id, { imageUrl: "" })}
                      className="absolute -right-1 -top-1 hidden rounded-full bg-[var(--error)] p-0.5 text-white group-hover:block"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-16 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]">
                    <ImagePlus className="h-4 w-4 text-[var(--text-tertiary)]" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onHandleImageUpload(item.id, file);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          </td>
          <td />
        </tr>
      )}
    </>
  );
}

export function QuoteEditor() {
  const { settings } = useSettings();
  const { clients, loading: clientsLoading } = useClients();

  const [quoteId, setQuoteId] = useState(generateQuoteId);
  const [status] = useState<QuoteStatus>("draft");
  const [channel, setChannel] = useState<Channel>("retail");

  const [selectedClientId, setSelectedClientId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [items, setItems] = useState<FlexQuoteItem[]>([createEmptyItem()]);
  const [description, setDescription] = useState("");
  const [descriptionImageUrl, setDescriptionImageUrl] = useState("");
  const [includeTax, setIncludeTax] = useState(true);
  const [termsTemplate, setTermsTemplate] = useState(DEFAULT_TERMS);
  const [clientSectionOpen, setClientSectionOpen] = useState(true);

  const [isEditMode, setIsEditMode] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);

  const [colWidths, setColWidths] = useState<{ itemName: number; spec: number }>({ ...COL_DEFAULT });
  const autoDraftReadyRef = useRef(false);

  const clearAutoDraft = useCallback(() => {
    try {
      localStorage.removeItem(AUTO_DRAFT_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COL_WIDTH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setColWidths({
          itemName: Math.max(COL_MIN.itemName, parsed.itemName ?? COL_DEFAULT.itemName),
          spec: Math.max(COL_MIN.spec, parsed.spec ?? COL_DEFAULT.spec),
        });
      }
    } catch {}
  }, []);

  const resizeRef = useRef<{
    col: "itemName" | "spec";
    startX: number;
    startW: number;
  } | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback(
    (col: "itemName" | "spec", e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = { col, startX: e.clientX, startW: colWidths[col] };
      setIsResizing(true);
    },
    [colWidths],
  );

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      const min = COL_MIN[r.col];
      const next = Math.max(min, r.startW + delta);
      setColWidths((prev) => ({ ...prev, [r.col]: next }));
    };

    const onMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
      setColWidths((cur) => {
        try { localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(cur)); } catch {}
        return cur;
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("quote-to-load");
      if (!stored) return;
      
      const data = JSON.parse(stored);
      sessionStorage.removeItem("quote-to-load");

      const { header, lines, isDuplicate } = data;
      
      if (isDuplicate) {
        setQuoteId(generateQuoteId());
        setIsEditMode(false);
      } else {
        setQuoteId(header.quoteId);
        setIsEditMode(true);
      }

      setCompanyName(header.clientName || "");
      setContactName(header.clientContact || "");
      setPhone(header.clientPhone || "");
      setAddress(header.projectAddress || "");
      setProjectName(header.projectName || "");
      setChannel(header.channel || "retail");
      setDescription(header.notes || "");

      if (lines && lines.length > 0) {
        const loadedItems = (lines as QuoteLineRecord[]).map((line) => ({
          id: crypto.randomUUID(),
          name: line.itemName || "",
          spec: line.materialDesc || "",
          qty: line.qty || 1,
          unit: "只" as ItemUnit,
          unitPrice: line.unitPrice || 0,
          amount: line.subtotal || 0,
          isCostItem: false,
          notes: line.notes || "",
        }));
        setItems(loadedItems);
      }
    } catch (err) {
      console.error("Failed to load quote from session storage:", err);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTO_DRAFT_KEY);
      if (!raw) {
        autoDraftReadyRef.current = true;
        return;
      }

      const draft = JSON.parse(raw) as AutoDraft;
      const savedAtMs = new Date(draft.savedAt).getTime();

      if (!Number.isFinite(savedAtMs) || Date.now() - savedAtMs > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(AUTO_DRAFT_KEY);
        autoDraftReadyRef.current = true;
        return;
      }

      const shouldRestore = confirm(`發現未儲存的草稿（${draft.savedAt}），要還原嗎？`);

      if (shouldRestore) {
        setQuoteId(draft.quoteId);
        setIsEditMode(draft.isEditMode);
        setSelectedClientId(draft.selectedClientId);
        setCompanyName(draft.companyName);
        setContactName(draft.contactName);
        setPhone(draft.phone);
        setTaxId(draft.taxId);
        setProjectName(draft.projectName);
        setEmail(draft.email);
        setAddress(draft.address);
        setChannel(draft.channel);
        setItems(draft.items.length > 0 ? draft.items : [createEmptyItem()]);
        setDescription(draft.description);
        setDescriptionImageUrl(draft.descriptionImageUrl);
        setIncludeTax(draft.includeTax);
        setTermsTemplate(draft.termsTemplate);
      } else {
        localStorage.removeItem(AUTO_DRAFT_KEY);
      }
    } catch {
      clearAutoDraft();
    } finally {
      autoDraftReadyRef.current = true;
    }
  }, [clearAutoDraft]);

  useEffect(() => {
    if (!autoDraftReadyRef.current) return;

    const timeoutId = window.setTimeout(() => {
      const draft: AutoDraft = {
        savedAt: new Date().toISOString(),
        quoteId,
        isEditMode,
        selectedClientId,
        companyName,
        contactName,
        phone,
        taxId,
        projectName,
        email,
        address,
        channel,
        items,
        description,
        descriptionImageUrl,
        includeTax,
        termsTemplate,
      };

      try {
        localStorage.setItem(AUTO_DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // Ignore quota errors from large base64 images.
      }
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [
    address,
    channel,
    companyName,
    contactName,
    description,
    descriptionImageUrl,
    email,
    includeTax,
    isEditMode,
    items,
    phone,
    projectName,
    quoteId,
    selectedClientId,
    taxId,
    termsTemplate,
  ]);

  const selectClient = useCallback(
    (clientId: string) => {
      setSelectedClientId(clientId);
      if (clientId === "__new__") {
        setCompanyName("");
        setContactName("");
        setPhone("");
        setTaxId("");
        setProjectName("");
        setEmail("");
        setAddress("");
        return;
      }
      const client = clients.find((c: Client) => c.id === clientId);
      if (!client) return;
      setCompanyName(client.companyName);
      setContactName(client.contactName);
      setPhone(client.phone);
      setTaxId(client.taxId);
      setEmail(client.email);
      setAddress(client.address);
      setChannel(client.channel);
    },
    [clients],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<FlexQuoteItem>) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const updated = { ...item, ...patch };
          if ("qty" in patch || "unitPrice" in patch) {
            updated.amount = updated.qty * updated.unitPrice;
          }
          return updated;
        }),
      );
    },
    [],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      if (prev.length <= 1) return [createEmptyItem()];
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const toggleItemExpand = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleImageUpload = useCallback(
    (id: string, file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        updateItem(id, { imageUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    },
    [updateItem],
  );

  const addItem = useCallback((item?: Omit<FlexQuoteItem, "id">) => {
    if (item) {
      setItems((prev) => [...prev, { ...item, id: crypto.randomUUID() }]);
    } else {
      setItems((prev) => [...prev, createEmptyItem()]);
    }
  }, []);

  const insertTemplateItem = useCallback(
    (template: (typeof ITEM_TEMPLATES)[number]) => {
      addItem(template.item);
      setTemplateDropdownOpen(false);
    },
    [addItem],
  );

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.amount, 0),
    [items],
  );
  const tax = useMemo(
    () => (includeTax ? Math.round(subtotal * (settings.taxRate / 100)) : 0),
    [includeTax, subtotal, settings.taxRate],
  );
  const total = subtotal + tax;

  function handleNewQuote() {
    clearAutoDraft();
    setIsEditMode(false);
    setQuoteId(generateQuoteId());
    setSelectedClientId("");
    setCompanyName("");
    setContactName("");
    setPhone("");
    setTaxId("");
    setProjectName("");
    setEmail("");
    setAddress("");
    setItems([createEmptyItem()]);
    setDescription("");
    setDescriptionImageUrl("");
    setIncludeTax(true);
    setTermsTemplate(DEFAULT_TERMS);
    setChannel("retail");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function fetchNextQuoteId(): Promise<string> {
    try {
      const res = await fetch("/api/sheets/quotes/next-id");
      const data = (await res.json()) as { quoteId: string };
      return data.quoteId;
    } catch {
      return quoteId;
    }
  }

  function buildPayload(targetId: string) {
    const now = new Date().toISOString().slice(0, 10);
    return {
      header: {
        quoteId: targetId,
        quoteDate: now,
        clientName: companyName,
        clientContact: contactName,
        clientPhone: phone,
        projectName,
        projectAddress: address,
        channel,
        totalBeforeTax: subtotal,
        tax,
        total,
        commissionMode: settings.commissionMode,
        commissionRate: settings.commissionRate,
        commissionAmount: 0,
        status: "draft" as QuoteStatus,
        createdBy: "",
        notes: description,
        createdAt: now,
        updatedAt: now,
      },
      lines: items.map((item, idx) => ({
        quoteId: targetId,
        lineNumber: idx + 1,
        itemName: item.name,
        method: "flat",
        widthCm: 0,
        heightCm: 0,
        caiCount: 0,
        foamThickness: 0,
        materialId: "",
        materialDesc: item.spec,
        qty: item.qty,
        laborRate: 0,
        materialRate: 0,
        extras: "",
        unitPrice: item.unitPrice,
        piecePrice: item.unitPrice,
        subtotal: item.amount,
        notes: item.notes,
      })),
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (isEditMode) {
        const payload = buildPayload(quoteId);
        const response = await fetch("/api/sheets/quotes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("更新失敗");
        clearAutoDraft();
        alert(`報價單 ${quoteId} 已更新`);
      } else {
        const finalId = await fetchNextQuoteId();
        setQuoteId(finalId);
        const payload = buildPayload(finalId);
        const response = await fetch("/api/sheets/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("儲存失敗");
        setIsEditMode(true);
        clearAutoDraft();
        alert(`報價單 ${finalId} 已儲存`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAs() {
    setSaving(true);
    try {
      const newId = await fetchNextQuoteId();
      setQuoteId(newId);
      const payload = buildPayload(newId);
      const response = await fetch("/api/sheets/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("儲存失敗");
      setIsEditMode(true);
      clearAutoDraft();
      alert(`報價單 ${newId} 已另存新檔`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "另存新檔失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreviewPDF() {
    setPdfLoading(true);
    setPdfPreviewOpen(true);
    setPdfBlob(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const blob = await generatePDFBlob({
        quoteId,
        quoteDate: today,
        validityDays: settings.quoteValidityDays,
        client: {
          companyName,
          contactName,
          phone,
          email,
          address,
          taxId,
        },
        projectName,
        channel,
        items,
        description,
        descriptionImageUrl: descriptionImageUrl || undefined,
        includeTax,
        subtotal,
        tax,
        total,
        termsTemplate,
        settings,
      });
      setPdfBlob(blob);
    } finally {
      setPdfLoading(false);
    }
  }

  const STATUS_LABELS: Record<QuoteStatus, string> = {
    draft: "草稿",
    sent: "已發送",
    accepted: "已接受",
    rejected: "已拒絕",
    expired: "已過期",
    deleted: "已刪除",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">報價單</span>
            <Input
              value={quoteId}
              onChange={(e) => setQuoteId(e.target.value)}
              className="h-7 w-48 text-sm font-semibold"
              placeholder="CQ-YYYYMMDD-01"
            />
          </div>
          <span className="badge badge-draft">{STATUS_LABELS[status]}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)]">通路</span>
            <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["wholesale", "designer", "retail", "luxury_retail"] as const).map((ch) => (
                  <SelectItem key={ch} value={ch}>
                    {CHANNEL_LABELS[ch].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleNewQuote}>
            <FilePlus className="h-3.5 w-3.5" />
            新建報價
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "儲存中..." : isEditMode ? "更新" : "儲存"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={handleSaveAs}
          >
            <Copy className="h-3.5 w-3.5" />
            另存新檔
          </Button>
          <Button size="sm" disabled={pdfLoading} onClick={handlePreviewPDF}>
            {pdfLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {pdfLoading ? "生成中..." : "預覽 PDF"}
          </Button>
        </div>
      </div>

      <div className="card-surface rounded-[var(--radius-lg)]">
        <button
          type="button"
          onClick={() => setClientSectionOpen(!clientSectionOpen)}
          className="flex w-full items-center justify-between px-6 py-3 text-left transition-colors hover:bg-[var(--bg-subtle)]"
        >
          <span className="text-sm font-medium text-[var(--text-primary)]">
            客戶資訊
          </span>
          {clientSectionOpen ? (
            <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
          )}
        </button>
        {clientSectionOpen && (
          <div className="border-t border-[var(--border)] px-6 py-4">
            <div className="mb-4">
              <Label>選擇客戶</Label>
              <Select
                value={selectedClientId}
                onValueChange={selectClient}
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder={clientsLoading ? "載入中..." : "選擇客戶或新建"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">＋ 新客戶（手動輸入）</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.companyName}
                      {c.shortName ? ` (${c.shortName})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label>公司名稱</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div>
                <Label>聯絡人</Label>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div>
                <Label>電話</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <Label>統一編號</Label>
                <Input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                />
              </div>
              <div>
                <Label>案場名稱</Label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card-surface rounded-[var(--radius-lg)]">
        <div className="overflow-x-auto rounded-t-[var(--radius-lg)]">
          <DndContext onDragEnd={handleDragEnd}>
            <table className={`w-full border-collapse text-sm ${isResizing ? "select-none" : ""}`}>
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                  <th className="w-12 px-3 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)]">
                    項次
                  </th>
                  <th
                    className="relative px-3 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)]"
                    style={{ width: colWidths.itemName, minWidth: COL_MIN.itemName }}
                  >
                    商品名稱
                    <div
                      onMouseDown={(e) => handleResizeStart("itemName", e)}
                      className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-[var(--accent)]"
                    />
                  </th>
                  <th
                    className="relative px-3 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)]"
                    style={{ width: colWidths.spec, minWidth: COL_MIN.spec }}
                  >
                    規格
                    <div
                      onMouseDown={(e) => handleResizeStart("spec", e)}
                      className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-[var(--accent)]"
                    />
                  </th>
                  <th className="w-20 px-3 py-2.5 text-right text-xs font-medium text-[var(--text-secondary)]">
                    數量
                  </th>
                  <th className="w-20 px-3 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)]">
                    單位
                  </th>
                  <th className="w-28 px-3 py-2.5 text-right text-xs font-medium text-[var(--text-secondary)]">
                    單價
                  </th>
                  <th className="w-28 px-3 py-2.5 text-right text-xs font-medium text-[var(--text-secondary)]">
                    金額
                  </th>
                  <th className="w-12 px-3 py-2.5" />
                </tr>
              </thead>
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <tbody>
                  {items.map((item, idx) => (
                    <SortableQuoteItemRow
                      key={item.id}
                      item={item}
                      index={idx}
                      colWidths={colWidths}
                      expanded={expandedItems.has(item.id)}
                      onToggleExpand={toggleItemExpand}
                      onUpdateItem={updateItem}
                      onRemoveItem={removeItem}
                      onHandleImageUpload={handleImageUpload}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </table>
          </DndContext>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => addItem()}>
            <Plus className="h-3.5 w-3.5" />
            新增品項
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCalcOpen(true)}
          >
            🧮 用計算器算
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTemplateDropdownOpen(!templateDropdownOpen)}
            >
              📋 常用範本
              <ChevronDown className="h-3 w-3" />
            </Button>
            {templateDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setTemplateDropdownOpen(false)}
                />
                <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-lg)]">
                  {ITEM_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => insertTemplateItem(tpl)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      <span>{tpl.label}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {tpl.item.unitPrice > 0
                          ? formatCurrency(tpl.item.unitPrice)
                          : "待定"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card-surface rounded-[var(--radius-lg)] px-6 py-4">
        <Label>補充說明</Label>
        <div className="mt-2 flex gap-4">
          <div className="flex-1">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="坐墊底部車縫止滑墊、坐墊車縫綁帶⋯⋯"
              rows={3}
            />
          </div>
          <div className="w-40 shrink-0">
            <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">附圖（會顯示在報價單）</div>
            {descriptionImageUrl ? (
              <div className="group relative">
                <img
                  src={descriptionImageUrl}
                  alt=""
                  className="h-20 w-full rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
                />
                <button
                  type="button"
                  onClick={() => setDescriptionImageUrl("")}
                  className="absolute -right-1 -top-1 hidden rounded-full bg-[var(--error)] p-0.5 text-white group-hover:block"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <label className="flex h-20 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]">
                <ImagePlus className="h-4 w-4 text-[var(--text-tertiary)]" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => setDescriptionImageUrl(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <div className="w-72 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">小計</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Checkbox
                checked={includeTax}
                onCheckedChange={(v) => setIncludeTax(v === true)}
              />
              營業稅 {settings.taxRate}%
            </label>
            <span className="font-medium">{formatCurrency(tax)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-base">
            <span className="font-semibold text-[var(--text-primary)]">
              總額
            </span>
            <span className="font-bold text-[var(--accent)]">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>

      <div className="card-surface rounded-[var(--radius-lg)] px-6 py-4">
        <Label>備註 / 條款</Label>
        <Textarea
          value={termsTemplate}
          onChange={(e) => setTermsTemplate(e.target.value)}
          rows={6}
          className="font-mono text-xs leading-relaxed"
        />
      </div>

      <CalculatorModal
        open={calcOpen}
        onOpenChange={setCalcOpen}
        onInsertItem={addItem}
        channel={channel}
      />

      <PDFPreviewModal
        open={pdfPreviewOpen}
        onOpenChange={setPdfPreviewOpen}
        pdfBlob={pdfBlob}
        fileName={`${quoteId}.pdf`}
        loading={pdfLoading}
      />
    </div>
  );
}
