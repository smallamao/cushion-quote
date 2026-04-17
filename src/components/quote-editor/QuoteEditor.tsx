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
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MessageSquare,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useClients } from "@/hooks/useClients";
import { useHistory } from "@/hooks/useHistory";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSettings } from "@/hooks/useSettings";
import { useTemplates } from "@/hooks/useTemplates";
import {
  buildQuoteDraftSignature,
  clearQuoteLoadRequest,
  clearQuoteDraftSession,
  consumeQuoteDraftSession,
  createQuoteDraftSession,
  createQuoteLoadRequest,
  generateQuoteDraftSessionId,
  readQuoteLoadRequest,
  writeQuoteDraftSession,
  writeQuoteLoadRequest,
} from "@/lib/quote-draft-session";
import {
  CHANNEL_LABELS,
  DEFAULT_TERMS,
  ITEM_TEMPLATES,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_DETAIL_ENABLED,
  LEAD_SOURCE_OPTIONS,
  QUOTE_TEMPLATES,
} from "@/lib/constants";
import type {
  CaseRecord,
  Channel,
  Client,
  CommissionOverride,
  CommissionMode,
  CommissionPartnerSplit,
  FlexQuoteItem,
  ItemUnit,
  LeadSource,
  PartnerRole,
  QuoteDraftComparable,
  QuoteDraftSessionSource,
  QuotePlanRecord,
  QuoteTemplate,
  QuoteVersionRecord,
  SystemSettings,
  VersionLineRecord,
  VersionStatus,
} from "@/lib/types";
import { buildSplitItemFields, buildSplitLineFields } from "@/lib/split-panel-metadata";
import { calculateQuotedUnitPrice, clampCommissionRate, formatCurrency, roundPriceToTens, slugDate } from "@/lib/utils";
import {
  buildPdfFileName,
  generateAndDownloadJpg,
  generatePDFBlob,
} from "@/components/pdf/QuotePDF";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import { CalculatorModal } from "@/components/quote-editor/CalculatorModal";
import { MobileQuoteItemCard } from "@/components/quote-editor/MobileQuoteItemCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const ROLE_LABELS: Record<PartnerRole, string> = {
  designer: "設計",
  installer: "工班",
  referrer: "介紹人",
  other: "其他",
};

const COL_WIDTH_KEY = "quote-table-column-widths";
const COL_MIN = { itemName: 150, spec: 120 } as const;
const COL_DEFAULT = { itemName: 200, spec: 160 } as const;

type LocalDraftSaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface AutoPricingConfig {
  channelMultipliers: SystemSettings["channelMultipliers"];
  commissionMode: CommissionMode;
  commissionRate: number;
  commissionFixedAmount: number;
}

function isAutoPricedItem(item: FlexQuoteItem) {
  if (item.unitPriceLocked) return false;
  if (item.autoPriced != null) return item.autoPriced;
  return item.costPerUnit != null && (item.method != null || item.materialRate != null || item.laborRate != null);
}

function getCommissionModeLabel(mode: CommissionMode, rate: number, fixedAmount: number) {
  if (mode === "rebate") return `返佣 ${clampCommissionRate(rate)}%`;
  if (mode === "fixed") return `固定 ${formatCurrency(Math.max(0, Math.round(fixedAmount)))}`;
  if (mode === "none") return "無佣金";
  return "賺價差";
}

function recalculateAutoPricedItems(
  items: FlexQuoteItem[],
  channel: Channel,
  config: AutoPricingConfig,
) {
  const multiplier = config.channelMultipliers[channel];
  const autoEntries = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isAutoPricedItem(item) && item.costPerUnit != null && Number.isFinite(item.costPerUnit));

  if (autoEntries.length === 0) return items;

  const fixedCommission =
    config.commissionMode === "fixed" ? Math.max(0, Math.round(config.commissionFixedAmount)) : 0;
  const allocationByIndex = new Map<number, number>();

  if (fixedCommission > 0) {
    const baseSubtotals = autoEntries.map(({ item }) => {
      const qty = Math.max(1, Number(item.qty) || 1);
      return roundPriceToTens((item.costPerUnit ?? 0) * multiplier) * qty;
    });
    const allocatableSubtotal = baseSubtotals.reduce((sum, value) => sum + value, 0);

    if (allocatableSubtotal > 0) {
      const allocations = baseSubtotals.map((baseSubtotal) =>
        Math.floor((fixedCommission * baseSubtotal) / allocatableSubtotal),
      );
      const allocatedTotal = allocations.reduce((sum, value) => sum + value, 0);
      const remainder = fixedCommission - allocatedTotal;

      let targetIndex = 0;
      for (let i = 1; i < baseSubtotals.length; i += 1) {
        if (baseSubtotals[i] > baseSubtotals[targetIndex]) {
          targetIndex = i;
        }
      }
      allocations[targetIndex] += remainder;

      autoEntries.forEach(({ index }, entryIndex) => {
        allocationByIndex.set(index, allocations[entryIndex] ?? 0);
      });
    }
  }

  let changed = false;
  const nextItems = items.map((item, index) => {
    if (!isAutoPricedItem(item) || item.costPerUnit == null || !Number.isFinite(item.costPerUnit)) return item;

    const qty = Math.max(1, Number(item.qty) || 1);
    const baseUnitPrice = roundPriceToTens(item.costPerUnit * multiplier);
    const nextUnitPrice =
      fixedCommission > 0
        ? roundPriceToTens(baseUnitPrice + (allocationByIndex.get(index) ?? 0) / qty)
        : calculateQuotedUnitPrice(item.costPerUnit, multiplier, config.commissionMode, config.commissionRate);
    const nextAmount = nextUnitPrice * item.qty;

    if (item.unitPrice === nextUnitPrice && item.amount === nextAmount) return item;

    changed = true;
    return {
      ...item,
      unitPrice: nextUnitPrice,
      amount: nextAmount,
    };
  });

  return changed ? nextItems : items;
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateStr: string, days: number): string {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(base.getTime())) return todayIso();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function defaultValidUntil(validityDays: number): string {
  return addDaysIso(todayIso(), Math.max(0, validityDays || 0));
}

function parseCommissionPartners(raw: string): CommissionPartnerSplit[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Partial<CommissionPartnerSplit>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        name: String(item.name ?? "").trim(),
        partnerId: String(item.partnerId ?? "").trim(),
        role: (item.role as PartnerRole) ?? "other",
        amount: Math.max(0, Math.round(Number(item.amount ?? 0) || 0)),
      }))
      .filter((item) => item.name || item.partnerId || item.amount > 0);
  } catch {
    return [];
  }
}

function toFlexItemsFromVersion(lines: VersionLineRecord[]): FlexQuoteItem[] {
  return lines.map((line) => ({
    id: crypto.randomUUID(),
    name: line.itemName,
    spec: line.spec,
    qty: line.qty || 1,
    unit: line.unit,
    unitPrice: line.unitPrice,
    amount: line.lineAmount,
    isCostItem: line.isCostItem,
    notes: line.notes,
    imageUrl: line.imageUrl,
    specImageUrl: line.specImageUrl,
    materialId: line.materialId,
    autoPriced: false,
    costPerUnit: line.estimatedUnitCost,
    ...buildSplitItemFields(line),
  }));
}

interface SortableQuoteItemRowProps {
  item: FlexQuoteItem;
  index: number;
  colWidths: { itemName: number; spec: number };
  expanded: boolean;
  isImageUploading: boolean;
  isSpecImageUploading: boolean;
  imageUploadError?: string;
  specImageUploadError?: string;
  onToggleExpand: (id: string) => void;
  onUpdateItem: (id: string, patch: Partial<FlexQuoteItem>) => void;
  onRemoveItem: (id: string) => void;
  onHandleImageUpload: (id: string, file: File, field?: "imageUrl" | "specImageUrl") => void | Promise<void>;
}

function SortableQuoteItemRow({
  item,
  index,
  colWidths,
  expanded,
  isImageUploading,
  isSpecImageUploading,
  imageUploadError,
  specImageUploadError,
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
  const showManualCostInput = useRef(item.costPerUnit == null).current;

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
            rows={3}
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
              {showManualCostInput && (
                <div className="w-40 shrink-0">
                  <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">成本/件（選填）</div>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.costPerUnit ?? ""}
                    onChange={(e) =>
                      onUpdateItem(item.id, {
                        costPerUnit: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="0"
                    className="h-8 text-xs"
                  />
                </div>
              )}
              <div className="w-32 shrink-0">
                <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">參考圖片</div>
                {item.imageUrl ? (
                  <div className="group relative">
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-16 w-full rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
                    />
                    {isImageUploading && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-black/35">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onUpdateItem(item.id, { imageUrl: "" })}
                      disabled={isImageUploading}
                      className="absolute -right-1 -top-1 hidden rounded-full bg-[var(--error)] p-0.5 text-white group-hover:block"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-16 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]">
                    {isImageUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                    ) : (
                      <ImagePlus className="h-4 w-4 text-[var(--text-tertiary)]" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isImageUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onHandleImageUpload(item.id, file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                )}
                {imageUploadError && (
                  <div className="mt-1 text-[10px] text-[var(--error)]">{imageUploadError}</div>
                )}
              </div>
              <div className="w-32 shrink-0">
                <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">規格圖片</div>
                {item.specImageUrl ? (
                  <div className="group relative">
                    <img
                      src={item.specImageUrl}
                      alt=""
                      className="h-16 w-full rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
                    />
                    {isSpecImageUploading && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-black/35">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onUpdateItem(item.id, { specImageUrl: "" })}
                      disabled={isSpecImageUploading}
                      className="absolute -right-1 -top-1 hidden rounded-full bg-[var(--error)] p-0.5 text-white group-hover:block"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-16 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]">
                    {isSpecImageUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                    ) : (
                      <ImagePlus className="h-4 w-4 text-[var(--text-tertiary)]" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isSpecImageUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onHandleImageUpload(item.id, file, "specImageUrl");
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                )}
                {specImageUploadError && (
                  <div className="mt-1 text-[10px] text-[var(--error)]">{specImageUploadError}</div>
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
  const { templates: dbTemplates, loadTemplates } = useTemplates();
  const isMobile = useIsMobile();

  const [caseId, setCaseId] = useState("");
  const [quoteId, setQuoteId] = useState(generateQuoteId);
  const [versionId, setVersionId] = useState("");
  const [versionNo, setVersionNo] = useState(1);
  const [versionLabel, setVersionLabel] = useState("");
  const [status] = useState<VersionStatus>("draft");
  const [channel, setChannel] = useState<Channel>("retail");

  const [selectedClientId, setSelectedClientId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [quoteName, setQuoteName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [leadSource, setLeadSource] = useState<LeadSource>("unknown");
  const [leadSourceDetail, setLeadSourceDetail] = useState("");
  const [leadSourceContact, setLeadSourceContact] = useState("");
  const [leadSourceNotes, setLeadSourceNotes] = useState("");
  const [commissionOverride, setCommissionOverride] = useState<CommissionOverride | null>(null);
  const [commissionPartners, setCommissionPartners] = useState<CommissionPartnerSplit[]>([]);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);

  const [historyInitialItems, setHistoryInitialItems] = useState<FlexQuoteItem[]>(() => [createEmptyItem()]);
  const { state: items, setState: setItems, undo, redo, canUndo, canRedo } = useHistory<FlexQuoteItem[]>(historyInitialItems);
  const [description, setDescription] = useState("");
  const [descriptionImageUrl, setDescriptionImageUrl] = useState("");
  const [descriptionImageUploading, setDescriptionImageUploading] = useState(false);
  const [descriptionImageError, setDescriptionImageError] = useState("");
  const [includeTax, setIncludeTax] = useState(true);
  const [termsTemplate, setTermsTemplate] = useState(DEFAULT_TERMS);
  const [clientSectionOpen, setClientSectionOpen] = useState(true);

  const [isEditMode, setIsEditMode] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [pdfLoading, setPdfLoading] = useState(false);
  const [jpgLoading, setJpgLoading] = useState(false);
  const [pdfPageMode, setPdfPageMode] = useState<"a4" | "long">("a4");
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyingVersion, setCopyingVersion] = useState(false);
  const [activeVersion, setActiveVersion] = useState<QuoteVersionRecord | null>(null);
  const [validUntil, setValidUntil] = useState<string>(() =>
    defaultValidUntil(settings.quoteValidityDays),
  );
  const [calcOpen, setCalcOpen] = useState(false);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [quoteTemplateDropdownOpen, setQuoteTemplateDropdownOpen] = useState(false);
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [itemImageUploading, setItemImageUploading] = useState<Record<string, boolean>>({});
  const [itemImageErrors, setItemImageErrors] = useState<Record<string, string>>({});
  const [draftSessionId, setDraftSessionId] = useState(() => generateQuoteDraftSessionId());
  const [draftSessionSource, setDraftSessionSource] = useState<QuoteDraftSessionSource>("new-quote");
  const [localDraftSaveState, setLocalDraftSaveState] = useState<LocalDraftSaveState>("idle");
  const [localDraftSavedAt, setLocalDraftSavedAt] = useState("");

  const [colWidths, setColWidths] = useState<{ itemName: number; spec: number }>({ ...COL_DEFAULT });
  const autoDraftReadyRef = useRef(false);
  const autoDraftBaselineSignatureRef = useRef("");
  const autoDraftRestoreCheckedRef = useRef(false);
  const autoPricingSignatureRef = useRef("");
  const suppressNextAutoPricingRef = useRef(false);
  const pendingSessionLoadRef = useRef(false);
  const restoredLocalDraftRef = useRef(false);

  const clearAutoDraft = useCallback(() => {
    autoDraftBaselineSignatureRef.current = "";
    restoredLocalDraftRef.current = false;
    setLocalDraftSaveState("idle");
    setLocalDraftSavedAt("");
    try {
      clearQuoteDraftSession(window.localStorage);
    } catch {}
  }, []);

  const shouldShowLeadSourceDetail = useCallback(
    (source: LeadSource) => LEAD_SOURCE_DETAIL_ENABLED.includes(source),
    [],
  );

  const buildCurrentAutoDraftComparable = useCallback(
    (): QuoteDraftComparable => ({
      selectedClientId,
      companyName,
      contactName,
      phone,
      taxId,
      projectName,
      quoteName,
      email,
      address,
      channel,
      leadSource,
      leadSourceDetail,
      leadSourceContact,
      leadSourceNotes,
      items,
      description,
      descriptionImageUrl,
      includeTax,
      termsTemplate,
      commissionOverride,
      commissionPartners,
    }),
    [
      selectedClientId,
      companyName,
      contactName,
      phone,
      taxId,
      projectName,
      quoteName,
      email,
      address,
      channel,
      leadSource,
      leadSourceDetail,
      leadSourceContact,
      leadSourceNotes,
      items,
      description,
      descriptionImageUrl,
      includeTax,
      termsTemplate,
      commissionOverride,
      commissionPartners,
    ],
  );

  const buildCurrentDraftSession = useCallback(
    (
      signature: string,
      comparable: QuoteDraftComparable,
      source: QuoteDraftSessionSource = draftSessionSource,
    ) =>
      createQuoteDraftSession({
        sessionId: draftSessionId,
        source,
        caseId,
        quoteId,
        versionId,
        versionNo,
        versionLabel,
        isEditMode,
        comparable,
        signature,
      }),
    [caseId, draftSessionId, draftSessionSource, isEditMode, quoteId, versionId, versionLabel, versionNo],
  );

  const hasUnsavedChanges = useCallback(() => {
    if (restoredLocalDraftRef.current) return true;
    if (!autoDraftReadyRef.current || !autoDraftBaselineSignatureRef.current) return false;

    const currentComparable = buildCurrentAutoDraftComparable();
    const currentSignature = buildQuoteDraftSignature(currentComparable);
    return currentSignature !== autoDraftBaselineSignatureRef.current;
  }, [buildCurrentAutoDraftComparable]);

  const flushAutoDraftNow = useCallback(
    (source: QuoteDraftSessionSource = draftSessionSource) => {
      if (!autoDraftReadyRef.current) return false;

      const currentComparable = buildCurrentAutoDraftComparable();
      const currentSignature = buildQuoteDraftSignature(currentComparable);

      if (!autoDraftBaselineSignatureRef.current) {
        autoDraftBaselineSignatureRef.current = currentSignature;
        setLocalDraftSaveState("idle");
        return false;
      }

      if (currentSignature === autoDraftBaselineSignatureRef.current) {
        if (!restoredLocalDraftRef.current) {
          clearAutoDraft();
        }
        return false;
      }

      try {
        writeQuoteDraftSession(
          window.localStorage,
          buildCurrentDraftSession(currentSignature, currentComparable, source),
        );
        setLocalDraftSaveState("saved");
        setLocalDraftSavedAt(new Date().toISOString());
        return true;
      } catch {
        setLocalDraftSaveState("error");
        return false;
      }
    },
    [buildCurrentAutoDraftComparable, buildCurrentDraftSession, clearAutoDraft, draftSessionSource],
  );

  const handleCommissionModeChange = useCallback(
    (value: CommissionMode | "default") => {
      if (value === "default") {
        setCommissionOverride(null);
        return;
      }

      setCommissionOverride((current) => ({
        mode: value,
        rate: clampCommissionRate(current?.rate ?? settings.commissionRate),
        fixedAmount: Math.max(0, Math.round(current?.fixedAmount ?? settings.commissionFixedAmount)),
      }));
    },
    [settings.commissionFixedAmount, settings.commissionRate],
  );

  const effectiveSettings = useMemo(
    () =>
      commissionOverride
        ? {
            ...settings,
            commissionMode: commissionOverride.mode,
            commissionRate: commissionOverride.rate,
            commissionFixedAmount: commissionOverride.fixedAmount,
          }
        : settings,
    [commissionOverride, settings],
  );
  const currentAutoPricing = useMemo<AutoPricingConfig>(
    () => ({
      channelMultipliers: settings.channelMultipliers,
      commissionMode: effectiveSettings.commissionMode,
      commissionRate: effectiveSettings.commissionRate,
      commissionFixedAmount: effectiveSettings.commissionFixedAmount,
    }),
    [
      effectiveSettings.commissionFixedAmount,
      effectiveSettings.commissionMode,
      effectiveSettings.commissionRate,
      settings.channelMultipliers,
    ],
  );
  const applyAutoPricing = useCallback(
    (sourceItems: FlexQuoteItem[]) => recalculateAutoPricedItems(sourceItems, channel, currentAutoPricing),
    [channel, currentAutoPricing],
  );

  // Merge hardcoded templates with database templates
  const allQuoteTemplates = useMemo(() => {
    // Convert database templates to the UI format
    const convertedDbTemplates = dbTemplates.map((tpl) => ({
      id: tpl.templateId,
      label: tpl.templateName,
      description: tpl.description,
      items: tpl.items.map(item => {
        const { id, ...rest } = item as FlexQuoteItem;
        return rest as Omit<FlexQuoteItem, "id">;
      }),
    }));

    return [...QUOTE_TEMPLATES, ...convertedDbTemplates];
  }, [dbTemplates]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const applyClientCommissionOverride = useCallback((client: Client | null) => {
    if (!client || client.commissionMode === "default") {
      setCommissionOverride(null);
      return;
    }

    setCommissionOverride({
      mode: client.commissionMode,
      rate: clampCommissionRate(client.commissionRate),
      fixedAmount: Math.max(0, client.commissionFixedAmount || 0),
    });
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

  const loadCaseSourceDetails = useCallback(async (targetCaseId: string) => {
    if (!targetCaseId) {
      return {
        leadSource: "unknown" as LeadSource,
        leadSourceDetail: "",
        leadSourceContact: "",
        leadSourceNotes: "",
      };
    }
    try {
      const response = await fetch(`/api/sheets/cases/${encodeURIComponent(targetCaseId)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return {
          leadSource: "unknown" as LeadSource,
          leadSourceDetail: "",
          leadSourceContact: "",
          leadSourceNotes: "",
        };
      }
      const payload = (await response.json()) as { case?: CaseRecord };
      return {
        leadSource: payload.case?.leadSource ?? "unknown",
        leadSourceDetail: payload.case?.leadSourceDetail ?? "",
        leadSourceContact: payload.case?.leadSourceContact ?? "",
        leadSourceNotes: payload.case?.leadSourceNotes ?? "",
      };
    } catch {
      return {
        leadSource: "unknown" as LeadSource,
        leadSourceDetail: "",
        leadSourceContact: "",
        leadSourceNotes: "",
      };
    }
  }, []);

  const persistCaseSourceDetails = useCallback(
    async (targetCaseId: string) => {
      if (!targetCaseId) return;
      const response = await fetch("/api/sheets/cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: targetCaseId,
          projectAddress: address,
          leadSource,
          leadSourceDetail: shouldShowLeadSourceDetail(leadSource) ? leadSourceDetail.trim() : "",
          leadSourceContact: leadSourceContact.trim(),
          leadSourceNotes: leadSourceNotes.trim(),
        } satisfies Partial<CaseRecord> & { caseId: string }),
      });
      if (!response.ok) throw new Error("更新案件資料失敗");
    },
    [address, leadSource, leadSourceContact, leadSourceDetail, leadSourceNotes, shouldShowLeadSourceDetail],
  );

  const loadVersionDocument = useCallback(
    async (targetVersionId: string, targetCaseId = "", targetQuoteId = "") => {
      const response = await fetch(`/api/sheets/versions/${encodeURIComponent(targetVersionId)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("讀取版本失敗");
      const payload = (await response.json()) as {
        version: QuoteVersionRecord;
        lines: VersionLineRecord[];
      };
      const { version, lines } = payload;
      const resolvedCaseId = targetCaseId || version.caseId;
      const resolvedQuoteId = targetQuoteId || version.quoteId;

      // Fetch quote plan to get quoteName and current case name
      const quoteResponse = await fetch(`/api/sheets/cases/${encodeURIComponent(resolvedCaseId)}`, {
        cache: "no-store",
      });
      let loadedQuoteName = "";
      let currentCaseName = "";
      if (quoteResponse.ok) {
        const caseData = (await quoteResponse.json()) as { case: CaseRecord; quotes: Array<{ quote: QuotePlanRecord; versions: QuoteVersionRecord[] }> };
        const quotePlan = caseData.quotes.find((q) => q.quote.quoteId === resolvedQuoteId);
        loadedQuoteName = quotePlan?.quote.quoteName || "";
        currentCaseName = caseData.case.caseName || "";
      }

      const sourceDetails = await loadCaseSourceDetails(resolvedCaseId);
      setCaseId(resolvedCaseId);
      setQuoteId(resolvedQuoteId);
      setQuoteName(loadedQuoteName);
      setVersionId(version.versionId);
      setVersionNo(version.versionNo);
      setVersionLabel(version.versionLabel);
      setIsEditMode(true);
      setActiveVersion(version);
      setValidUntil(
        version.validUntil ||
          addDaysIso(version.quoteDate || todayIso(), settings.quoteValidityDays),
      );
      setSelectedClientId("");
      setCompanyName(version.clientNameSnapshot || "");
      setContactName(version.contactNameSnapshot || "");
      setPhone(version.clientPhoneSnapshot || "");
      setAddress(version.projectAddressSnapshot || "");
      setProjectName(currentCaseName || version.projectNameSnapshot || "");
      setChannel(version.channel || "retail");
      setLeadSource(sourceDetails.leadSource);
      setLeadSourceDetail(sourceDetails.leadSourceDetail);
      setLeadSourceContact(sourceDetails.leadSourceContact);
      setLeadSourceNotes(sourceDetails.leadSourceNotes);
      setDescription(version.publicDescription || "");
      setDescriptionImageUrl(version.descriptionImageUrl || "");
      setDescriptionImageError("");
      setDescriptionImageUploading(false);
      setItemImageErrors({});
      setItemImageUploading({});
      setTermsTemplate(version.termsTemplate || DEFAULT_TERMS);
      setIncludeTax((version.taxRate ?? 0) > 0);
      setCommissionOverride({
        mode: version.commissionMode,
        rate: clampCommissionRate(version.commissionRate),
        fixedAmount: Math.max(0, version.commissionFixedAmount || 0),
      });
      setCommissionPartners(parseCommissionPartners(version.commissionPartners || ""));
      suppressNextAutoPricingRef.current = true;
      setHistoryInitialItems(lines.length > 0 ? toFlexItemsFromVersion(lines) : [createEmptyItem()]);
      setExpandedItems(new Set());
      setDraftSessionId(generateQuoteDraftSessionId());
      setDraftSessionSource("loaded-version");
      restoredLocalDraftRef.current = false;
    },
    [loadCaseSourceDetails],
  );

  useEffect(() => {
    let disposed = false;

    async function restoreFromSession() {
      try {
        const data = readQuoteLoadRequest(window.sessionStorage);
        if (!data) return;

        if (data.versionId) {
          pendingSessionLoadRef.current = true;
          await loadVersionDocument(data.versionId, data.caseId, data.quoteId);
          clearQuoteLoadRequest(window.sessionStorage);
          restoredLocalDraftRef.current = false;
          setDraftSessionSource(data.source);
        }
      } catch (err) {
        if (!disposed) {
          console.error("Failed to load quote from session storage:", err);
        }
      } finally {
        pendingSessionLoadRef.current = false;
        autoDraftReadyRef.current = true;
      }
    }

    void restoreFromSession();
    return () => {
      disposed = true;
    };
  }, [loadVersionDocument]);

  useEffect(() => {
    if (pendingSessionLoadRef.current) return;
    if (autoDraftRestoreCheckedRef.current) return;
    autoDraftRestoreCheckedRef.current = true;

    try {
      const draft = consumeQuoteDraftSession(window.localStorage);
      if (!draft) {
        autoDraftReadyRef.current = true;
        return;
      }

      const draftComparable: QuoteDraftComparable = {
        selectedClientId: draft.selectedClientId,
        companyName: draft.companyName,
        contactName: draft.contactName,
        phone: draft.phone,
        taxId: draft.taxId,
        projectName: draft.projectName,
        quoteName: draft.quoteName ?? "",
        email: draft.email,
        address: draft.address,
        channel: draft.channel,
        leadSource: draft.leadSource ?? "unknown",
        leadSourceDetail: draft.leadSourceDetail ?? "",
        leadSourceContact: draft.leadSourceContact ?? "",
        leadSourceNotes: draft.leadSourceNotes ?? "",
        items: draft.items.length > 0 ? draft.items : [createEmptyItem()],
        description: draft.description,
        descriptionImageUrl: draft.descriptionImageUrl,
        includeTax: draft.includeTax,
        termsTemplate: draft.termsTemplate,
        commissionOverride: draft.commissionOverride
          ? {
              mode: draft.commissionOverride.mode,
              rate: clampCommissionRate(draft.commissionOverride.rate),
              fixedAmount: Math.max(0, Number(draft.commissionOverride.fixedAmount ?? 0)),
            }
          : null,
        commissionPartners: draft.commissionPartners ?? [],
      };
      const draftSignature = draft.signature ?? buildQuoteDraftSignature(draftComparable);
      const currentSignature = buildQuoteDraftSignature(buildCurrentAutoDraftComparable());

      if (draftSignature === currentSignature) {
        clearAutoDraft();
        autoDraftBaselineSignatureRef.current = currentSignature;
        autoDraftReadyRef.current = true;
        return;
      }

      const shouldRestore = confirm(`發現未儲存的草稿（${draft.savedAt}），要還原嗎？`);

      if (shouldRestore) {
        const draftAutoPricing: AutoPricingConfig = {
          channelMultipliers: settings.channelMultipliers,
          commissionMode: draft.commissionOverride?.mode ?? settings.commissionMode,
          commissionRate: clampCommissionRate(draft.commissionOverride?.rate ?? settings.commissionRate),
          commissionFixedAmount: Math.max(
            0,
            Number(draft.commissionOverride?.fixedAmount ?? settings.commissionFixedAmount ?? 0),
          ),
        };
        setCaseId(draft.caseId);
        setQuoteId(draft.quoteId);
        setVersionId(draft.versionId);
        setVersionNo(draft.versionNo);
        setVersionLabel(draft.versionLabel);
        setActiveVersion(null);
        setIsEditMode(draft.isEditMode);
        setSelectedClientId(draft.selectedClientId);
        setCompanyName(draft.companyName);
        setContactName(draft.contactName);
        setPhone(draft.phone);
        setTaxId(draft.taxId);
        setProjectName(draft.projectName);
        setQuoteName(draft.quoteName ?? "");
        setEmail(draft.email);
        setAddress(draft.address);
        setChannel(draft.channel);
        setLeadSource(draft.leadSource ?? "unknown");
        setLeadSourceDetail(draft.leadSourceDetail ?? "");
        setLeadSourceContact(draft.leadSourceContact ?? "");
        setLeadSourceNotes(draft.leadSourceNotes ?? "");
        setHistoryInitialItems(recalculateAutoPricedItems(draftComparable.items, draft.channel, draftAutoPricing));
        setDescription(draftComparable.description);
        setDescriptionImageUrl(draftComparable.descriptionImageUrl);
        setIncludeTax(draftComparable.includeTax);
        setTermsTemplate(draftComparable.termsTemplate);
        setCommissionOverride(draftComparable.commissionOverride);
        setCommissionPartners(draftComparable.commissionPartners);
        setDraftSessionId(draft.sessionId);
        setDraftSessionSource(draft.source);
        setLocalDraftSaveState("saved");
        setLocalDraftSavedAt(draft.savedAt);
        restoredLocalDraftRef.current = true;
        autoDraftBaselineSignatureRef.current = draftSignature;
      } else {
        clearAutoDraft();
        autoDraftBaselineSignatureRef.current = currentSignature;
      }
    } catch {
      clearAutoDraft();
    } finally {
      autoDraftReadyRef.current = true;
    }
  }, [buildCurrentAutoDraftComparable, clearAutoDraft, settings.channelMultipliers, settings.commissionFixedAmount, settings.commissionMode, settings.commissionRate]);

  useEffect(() => {
    const nextSignature = JSON.stringify({
      channel,
      multiplier: currentAutoPricing.channelMultipliers[channel],
      commissionMode: currentAutoPricing.commissionMode,
      commissionRate: currentAutoPricing.commissionRate,
      commissionFixedAmount: currentAutoPricing.commissionFixedAmount,
    });

    if (autoPricingSignatureRef.current === nextSignature) return;
    if (suppressNextAutoPricingRef.current) {
      suppressNextAutoPricingRef.current = false;
      autoPricingSignatureRef.current = nextSignature;
      return;
    }
    autoPricingSignatureRef.current = nextSignature;

    const nextItems = applyAutoPricing(items);
    if (nextItems !== items) {
      setItems(nextItems);
    }
  }, [applyAutoPricing, channel, currentAutoPricing, items, setItems]);

  useEffect(() => {
    if (!autoDraftReadyRef.current) return;

    const currentComparable = buildCurrentAutoDraftComparable();
    const currentSignature = buildQuoteDraftSignature(currentComparable);

    if (!autoDraftBaselineSignatureRef.current) {
      autoDraftBaselineSignatureRef.current = currentSignature;
      setLocalDraftSaveState("idle");
      return;
    }

    if (currentSignature === autoDraftBaselineSignatureRef.current) {
      if (!restoredLocalDraftRef.current) {
        clearAutoDraft();
      }
      return;
    }

    restoredLocalDraftRef.current = false;
    setLocalDraftSaveState("dirty");
    const timeoutId = window.setTimeout(() => {
      setLocalDraftSaveState("saving");

      try {
        writeQuoteDraftSession(
          window.localStorage,
          buildCurrentDraftSession(currentSignature, currentComparable),
        );
        setLocalDraftSaveState("saved");
        setLocalDraftSavedAt(new Date().toISOString());
      } catch {
        setLocalDraftSaveState("error");
      }
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [
    address,
    buildCurrentAutoDraftComparable,
    buildCurrentDraftSession,
    caseId,
    channel,
    companyName,
    clearAutoDraft,
    commissionOverride,
    commissionPartners,
    contactName,
    description,
    descriptionImageUrl,
    email,
    includeTax,
    isEditMode,
    items,
    leadSource,
    leadSourceContact,
    leadSourceNotes,
    phone,
    projectName,
    quoteName,
    quoteId,
    selectedClientId,
    taxId,
    termsTemplate,
    versionId,
    versionLabel,
    versionNo,
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
        setCommissionOverride(null);
        return;
      }
      const client = clients.find((c: Client) => c.id === clientId);
      if (!client) {
        setCommissionOverride(null);
        return;
      }
      setCompanyName(client.companyName);
      setContactName(client.contactName);
      setPhone(client.phone);
      setTaxId(client.taxId);
      setEmail(client.email);
      setAddress(client.address);
      setChannel(client.channel);
      applyClientCommissionOverride(client);
    },
    [applyClientCommissionOverride, clients],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<FlexQuoteItem>) => {
      setItems((prev) => {
        let shouldReprice = false;
        const nextItems = prev.map((item) => {
          if (item.id !== id) return item;
          const updated = { ...item, ...patch };
          if ("qty" in patch || "unitPrice" in patch) {
            updated.amount = updated.qty * updated.unitPrice;
          }
          if ("unitPrice" in patch) {
            updated.unitPriceLocked = true;
          }
          if (
            ("qty" in patch || "costPerUnit" in patch) &&
            isAutoPricedItem(updated) &&
            (updated.costPerUnit != null || item.costPerUnit != null)
          ) {
            shouldReprice = true;
          }
          return updated;
        });
        return shouldReprice ? applyAutoPricing(nextItems) : nextItems;
      });
    },
    [applyAutoPricing, setItems],
  );

  const readFileAsDataUrl = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("圖片讀取失敗"));
      };
      reader.onerror = () => reject(new Error("圖片讀取失敗"));
      reader.readAsDataURL(file);
    });
  }, []);

  const uploadImage = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json()) as { ok?: boolean; url?: string; error?: string };
    if (!response.ok || !payload.url) {
      throw new Error(payload.error || "圖片上傳失敗");
    }
    return payload.url;
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      if (prev.length <= 1) return [createEmptyItem()];
      return prev.filter((item) => item.id !== id);
    });
  }, [setItems]);

  const toggleItemExpand = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleImageUpload = useCallback(
    async (id: string, file: File, field: "imageUrl" | "specImageUrl" = "imageUrl") => {
      const stateKey = field === "specImageUrl" ? `${id}:spec` : id;
      setItemImageUploading((prev) => ({ ...prev, [stateKey]: true }));
      setItemImageErrors((prev) => ({ ...prev, [stateKey]: "" }));

      try {
        const previewUrl = await readFileAsDataUrl(file);
        updateItem(id, { [field]: previewUrl });

        try {
          const uploadedUrl = await uploadImage(file);
          updateItem(id, { [field]: uploadedUrl });
        } catch (err) {
          const message = err instanceof Error ? err.message : "圖片上傳失敗，已保留本機預覽";
          setItemImageErrors((prev) => ({ ...prev, [stateKey]: message }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "圖片讀取失敗";
        setItemImageErrors((prev) => ({ ...prev, [stateKey]: message }));
      } finally {
        setItemImageUploading((prev) => {
          const next = { ...prev };
          delete next[stateKey];
          return next;
        });
      }
    },
    [readFileAsDataUrl, updateItem, uploadImage],
  );

  const handleDescriptionImageUpload = useCallback(
    async (file: File) => {
      setDescriptionImageUploading(true);
      setDescriptionImageError("");
      try {
        const previewUrl = await readFileAsDataUrl(file);
        setDescriptionImageUrl(previewUrl);

        try {
          const uploadedUrl = await uploadImage(file);
          setDescriptionImageUrl(uploadedUrl);
        } catch (err) {
          const message = err instanceof Error ? err.message : "圖片上傳失敗，已保留本機預覽";
          setDescriptionImageError(message);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "圖片讀取失敗";
        setDescriptionImageError(message);
      } finally {
        setDescriptionImageUploading(false);
      }
    },
    [readFileAsDataUrl, uploadImage],
  );

  const addItem = useCallback((item?: Omit<FlexQuoteItem, "id">) => {
    if (item) {
      setItems((prev) => applyAutoPricing([...prev, { ...item, id: crypto.randomUUID() }]));
    } else {
      setItems((prev) => [...prev, createEmptyItem()]);
    }
  }, [applyAutoPricing, setItems]);

  const addCommissionPartner = useCallback(() => {
    setCommissionPartners((prev) => [...prev, { name: "", partnerId: "", role: "other", amount: 0 }]);
  }, []);

  const updateCommissionPartner = useCallback((index: number, patch: Partial<CommissionPartnerSplit>) => {
    setCommissionPartners((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const nextAmount =
          patch.amount == null ? item.amount : Math.max(0, Math.round(Number(patch.amount) || 0));
        return {
          ...item,
          ...patch,
          amount: nextAmount,
        };
      }),
    );
  }, []);

  const removeCommissionPartner = useCallback((index: number) => {
    setCommissionPartners((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const insertTemplateItem = useCallback(
    (template: (typeof ITEM_TEMPLATES)[number]) => {
      addItem(template.item);
      setTemplateDropdownOpen(false);
    },
    [addItem],
  );

  const applyQuoteTemplate = useCallback(
    (template: { id: string; label: string; description: string; items: Array<Omit<FlexQuoteItem, "id">>; defaultTerms?: string }) => {
      const confirmed = confirm(
        `套用範本「${template.label}」將替換目前所有品項，確定嗎？`,
      );
      if (!confirmed) return;

      setItems(applyAutoPricing(template.items.map((item) => ({ ...item, id: crypto.randomUUID() }))));
      setExpandedItems(new Set());
      if (template.defaultTerms) {
        setTermsTemplate(template.defaultTerms);
      }
      setQuoteTemplateDropdownOpen(false);
    },
    [applyAutoPricing, setItems],
  );

  const handleSaveAsTemplate = useCallback(async () => {
    if (!newTemplateName.trim()) {
      alert("請輸入範本名稱");
      return;
    }

    if (items.length === 0) {
      alert("目前沒有品項可以儲存");
      return;
    }

    const newTemplate: QuoteTemplate = {
      templateId: "",
      templateName: newTemplateName.trim(),
      description: newTemplateDescription.trim(),
      items: items.map(({ id, ...rest }) => rest) as FlexQuoteItem[],
      isActive: true,
      createdAt: "",
      updatedAt: "",
    };

    try {
      const response = await fetch("/api/sheets/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: newTemplate }),
      });

      const result = await response.json();
      if (result.ok) {
        alert(`範本「${newTemplateName}」已儲存成功！`);
        setNewTemplateName("");
        setNewTemplateDescription("");
        setSaveTemplateDialogOpen(false);
        loadTemplates();
      } else {
        alert(`儲存失敗：${result.error}`);
      }
    } catch (error) {
      alert(`儲存失敗：${error instanceof Error ? error.message : "未知錯誤"}`);
    }
  }, [items, newTemplateName, newTemplateDescription, loadTemplates]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.amount, 0),
    [items],
  );
  const tax = useMemo(
    () => (includeTax ? Math.round(subtotal * (settings.taxRate / 100)) : 0),
    [includeTax, subtotal, settings.taxRate],
  );
  const total = subtotal + tax;
  const estimatedCostTotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.costPerUnit ?? 0) * item.qty, 0),
    [items],
  );
  const commissionAmount = useMemo(
    () =>
      effectiveSettings.commissionMode === "rebate"
        ? Math.round(total * (effectiveSettings.commissionRate / 100))
        : effectiveSettings.commissionMode === "fixed"
          ? Math.max(0, Math.round(effectiveSettings.commissionFixedAmount))
          : 0,
    [effectiveSettings.commissionMode, effectiveSettings.commissionRate, effectiveSettings.commissionFixedAmount, total],
  );
  const netAmountAfterCommission = total - commissionAmount;
  const netMarginAfterCommission = netAmountAfterCommission - estimatedCostTotal;
  const showLowMarginWarning =
    (effectiveSettings.commissionMode === "rebate" || effectiveSettings.commissionMode === "fixed") &&
    items.some((item) => item.costPerUnit != null) &&
    netMarginAfterCommission < 0;
  const commissionSplitTotal = useMemo(
    () => commissionPartners.reduce((sum, item) => sum + item.amount, 0),
    [commissionPartners],
  );
  const commissionSplitEnabled =
    effectiveSettings.commissionMode === "rebate" || effectiveSettings.commissionMode === "fixed";
  const hasCommissionSplitMismatch =
    commissionAmount > 0 &&
    commissionPartners.length > 0 &&
    commissionSplitTotal !== Math.round(commissionAmount);
  const commissionModeFieldValue = commissionOverride?.mode ?? "default";
  const effectiveCommissionLabel = getCommissionModeLabel(
    effectiveSettings.commissionMode,
    effectiveSettings.commissionRate,
    effectiveSettings.commissionFixedAmount,
  );
  const systemCommissionLabel = getCommissionModeLabel(
    settings.commissionMode,
    settings.commissionRate,
    settings.commissionFixedAmount,
  );
  const serializedCommissionPartners = useMemo(
    () => (commissionSplitEnabled && commissionAmount > 0 ? JSON.stringify(commissionPartners) : ""),
    [commissionAmount, commissionPartners, commissionSplitEnabled],
  );

  function handleNewQuote() {
    if (hasUnsavedChanges() && !confirm("目前有未儲存變更，確定要放棄並新建報價嗎？")) {
      return;
    }

    clearAutoDraft();
    setDraftSessionId(generateQuoteDraftSessionId());
    setDraftSessionSource("new-quote");
    setCaseId("");
    setIsEditMode(false);
    setQuoteId(generateQuoteId());
    setVersionId("");
    setVersionNo(1);
    setVersionLabel("");
    setActiveVersion(null);
    setValidUntil(defaultValidUntil(settings.quoteValidityDays));
    setSelectedClientId("");
    setCompanyName("");
    setContactName("");
    setPhone("");
    setTaxId("");
    setProjectName("");
    setEmail("");
    setAddress("");
    setLeadSource("unknown");
    setLeadSourceDetail("");
    setLeadSourceContact("");
    setLeadSourceNotes("");
    setHistoryInitialItems([createEmptyItem()]);
    setExpandedItems(new Set());
    setDescription("");
    setDescriptionImageUrl("");
    setDescriptionImageError("");
    setDescriptionImageUploading(false);
    setItemImageErrors({});
    setItemImageUploading({});
    setIncludeTax(true);
    setTermsTemplate(DEFAULT_TERMS);
    setChannel("retail");
    setCommissionOverride(null);
    setCommissionPartners([]);
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

  function buildVersionLines(targetVersionId: string, targetQuoteId: string, targetCaseId: string) {
    const now = new Date().toISOString();
    return items.map((item, idx) => {
      const estimatedUnitCost = item.costPerUnit ?? 0;
      const estimatedCostAmount = estimatedUnitCost * item.qty;
      const lineMarginAmount = item.amount - estimatedCostAmount;
      return {
        itemId: `${targetVersionId}-L${String(idx + 1).padStart(3, "0")}`,
        versionId: targetVersionId,
        quoteId: targetQuoteId,
        caseId: targetCaseId,
        lineNo: idx + 1,
        itemName: item.name,
        spec: item.spec,
        materialId: item.materialId ?? "",
        qty: item.qty,
        unit: item.unit,
        unitPrice: item.unitPrice,
        lineAmount: item.amount,
        estimatedUnitCost,
        estimatedCostAmount,
        lineMarginAmount,
        lineMarginRate: item.amount > 0 ? lineMarginAmount / item.amount : 0,
        isCostItem: item.isCostItem,
        showOnQuote: !item.isCostItem,
        notes: item.notes,
        imageUrl: item.imageUrl ?? "",
        specImageUrl: item.specImageUrl ?? "",
        createdAt: now,
        updatedAt: now,
        installHeightTier: item.installHeightTier ?? "",
        panelSizeTier: item.panelSizeTier ?? "",
        installSurchargeRate: item.installSurchargeRate ?? 0,
        ...buildSplitLineFields(item),
      };
    });
  }

  function buildFirstVersionLinesInput() {
    return items.map((item, idx) => {
      const estimatedUnitCost = item.costPerUnit ?? 0;
      const estimatedCostAmount = estimatedUnitCost * item.qty;
      const lineMarginAmount = item.amount - estimatedCostAmount;
      return {
        lineNo: idx + 1,
        itemName: item.name,
        spec: item.spec,
        materialId: item.materialId ?? "",
        qty: item.qty,
        unit: item.unit,
        unitPrice: item.unitPrice,
        lineAmount: item.amount,
        estimatedUnitCost,
        estimatedCostAmount,
        lineMarginAmount,
        lineMarginRate: item.amount > 0 ? lineMarginAmount / item.amount : 0,
        isCostItem: item.isCostItem,
        showOnQuote: !item.isCostItem,
        notes: item.notes,
        imageUrl: item.imageUrl ?? "",
        specImageUrl: item.specImageUrl ?? "",
        installHeightTier: item.installHeightTier ?? "",
        panelSizeTier: item.panelSizeTier ?? "",
        installSurchargeRate: item.installSurchargeRate ?? 0,
        ...buildSplitLineFields(item),
      };
    });
  }

  async function ensureCaseIdForV2() {
    if (caseId) return caseId;
    const trimmedProjectName = projectName.trim();
    const response = await fetch("/api/sheets/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseName: trimmedProjectName,
        clientId: selectedClientId === "__new__" ? "" : selectedClientId,
        clientNameSnapshot: companyName,
        contactNameSnapshot: contactName,
        phoneSnapshot: phone,
        projectAddress: address,
        channelSnapshot: channel,
        leadSource,
        leadSourceDetail: shouldShowLeadSourceDetail(leadSource) ? leadSourceDetail.trim() : "",
        leadSourceContact: leadSourceContact.trim(),
        leadSourceNotes: leadSourceNotes.trim(),
      } satisfies Partial<CaseRecord>),
    });
    if (!response.ok) throw new Error("建立案件失敗");
    const payload = (await response.json()) as { caseId: string };
    setCaseId(payload.caseId);
    return payload.caseId;
  }

  async function getVersionBaseRecord(targetVersionId: string) {
    if (activeVersion && activeVersion.versionId === targetVersionId) {
      return activeVersion;
    }
    const response = await fetch(`/api/sheets/versions/${encodeURIComponent(targetVersionId)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("讀取版本失敗");
    const payload = (await response.json()) as { version: QuoteVersionRecord };
    return payload.version;
  }

  function buildVersionPayload(version: QuoteVersionRecord) {
    const grossMarginAmount = total - estimatedCostTotal;
    const nextVersion: QuoteVersionRecord = {
      ...version,
      versionLabel: versionLabel || version.versionLabel,
      quoteDate: new Date().toISOString().slice(0, 10),
      validUntil: validUntil || defaultValidUntil(settings.quoteValidityDays),
      subtotalBeforeTax: subtotal,
      taxRate: includeTax ? settings.taxRate : 0,
      taxAmount: tax,
      totalAmount: total,
      commissionMode: effectiveSettings.commissionMode,
      commissionRate: effectiveSettings.commissionRate,
      commissionAmount,
      commissionFixedAmount: effectiveSettings.commissionMode === "fixed" ? commissionAmount : 0,
      commissionPartners: serializedCommissionPartners,
      estimatedCostTotal,
      grossMarginAmount,
      grossMarginRate: total > 0 ? grossMarginAmount / total : 0,
      channel,
      termsTemplate,
      publicDescription: description,
      descriptionImageUrl,
      clientNameSnapshot: companyName,
      contactNameSnapshot: contactName,
      clientPhoneSnapshot: phone,
      projectNameSnapshot: projectName,
      projectAddressSnapshot: address,
      channelSnapshot: channel,
      updatedAt: new Date().toISOString(),
    };
    return {
      version: nextVersion,
      lines: buildVersionLines(nextVersion.versionId, nextVersion.quoteId, nextVersion.caseId),
    };
  }

  async function handleSave() {
    if (hasCommissionSplitMismatch) {
      alert(`分潤總額 ${formatCurrency(commissionSplitTotal)} 與佣金 ${formatCurrency(commissionAmount)} 不一致`);
      return;
    }

    setSaving(true);
    try {
      if (versionId) {
        const baseVersion = await getVersionBaseRecord(versionId);
        const payload = buildVersionPayload(baseVersion);
        const response = await fetch(`/api/sheets/versions/${encodeURIComponent(versionId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("版本更新失敗");

        // Update quote name if provided
        if (quoteName && quoteId) {
          await fetch("/api/sheets/quotes-v2", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quoteId, quoteName: quoteName.trim() }),
          });
        }

        // Update case details including case name
        const trimmedProjectName = projectName.trim();
        await fetch("/api/sheets/cases", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: payload.version.caseId,
            ...(trimmedProjectName ? { caseName: trimmedProjectName } : {}),
            clientNameSnapshot: companyName,
            contactNameSnapshot: contactName,
            phoneSnapshot: phone,
            projectAddress: address,
            leadSource,
            leadSourceDetail: shouldShowLeadSourceDetail(leadSource) ? leadSourceDetail.trim() : "",
            leadSourceContact: leadSourceContact.trim(),
            leadSourceNotes: leadSourceNotes.trim(),
          }),
        });
        setActiveVersion(payload.version);
        setVersionLabel(payload.version.versionLabel);
        setVersionNo(payload.version.versionNo);
        setQuoteId(payload.version.quoteId);
        setCaseId(payload.version.caseId);
        setIsEditMode(true);
        clearAutoDraft();
        alert(`版本 ${versionId} 已更新`);
        return;
      }

      if (!isEditMode) {
        const targetCaseId = await ensureCaseIdForV2();
        const response = await fetch("/api/sheets/quotes-v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: targetCaseId,
            quoteName: quoteName.trim(),
            firstVersion: {
              versionLabel: versionLabel || "V01 初版",
              quoteDate: new Date().toISOString().slice(0, 10),
              validUntil: validUntil || defaultValidUntil(settings.quoteValidityDays),
              channel,
              taxRate: includeTax ? settings.taxRate : 0,
              subtotalBeforeTax: subtotal,
              taxAmount: tax,
              totalAmount: total,
              commissionMode: effectiveSettings.commissionMode,
               commissionRate: effectiveSettings.commissionRate,
               commissionAmount,
               commissionFixedAmount: effectiveSettings.commissionMode === "fixed" ? commissionAmount : 0,
               commissionPartners: serializedCommissionPartners,
               estimatedCostTotal,
              grossMarginAmount: total - estimatedCostTotal,
              grossMarginRate:
                total > 0 ? (total - estimatedCostTotal) / total : 0,
               termsTemplate,
               publicDescription: description,
               descriptionImageUrl,
               clientNameSnapshot: companyName,
              contactNameSnapshot: contactName,
              clientPhoneSnapshot: phone,
              projectNameSnapshot: projectName,
              projectAddressSnapshot: address,
              channelSnapshot: channel,
              lines: buildFirstVersionLinesInput(),
            },
          }),
        });
        if (!response.ok) {
          const errBody = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(errBody?.error ? `儲存新版本失敗: ${errBody.error}` : "儲存新版本失敗");
        }
        const payload = (await response.json()) as { quoteId: string; versionId: string };

        // Update case details including case name
        const trimmedProjectName = projectName.trim();
        await fetch("/api/sheets/cases", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: targetCaseId,
            ...(trimmedProjectName ? { caseName: trimmedProjectName } : {}),
            clientNameSnapshot: companyName,
            contactNameSnapshot: contactName,
            phoneSnapshot: phone,
            projectAddress: address,
            leadSource,
            leadSourceDetail: shouldShowLeadSourceDetail(leadSource) ? leadSourceDetail.trim() : "",
            leadSourceContact: leadSourceContact.trim(),
            leadSourceNotes: leadSourceNotes.trim(),
          }),
        });

        await loadVersionDocument(payload.versionId, targetCaseId, payload.quoteId);
        clearAutoDraft();
        alert(`報價 ${payload.quoteId}（${payload.versionId}）已儲存`);
        return;
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyAction(action: "new_version" | "use_as_template" | "new_quote_same_case") {
    if (!versionId) return;

    if (
      hasUnsavedChanges() &&
      !confirm("目前有未儲存變更。複製只會依最後一次正式儲存的版本建立，確定要繼續嗎？")
    ) {
      return;
    }

    setCopyingVersion(true);
    try {
      flushAutoDraftNow("quote-editor-copy");

      const response = await fetch("/api/sheets/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "new_version"
            ? {
                action: "new_version",
                basedOnVersionId: versionId,
              }
            : action === "new_quote_same_case"
              ? {
                  action: "new_quote_same_case",
                  sourceVersionId: versionId,
                  targetCaseId: caseId,
                  quoteName: "新方案",
                }
              : {
                  action: "use_as_template",
                  sourceVersionId: versionId,
                  caseDraft: {
                    caseName: `${projectName || companyName || "新案件"}（複製）`,
                    projectAddress: address,
                    clientNameSnapshot: companyName,
                    contactNameSnapshot: contactName,
                    phoneSnapshot: phone,
                    channelSnapshot: channel,
                    leadSource,
                    leadSourceDetail: shouldShowLeadSourceDetail(leadSource) ? leadSourceDetail.trim() : "",
                    leadSourceContact: leadSourceContact.trim(),
                    leadSourceNotes: leadSourceNotes.trim(),
                  },
                },
        ),
      });
      if (!response.ok) throw new Error("複製版本失敗");
      const payload = (await response.json()) as {
        caseId?: string;
        quoteId?: string;
        versionId?: string;
      };

      setCopyDialogOpen(false);
      if (action === "new_version" && payload.versionId) {
        await loadVersionDocument(payload.versionId, caseId, quoteId);
        clearAutoDraft();
        alert(`已建立新版本 ${payload.versionId}`);
        return;
      }

      if ((action === "use_as_template" || action === "new_quote_same_case") && payload.caseId && payload.quoteId && payload.versionId) {
        writeQuoteLoadRequest(
          window.sessionStorage,
          createQuoteLoadRequest({
            source: "quote-editor-copy",
            caseId: payload.caseId,
            quoteId: payload.quoteId,
            versionId: payload.versionId,
          }),
        );
        window.location.href = "/";
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "複製版本失敗");
    } finally {
      setCopyingVersion(false);
    }
  }

  async function handleDownloadJpg() {
    if (jpgLoading) return;
    setJpgLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await generateAndDownloadJpg({
        quoteId,
        quoteDate: today,
        validityDays: settings.quoteValidityDays,
        validUntil: validUntil || undefined,
        client: {
          companyName,
          contactName,
          phone,
          email,
          address,
          taxId,
        },
        projectName,
        quoteName,
        channel,
        items,
        description,
        descriptionImageUrl: descriptionImageUrl || undefined,
        includeTax,
        subtotal,
        tax,
        total,
        termsTemplate: termsTemplate.replace(/(\d+\.)\s/g, "$1\u00A0"),
        settings,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "產生 JPG 失敗");
    } finally {
      setJpgLoading(false);
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
        validUntil: validUntil || undefined,
        pdfMode: pdfPageMode,
        client: {
          companyName,
          contactName,
          phone,
          email,
          address,
          taxId,
        },
        projectName,
        quoteName,
        channel,
        items,
        description,
        descriptionImageUrl: descriptionImageUrl || undefined,
        includeTax,
        subtotal,
        tax,
        total,
        termsTemplate: termsTemplate.replace(/(\d+\.)\s/g, "$1\u00A0"),
        settings,
      });
      setPdfBlob(blob);
    } finally {
      setPdfLoading(false);
    }
  }

  function handleCopyText() {
    const today = new Date().toISOString().slice(0, 10);
    const visibleItems = items.filter((i) => !i.isCostItem);
    const lines: string[] = [];

    lines.push(`【${settings.companyName} 報價單】`);
    lines.push(`報價單號：${quoteId}`);
    lines.push(`日期：${today}`);
    if (companyName) lines.push(`客戶：${companyName}`);
    if (projectName) lines.push(`案場：${projectName}`);
    lines.push("");
    lines.push("── 品項明細 ──");

    visibleItems.forEach((item, i) => {
      const name = item.name.replace(/\n/g, " ");
      lines.push(`${i + 1}. ${name}`);
      if (item.spec) lines.push(`   ${item.spec}`);
      lines.push(`   ${item.qty} ${item.unit} × $${item.unitPrice.toLocaleString()} = $${item.amount.toLocaleString()}`);
    });

    lines.push("");
    lines.push("── 金額 ──");
    lines.push(`小計：$${subtotal.toLocaleString()}`);
    if (includeTax) {
      lines.push(`稅金（${settings.taxRate}%）：$${tax.toLocaleString()}`);
    }
    lines.push(`合計：$${total.toLocaleString()}`);
    lines.push("");
    lines.push(`有效期限：${validUntil || `${settings.quoteValidityDays} 天`}`);
    lines.push(`${settings.companyName} ${settings.companyPhone}`);

    navigator.clipboard.writeText(lines.join("\n"));
  }

  const STATUS_LABELS: Record<VersionStatus, string> = {
    draft: "草稿",
    sent: "已發送",
    following_up: "追蹤中",
    negotiating: "議價中",
    accepted: "已接受",
    rejected: "已拒絕",
    superseded: "已取代",
  };

  const localDraftStatusLabel = useMemo(() => {
    if (localDraftSaveState === "saving") return "正在自動暫存...";
    if (localDraftSaveState === "saved") {
      if (!localDraftSavedAt) return "已自動暫存";
      return `已自動暫存 ${new Date(localDraftSavedAt).toLocaleTimeString("zh-TW", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`;
    }
    if (localDraftSaveState === "error") return "自動暫存失敗";
    if (localDraftSaveState === "dirty") return "有未儲存變更";
    return "目前無未儲存變更";
  }, [localDraftSaveState, localDraftSavedAt]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">報價編輯</h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            案件：{projectName || "未命名案件"} | 報價：{quoteId || "未建立"} | 版本：
            {versionId ? `V${versionNo}` : "未建立"}
            {versionLabel ? ` ${versionLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            variant="ghost"
            size="sm"
            disabled={saving || copyingVersion}
            onClick={() => setCopyDialogOpen(true)}
          >
            <Copy className="h-3.5 w-3.5" />
            複製
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCopyText}>
            <MessageSquare className="h-3.5 w-3.5" />
            複製文字版
          </Button>
          <Button
            size="sm"
            disabled={jpgLoading}
            onClick={handleDownloadJpg}
          >
            {jpgLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
            {jpgLoading ? "生成中..." : "下載 JPG"}
          </Button>
          <div className="flex items-center">
            <Button
              size="sm"
              variant="outline"
              disabled={pdfLoading}
              onClick={handlePreviewPDF}
              className="rounded-r-none"
            >
              {pdfLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {pdfLoading ? "生成中..." : "預覽 PDF"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-l-none border-l-0 px-2 text-[10px]"
              onClick={() => setPdfPageMode((m) => (m === "a4" ? "long" : "a4"))}
            >
              {pdfPageMode === "a4" ? "A4" : "長版"}
            </Button>
          </div>
          <Button size="sm" onClick={handleNewQuote}>
            <FilePlus className="h-3.5 w-3.5" />
            新建報價
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">報價單</span>
          <Input
            value={quoteId}
            onChange={(e) => setQuoteId(e.target.value)}
            className="h-8 w-48 text-sm font-semibold"
            placeholder="CQ-YYYYMMDD-01"
            disabled={Boolean(versionId)}
          />
        </div>
        <span className="badge badge-draft">{STATUS_LABELS[status]}</span>
        <span className="text-xs text-[var(--text-secondary)]">{localDraftStatusLabel}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">通路</span>
          <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <SelectTrigger className="h-8 w-auto min-w-[7rem] text-xs">
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">有效至</span>
          <Input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="h-8 w-40 text-xs"
          />
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => setValidUntil(addDaysIso(todayIso(), d))}
            >
              {d}天
            </Button>
          ))}
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
                  placeholder="整體專案名稱（例如：台中愛臻邸）"
                />
              </div>
              <div>
                <Label>方案名稱</Label>
                <Input
                  value={quoteName}
                  onChange={(e) => setQuoteName(e.target.value)}
                  placeholder="場域名稱（例如：客廳、主臥室）"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>案件來源</Label>
                <Select
                  value={leadSource}
                  onValueChange={(value) => {
                    const nextSource = value as LeadSource;
                    setLeadSource(nextSource);
                    if (!shouldShowLeadSourceDetail(nextSource)) {
                      setLeadSourceDetail("");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇案件來源" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCE_OPTIONS.map((source) => (
                      <SelectItem key={source} value={source}>
                        {LEAD_SOURCE_LABELS[source].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {shouldShowLeadSourceDetail(leadSource) && (
                <div>
                  <Label>來源細項</Label>
                  <Input
                    value={leadSourceDetail}
                    onChange={(e) => setLeadSourceDetail(e.target.value)}
                    placeholder="例如：BNI、扶輪社、綠裝修協會"
                  />
                </div>
              )}
              <div>
                <Label>來源人 / 介紹人</Label>
                <Input
                  value={leadSourceContact}
                  onChange={(e) => setLeadSourceContact(e.target.value)}
                  placeholder="例如：王設計師 / 李先生"
                />
              </div>
            </div>
            <div className="mt-4">
              <Label>來源備註</Label>
              <Textarea
                value={leadSourceNotes}
                onChange={(e) => setLeadSourceNotes(e.target.value)}
                placeholder="例如：舊案設計師轉介紹，業主爸爸家要翻修床頭板繃布"
                className="min-h-20"
              />
            </div>
          </div>
        )}
      </div>

      <div className="card-surface rounded-[var(--radius-lg)]">
        {isMobile ? (
          <div className="space-y-3 p-3">
            {items.map((item, idx) => (
              <MobileQuoteItemCard
                key={item.id}
                item={item}
                index={idx}
                expanded={expandedItems.has(item.id)}
                isImageUploading={Boolean(itemImageUploading[item.id])}
                isSpecImageUploading={Boolean(itemImageUploading[`${item.id}:spec`])}
                imageUploadError={itemImageErrors[item.id]}
                specImageUploadError={itemImageErrors[`${item.id}:spec`]}
                onToggleExpand={toggleItemExpand}
                onUpdateItem={updateItem}
                onRemoveItem={removeItem}
                onHandleImageUpload={handleImageUpload}
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addItem()}
              className="w-full border border-dashed border-[var(--border)]"
            >
              <Plus className="h-3.5 w-3.5" />
              ＋ 新增品項
            </Button>
          </div>
        ) : (
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
                        isImageUploading={Boolean(itemImageUploading[item.id])}
                        isSpecImageUploading={Boolean(itemImageUploading[`${item.id}:spec`])}
                        imageUploadError={itemImageErrors[item.id]}
                        specImageUploadError={itemImageErrors[`${item.id}:spec`]}
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
        )}

        <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
          <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo}>
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => addItem()}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden md:inline">新增品項</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCalcOpen(true)}
          >
            🧮 <span className="hidden md:inline">用計算器算</span>
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTemplateDropdownOpen(!templateDropdownOpen)}
            >
              📋 <span className="hidden md:inline">常用範本</span>
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
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuoteTemplateDropdownOpen(!quoteTemplateDropdownOpen)}
            >
              📄 <span className="hidden md:inline">套用整單範本</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
            {quoteTemplateDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setQuoteTemplateDropdownOpen(false)}
                />
                <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-lg)]">
                  {allQuoteTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => applyQuoteTemplate(template)}
                      className="block w-full px-3 py-2 text-left transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {template.label}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {template.description}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSaveTemplateDialogOpen(true)}
            disabled={items.length === 0}
          >
            <Save className="h-3 w-3" />
            <span className="hidden md:inline">存為範本</span>
          </Button>
        </div>
      </div>

      {saveTemplateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-xl)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                儲存為範本
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSaveTemplateDialogOpen(false);
                  setNewTemplateName("");
                  setNewTemplateDescription("");
                }}
                className="rounded-[var(--radius-sm)] p-1 hover:bg-[var(--bg-subtle)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                  範本名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  placeholder="例：標準臥室套餐"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                  範本說明
                </label>
                <textarea
                  value={newTemplateDescription}
                  onChange={(e) => setNewTemplateDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  placeholder="簡單描述這個範本的用途..."
                />
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
                <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
                  將儲存 {items.length} 個品項
                </p>
                <ul className="space-y-0.5">
                  {items.slice(0, 3).map((item, idx) => (
                    <li key={idx} className="text-xs text-[var(--text-tertiary)]">
                      • {item.name} {item.spec && `(${item.spec})`}
                    </li>
                  ))}
                  {items.length > 3 && (
                    <li className="text-xs text-[var(--text-tertiary)]">
                      ... 及其他 {items.length - 3} 個品項
                    </li>
                  )}
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSaveTemplateDialogOpen(false);
                    setNewTemplateName("");
                    setNewTemplateDescription("");
                  }}
                >
                  取消
                </Button>
                <Button size="sm" onClick={handleSaveAsTemplate}>
                  <Save className="h-4 w-4" />
                  儲存範本
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                {descriptionImageUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-black/35">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDescriptionImageUrl("");
                    setDescriptionImageError("");
                  }}
                  disabled={descriptionImageUploading}
                  className="absolute -right-1 -top-1 hidden rounded-full bg-[var(--error)] p-0.5 text-white group-hover:block"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <label className="flex h-20 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]">
                {descriptionImageUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                ) : (
                  <ImagePlus className="h-4 w-4 text-[var(--text-tertiary)]" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={descriptionImageUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleDescriptionImageUpload(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            )}
            {descriptionImageError && (
              <div className="mt-1 text-[10px] text-[var(--error)]">{descriptionImageError}</div>
            )}
          </div>
        </div>
      </div>

      <div className="card-surface rounded-[var(--radius-lg)] px-6 py-4">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,15rem)_minmax(0,12rem)_minmax(0,1fr)]">
          <div>
            <Label>佣金模式</Label>
            <Select
              value={commissionModeFieldValue}
              onValueChange={(value) => handleCommissionModeChange(value as CommissionMode | "default")}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">跟隨系統設定（{systemCommissionLabel}）</SelectItem>
                <SelectItem value="price_gap">賺價差</SelectItem>
                <SelectItem value="rebate">返佣</SelectItem>
                <SelectItem value="fixed">固定金額</SelectItem>
                <SelectItem value="none">無佣金</SelectItem>
              </SelectContent>
            </Select>
            <div className="mt-2 text-xs text-[var(--text-tertiary)]">
              選客戶後會先帶入客戶預設；這裡可再手動改成這張報價要用的模式。
            </div>
          </div>

          {effectiveSettings.commissionMode === "rebate" && (
            <div>
              <Label>返佣比例 (%)</Label>
              <Input
                className="mt-2"
                type="number"
                min={0}
                max={50}
                step={0.1}
                value={effectiveSettings.commissionRate}
                onChange={(e) =>
                  setCommissionOverride((current) => ({
                    mode: current?.mode ?? "rebate",
                    rate: clampCommissionRate(Number(e.target.value)),
                    fixedAmount: current?.fixedAmount ?? settings.commissionFixedAmount,
                  }))
                }
              />
            </div>
          )}

          {effectiveSettings.commissionMode === "fixed" && (
            <div>
              <Label>固定佣金金額</Label>
              <Input
                className="mt-2"
                type="number"
                min={0}
                step={1}
                value={effectiveSettings.commissionFixedAmount}
                onChange={(e) =>
                  setCommissionOverride((current) => ({
                    mode: current?.mode ?? "fixed",
                    rate: current?.rate ?? settings.commissionRate,
                    fixedAmount: Math.max(0, Math.round(Number(e.target.value) || 0)),
                  }))
                }
              />
            </div>
          )}

          <div className="rounded-[var(--radius-md)] bg-[var(--bg-subtle)] px-4 py-3 text-sm">
            <div className="font-medium text-[var(--text-primary)]">目前生效：{effectiveCommissionLabel}</div>
            <div className="mt-1 text-[var(--text-secondary)]">
              {commissionModeFieldValue === "default" ? "這張報價目前跟隨系統設定。" : "這張報價目前使用個別設定，儲存後會記錄在版本裡。"}
            </div>
            {commissionSplitEnabled && (
              <div className="mt-2 text-[var(--text-secondary)]">
                內部佣金：{formatCurrency(commissionAmount)}，扣除後淨額：{formatCurrency(netAmountAfterCommission)}
              </div>
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
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">佣金金額</span>
            <span className="font-medium">{formatCurrency(commissionAmount)}</span>
          </div>
          {effectiveSettings.commissionMode !== "none" && (
            <div className="mt-2 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center justify-between">
                <span>
                  佣金模式：{effectiveCommissionLabel}
                </span>
                {commissionSplitEnabled && (
                  <span className="font-medium text-[var(--text-primary)]">
                    佣金 {formatCurrency(commissionAmount)}
                  </span>
                )}
              </div>
              {commissionSplitEnabled && (
                <div className="mt-1 flex items-center justify-between text-[var(--text-tertiary)]">
                  <span>扣除佣金後淨額</span>
                  <span>{formatCurrency(netAmountAfterCommission)}</span>
                </div>
              )}
            </div>
          )}
          {commissionAmount > 0 && (
            <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text-primary)]">分潤明細</span>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSplitDialogOpen(true)}>
                  編輯分潤
                </Button>
              </div>
              {commissionPartners.length === 0 ? (
                <div className="mt-1 text-[var(--text-tertiary)]">尚未設定分潤，將不自動建立分潤結算</div>
              ) : (
                <div className="mt-2 space-y-1">
                  {commissionPartners.map((partner, index) => (
                    <div key={`${partner.name}-${index}`} className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span>
                        {partner.name || "未填姓名"} · {ROLE_LABELS[partner.role]}
                      </span>
                      <span className="font-medium text-[var(--text-primary)]">{formatCurrency(partner.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {hasCommissionSplitMismatch && (
                <div className="mt-2 text-[var(--error)]">
                  分潤合計 {formatCurrency(commissionSplitTotal)} 需等於佣金 {formatCurrency(commissionAmount)}
                </div>
              )}
            </div>
          )}
          {showLowMarginWarning && (
            <div className="rounded-[var(--radius-md)] border border-[var(--error)]/25 bg-[var(--error)]/6 px-3 py-2 text-xs leading-5 text-[var(--error)]">
              佣金後淨額 {formatCurrency(netAmountAfterCommission)} 已低於預估成本
              {formatCurrency(estimatedCostTotal)}，目前毛利為{" "}
              {formatCurrency(netMarginAfterCommission)}。
            </div>
          )}
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

      <Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader>
            <DialogTitle>編輯分潤</DialogTitle>
            <DialogDescription>
              佣金 {formatCurrency(commissionAmount)} · 分潤合計 {formatCurrency(commissionSplitTotal)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-6 py-4">
            {commissionPartners.length === 0 ? (
              <div className="rounded-[var(--radius-md)] bg-[var(--bg-subtle)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
                尚未新增分潤對象
              </div>
            ) : (
              <div className="space-y-2">
                {commissionPartners.map((partner, index) => (
                  <div key={`split-${index}`} className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3 sm:grid-cols-12">
                    <Input
                      className="sm:col-span-3"
                      placeholder="姓名"
                      value={partner.name}
                      onChange={(e) => updateCommissionPartner(index, { name: e.target.value })}
                    />
                    <Input
                      className="sm:col-span-2"
                      placeholder="合作方ID"
                      value={partner.partnerId}
                      onChange={(e) => updateCommissionPartner(index, { partnerId: e.target.value })}
                    />
                    <Select value={partner.role} onValueChange={(v) => updateCommissionPartner(index, { role: v as PartnerRole })}>
                      <SelectTrigger className="sm:col-span-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="designer">設計</SelectItem>
                        <SelectItem value="installer">工班</SelectItem>
                        <SelectItem value="referrer">介紹人</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      className="sm:col-span-3"
                      placeholder="金額"
                      value={partner.amount}
                      onChange={(e) => updateCommissionPartner(index, { amount: Number(e.target.value) || 0 })}
                    />
                    <Button variant="ghost" size="sm" className="sm:col-span-1" onClick={() => removeCommissionPartner(index)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {hasCommissionSplitMismatch && (
              <div className="rounded-[var(--radius-md)] border border-[var(--error)]/25 bg-[var(--error)]/6 px-3 py-2 text-xs text-[var(--error)]">
                分潤總額需等於佣金總額，才可儲存。
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={addCommissionPartner}>
                <Plus className="h-3.5 w-3.5" />
                新增分潤對象
              </Button>
              <Button size="sm" onClick={() => setSplitDialogOpen(false)}>
                完成
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={copyDialogOpen}
        onOpenChange={(open) => {
          if (!copyingVersion) {
            setCopyDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-w-md p-0">
          <DialogHeader>
            <DialogTitle>複製報價</DialogTitle>
            <DialogDescription>
              {versionId
                ? "可建立同報價新版本、新報價方案，或套用成新案件。"
                : "目前為舊版報價流程，將使用另存新檔建立新單號。"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-6 py-4">
            <Button
              className="w-full justify-start"
              disabled={copyingVersion || saving}
              onClick={() => void handleCopyAction("new_version")}
            >
              <Copy className="h-3.5 w-3.5" />
              建立新版本（議價調整）
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={copyingVersion || saving}
              onClick={() => void handleCopyAction("new_quote_same_case")}
            >
              <Plus className="h-3.5 w-3.5" />
              新增報價方案（同案件，例如：客廳/臥室）
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={copyingVersion || saving}
              onClick={() => void handleCopyAction("use_as_template")}
            >
              <FilePlus className="h-3.5 w-3.5" />
              套用為新報價（新案子）
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CalculatorModal
        open={calcOpen}
        onOpenChange={setCalcOpen}
        onInsertItem={addItem}
        channel={channel}
        settings={effectiveSettings}
      />

      <PDFPreviewModal
        open={pdfPreviewOpen}
        onOpenChange={setPdfPreviewOpen}
        pdfBlob={pdfBlob}
        fileName={buildPdfFileName({ quoteId, projectName, quoteName })}
        loading={pdfLoading}
      />
    </div>
  );
}
