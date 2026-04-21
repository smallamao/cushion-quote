"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Eye,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  Save,
  Send,
  Stethoscope,
  Trash2,
} from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  buildAfterSalesPdfFileName,
  generateAfterSalesPdfBlob,
} from "@/components/pdf/AfterSalesPDF";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEquipment } from "@/hooks/useEquipment";
import { useSettings } from "@/hooks/useSettings";
import { useUsers } from "@/hooks/useUsers";
import { parseAfterSalesText } from "@/lib/after-sales-paste-parser";
import type {
  AfterSalesReply,
  AfterSalesService,
  AfterSalesStatus,
} from "@/lib/types";

interface Props {
  mode: "create" | "edit";
  serviceId?: string;
}

type DraftService = Omit<AfterSalesService, "serviceId" | "createdAt" | "updatedAt" | "createdBy">;

function emptyDraft(): DraftService {
  const today = new Date().toISOString().slice(0, 10);
  return {
    receivedDate: today,
    relatedOrderNo: "",
    shipmentDate: "",
    clientName: "",
    clientPhone: "",
    clientContact2: "",
    clientPhone2: "",
    deliveryAddress: "",
    modelCode: "",
    modelNameSnapshot: "",
    issueDescription: "",
    issuePhotos: [],
    status: "pending",
    assignedTo: "",
    scheduledDate: "",
    dispatchNotes: "",
    completedDate: "",
    completionNotes: "",
    completionPhotos: [],
  };
}

const STATUS_OPTIONS: Array<{ value: AfterSalesStatus; label: string }> = [
  { value: "pending", label: "待確認" },
  { value: "scheduled", label: "已排程" },
  { value: "in_progress", label: "維修中" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "取消" },
];

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !json.url) {
    throw new Error(json.error || "圖片上傳失敗");
  }
  return json.url;
}

export function AfterSalesEditorClient({ mode, serviceId }: Props) {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const { equipment } = useEquipment();
  const { settings } = useSettings();
  const { users } = useUsers();
  const readOnly = user?.role === "technician";

  // 技師不能新增工單，導回列表
  useEffect(() => {
    if (!userLoading && readOnly && mode === "create") {
      router.replace("/after-sales");
    }
  }, [userLoading, readOnly, mode, router]);

  const [draft, setDraft] = useState<DraftService>(emptyDraft());
  const [meta, setMeta] = useState<Pick<
    AfterSalesService,
    "serviceId" | "createdAt" | "updatedAt" | "createdBy"
  > | null>(null);

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [replies, setReplies] = useState<AfterSalesReply[]>([]);
  const [newReplyContent, setNewReplyContent] = useState("");
  const [newReplyAttachments, setNewReplyAttachments] = useState<string[]>([]);
  const [replySaving, setReplySaving] = useState(false);

  const issuePhotoInputRef = useRef<HTMLInputElement>(null);
  const completionPhotoInputRef = useRef<HTMLInputElement>(null);
  const replyPhotoInputRef = useRef<HTMLInputElement>(null);

  // PDF 預覽 state
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Paste-to-parse state (create mode only)
  const [pasteText, setPasteText] = useState("");
  const [pasteMatched, setPasteMatched] = useState<string[] | null>(null);

  function handleParsePaste() {
    const result = parseAfterSalesText(pasteText);
    if (result.matchedFields.length === 0) {
      setPasteMatched([]);
      return;
    }
    setDraft((prev) => ({
      ...prev,
      shipmentDate: result.shipmentDate || prev.shipmentDate,
      relatedOrderNo: result.relatedOrderNo || prev.relatedOrderNo,
      clientName: result.clientName || prev.clientName,
      clientPhone: result.clientPhone || prev.clientPhone,
      clientContact2: result.clientContact2 || prev.clientContact2,
      clientPhone2: result.clientPhone2 || prev.clientPhone2,
      deliveryAddress: result.deliveryAddress || prev.deliveryAddress,
      modelCode: result.modelCode || prev.modelCode,
      modelNameSnapshot: result.modelNameSnapshot || prev.modelNameSnapshot,
      issueDescription: result.issueDescription || prev.issueDescription,
    }));
    setPasteMatched(result.matchedFields);
  }

  async function handlePreviewPdf() {
    if (!meta) return;
    setPdfOpen(true);
    setPdfLoading(true);
    setPdfBlob(null);
    try {
      const service: AfterSalesService = {
        ...draft,
        serviceId: meta.serviceId,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        createdBy: meta.createdBy,
      };
      const blob = await generateAfterSalesPdfBlob({
        service,
        replies,
        settings,
      });
      setPdfBlob(blob);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PDF 生成失敗");
      setPdfOpen(false);
    } finally {
      setPdfLoading(false);
    }
  }

  // 載入編輯模式的資料
  useEffect(() => {
    if (mode !== "edit" || !serviceId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/sheets/after-sales/${serviceId}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok: boolean;
          service?: AfterSalesService;
          replies?: AfterSalesReply[];
          error?: string;
        };
        if (cancelled) return;
        if (!json.ok || !json.service) {
          setError(json.error ?? "載入失敗");
          return;
        }
        const { service } = json;
        setDraft({
          receivedDate: service.receivedDate,
          relatedOrderNo: service.relatedOrderNo,
          shipmentDate: service.shipmentDate,
          clientName: service.clientName,
          clientPhone: service.clientPhone,
          clientContact2: service.clientContact2,
          clientPhone2: service.clientPhone2,
          deliveryAddress: service.deliveryAddress,
          modelCode: service.modelCode,
          modelNameSnapshot: service.modelNameSnapshot,
          issueDescription: service.issueDescription,
          issuePhotos: service.issuePhotos ?? [],
          status: service.status,
          assignedTo: service.assignedTo,
          scheduledDate: service.scheduledDate,
          dispatchNotes: service.dispatchNotes,
          completedDate: service.completedDate,
          completionNotes: service.completionNotes,
          completionPhotos: service.completionPhotos ?? [],
        });
        setMeta({
          serviceId: service.serviceId,
          createdAt: service.createdAt,
          updatedAt: service.updatedAt,
          createdBy: service.createdBy,
        });
        setReplies(json.replies ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, serviceId]);

  function update<K extends keyof DraftService>(key: K, value: DraftService[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // 選款式時自動帶出名稱 snapshot
  function handleModelChange(code: string) {
    const hit = equipment.find((e) => e.modelCode === code);
    setDraft((prev) => ({
      ...prev,
      modelCode: code,
      modelNameSnapshot: hit?.modelName ?? prev.modelNameSnapshot,
    }));
  }

  async function handleUploadPhoto(
    file: File,
    target: "issue" | "completion",
  ) {
    try {
      const url = await uploadImage(file);
      setDraft((prev) => ({
        ...prev,
        ...(target === "issue"
          ? { issuePhotos: [...prev.issuePhotos, url] }
          : { completionPhotos: [...prev.completionPhotos, url] }),
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "上傳失敗");
    }
  }

  function removePhoto(target: "issue" | "completion", idx: number) {
    setDraft((prev) => ({
      ...prev,
      ...(target === "issue"
        ? { issuePhotos: prev.issuePhotos.filter((_, i) => i !== idx) }
        : {
            completionPhotos: prev.completionPhotos.filter((_, i) => i !== idx),
          }),
    }));
  }

  async function handleSave() {
    if (!draft.clientName.trim()) {
      alert("請填寫客戶姓名");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/sheets/after-sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const json = (await res.json()) as {
          ok: boolean;
          service?: AfterSalesService;
          error?: string;
        };
        if (!json.ok || !json.service) {
          alert(json.error ?? "建立失敗");
          return;
        }
        router.push(`/after-sales/${json.service.serviceId}` as never);
      } else {
        const res = await fetch(`/api/sheets/after-sales/${serviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) {
          alert(json.error ?? "儲存失敗");
          return;
        }
        alert("已儲存");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  const handleReplyUpload = useCallback(async (file: File) => {
    try {
      const url = await uploadImage(file);
      setNewReplyAttachments((prev) => [...prev, url]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "上傳失敗");
    }
  }, []);

  async function handlePostReply() {
    if (!newReplyContent.trim()) {
      alert("請填寫回應內容");
      return;
    }
    if (!serviceId) return;
    setReplySaving(true);
    try {
      const res = await fetch(`/api/sheets/after-sales/${serviceId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newReplyContent.trim(),
          attachments: newReplyAttachments,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        reply?: AfterSalesReply;
        error?: string;
      };
      if (!json.ok || !json.reply) {
        alert(json.error ?? "發送失敗");
        return;
      }
      setReplies((prev) => [json.reply!, ...prev]);
      setNewReplyContent("");
      setNewReplyAttachments([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "發送失敗");
    } finally {
      setReplySaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-[var(--text-secondary)]">載入中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/after-sales">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-3 w-3" />
            返回列表
          </Button>
        </Link>
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/after-sales">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-3 w-3" />
              返回列表
            </Button>
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <Stethoscope className="h-5 w-5" />
              {mode === "create" ? "新增售後服務單" : readOnly ? `檢視 ${meta?.serviceId ?? ""}` : `編輯 ${meta?.serviceId ?? ""}`}
            </h1>
            {meta && (
              <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                建立者: {meta.createdBy} · 建立: {meta.createdAt.slice(0, 10)} · 最後更新: {meta.updatedAt.slice(0, 10)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === "edit" && (
            <Button variant="outline" onClick={handlePreviewPdf}>
              <Eye className="mr-1 h-4 w-4" />
              預覽 PDF
            </Button>
          )}
          {!readOnly && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              {mode === "create" ? "建立" : "儲存變更"}
            </Button>
          )}
        </div>
      </div>

      {/* 技師快捷資訊卡 */}
      {readOnly && mode === "edit" && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)]">快捷資訊</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {draft.clientName && (
              <div>
                <div className="text-[11px] text-[var(--text-tertiary)]">客戶</div>
                <div className="text-sm font-medium">{draft.clientName}</div>
              </div>
            )}
            {draft.clientPhone && (
              <div>
                <div className="text-[11px] text-[var(--text-tertiary)]">電話</div>
                <a href={`tel:${draft.clientPhone}`} className="text-sm font-medium text-[var(--accent)] underline">
                  {draft.clientPhone}
                </a>
              </div>
            )}
            {draft.clientContact2 && (
              <div>
                <div className="text-[11px] text-[var(--text-tertiary)]">次要聯絡人</div>
                <div className="text-sm">{draft.clientContact2}</div>
              </div>
            )}
            {draft.clientPhone2 && (
              <div>
                <div className="text-[11px] text-[var(--text-tertiary)]">次要電話</div>
                <a href={`tel:${draft.clientPhone2}`} className="text-sm font-medium text-[var(--accent)] underline">
                  {draft.clientPhone2}
                </a>
              </div>
            )}
            {draft.deliveryAddress && (
              <div className="sm:col-span-2">
                <div className="text-[11px] text-[var(--text-tertiary)]">地址</div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(draft.deliveryAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-[var(--accent)] underline"
                >
                  {draft.deliveryAddress}
                </a>
              </div>
            )}
            {draft.modelCode && (
              <div>
                <div className="text-[11px] text-[var(--text-tertiary)]">款式</div>
                <div className="text-sm"><span className="font-mono">{draft.modelCode}</span> {draft.modelNameSnapshot}</div>
              </div>
            )}
            {draft.issueDescription && (
              <div className="sm:col-span-2">
                <div className="text-[11px] text-[var(--text-tertiary)]">問題描述</div>
                <div className="whitespace-pre-wrap text-sm">{draft.issueDescription}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 快速貼上解析區 - 只在新增時顯示 */}
      {mode === "create" && !readOnly && (
        <div className="rounded-lg border border-dashed border-[var(--accent)]/50 bg-[var(--bg-subtle)] p-5">
          <h2 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
            快速貼上解析
          </h2>
          <p className="mb-3 text-xs text-[var(--text-tertiary)]">
            從 LINE/Email 複製客戶資訊整段貼入,系統自動解析出貨日 (民國/西元皆可)、地址、主要/次要聯絡人與電話、訂單編號、款式。範例:
            <br />
            <span className="font-mono text-[11px]">
              114.07.17 / 桃園市楊梅區... / 0983335320 黃美宜 / 0963160081 張家耀
            </span>
          </p>
          <Textarea
            rows={4}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="貼上客戶訊息..."
            className="font-mono text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              type="button"
              onClick={handleParsePaste}
              disabled={!pasteText.trim()}
            >
              解析並填入
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                setPasteText("");
                setPasteMatched(null);
              }}
              disabled={!pasteText && !pasteMatched}
            >
              清空
            </Button>
            {pasteMatched && pasteMatched.length > 0 && (
              <span className="text-xs text-green-700">
                ✓ 已填入: {pasteMatched.join("、")}
              </span>
            )}
            {pasteMatched && pasteMatched.length === 0 && (
              <span className="text-xs text-amber-700">
                未辨識到任何欄位,請手動輸入或檢查格式
              </span>
            )}
          </div>
        </div>
      )}

      {/* 客戶報修區 */}
      <div className={`rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5 ${readOnly ? "pointer-events-none opacity-60" : ""}`}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
          客戶報修資訊
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label>受理日期 *</Label>
            <Input
              type="date"
              value={draft.receivedDate}
              onChange={(e) => update("receivedDate", e.target.value)}
            />
          </div>
          <div>
            <Label>訂單編號</Label>
            <Input
              value={draft.relatedOrderNo}
              onChange={(e) => update("relatedOrderNo", e.target.value)}
              placeholder="例 P3705"
            />
          </div>
          <div>
            <Label>出貨日期</Label>
            <Input
              type="date"
              value={draft.shipmentDate}
              onChange={(e) => update("shipmentDate", e.target.value)}
            />
          </div>
          <div>
            <Label>主要聯絡人 *</Label>
            <Input
              value={draft.clientName}
              onChange={(e) => update("clientName", e.target.value)}
              placeholder="例 張三"
            />
          </div>
          <div>
            <Label>主要電話</Label>
            <Input
              value={draft.clientPhone}
              onChange={(e) => update("clientPhone", e.target.value)}
              placeholder="0912345678"
            />
          </div>
          <div />
          <div>
            <Label>次要聯絡人</Label>
            <Input
              value={draft.clientContact2}
              onChange={(e) => update("clientContact2", e.target.value)}
            />
          </div>
          <div>
            <Label>次要電話</Label>
            <Input
              value={draft.clientPhone2}
              onChange={(e) => update("clientPhone2", e.target.value)}
            />
          </div>
          <div />
          <div className="md:col-span-3">
            <Label>送貨地址</Label>
            <Input
              value={draft.deliveryAddress}
              onChange={(e) => update("deliveryAddress", e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>款式編號</Label>
            <Select value={draft.modelCode} onValueChange={handleModelChange}>
              <SelectTrigger>
                <SelectValue placeholder="選擇款式 (可選)" />
              </SelectTrigger>
              <SelectContent>
                {equipment.length === 0 && (
                  <div className="px-2 py-2 text-xs text-[var(--text-tertiary)]">
                    尚無設備型錄
                  </div>
                )}
                {equipment.map((e) => (
                  <SelectItem key={e.modelCode} value={e.modelCode}>
                    <span className="font-mono">{e.modelCode}</span>
                    {" — "}
                    {e.modelName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>款式名稱 (可自由輸入)</Label>
            <Input
              value={draft.modelNameSnapshot}
              onChange={(e) => update("modelNameSnapshot", e.target.value)}
              placeholder="選款式會自動帶入,也可手打"
            />
          </div>
        </div>

        <div className="mt-4">
          <Label>問題描述 *</Label>
          <Textarea
            rows={4}
            value={draft.issueDescription}
            onChange={(e) => update("issueDescription", e.target.value)}
            placeholder="例: 坐墊滑軌反應偏鬆"
          />
        </div>

        {/* 問題照片 */}
        <div className="mt-4">
          <Label>問題照片</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {draft.issuePhotos.map((url, idx) => (
              <div key={idx} className="relative h-24 w-24 overflow-hidden rounded-md border border-[var(--border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="問題照片" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto("issue", idx)}
                  className="absolute right-0 top-0 rounded-bl bg-red-500/80 p-0.5 text-white"
                  aria-label="移除"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => issuePhotoInputRef.current?.click()}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <ImagePlus className="h-5 w-5" />
              <span className="text-[10px]">加照片</span>
            </button>
            <input
              ref={issuePhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUploadPhoto(f, "issue");
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      {/* 派工區 */}
      <div className={`rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5 ${readOnly ? "pointer-events-none opacity-60" : ""}`}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
          派工 / 維修記錄
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label>狀態</Label>
            <Select
              value={draft.status}
              onValueChange={(v) => update("status", v as AfterSalesStatus)}
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
          <div>
            <Label>負責人</Label>
            <Select
              value={draft.assignedTo || "__unassigned__"}
              onValueChange={(v) => update("assignedTo", v === "__unassigned__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="選擇負責人" />
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
                {draft.assignedTo &&
                  !users.some((u) => u.displayName === draft.assignedTo) && (
                    <SelectItem value={draft.assignedTo}>
                      {draft.assignedTo}（舊資料）
                    </SelectItem>
                  )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>預定派工日期</Label>
            <Input
              type="date"
              value={draft.scheduledDate}
              onChange={(e) => update("scheduledDate", e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <Label>派工備註</Label>
            <Textarea
              rows={2}
              value={draft.dispatchNotes}
              onChange={(e) => update("dispatchNotes", e.target.value)}
              placeholder="例 約 1/23 下午 2:00 到府查修"
            />
          </div>
          <div>
            <Label>完工日期</Label>
            <Input
              type="date"
              value={draft.completedDate}
              onChange={(e) => update("completedDate", e.target.value)}
            />
          </div>
          <div className="md:col-span-2" />
          <div className="md:col-span-3">
            <Label>維修說明 (完工時填)</Label>
            <Textarea
              rows={3}
              value={draft.completionNotes}
              onChange={(e) => update("completionNotes", e.target.value)}
              placeholder="實際維修過程和結果"
            />
          </div>
        </div>

        {/* 完工照片 */}
        <div className="mt-4">
          <Label>完工照片</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {draft.completionPhotos.map((url, idx) => (
              <div key={idx} className="relative h-24 w-24 overflow-hidden rounded-md border border-[var(--border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="完工照片" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto("completion", idx)}
                  className="absolute right-0 top-0 rounded-bl bg-red-500/80 p-0.5 text-white"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => completionPhotoInputRef.current?.click()}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <ImagePlus className="h-5 w-5" />
              <span className="text-[10px]">加照片</span>
            </button>
            <input
              ref={completionPhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUploadPhoto(f, "completion");
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      {/* 聯繫紀錄 / 回應區 (只有 edit 模式才能用) */}
      {mode === "edit" && serviceId && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <MessageSquarePlus className="h-4 w-4" />
            聯繫紀錄 ({replies.length})
          </h2>

          {/* 發新訊息 */}
          <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
            <Textarea
              rows={2}
              value={newReplyContent}
              onChange={(e) => setNewReplyContent(e.target.value)}
              placeholder={`以 ${user?.displayName ?? "你"} 的身份留言...`}
              className="bg-white"
            />
            {newReplyAttachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {newReplyAttachments.map((url, idx) => (
                  <div key={idx} className="relative h-16 w-16 overflow-hidden rounded border border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="附件" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() =>
                        setNewReplyAttachments((prev) =>
                          prev.filter((_, i) => i !== idx),
                        )
                      }
                      className="absolute right-0 top-0 rounded-bl bg-red-500/80 p-0.5 text-white"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => replyPhotoInputRef.current?.click()}
              >
                <ImagePlus className="mr-1 h-3 w-3" />
                附圖
              </Button>
              <input
                ref={replyPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleReplyUpload(f);
                  e.target.value = "";
                }}
              />
              <Button onClick={handlePostReply} disabled={replySaving} size="sm">
                {replySaving ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Send className="mr-1 h-3 w-3" />
                )}
                送出
              </Button>
            </div>
          </div>

          {/* 時間軸 */}
          <div className="space-y-3">
            {replies.length === 0 && (
              <p className="text-center text-xs text-[var(--text-tertiary)]">
                尚無聯繫紀錄
              </p>
            )}
            {replies.map((r) => (
              <div
                key={r.replyId}
                className="rounded-md border border-[var(--border)] bg-white p-3"
              >
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {r.author}
                  </span>
                  <span className="text-[var(--text-tertiary)]">
                    {r.occurredAt.replace("T", " ").slice(0, 16)}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                  {r.content}
                </div>
                {r.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.attachments.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-16 w-16 overflow-hidden rounded border border-[var(--border)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="附件" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF 預覽 modal */}
      <PDFPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        pdfBlob={pdfBlob}
        fileName={meta ? buildAfterSalesPdfFileName({
          ...draft,
          serviceId: meta.serviceId,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          createdBy: meta.createdBy,
        } as AfterSalesService) : "售後服務單.pdf"}
        loading={pdfLoading}
      />
    </div>
  );
}
