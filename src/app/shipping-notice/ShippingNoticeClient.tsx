"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Copy, Check, Truck, X, ChevronLeft, ChevronRight, Printer, Navigation } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useActiveDrivers } from "@/hooks/useDrivers";
import { LIST_NAMES, TRELLO } from "@/lib/trello-constants";
import type { DriverRecord } from "@/lib/drivers-sheet";
import {
  buildRepairOrderText,
  buildScheduleSMS,
  buildCuttingWorkOrder,
  buildShippingMsg,
  buildCustomerInfoText,
  getCustomFieldText,
  getTrelloAttachmentImageUrls,
  getAllTrelloImageUrlGroups,
  getCustomFieldDate,
  normalizePhone,
  type TrelloLabel,
  type TrelloCard,
  type CustomFieldItem,
  type TrelloAttachment,
  type ShippingMsgOptions,
} from "@/lib/trello-helpers";

// ─── Trello read helpers ──────────────────────────────────────

async function trelloGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = `/api/trello/${path}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    const detail = (body?.message ?? body?.error ?? "") as string;
    throw new Error(`Trello API 錯誤 ${res.status}${detail ? `：${detail}` : ""}`);
  }
  return res.json() as Promise<T>;
}

async function searchCards(query: string): Promise<TrelloCard[]> {
  const result = await trelloGet<{ cards: TrelloCard[] }>("search", {
    query,
    modelTypes: "cards",
    card_fields: "name,desc,due,dueComplete,idList,idBoard,labels,badges",
    cards_limit: "20",
  });
  return result.cards ?? [];
}

async function fetchCustomFields(cardId: string): Promise<CustomFieldItem[]> {
  return trelloGet<CustomFieldItem[]>(`cards/${cardId}/customFieldItems`);
}

async function fetchAttachments(cardId: string): Promise<TrelloAttachment[]> {
  return trelloGet<TrelloAttachment[]>(`cards/${cardId}/attachments`, {
    fields: "id,name,url,mimeType,bytes,date,isUpload,previews",
  });
}

// ─── Trello write helpers ─────────────────────────────────────

async function trelloDelete(path: string): Promise<void> {
  const res = await fetch(`/api/trello/${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Trello DELETE 失敗 ${res.status}`);
}

async function trelloPutQ(path: string, query: Record<string, string>, body?: unknown): Promise<void> {
  const qs = new URLSearchParams(query).toString();
  const url = `/api/trello/${path}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Trello PUT 失敗 ${res.status}`);
}

async function removeCardLabel(cardId: string, labelId: string): Promise<void> {
  await trelloDelete(`cards/${cardId}/idLabels/${labelId}`);
}

async function addCardLabel(cardId: string, labelId: string): Promise<void> {
  // Trello requires `value` as a query param for this endpoint, not JSON body
  const res = await fetch(
    `/api/trello/cards/${cardId}/idLabels?value=${encodeURIComponent(labelId)}`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`Trello POST 失敗 ${res.status}`);
}

async function updateCardDue(cardId: string, iso: string, dueComplete: boolean): Promise<void> {
  await trelloPutQ(`cards/${cardId}`, { due: iso, dueComplete: String(dueComplete) });
}

async function updateCardScheduleDay(cardId: string, iso: string): Promise<void> {
  await trelloPutQ(
    `cards/${cardId}/customField/${TRELLO.CUSTOM_FIELDS.SCHEDULE_DAY}/item`,
    {},
    { value: { date: iso } },
  );
}

async function moveCardToList(cardId: string, listId: string, dueComplete?: boolean): Promise<void> {
  const params: Record<string, string> = { idList: listId };
  if (dueComplete !== undefined) params.dueComplete = String(dueComplete);
  await trelloPutQ(`cards/${cardId}`, params);
}

interface CheckItem {
  id: string;
  name: string;
  state: "complete" | "incomplete";
  idChecklist: string;
}

interface Checklist {
  id: string;
  name: string;
  checkItems: CheckItem[];
}

async function fetchChecklists(cardId: string): Promise<Checklist[]> {
  return trelloGet<Checklist[]>(`cards/${cardId}/checklists`, {
    fields: "id,name",
    checkItem_fields: "id,name,state",
  });
}

async function toggleCheckItem(cardId: string, checkItemId: string, complete: boolean): Promise<void> {
  await trelloPutQ(`cards/${cardId}/checkItem/${checkItemId}`, {
    state: complete ? "complete" : "incomplete",
  });
}

async function updateCustomField(
  cardId: string,
  fieldId: string,
  value: { text?: string; number?: string; date?: string },
): Promise<void> {
  await trelloPutQ(`cards/${cardId}/customField/${fieldId}/item`, {}, { value });
}

async function addCheckItem(checklistId: string, name: string): Promise<CheckItem> {
  const qs = new URLSearchParams({ pos: "bottom" }).toString();
  const url = `/api/trello/checklists/${checklistId}/checkItems?${qs}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`新增失敗 ${res.status}`);
  return res.json() as Promise<CheckItem>;
}

// ─── Custom field definitions ─────────────────────────────────

interface FieldDef {
  id: string;
  label: string;
  type: "text" | "date" | "number";
}

const CUSTOM_FIELD_DEFS: FieldDef[] = [
  { id: TRELLO.CUSTOM_FIELDS.SCHEDULE_DAY,           label: "排程日",        type: "date"   },
  { id: TRELLO.CUSTOM_FIELDS.SCHEDULE_TEXT,          label: "排程備註",      type: "text"   },
  { id: TRELLO.CUSTOM_FIELDS.COLOR,                  label: "色號",          type: "text"   },
  { id: TRELLO.CUSTOM_FIELDS.COMMUNITY_NAME,         label: "社區名稱",      type: "text"   },
  { id: TRELLO.CUSTOM_FIELDS.ACCESSORIES,            label: "配件",          type: "text"   },
  { id: TRELLO.CUSTOM_FIELDS.CHAIR_LEG,              label: "椅腳",          type: "text"   },
  { id: TRELLO.CUSTOM_FIELDS.SEAT_MATERIALS,         label: "坐墊材料",      type: "text"   },
  { id: TRELLO.CUSTOM_FIELDS.FURNITURE_AMOUNT,       label: "家具金額",      type: "number" },
  { id: TRELLO.CUSTOM_FIELDS.BEDDING_AMOUNT,         label: "寢具金額",      type: "number" },
  { id: TRELLO.CUSTOM_FIELDS.PRIMARY_CONTACT_NAME,   label: "主要聯絡人",    type: "text"   },
  { id: TRELLO.CUSTOM_FIELDS.PRIMARY_CONTACT_PHONE,  label: "主要電話",      type: "text"   },
  { id: TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_NAME, label: "次要聯絡人",    type: "text"   },
  { id: TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_PHONE,label: "次要電話",      type: "text"   },
];

// ─── localStorage keys ────────────────────────────────────────

const LS_SHIPPING_DATE = "cq-shipping-date";
const LS_PRODUCTION_DATE = "cq-production-date";

const QUICK_TIMES = ["10:00", "12:00", "14:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

const TRELLO_LABEL_COLOR_STYLES: Record<string, { backgroundColor: string; color: string }> = {
  green: { backgroundColor: "#dcfff1", color: "#216e4e" },
  yellow: { backgroundColor: "#fef7c0", color: "#7f5f01" },
  orange: { backgroundColor: "#ffe2bd", color: "#a54800" },
  red: { backgroundColor: "#ffd5d2", color: "#ae2e24" },
  purple: { backgroundColor: "#dfd8fd", color: "#5e4db2" },
  blue: { backgroundColor: "#cce0ff", color: "#09326c" },
  sky: { backgroundColor: "#c6edfb", color: "#164555" },
  lime: { backgroundColor: "#dff6c2", color: "#4c6b1f" },
  pink: { backgroundColor: "#fdd0ec", color: "#943d73" },
  black: { backgroundColor: "#dcdfe4", color: "#172b4d" },
};

function getTrelloLabelStyle(labelColor?: string): { backgroundColor: string; color: string } {
  if (!labelColor) {
    return { backgroundColor: "var(--bg-subtle)", color: "var(--text-secondary)" };
  }

  return TRELLO_LABEL_COLOR_STYLES[labelColor] ?? {
    backgroundColor: "var(--bg-subtle)",
    color: "var(--text-secondary)",
  };
}

function LabelBadge({ label, text }: { label: TrelloLabel; text: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px]" style={getTrelloLabelStyle(label.color)}>
      {text}
    </span>
  );
}

function FallbackBadge({ text }: { text: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px]" style={getTrelloLabelStyle()}>
      {text}
    </span>
  );
}

// ─── Copy button ──────────────────────────────────────────────

function CopyButton({
  text,
  label = "複製",
  onCopied,
}: {
  text: string;
  label?: string;
  onCopied?: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    if (onCopied) void onCopied().catch(() => undefined);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={() => void handleCopy()}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--bg-hover)]"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "已複製" : label}
    </button>
  );
}

// ─── Result modal ─────────────────────────────────────────────

function ResultModal({
  title,
  content,
  onClose,
  onCopied,
}: {
  title: string;
  content: string;
  onClose: () => void;
  onCopied?: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-lg rounded-t-2xl bg-[var(--bg-elevated)] p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{title}</span>
          <button onClick={onClose} className="text-[var(--text-tertiary)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          readOnly
          value={content}
          rows={14}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-xs leading-relaxed text-[var(--text-primary)] focus:outline-none"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            關閉
          </Button>
          <CopyButton text={content} label="複製全文" onCopied={onCopied} />
        </div>
      </div>
    </div>
  );
}

// ─── Print label modal ────────────────────────────────────────

function PrintLabelModal({
  ordNum,
  ordName,
  onClose,
}: {
  ordNum: string;
  ordName: string;
  onClose: () => void;
}) {
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-label-zone, .print-label-zone * { visibility: visible; }
          .print-label-zone { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
        }
      `}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-xs rounded-2xl bg-[var(--bg-elevated)] p-6 shadow-2xl">
          <div className="print-label-zone mb-5 rounded-xl border-2 border-[var(--border)] bg-white p-6 text-center">
            <p className="text-5xl font-bold tracking-wide text-black">{ordNum}</p>
            <p className="mt-3 text-3xl text-black">{ordName}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              關閉
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="mr-1 h-3.5 w-3.5" />
              列印
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Shipping settings panel ──────────────────────────────────

interface ShippingSettingsProps {
  card: TrelloCard;
  customFields: CustomFieldItem[];
  drivers: DriverRecord[];
  onBack: () => void;
}

function ShippingSettings({ card, customFields, drivers, onBack }: ShippingSettingsProps) {
  const [driverKey, setDriverKey] = useState<string>("");
  const [finalPayment, setFinalPayment] = useState("");
  const [receiveAccount, setReceiveAccount] = useState<"jinshuei" | "potato">("jinshuei");
  const [sofaRecycle, setSofaRecycle] = useState(false);
  const [sofaRecycleFree, setSofaRecycleFree] = useState(false);
  const [result, setResult] = useState<{
    title: string;
    content: string;
    onCopied?: () => Promise<void>;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Date picker loads from localStorage (not card.due per spec)
  const [shippingDatetime, setShippingDatetime] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LS_SHIPPING_DATE) ?? "";
    }
    return "";
  });

  // Pre-select driver from card labels
  useEffect(() => {
    for (const driver of drivers) {
      if (card.labels.some((l) => l.id === driver.labelId)) {
        setDriverKey(driver.key);
        break;
      }
    }
  }, [card, drivers]);

  function setQuickTime(hhmm: string) {
    const localDate = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD in local tz
    const base = shippingDatetime ? shippingDatetime.slice(0, 11) : `${localDate}T`;
    setShippingDatetime(base + hhmm);
  }

  function getOpts(timeRangeHours: 1 | 2 = 2): ShippingMsgOptions {
    const driver = drivers.find((d) => d.key === driverKey);
    return {
      timeRangeHours,
      driverTitle: driver?.title ?? "",
      driverGreeting: driver?.confirmTitle ?? "",
      driverPhone: driver?.phoneNumber ?? "",
      driverKey,
      finalPayment: parseInt(finalPayment.replace(/,/g, ""), 10) || 0,
      receiveAccount,
      sofaRecycle,
      sofaRecycleFree,
      isDriverConfirm: false,
      isBackShipping: false,
      isCleaning: false,
    };
  }

  async function handleSaveDriver() {
    if (!driverKey) {
      alert("請先選擇司機");
      return;
    }
    setIsSaving(true);
    setSaveMsg("");
    try {
      // Remove all active driver labels from card
      for (const d of drivers) {
        if (d.labelId && card.labels.some((l) => l.id === d.labelId)) {
          await removeCardLabel(card.id, d.labelId);
        }
      }
      // Add selected driver label
      const selected = drivers.find((d) => d.key === driverKey);
      if (selected?.labelId) await addCardLabel(card.id, selected.labelId);
      // Update due date if set
      if (shippingDatetime) {
        const iso = new Date(shippingDatetime).toISOString();
        await updateCardDue(card.id, iso, false);
        localStorage.setItem(LS_SHIPPING_DATE, shippingDatetime);
      }
      setSaveMsg("✓ 已更新");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setIsSaving(false);
    }
  }

  // Copying shipping notification also moves card to 待出貨
  async function onShippingCopied(): Promise<void> {
    await moveCardToList(card.id, TRELLO.LISTS.WAIT_SHIPPING, true);
    if (shippingDatetime) {
      const iso = new Date(shippingDatetime).toISOString();
      await updateCardDue(card.id, iso, true);
    }
  }

  function handleOutput(type: "shipping" | "driver" | "back" | "cleaning", timeRangeHours: 1 | 2 = 2) {
    const opts = getOpts(timeRangeHours);
    let content: string;
    let title: string;
    switch (type) {
      case "shipping":
        title = `排程出貨簡訊 (${timeRangeHours}hr)`;
        content = buildShippingMsg(card, customFields, opts);
        setResult({ title, content, onCopied: onShippingCopied });
        return;
      case "driver":
        title = "司機確認單";
        content = buildShippingMsg(card, customFields, { ...opts, isDriverConfirm: true });
        break;
      case "back":
        title = "載回貨趟通知";
        content = buildShippingMsg(card, customFields, { ...opts, isBackShipping: true });
        break;
      case "cleaning":
        title = "到府清潔通知";
        content = buildShippingMsg(card, customFields, { ...opts, isCleaning: true });
        break;
    }
    setResult({ title, content });
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        返回
      </button>

      {/* 司機選擇 */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">司機</p>
        <div className="flex flex-wrap gap-1.5">
          {drivers.map((d) => (
            <button
              key={d.key}
              onClick={() => setDriverKey(d.key)}
              className={[
                "rounded-full px-3 py-1 text-xs transition-colors",
                driverKey === d.key
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
              ].join(" ")}
            >
              {d.title}
            </button>
          ))}
        </div>
        {driverKey && (
          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            電話：{drivers.find((d) => d.key === driverKey)?.phoneNumber ?? ""}
          </p>
        )}
      </div>

      {/* 出貨日期時間 */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">出貨日期時間</p>
        <Input
          type="datetime-local"
          value={shippingDatetime}
          onChange={(e) => setShippingDatetime(e.target.value)}
          className="h-8 text-sm"
        />
        {/* 快速時間 */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_TIMES.map((t) => (
            <button
              key={t}
              onClick={() => setQuickTime(t)}
              className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 更改按鈕 — 更新 Trello label + due */}
      <div className="flex items-center gap-2">
        <Button size="sm" className="w-full" onClick={() => void handleSaveDriver()} disabled={isSaving}>
          {isSaving ? "更新中…" : "更改"}
        </Button>
        {saveMsg && <span className="shrink-0 text-xs text-green-600">{saveMsg}</span>}
      </div>

      <hr className="border-[var(--border)]" />

      {/* 尾款金額 */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">尾款金額</p>
        <Input
          value={finalPayment}
          onChange={(e) => setFinalPayment(e.target.value)}
          placeholder="例：5000"
          className="h-8 text-sm"
        />
      </div>

      {/* 收款帳戶 */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">收款帳戶</p>
        <div className="flex gap-2">
          {(["jinshuei", "potato"] as const).map((acc) => (
            <button
              key={acc}
              onClick={() => setReceiveAccount(acc)}
              className={[
                "rounded-full px-3 py-1 text-xs transition-colors",
                receiveAccount === acc
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
              ].join(" ")}
            >
              {acc === "jinshuei" ? "陳金水" : "馬鈴薯沙發"}
            </button>
          ))}
        </div>
      </div>

      {/* 舊沙發 */}
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={sofaRecycle}
            onChange={(e) => setSofaRecycle(e.target.checked)}
            className="rounded"
          />
          舊沙發
        </label>
        {sofaRecycle && (
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={sofaRecycleFree}
              onChange={(e) => setSofaRecycleFree(e.target.checked)}
              className="rounded"
            />
            免費抬走
          </label>
        )}
      </div>

      {/* 輸出按鈕 */}
      <div className="space-y-2 pt-1">
        <Button size="sm" variant="outline" className="w-full" onClick={() => handleOutput("driver")}>
          司機確認
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => handleOutput("shipping", 1)}>
            排程出貨 一小時
          </Button>
          <Button size="sm" onClick={() => handleOutput("shipping", 2)}>
            排程出貨 二小時
          </Button>
        </div>
        <Button size="sm" variant="outline" className="w-full" onClick={() => handleOutput("back")}>
          載回貨趟通知
        </Button>
        <Button size="sm" variant="outline" className="w-full" onClick={() => handleOutput("cleaning")}>
          到府清潔通知
        </Button>
      </div>

      {result && (
        <ResultModal
          title={result.title}
          content={result.content}
          onClose={() => setResult(null)}
          onCopied={result.onCopied}
        />
      )}
    </div>
  );
}

// ─── Production view (排程套印) ───────────────────────────────

interface ProductionViewProps {
  card: TrelloCard;
  customFields: CustomFieldItem[];
  onBack: () => void;
}

function ProductionView({ card, customFields, onBack }: ProductionViewProps) {
  const initialBraider: "yang" | "shen" | "" = card.labels.some(
    (l) => l.id === TRELLO.LABELS.BRAIDER_SHEN,
  )
    ? "shen"
    : card.labels.some((l) => l.id === TRELLO.LABELS.BRAIDER_YANG)
    ? "yang"
    : "";

  const [braiderKey, setBraiderKey] = useState<"yang" | "shen" | "">(initialBraider);
  const [scheduleDate, setScheduleDate] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LS_PRODUCTION_DATE) ?? "";
    }
    return "";
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [printLabel, setPrintLabel] = useState<{ ordNum: string; ordName: string } | null>(null);
  const [result, setResult] = useState<{ title: string; content: string } | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setSaveMsg("");
    try {
      if (braiderKey) {
        // Remove both braider labels first
        for (const labelId of [TRELLO.LABELS.BRAIDER_YANG, TRELLO.LABELS.BRAIDER_SHEN]) {
          if (card.labels.some((l) => l.id === labelId)) {
            await removeCardLabel(card.id, labelId);
          }
        }
        // Add selected braider label
        const newLabelId =
          braiderKey === "yang" ? TRELLO.LABELS.BRAIDER_YANG : TRELLO.LABELS.BRAIDER_SHEN;
        await addCardLabel(card.id, newLabelId);
        // Move card to production list only when a braider is selected
        await moveCardToList(card.id, TRELLO.LISTS.PRODUCTION);
      }
      // Always update schedule day if provided
      if (scheduleDate) {
        const iso = new Date(scheduleDate).toISOString();
        await updateCardScheduleDay(card.id, iso);
        localStorage.setItem(LS_PRODUCTION_DATE, scheduleDate);
      }
      setSaveMsg("✓ 已更新");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setIsSaving(false);
    }
  }

  function handlePrintSticker(chairLegMode: boolean) {
    const nameParts = card.name.split(/\s+/);
    const ordNum = nameParts[0] ?? card.name;
    const ordName = chairLegMode
      ? getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.CHAIR_LEG)
      : (nameParts[1] ?? "");
    setPrintLabel({ ordNum, ordName });
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        返回
      </button>

      <p className="text-sm font-semibold">排程套印</p>

      {/* 生產資訊摘要 */}
      {(() => {
        const styleLabel = card.labels.find((l) => l.name.startsWith("成交/"));
        const color = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.COLOR);
        const scheduleText = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.SCHEDULE_TEXT);
        const seatMaterials = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.SEAT_MATERIALS);
        const chairLeg = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.CHAIR_LEG);
        const rows: [string, string][] = [
          ...(styleLabel ? [["款式", styleLabel.name.replace("成交/", "")] as [string, string]] : []),
          ...(color ? [["布色", color.replace(/,/g, " & ")] as [string, string]] : []),
          ...(scheduleText ? [["排程", scheduleText] as [string, string]] : []),
          ...(seatMaterials ? [["座材", seatMaterials] as [string, string]] : []),
          ...(chairLeg ? [["椅腳", chairLeg] as [string, string]] : []),
        ];
        if (!rows.length) return null;
        return (
          <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5 space-y-1.5">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-2 text-xs">
                <span className="w-10 shrink-0 text-[var(--text-tertiary)]">{label}</span>
                <span className="text-[var(--text-primary)] leading-relaxed">{value}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* 排程師傅 */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">排程師傅</p>
        <div className="flex gap-2">
          {(["yang", "shen"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setBraiderKey(key)}
              className={[
                "rounded-full px-3 py-1 text-xs transition-colors",
                braiderKey === key
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
              ].join(" ")}
            >
              {key === "yang" ? "排程-暘" : "排程-伸"}
            </button>
          ))}
        </div>
      </div>

      {/* 排程日期 */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">排程日期</p>
        <Input
          type="date"
          value={scheduleDate}
          onChange={(e) => setScheduleDate(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* 更改按鈕 */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "更新中…" : "更改"}
        </Button>
        {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
      </div>

      <hr className="border-[var(--border)]" />

      {/* 排程簡訊 */}
      <button
        onClick={() =>
          setResult({ title: "排程簡訊", content: buildScheduleSMS(card, customFields) })
        }
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)]"
      >
        <span className="text-base">📅</span>
        <span>排程簡訊</span>
      </button>

      {/* 套印按鈕 */}
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handlePrintSticker(false)}
          className="flex w-full items-center gap-1"
        >
          <Printer className="h-3.5 w-3.5" />
          套印貼紙
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handlePrintSticker(true)}
          className="flex w-full items-center gap-1"
        >
          <Printer className="h-3.5 w-3.5" />
          套印椅腳
        </Button>
      </div>

      {printLabel && (
        <PrintLabelModal
          ordNum={printLabel.ordNum}
          ordName={printLabel.ordName}
          onClose={() => setPrintLabel(null)}
        />
      )}

      {result && (
        <ResultModal title={result.title} content={result.content} onClose={() => setResult(null)} />
      )}
    </div>
  );
}

// ─── Image modal ──────────────────────────────────────────────

function AttachmentImage({
  urls,
  alt,
  className,
}: {
  urls: string[];
  alt: string;
  className: string;
}) {
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [urls]);

  const url = urls[candidateIndex];
  if (!url) return null;

  return (
    // Trello attachment URLs are resolved dynamically through our authenticated proxy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/trello/attachment-proxy?url=${encodeURIComponent(url)}`}
      alt={alt}
      className={className}
      onError={() => setCandidateIndex((index) => index + 1)}
    />
  );
}

function ImageModal({
  images,
  initialIndex,
  onClose,
}: {
  images: string[][];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex ?? images.length - 1);
  const total = images.length;
  const urls = images[index] ?? [];

  const prev = () => setIndex((i) => (i - 1 + total) % total);
  const next = () => setIndex((i) => (i + 1) % total);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 text-white/80 hover:text-white"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {total > 1 && (
          <button onClick={prev} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <AttachmentImage urls={urls} alt="訂單照片" className="max-h-[90vh] max-w-[80vw] object-contain" />
        {total > 1 && (
          <button onClick={next} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {total > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
          {index + 1} / {total}
        </div>
      )}
    </div>
  );
}

// ─── Customer view ────────────────────────────────────────────

interface CustomerViewProps {
  card: TrelloCard;
  customFields: CustomFieldItem[];
  attachments: TrelloAttachment[];
  onBack: () => void;
}

function CustomFieldsView({
  card,
  customFields,
  onBack,
  onUpdate,
}: {
  card: TrelloCard;
  customFields: CustomFieldItem[];
  onBack: () => void;
  onUpdate: (fieldId: string, value: CustomFieldItem["value"]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function getCurrentValue(field: FieldDef): string {
    const item = customFields.find((cf) => cf.idCustomField === field.id);
    if (!item?.value) return "";
    if (field.type === "date" && item.value.date) {
      const d = new Date(item.value.date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return item.value.text ?? item.value.number ?? "";
  }

  function getDisplayValue(field: FieldDef): string {
    const raw = getCurrentValue(field);
    if (!raw) return "";
    if (field.type === "date") {
      const [y, m, d] = raw.split("-").map(Number);
      const rocYear = (y ?? 0) - 1911;
      const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
      const dateObj = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
      return `${rocYear}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")} (${dayNames[dateObj.getDay()] ?? ""})`;
    }
    return raw;
  }

  function startEdit(field: FieldDef) {
    setDraft(getCurrentValue(field));
    setEditingId(field.id);
  }

  async function handleSave(field: FieldDef) {
    setSaving(true);
    try {
      let value: CustomFieldItem["value"];
      if (field.type === "date") {
        value = draft ? { date: new Date(draft).toISOString() } : {};
      } else if (field.type === "number") {
        value = draft ? { number: draft } : {};
      } else {
        value = draft ? { text: draft } : {};
      }
      await updateCustomField(card.id, field.id, value);
      onUpdate(field.id, value);
      setEditingId(null);
    } catch {
      alert("儲存失敗，請重試");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        返回
      </button>

      <p className="text-sm font-semibold">自訂欄位</p>

      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
        {CUSTOM_FIELD_DEFS.map((field, i) => {
          const isEditing = editingId === field.id;
          const display = getDisplayValue(field);
          return (
            <div
              key={field.id}
              className={`${i > 0 ? "border-t border-[var(--border)]" : ""}`}
            >
              {isEditing ? (
                <div className="px-3 py-2.5">
                  <p className="mb-1 text-xs text-[var(--text-tertiary)]">{field.label}</p>
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSave(field);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      onClick={() => void handleSave(field)}
                      disabled={saving}
                      className="text-sm text-[var(--accent)] disabled:opacity-40"
                    >
                      {saving ? "…" : "儲存"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-sm text-[var(--text-tertiary)]"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => startEdit(field)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)]"
                >
                  <span className="shrink-0 text-sm text-[var(--text-secondary)]">{field.label}</span>
                  <span className={`truncate text-sm ${display ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}>
                    {display || "—"}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChecklistView({ card, onBack, onCountChange }: { card: TrelloCard; onBack: () => void; onCountChange?: (done: number) => void }) {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchChecklists(card.id)
      .then(setChecklists)
      .catch(() => setChecklists([]))
      .finally(() => setLoading(false));
  }, [card.id]);

  async function handleToggle(checklistId: string, item: CheckItem) {
    setToggling(item.id);
    const complete = item.state !== "complete";
    try {
      await toggleCheckItem(card.id, item.id, complete);
      setChecklists((prev) => {
        const next = prev.map((cl) =>
          cl.id !== checklistId ? cl : {
            ...cl,
            checkItems: cl.checkItems.map((ci) =>
              ci.id === item.id ? { ...ci, state: (complete ? "complete" : "incomplete") as CheckItem["state"] } : ci
            ),
          }
        );
        const done = next.flatMap((cl) => cl.checkItems).filter((ci) => ci.state === "complete").length;
        onCountChange?.(done);
        return next;
      });
    } catch {
      alert("更新失敗，請重試");
    } finally {
      setToggling(null);
    }
  }

  async function handleAdd(checklistId: string) {
    const name = newItemText.trim();
    if (!name) return;
    setSaving(true);
    try {
      const newItem = await addCheckItem(checklistId, name);
      setChecklists((prev) =>
        prev.map((cl) =>
          cl.id !== checklistId ? cl : { ...cl, checkItems: [...cl.checkItems, newItem] }
        )
      );
      setNewItemText("");
      setAddingTo(null);
    } catch {
      alert("新增失敗，請重試");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        返回
      </button>

      <p className="text-sm font-semibold">清單</p>

      {loading && (
        <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">載入中…</p>
      )}

      {!loading && checklists.length === 0 && (
        <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">沒有清單</p>
      )}

      {checklists.map((cl) => {
        const done = cl.checkItems.filter((i) => i.state === "complete").length;
        return (
          <div key={cl.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--text-secondary)]">{cl.name}</p>
              <span className={`text-xs ${done === cl.checkItems.length && cl.checkItems.length > 0 ? "text-green-600" : "text-[var(--text-tertiary)]"}`}>
                {done}/{cl.checkItems.length}
              </span>
            </div>

            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
              {cl.checkItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void handleToggle(cl.id, item)}
                  disabled={toggling === item.id}
                  className="flex w-full items-center gap-2.5 border-b border-[var(--border)] px-3 py-2.5 text-left last:border-b-0 hover:bg-[var(--bg-hover)] disabled:opacity-50"
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${item.state === "complete" ? "border-green-500 bg-green-500 text-white" : "border-[var(--border)]"}`}>
                    {item.state === "complete" && "✓"}
                  </span>
                  <span className={`text-sm ${item.state === "complete" ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
                    {item.name}
                  </span>
                </button>
              ))}

              {addingTo === cl.id ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <input
                    autoFocus
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(cl.id); if (e.key === "Escape") { setAddingTo(null); setNewItemText(""); } }}
                    placeholder="新項目名稱…"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  <button
                    onClick={() => void handleAdd(cl.id)}
                    disabled={saving || !newItemText.trim()}
                    className="text-xs text-[var(--accent)] disabled:opacity-40"
                  >
                    {saving ? "…" : "新增"}
                  </button>
                  <button onClick={() => { setAddingTo(null); setNewItemText(""); }} className="text-xs text-[var(--text-tertiary)]">
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTo(cl.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
                >
                  + 新增項目
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CustomerView({ card, customFields, attachments, onBack }: CustomerViewProps) {
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [result, setResult] = useState<{ title: string; content: string } | null>(null);
  const snapshotImageGroups = useMemo(() => getAllTrelloImageUrlGroups(attachments, "full"), [attachments]);

  const descLines = card.desc.split("\n").map((l) => l.trim()).filter(Boolean);
  const address = descLines[0] ?? "";
  const communityName = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.COMMUNITY_NAME);
  const finalAddress = communityName ? `${address}〔${communityName}〕` : address;

  const orderNumber = card.name.match(/P\d{4,6}/)?.[0] ?? "";
  const primaryName =
    getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.PRIMARY_CONTACT_NAME) ||
    card.name.replace(orderNumber, "").trim();
  const primaryPhoneRaw =
    getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.PRIMARY_CONTACT_PHONE) ||
    descLines[1] ||
    "";
  const primaryPhone = normalizePhone(primaryPhoneRaw) ?? primaryPhoneRaw;

  const secondaryPhoneRaw = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_PHONE);
  const secondaryName = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_NAME);
  const secondaryPhone = secondaryPhoneRaw
    ? (normalizePhone(secondaryPhoneRaw.split("/")[0]?.trim() ?? "") ?? secondaryPhoneRaw)
    : null;

  function openSnapshot() {
    if (snapshotImageGroups.length === 0) return;
    setSnapshotOpen(true);
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        返回
      </button>

      <p className="text-sm font-semibold">客戶資訊</p>

      {/* 主要聯絡人 */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">主要聯絡人</p>
        <a
          href={`tel:${primaryPhone}`}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-[var(--bg-hover)]"
        >
          <span className="text-base">📞</span>
          <span className="font-mono">{primaryPhone}</span>
          <span className="text-[var(--text-secondary)]">{primaryName}</span>
        </a>
      </div>

      {/* 次要聯絡人 */}
      {secondaryPhone && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">次要聯絡人</p>
          <a
            href={`tel:${secondaryPhone}`}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-[var(--bg-hover)]"
          >
            <span className="text-base">📞</span>
            <span className="font-mono">{secondaryPhone}</span>
            <span className="text-[var(--text-secondary)]">{secondaryName}</span>
          </a>
        </div>
      )}

      {/* 地址 */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-secondary)]">地址</p>
          <div className="flex items-center gap-2">
            <CopyButton text={finalAddress} />
            {finalAddress && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(finalAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
              >
                <Navigation className="h-3.5 w-3.5" />
                導航
              </a>
            )}
          </div>
        </div>
        <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm leading-relaxed text-[var(--text-primary)]">
          {finalAddress}
        </p>
      </div>

      <hr className="border-[var(--border)]" />

      {/* 輸出客戶資訊 */}
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() =>
          setResult({ title: "客戶資訊", content: buildCustomerInfoText(card, customFields) })
        }
      >
        輸出客戶資訊
      </Button>

      {/* 維修單資訊 */}
      {(() => {
        const repairText = buildRepairOrderText(card, customFields);
        if (!repairText) return null;
        return (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setResult({ title: "維修單資訊", content: repairText })}
          >
            <span className="mr-1">📋</span>維修單資訊
          </Button>
        );
      })()}

      {/* 訂單快照 */}
      {snapshotImageGroups.length > 0 && (
        <Button size="sm" variant="outline" className="w-full" onClick={openSnapshot}>
          <span className="mr-1">📷</span>
          訂單快照
          {snapshotImageGroups.length > 1 && (
            <span className="ml-1 text-[var(--text-tertiary)]">({snapshotImageGroups.length})</span>
          )}
        </Button>
      )}

      {result && (
        <ResultModal title={result.title} content={result.content} onClose={() => setResult(null)} />
      )}
      {snapshotOpen && (
        <ImageModal images={snapshotImageGroups} onClose={() => setSnapshotOpen(false)} />
      )}
    </div>
  );
}

// ─── Card detail panel ────────────────────────────────────────

interface CardDetailProps {
  card: TrelloCard;
  drivers: DriverRecord[];
  attachments: TrelloAttachment[];
  onClose: () => void;
}

function CardDetail({ card, drivers, attachments, onClose }: CardDetailProps) {
  const [customFields, setCustomFields] = useState<CustomFieldItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"actions" | "shipping" | "production" | "customer" | "checklist" | "customfields">("actions");
  const [result, setResult] = useState<{ title: string; content: string } | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");

  useEffect(() => {
    setLoading(true);
    setView("actions");
    fetchCustomFields(card.id)
      .then(setCustomFields)
      .catch(() => setCustomFields([]))
      .finally(() => setLoading(false));
  }, [card.id]);

  useEffect(() => {
    async function handlePaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;

      setUploadState("uploading");
      try {
        const form = new FormData();
        form.append("cardId", card.id);
        form.append("file", file, `paste-${Date.now()}.png`);
        const res = await fetch("/api/trello/upload-attachment", { method: "POST", body: form });
        if (!res.ok) throw new Error(`上傳失敗 ${res.status}`);
        setUploadState("done");
        setTimeout(() => setUploadState("idle"), 2000);
      } catch {
        setUploadState("error");
        setTimeout(() => setUploadState("idle"), 3000);
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [card.id]);

  function handleAction(type: "schedule" | "cutting") {
    if (loading) return;
    let text: string;
    let title: string;
    switch (type) {
      case "schedule":
        title = "排程簡訊";
        text = buildScheduleSMS(card, customFields);
        break;
      case "cutting":
        title = "裁剪工作單";
        text = buildCuttingWorkOrder(card, customFields);
        break;
    }
    setResult({ title, content: text });
  }

  const listName = LIST_NAMES[card.idList] ?? "未知";
  const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"] as const;
  const dueDate = card.due
    ? (() => {
        const d = new Date(card.due);
        const month = d.getMonth() + 1;
        const day = d.getDate();
        const hour = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");
        return `${month}/${day} (${DAY_NAMES[d.getDay()] ?? ""}) ${hour}:${min}`;
      })()
    : null;
  const scheduleDay = getCustomFieldDate(customFields, TRELLO.CUSTOM_FIELDS.SCHEDULE_DAY);
  const scheduleDisplay = scheduleDay
    ? (() => {
        const rocYear = scheduleDay.getFullYear() - 1911;
        const mm = String(scheduleDay.getMonth() + 1).padStart(2, "0");
        const dd = String(scheduleDay.getDate()).padStart(2, "0");
        return `${rocYear}.${mm}.${dd} (${DAY_NAMES[scheduleDay.getDay()] ?? ""})`;
      })()
    : null;
  const driverLabel = drivers.find((d) => card.labels.some((l) => l.id === d.labelId));
  const driverTrelloLabel = card.labels.find((l) => l.id === driverLabel?.labelId);
  const styleLabel = card.labels.find((l) => l.name.startsWith("成交/"));
  const isWaitShipping = card.idList === TRELLO.LISTS.WAIT_SHIPPING;
  const checkTotal = card.badges?.checkItems ?? 0;
  const [checkDone, setCheckDone] = useState(card.badges?.checkItemsChecked ?? 0);

  async function handleMarkShipped() {
    if (!window.confirm("確認將此卡片標記為「已出貨」？")) return;
    setIsMoving(true);
    try {
      await moveCardToList(card.id, TRELLO.LISTS.SHIPPED, true);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setIsMoving(false);
    }
  }

  async function handleMoveCard(listId: string) {
    setIsMoving(true);
    try {
      const dueComplete = listId === TRELLO.LISTS.SHIPPED ? true : undefined;
      await moveCardToList(card.id, listId, dueComplete);
      setShowMovePicker(false);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "移動失敗");
    } finally {
      setIsMoving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-base font-semibold text-[var(--text-primary)]">
            {card.name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-[var(--text-tertiary)]">
            <span>{listName}</span>
            {checkTotal > 0 && (
              <span className={checkDone === checkTotal ? "text-green-600" : ""}>
                ☑ {checkDone}/{checkTotal}
              </span>
            )}
          </p>
          {scheduleDisplay && (
            <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
              <span className="font-normal text-[var(--text-tertiary)]">排程日：</span>
              {scheduleDisplay}
            </p>
          )}
          {dueDate && (
            <p className="text-sm font-medium text-[var(--text-primary)]">
              <span className="font-normal text-[var(--text-tertiary)]">出貨日：</span>
              {dueDate}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {styleLabel && (
              <LabelBadge label={styleLabel} text={styleLabel.name.replace("成交/", "")} />
            )}
            {driverLabel && (driverTrelloLabel ? <LabelBadge label={driverTrelloLabel} text={driverLabel.title} /> : <FallbackBadge text={driverLabel.title} />)}
            {card.labels
              .filter(
                (l) =>
                  !l.name.startsWith("成交/") && !drivers.some((d) => d.labelId === l.id),
              )
              .map((l) => (
                <LabelBadge key={l.id} label={l} text={l.name} />
              ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button onClick={onClose} className="text-[var(--text-tertiary)]">
            <X className="h-4 w-4" />
          </button>
          {uploadState !== "idle" && (
            <span className={`text-[10px] ${
              uploadState === "uploading" ? "text-[var(--text-tertiary)]" :
              uploadState === "done" ? "text-green-600" : "text-red-500"
            }`}>
              {uploadState === "uploading" ? "上傳中…" : uploadState === "done" ? "✓ 已上傳" : "上傳失敗"}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {loading ? (
          <p className="py-6 text-center text-xs text-[var(--text-tertiary)]">載入自訂欄位…</p>
        ) : view === "shipping" ? (
          <ShippingSettings
            card={card}
            customFields={customFields}
            drivers={drivers}
            onBack={() => setView("actions")}
          />
        ) : view === "production" ? (
          <ProductionView
            card={card}
            customFields={customFields}
            onBack={() => setView("actions")}
          />
        ) : view === "customer" ? (
          <CustomerView
            card={card}
            customFields={customFields}
            attachments={attachments}
            onBack={() => setView("actions")}
          />
        ) : view === "customfields" ? (
          <CustomFieldsView
            card={card}
            customFields={customFields}
            onBack={() => setView("actions")}
            onUpdate={(fieldId, value) =>
              setCustomFields((prev) => {
                const exists = prev.some((cf) => cf.idCustomField === fieldId);
                if (exists) return prev.map((cf) => cf.idCustomField === fieldId ? { ...cf, value } : cf);
                return [...prev, { id: fieldId, idCustomField: fieldId, value }];
              })
            }
          />
        ) : view === "checklist" ? (
          <ChecklistView
            card={card}
            onBack={() => setView("actions")}
            onCountChange={setCheckDone}
          />
        ) : (
          <div className="space-y-2">
            {isWaitShipping && (
              <button
                onClick={() => void handleMarkShipped()}
                disabled={isMoving}
                className="flex w-full items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2.5 text-left text-sm text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                <span className="text-base">✅</span>
                <span>{isMoving ? "更新中…" : "標記已出貨"}</span>
              </button>
            )}
            <button
              onClick={() => setView("shipping")}
              className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)]"
            >
              <span className="text-base">🚚</span>
              <span>排程出貨</span>
            </button>
            <button
              onClick={() => setView("production")}
              className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)]"
            >
              <span className="text-base">🖨️</span>
              <span>排程套印</span>
            </button>
            <button
              onClick={() => setView("customer")}
              className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)]"
            >
              <span className="text-base">👤</span>
              <span>客戶資訊</span>
            </button>
            <button
              onClick={() => setView("customfields")}
              className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)]"
            >
              <span className="text-base">🗂️</span>
              <span>自訂欄位</span>
            </button>
            {checkTotal > 0 && (
              <button
                onClick={() => setView("checklist")}
                className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)]"
              >
                <span className="text-base">☑️</span>
                <span>清單</span>
                <span className={`ml-auto text-xs ${checkDone === checkTotal ? "text-green-600" : "text-[var(--text-tertiary)]"}`}>
                  {checkDone}/{checkTotal}
                </span>
              </button>
            )}
            <button
              onClick={() => handleAction("schedule")}
              className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)]"
            >
              <span className="text-base">📅</span>
              <span>排程簡訊</span>
            </button>
            <button
              onClick={() => handleAction("cutting")}
              className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)]"
            >
              <span className="text-base">✂️</span>
              <span>裁剪工作單</span>
            </button>
            {showMovePicker ? (
              <div className="rounded-lg border border-[var(--border)] p-2.5">
                <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">移動到清單...</p>
                <div className="space-y-0.5">
                  {Object.entries(LIST_NAMES)
                    .filter(([id]) => id !== card.idList)
                    .map(([id, name]) => (
                      <button
                        key={id}
                        onClick={() => void handleMoveCard(id)}
                        disabled={isMoving}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50"
                      >
                        {name}
                      </button>
                    ))}
                </div>
                <button
                  onClick={() => setShowMovePicker(false)}
                  className="mt-2 w-full rounded px-2 py-1 text-xs text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowMovePicker(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)]"
              >
                <span className="text-base">↗️</span>
                <span>移動卡片</span>
              </button>
            )}
            {card.desc && (
              <div className="mt-3 rounded-lg bg-[var(--surface-2)] p-2.5 text-[11px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                {card.desc}
              </div>
            )}
          </div>
        )}
      </div>

      {result && (
        <ResultModal title={result.title} content={result.content} onClose={() => setResult(null)} />
      )}
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────

export function ShippingNoticeClient() {
  const { drivers } = useActiveDrivers();
  const [listNames, setListNames] = useState<Record<string, string>>(LIST_NAMES);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedCard, setSelectedCard] = useState<TrelloCard | null>(null);
  const [cardAttachments, setCardAttachments] = useState<TrelloAttachment[]>([]);
  const [cardAttachmentsCardId, setCardAttachmentsCardId] = useState<string | null>(null);
  const [cardCustomFieldsMap, setCardCustomFieldsMap] = useState<Record<string, CustomFieldItem[]>>({});
  const [previewImages, setPreviewImages] = useState<string[][] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedCardId = selectedCard?.id ?? null;
  const previewCardId = selectedCardId ?? cards[0]?.id ?? null;
  // thumbnail URLs for the last image (display in search card)
  const selectedCardImageUrls = useMemo(
    () => getTrelloAttachmentImageUrls(cardAttachments, "full"),
    [cardAttachments],
  );
  // all images' full-res URL groups (for modal navigation)
  const allCardImageGroups = useMemo(
    () => getAllTrelloImageUrlGroups(cardAttachments, "full"),
    [cardAttachments],
  );

  useEffect(() => {
    trelloGet<{ id: string; name: string }[]>(`boards/${TRELLO.BOARD_ID}/lists`, { fields: "id,name" })
      .then((lists) => {
        const map: Record<string, string> = {};
        for (const l of lists) map[l.id] = l.name;
        setListNames(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCardAttachmentsCardId(previewCardId);
    if (!previewCardId) {
      setCardAttachments([]);
      return;
    }

    setCardAttachments([]);
    fetchAttachments(previewCardId)
      .then(setCardAttachments)
      .catch(() => setCardAttachments([]));
  }, [previewCardId]);

  useEffect(() => {
    const q = submittedQuery.trim().toUpperCase();
    if (!q) {
      setSelectedCard(null);
      setCards([]);
      setSearchError("");
      return;
    }
    setSearching(true);
    setSearchError("");
    searchCards(q)
      .then((nextCards) => {
        setCards(nextCards);
        setSelectedCard(nextCards.length === 1 ? nextCards[0] : null);
        setCardCustomFieldsMap({});
        Promise.all(
          nextCards.map((c) =>
            fetchCustomFields(c.id)
              .then((fields) => ({ id: c.id, fields }))
              .catch(() => null),
          ),
        ).then((results) => {
          const map: Record<string, CustomFieldItem[]> = {};
          for (const r of results) if (r) map[r.id] = r.fields;
          setCardCustomFieldsMap(map);
        });
      })
      .catch((e: unknown) => setSearchError(e instanceof Error ? e.message : "搜尋失敗"))
      .finally(() => setSearching(false));
  }, [submittedQuery]);

  function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setSubmittedQuery(q);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 shrink-0 text-[var(--accent)]" />
        <h1 className="text-xl font-bold">排程出貨</h1>
      </div>

      <div className="flex max-w-sm gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="搜尋訂單號碼（P1234）或客戶名稱"
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={searching || !query.trim()}>
          查詢
        </Button>
      </div>

      {searchError && <p className="text-xs text-red-600">{searchError}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 搜尋結果 */}
        <div className="space-y-2">
          {searching && <p className="text-xs text-[var(--text-tertiary)]">搜尋中…</p>}
          {!searching && submittedQuery && cards.length === 0 && !searchError && (
            <p className="text-xs text-[var(--text-tertiary)]">查無符合的訂單</p>
          )}
          {cards.map((card) => {
            const listName = listNames[card.idList] ?? card.idList;
            const cardCF = cardCustomFieldsMap[card.id] ?? [];
            const scheduleDate = getCustomFieldDate(cardCF, TRELLO.CUSTOM_FIELDS.SCHEDULE_DAY);
            const scheduleText = getCustomFieldText(cardCF, TRELLO.CUSTOM_FIELDS.SCHEDULE_TEXT);
            const cardDayNames = ["日", "一", "二", "三", "四", "五", "六"] as const;
            const scheduleDisplay = (() => {
              if (!scheduleDate) return null;
              const d = scheduleDate;
              const rocYear = d.getFullYear() - 1911;
              const mm = String(d.getMonth() + 1).padStart(2, "0");
              const dd = String(d.getDate()).padStart(2, "0");
              return `${rocYear}.${mm}.${dd} (${cardDayNames[d.getDay()] ?? ""})`;
            })();
            const dueDisplay = (() => {
              if (!card.due) return null;
              const d = new Date(card.due);
              const month = d.getMonth() + 1;
              const day = d.getDate();
              const hour = String(d.getHours()).padStart(2, "0");
              const min = String(d.getMinutes()).padStart(2, "0");
              return `${month}/${day} (${cardDayNames[d.getDay()] ?? ""}) ${hour}:${min}`;
            })();
            const addressDisplay = card.desc.split("\n")[0]?.trim() || null;
            const isDone = card.dueComplete;
            const styleLabel = card.labels.find((l) => l.name.startsWith("成交/"));
            const styleText = styleLabel?.name.replace("成交/", "") ?? null;
            const driverLabel = drivers.find((d) => card.labels.some((l) => l.id === d.labelId));
            const driverTrelloLabel = card.labels.find((l) => l.id === driverLabel?.labelId);
            const isUrgent = card.labels.some((l) => l.id === "5d7b800053301c65f08da2ae");

            return (
              <div
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className={[
                  "cursor-pointer rounded-lg border p-3 transition-colors hover:bg-[var(--bg-hover)]",
                  selectedCard?.id === card.id
                    ? "border-[var(--accent)] bg-[var(--bg-hover)]"
                    : "border-[var(--border)] bg-[var(--bg-elevated)]",
                ].join(" ")}
              >
                {/* 第一行：訂單名稱 + 款式 */}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-base font-semibold text-[var(--text-primary)]">
                    {isDone && <span className="mr-1">✅</span>}
                    {isUrgent && <span className="mr-1 text-red-500">[急]</span>}
                    {card.name}
                  </p>
                  {styleText && (
                    <span className="shrink-0 font-mono text-sm font-bold text-[var(--text-primary)]">
                      {styleText}
                    </span>
                  )}
                </div>

                {/* 排程日 / 出貨日 / 地址 */}
                <div className="mt-1 space-y-0.5">
                  {scheduleDisplay && (
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      <span className="font-normal text-[var(--text-secondary)]">排程日：</span>
                      {scheduleDisplay}
                    </p>
                  )}
                  {dueDisplay && (
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      <span className="font-normal text-[var(--text-secondary)]">出貨日：</span>
                      {dueDisplay}
                    </p>
                  )}
                  {addressDisplay && (
                    <p className="truncate text-sm text-[var(--text-secondary)]">
                      📍 {addressDisplay}
                    </p>
                  )}
                </div>

                {/* 標籤 */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {listName !== card.idList && (
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)]">
                      {listName}
                    </span>
                  )}
                  {driverLabel && (driverTrelloLabel ? <LabelBadge label={driverTrelloLabel} text={driverLabel.title} /> : <FallbackBadge text={driverLabel.title} />)}
                </div>
                {cardAttachmentsCardId === card.id && selectedCardImageUrls.length > 0 && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewImages(allCardImageGroups);
                      }}
                      className="group w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-left"
                      title="點擊放大查看訂單附件"
                    >
                      <AttachmentImage
                        urls={selectedCardImageUrls}
                        alt="訂單附件"
                        className="h-[38rem] w-full bg-white object-contain transition-transform group-hover:scale-[1.02]"
                      />
                      <div className="flex items-center justify-between border-t border-[var(--border)] px-2 py-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">點擊放大查看</span>
                        {allCardImageGroups.length > 1 && (
                          <span className="flex items-center gap-0.5 text-[11px] text-[var(--text-tertiary)]">
                            📷 {allCardImageGroups.length}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 卡片詳情 */}
        {selectedCard && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
            <CardDetail
              card={selectedCard}
              drivers={drivers}
              attachments={cardAttachments}
              onClose={() => setSelectedCard(null)}
            />
          </div>
        )}
      </div>

      {previewImages && <ImageModal images={previewImages} onClose={() => setPreviewImages(null)} />}
    </div>
  );
}
