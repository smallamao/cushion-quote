"use client";

import { useCallback, useState } from "react";
import { ImagePlus, Loader2, Plus, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
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

interface WorkorderTabProps {
  draft: CustomOrder;
  updateDraft: <K extends keyof CustomOrder>(key: K, value: CustomOrder[K]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  isDirty: boolean;
}

export function WorkorderTab({ draft, updateDraft, onSave, saving, isDirty }: WorkorderTabProps) {
  const [materialUploading, setMaterialUploading] = useState(false);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleGeneratePdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      const { generateWorkOrderPdfBlob } = await import("@/components/pdf/WorkOrderPDF");
      const blob = await generateWorkOrderPdfBlob({ order: draft });
      setPdfBlob(blob);
      setPdfOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PDF 生成失敗");
    } finally {
      setPdfLoading(false);
    }
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
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => void handleGeneratePdf()} disabled={pdfLoading}>
          {pdfLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              生成中...
            </>
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

      <PDFPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        pdfBlob={pdfBlob}
        fileName={`工單-${draft.orderNumber || draft.orderId}.pdf`}
        loading={pdfLoading}
      />
    </div>
  );
}
