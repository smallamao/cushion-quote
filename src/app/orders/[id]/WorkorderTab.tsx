"use client";

import { useCallback, useState } from "react";
import { ImagePlus, LayoutTemplate, Loader2, Plus, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import { ImageCropModal } from "@/components/pdf/ImageCropModal";
import { WorkOrderLayoutEditor } from "@/components/pdf/WorkOrderLayoutEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomOrder, OrderItem, OrderNote } from "@/lib/types";

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "圖片上傳失敗");
  return json.url;
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface WorkorderTabProps {
  draft: CustomOrder;
  updateDraft: <K extends keyof CustomOrder>(key: K, value: CustomOrder[K]) => void;
  /** 產生 PDF 後把最新網址／時間同步回父層的 order+draft（不影響「未儲存」狀態） */
  onWorkOrderPdfSaved: (url: string, updatedAt: string) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  isDirty: boolean;
}

export function WorkorderTab({
  draft,
  updateDraft,
  onWorkOrderPdfSaved,
  onSave,
  saving,
  isDirty,
}: WorkorderTabProps) {
  const [materialUploading, setMaterialUploading] = useState(false);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);

  // 產生後在背景上傳＋存回訂單記錄，取代舊工單；失敗不影響已顯示的預覽
  async function persistPdf(blob: Blob) {
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], `工單-${draft.orderNumber || draft.orderId}.pdf`, { type: "application/pdf" }));
      fd.append("folder", "work-order-pdfs");
      const upRes = await fetch("/api/upload", { method: "POST", body: fd });
      const upJson = (await upRes.json()) as { url?: string };
      if (!upRes.ok || !upJson.url) return;

      const patchRes = await fetch(`/api/sheets/orders/${draft.orderId}/workorder-pdf`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: upJson.url }),
      });
      const patchJson = (await patchRes.json()) as { ok: boolean; workOrderPdfUpdatedAt?: string };
      if (patchJson.ok) {
        onWorkOrderPdfSaved(upJson.url, patchJson.workOrderPdfUpdatedAt ?? new Date().toISOString());
      }
    } catch {
      // 非阻斷：預覽已可用，僅「已存工單」紀錄未更新
    }
  }

  async function generatePdfWithImage(imageUrl: string) {
    setPdfLoading(true);
    try {
      const orderForPdf = imageUrl !== draft.materialImageUrl
        ? { ...draft, materialImageUrl: imageUrl }
        : draft;
      const { generateWorkOrderPdfBlob } = await import("@/components/pdf/WorkOrderPDF");
      const blob = await generateWorkOrderPdfBlob({ order: orderForPdf });
      setPdfBlob(blob);
      setPdfOpen(true);
      void persistPdf(blob);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PDF 生成失敗");
    } finally {
      setPdfLoading(false);
    }
  }

  async function viewStoredPdf() {
    if (!draft.workOrderPdfUrl) return;
    setPdfLoading(true);
    try {
      const res = await fetch(draft.workOrderPdfUrl);
      if (!res.ok) throw new Error("讀取已存工單失敗");
      // Cloudinary raw 檔會回 octet-stream，iframe 無法預覽（會變成下載亂碼檔名的檔案）
      // → 一律強制標回 application/pdf
      const buf = await res.arrayBuffer();
      setPdfBlob(new Blob([buf], { type: "application/pdf" }));
      setPdfOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "讀取已存工單失敗");
    } finally {
      setPdfLoading(false);
    }
  }

  const handleGeneratePdf = useCallback(() => {
    if (draft.materialImageUrl) {
      setCropOpen(true);
    } else {
      void generatePdfWithImage("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
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
                  className="h-28 w-28 rounded border object-contain bg-[var(--bg-subtle)]"
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
                  {materialUploading ? "上傳中..." : "上傳圖片"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={materialUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setMaterialUploading(true);
                    try {
                      const url = await uploadFile(file);
                      updateDraft("materialImageUrl", url);
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "圖片上傳失敗");
                    } finally {
                      setMaterialUploading(false);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
              {materialUploading && (
                <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  上傳中...
                </span>
              )}
            </div>
          </div>

          {draft.materialImageUrl && !draft.photoLayout?.some((p) => p.kind === "swatch") && (
            <div className="mt-3 max-w-xs">
              <div className="flex items-center justify-between">
                <Label>工單色票大小</Label>
                <span className="text-xs text-[var(--text-secondary)]">
                  {Math.round((draft.materialImageScale ?? 1) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.3}
                step={0.05}
                value={draft.materialImageScale ?? 1}
                onChange={(e) => updateDraft("materialImageScale", Number(e.target.value))}
                className="mt-1 w-full accent-[var(--accent)]"
              />
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                調整工單 PDF 右上角色票圖的大小（不影響裁切，只改顯示尺寸）
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 品項清單 */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          品項清單
        </h3>
        <div className="space-y-3">
          {draft.items.map((item: OrderItem) => {
            const isHeader = item.itemType === "header";
            const updateItem = (patch: Partial<OrderItem>) =>
              updateDraft(
                "items",
                draft.items.map((it: OrderItem) =>
                  it.id === item.id ? { ...it, ...patch } : it,
                ),
              );
            return (
              <div
                key={item.id}
                className={
                  isHeader
                    ? "rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/20"
                    : "rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-3"
                }
              >
                {/* Type toggle row */}
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      updateItem({ itemType: isHeader ? "normal" : "header" })
                    }
                    className={
                      isHeader
                        ? "rounded border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                        : "rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
                    }
                  >
                    {isHeader ? "📌 標題列" : "品項"}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-red-500 hover:text-red-700"
                    onClick={() =>
                      updateDraft(
                        "items",
                        draft.items.filter((it: OrderItem) => it.id !== item.id),
                      )
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* Header: only name */}
                {isHeader ? (
                  <div>
                    <Label className="text-xs">標題文字</Label>
                    <Input
                      value={item.name}
                      onChange={(e) => updateItem({ name: e.target.value })}
                      placeholder="例：景美門市（中間車「周公」洗標）"
                      className="font-medium"
                    />
                  </div>
                ) : (
                  <>
                    {/* Normal item: name + colorCode */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-xs">名稱</Label>
                        <Input
                          value={item.name}
                          onChange={(e) => updateItem({ name: e.target.value })}
                          placeholder="品項名稱"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">色號（紅字）</Label>
                        <Input
                          value={item.colorCode ?? ""}
                          onChange={(e) =>
                            updateItem({ colorCode: e.target.value || undefined })
                          }
                          placeholder="1000-02"
                          className="text-red-600"
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <Label className="text-xs">尺寸／規格（可換行輸入多行）</Label>
                      <Textarea
                        value={item.dimensions}
                        onChange={(e) => updateItem({ dimensions: e.target.value })}
                        placeholder={"例：w96 x 176cm *5pcs\nw22 x 176cm *1pcs"}
                        rows={3}
                        className="resize-none text-sm"
                      />
                    </div>
                    <div className="mt-2">
                      <Label className="text-xs">數量</Label>
                      <Input
                        value={item.quantity}
                        onChange={(e) => updateItem({ quantity: e.target.value })}
                        placeholder="1pcs"
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-xs">泡棉規格</Label>
                        <Input
                          value={item.foamSpec}
                          onChange={(e) => updateItem({ foamSpec: e.target.value })}
                          placeholder="例：0.08 黑硬Q"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">規格色</Label>
                        <Select
                          value={item.foamColor ?? "none"}
                          onValueChange={(v) =>
                            updateItem({
                              foamColor: (v === "none" ? null : v) as OrderItem["foamColor"],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="無" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">無</SelectItem>
                            <SelectItem value="orange">橘</SelectItem>
                            <SelectItem value="red">紅</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* Per-item photos (up to 4) */}
                    <div className="mt-2">
                      <Label className="text-xs">色票照片（最多 4 張）</Label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(item.photos ?? []).map((url, idx) => (
                          <div key={idx} className="relative">
                            <img
                              src={url}
                              alt=""
                              className="h-20 w-32 rounded border object-contain bg-[var(--bg-subtle)]"
                            />
                            <button
                              type="button"
                              className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white shadow"
                              onClick={() =>
                                updateItem({
                                  photos: (item.photos ?? []).filter((_, i) => i !== idx),
                                })
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {(item.photos?.length ?? 0) < 4 ? (
                          <label className="cursor-pointer">
                            <span className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs hover:bg-[var(--bg-hover)]">
                              <ImagePlus className="h-3 w-3" />
                              上傳照片
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const url = await uploadFile(file);
                                  updateItem({ photos: [...(item.photos ?? []), url] });
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : "圖片上傳失敗");
                                } finally {
                                  e.target.value = "";
                                }
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>
                    {/* Per-item sub-note */}
                    <div className="mt-2">
                      <Label className="text-xs">品項備注</Label>
                      <Input
                        value={item.subNote ?? ""}
                        onChange={(e) =>
                          updateItem({ subNote: e.target.value || undefined })
                        }
                        placeholder="例：壁面完成面高度249cm（已扣地板厚度7mm）"
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newHeader: OrderItem = {
                id: crypto.randomUUID(),
                name: "",
                dimensions: "",
                quantity: "",
                foamSpec: "",
                foamColor: null,
                itemType: "header",
              };
              updateDraft("items", [...draft.items, newHeader]);
            }}
          >
            <Plus className="mr-1 h-3 w-3" />
            新增標題行
          </Button>
        </div>
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
            {draft.photos.map((url: string) => (
              <div key={url} className="relative">
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
                      draft.photos.filter((p: string) => p !== url),
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
            {photosUploading ? "上傳中..." : "上傳附圖"}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={photosUploading}
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length === 0) return;
              setPhotosUploading(true);
              try {
                const urls = await Promise.all(files.map(uploadFile));
                updateDraft("photos", [...draft.photos, ...urls]);
              } catch (err) {
                alert(err instanceof Error ? err.message : "圖片上傳失敗");
              } finally {
                setPhotosUploading(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        {photosUploading && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            上傳中...
          </span>
        )}
      </div>

      {/* 儲存按鈕 */}
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setLayoutOpen(true)}
            disabled={
              draft.photos.length === 0 &&
              !draft.materialImageUrl &&
              !draft.items.some((it) => (it.photos ?? []).length > 0)
            }
            title={
              draft.photos.length === 0 &&
              !draft.materialImageUrl &&
              !draft.items.some((it) => (it.photos ?? []).length > 0)
                ? "請先上傳現場照片、材料圖片或品項色票照片"
                : "拖拉調整照片/色票位置大小旋轉，並可調文字大小"
            }
          >
            <LayoutTemplate className="mr-1 h-4 w-4" />
            版面編輯
            {(draft.photoLayout?.length ?? 0) > 0 && (
              <span className="ml-1 text-xs text-[var(--accent)]">●</span>
            )}
          </Button>
          {draft.workOrderPdfUrl && (
            <Button
              variant="outline"
              onClick={() => void viewStoredPdf()}
              disabled={pdfLoading}
              title="開啟上次產生的工單，不重新生成"
            >
              📄 查看工單 PDF
            </Button>
          )}
          <Button variant="outline" onClick={() => void handleGeneratePdf()} disabled={pdfLoading}>
            {pdfLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : draft.workOrderPdfUrl ? (
              "🔄 重新產生並取代"
            ) : (
              "📄 產生施工工單 PDF"
            )}
          </Button>
          <Button onClick={() => void onSave()} disabled={saving || !isDirty}>
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            儲存變更
          </Button>
        </div>
        {draft.workOrderPdfUpdatedAt && (
          <p className="text-xs text-[var(--text-tertiary)]">
            最後產生：{fmtDateTime(draft.workOrderPdfUpdatedAt)}
          </p>
        )}
      </div>

      <PDFPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        pdfBlob={pdfBlob}
        fileName={`工單-${draft.orderNumber || draft.orderId}.pdf`}
        loading={pdfLoading}
      />

      {draft.materialImageUrl && (
        <ImageCropModal
          open={cropOpen}
          imageSrc={draft.materialImageUrl}
          onClose={() => setCropOpen(false)}
          onConfirm={(cropped) => {
            setCropOpen(false);
            void generatePdfWithImage(cropped);
          }}
        />
      )}

      <WorkOrderLayoutEditor
        open={layoutOpen}
        order={draft}
        onClose={() => setLayoutOpen(false)}
        onSave={(layout, fontScale) => {
          updateDraft("photoLayout", layout);
          updateDraft("fontScale", fontScale);
          setLayoutOpen(false);
        }}
        onReplaceImage={(target, newUrl) => {
          if (target.kind === "swatch") {
            updateDraft("materialImageUrl", newUrl);
            return;
          }
          if (target.kind === "itemPhoto") {
            updateDraft(
              "items",
              draft.items.map((it) => ({
                ...it,
                photos: (it.photos ?? []).map((u) => (u === target.url ? newUrl : u)),
              })),
            );
          } else {
            updateDraft("photos", draft.photos.map((u) => (u === target.url ? newUrl : u)));
          }
          // 已存版面若引用舊網址，一併換新，避免取消儲存版面時對不上
          updateDraft(
            "photoLayout",
            (draft.photoLayout ?? []).map((p) => (p.url === target.url ? { ...p, url: newUrl } : p)),
          );
        }}
      />
    </div>
  );
}
