"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCw, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ImageCropModal } from "@/components/pdf/ImageCropModal";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CustomOrder, WorkOrderPhotoLayoutItem } from "@/lib/types";

// A4 page size in pt — must match WorkOrderPDF page coordinates
const A4_W = 595;
const A4_H = 842;
// 畫布顯示寬（px）；scale = CANVAS_W / A4_W
const CANVAS_W = 460;
const SCALE = CANVAS_W / A4_W;
const MIN_SIZE_PT = 40;
// 對齊吸附範圍（pt）：物件中心距頁面中心／其他物件中心小於此值就吸附
const SNAP_PT = 6;

interface Props {
  open: boolean;
  order: CustomOrder;
  onClose: () => void;
  /** layout 空陣列＝重設為自動排版；fontScale 一併儲存 */
  onSave: (layout: WorkOrderPhotoLayoutItem[], fontScale: number) => void;
  /** 在編輯器內裁切後，新圖網址回寫給父層（swatch → materialImageUrl；photo → photos[]；itemPhoto → items[].photos） */
  onReplaceImage: (
    target: { kind: "photo" | "swatch" | "itemPhoto"; url: string },
    newUrl: string,
  ) => void;
}

// 把裁切輸出的 dataURL 上傳成正式網址（Sheets 儲存格放不下 base64）
async function uploadDataUrl(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const fd = new FormData();
  fd.append("file", new File([blob], `crop-${Date.now()}.jpg`, { type: "image/jpeg" }));
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "圖片上傳失敗");
  return json.url;
}

type GestureMode = "move" | "resize" | "rotate";

interface Gesture {
  mode: GestureMode;
  idx: number;
  startX: number;
  startY: number;
  orig: WorkOrderPhotoLayoutItem;
  /** 垂直／水平吸附目標（中心座標，pt）：頁面中心＋其他物件中心 */
  snapV: number[];
  snapH: number[];
}

// 預設把照片排在頁面下半部（使用者本來就會再拖）
function defaultPhotoItem(url: string, idx: number): WorkOrderPhotoLayoutItem {
  return {
    url,
    x: 28 + (idx % 2) * 270,
    y: 460 + Math.floor(idx / 2) * 210,
    w: 260,
    h: 195,
    rotation: 0,
    kind: "photo",
  };
}

// 色票預設位置＝目前 PDF 的右上角位置與大小
function defaultSwatchItem(order: CustomOrder): WorkOrderPhotoLayoutItem {
  const k = Math.min(Math.max(order.materialImageScale ?? 1, 0.6), 1.3);
  const w = Math.round(180 * k);
  const h = Math.round(135 * k);
  return { url: "swatch", x: A4_W - 28 - w, y: 39, w, h, rotation: 0, kind: "swatch" };
}

// 品項色票照片預設排在頁面中段一列（原本內嵌在品項下方，抽出後可自由拖拉）
function defaultItemPhotoItem(url: string, idx: number): WorkOrderPhotoLayoutItem {
  return {
    url,
    x: 28 + (idx % 4) * 130,
    y: 330 + Math.floor(idx / 4) * 100,
    w: 120,
    h: 86,
    rotation: 0,
    kind: "itemPhoto",
  };
}

export function WorkOrderLayoutEditor({ open, order, onClose, onSave, onReplaceImage }: Props) {
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgLoading, setBgLoading] = useState(false);
  const [items, setItems] = useState<WorkOrderPhotoLayoutItem[]>([]);
  const [fontScale, setFontScale] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [cropIdx, setCropIdx] = useState<number | null>(null);
  const [cropSaving, setCropSaving] = useState(false);
  // 拖曳吸附時顯示的對齊輔助線（pt 座標；null＝不顯示）
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });
  const gestureRef = useRef<Gesture | null>(null);
  const bgUrlRef = useRef<string | null>(null);
  const bgSeqRef = useRef(0);

  // 產生純文字底圖（照片/色票都抽掉，由拖拉層呈現）
  async function renderBg(scale: number) {
    const seq = ++bgSeqRef.current;
    setBgLoading(true);
    try {
      const { generateWorkOrderJpgBlob } = await import("@/components/pdf/WorkOrderPDF");
      const blob = await generateWorkOrderJpgBlob(
        {
          order: {
            ...order,
            photos: [],
            photoLayout: [],
            materialImageUrl: "",
            // 品項色票照片也抽掉（由拖拉層呈現），底圖只剩純文字
            items: order.items.map((it) => ({ ...it, photos: [] })),
            fontScale: scale,
          },
        },
        { scale: 1.5, quality: 0.85 },
      );
      if (seq !== bgSeqRef.current) return; // 已有更新的重繪請求
      if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
      bgUrlRef.current = URL.createObjectURL(blob);
      setBgUrl(bgUrlRef.current);
    } catch {
      if (seq === bgSeqRef.current) setBgUrl(null); // 底圖失敗仍可編輯（白底）
    } finally {
      if (seq === bgSeqRef.current) setBgLoading(false);
    }
  }

  // 開啟時：初始化項目（色票＋照片；沿用已存版面，缺的補預設位置）與底圖
  useEffect(() => {
    if (!open) return;
    const existing = order.photoLayout ?? [];
    const photos = order.photos.slice(0, 6);
    const photoItems = photos.map(
      (url, i) =>
        existing.find((p) => (p.kind === "photo" || !p.kind) && p.url === url) ??
        defaultPhotoItem(url, i),
    );
    // 品項色票照片：每個品項最多 4 張，全部納入自由排版（同網址出現在多個品項時只排一張）
    const itemPhotoUrls = [
      ...new Set(order.items.flatMap((it) => (it.photos ?? []).slice(0, 4))),
    ];
    const itemPhotoItems = itemPhotoUrls.map(
      (url, i) =>
        existing.find((p) => p.kind === "itemPhoto" && p.url === url) ??
        defaultItemPhotoItem(url, i),
    );
    const swatchItems = order.materialImageUrl
      ? [existing.find((p) => p.kind === "swatch") ?? defaultSwatchItem(order)]
      : [];
    setItems([...swatchItems, ...photoItems, ...itemPhotoItems]);
    // fontScale：1 = 預設（PDF 基準已含 130% 放大），拉桿範圍 0.7~1.2
    const initialScale = Math.min(Math.max(order.fontScale ?? 1, 0.7), 1.2);
    setFontScale(initialScale);
    setSelected(null);
    void renderBg(initialScale);
    return () => {
      bgSeqRef.current++;
      if (bgUrlRef.current) { URL.revokeObjectURL(bgUrlRef.current); bgUrlRef.current = null; }
      setBgUrl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 文字大小改變 → 防抖重繪底圖
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void renderBg(fontScale), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontScale]);

  // 手勢進行中：掛在 window 上，拖出畫布也不會中斷
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g) return;
      const dxPt = (e.clientX - g.startX) / SCALE;
      const dyPt = (e.clientY - g.startY) / SCALE;
      if (g.mode === "move") {
        let x = Math.min(Math.max(g.orig.x + dxPt, -g.orig.w / 2), A4_W - g.orig.w / 2);
        let y = Math.min(Math.max(g.orig.y + dyPt, -g.orig.h / 2), A4_H - g.orig.h / 2);
        // Keynote 式吸附：物件中心靠近吸附目標 → 貼齊並顯示輔助線（取最近者）
        let gv: number | null = null;
        let gh: number | null = null;
        let bestV = SNAP_PT;
        let bestH = SNAP_PT;
        for (const t of g.snapV) {
          const d = Math.abs(x + g.orig.w / 2 - t);
          if (d < bestV) { bestV = d; gv = t; }
        }
        for (const t of g.snapH) {
          const d = Math.abs(y + g.orig.h / 2 - t);
          if (d < bestH) { bestH = d; gh = t; }
        }
        if (gv !== null) x = gv - g.orig.w / 2;
        if (gh !== null) y = gh - g.orig.h / 2;
        setGuides({ v: gv, h: gh });
        setItems((prev) => prev.map((it, i) => (i === g.idx ? { ...it, x, y } : it)));
        return;
      }
      setItems((prev) =>
        prev.map((it, i) => {
          if (i !== g.idx) return it;
          if (g.mode === "resize") {
            return {
              ...it,
              w: Math.max(g.orig.w + dxPt, MIN_SIZE_PT),
              h: Math.max(g.orig.h + dyPt, MIN_SIZE_PT),
            };
          }
          // rotate：以方塊中心為圓心，把手在上方（-90°）
          const el = document.getElementById("wo-layout-canvas");
          if (!el) return it;
          const rect = el.getBoundingClientRect();
          const cx = rect.left + (g.orig.x + g.orig.w / 2) * SCALE;
          const cy = rect.top + (g.orig.y + g.orig.h / 2) * SCALE;
          let deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
          // 靠近 0/±90/180 時吸附
          for (const snap of [-180, -90, 0, 90, 180]) {
            if (Math.abs(deg - snap) < 5) { deg = snap; break; }
          }
          return { ...it, rotation: Math.round(deg) };
        }),
      );
    }
    function onUp() {
      gestureRef.current = null;
      setGuides({ v: null, h: null });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function startGesture(mode: GestureMode, idx: number, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSelected(idx);
    const others = items.filter((_, j) => j !== idx);
    gestureRef.current = {
      mode,
      idx,
      startX: e.clientX,
      startY: e.clientY,
      orig: items[idx],
      snapV: [A4_W / 2, ...others.map((o) => o.x + o.w / 2)],
      snapH: [A4_H / 2, ...others.map((o) => o.y + o.h / 2)],
    };
  }

  /** 讀取 dataURL 的實際像素尺寸（用來讓版面框跟上新的裁切比例） */
  function readImageSize(src: string): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // 裁切完成：dataURL 上傳成正式網址 → 回寫父層（並同步本地照片項目的 url）
  // 同時依新圖比例重算版面框高度（以框中心為錨），否則 16:9 的裁切結果會被硬塞回
  // 原本 4:3 的框裡——照片被 cover 再裁一次、色票被 contain 留黑邊，裁切等於白做。
  async function handleCropConfirm(result: string) {
    if (cropIdx === null) return;
    const it = items[cropIdx];
    const originalSrc = it.kind === "swatch" ? order.materialImageUrl : it.url;
    if (result === originalSrc) { setCropIdx(null); return; } // 未變更
    setCropSaving(true);
    try {
      const [newUrl, size] = await Promise.all([uploadDataUrl(result), readImageSize(result)]);
      onReplaceImage({ kind: it.kind ?? "photo", url: originalSrc }, newUrl);
      setItems((prev) =>
        prev.map((p, i) => {
          if (i !== cropIdx) return p;
          const next = it.kind === "swatch" ? { ...p } : { ...p, url: newUrl };
          if (size && size.w > 0 && size.h > 0) {
            const newH = Math.round((p.w * size.h) / size.w);
            const cy = p.y + p.h / 2;
            next.h = newH;
            next.y = Math.max(0, Math.round(cy - newH / 2));
          }
          return next;
        }),
      );
      setCropIdx(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "裁切上傳失敗");
    } finally {
      setCropSaving(false);
    }
  }

  function handleSave() {
    onSave(
      items.map((it) => ({
        url: it.kind === "swatch" ? "swatch" : it.url,
        x: Math.round(it.x),
        y: Math.round(it.y),
        w: Math.round(it.w),
        h: Math.round(it.h),
        rotation: Math.round(it.rotation),
        kind: it.kind ?? "photo",
      })),
      fontScale,
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>工單版面編輯</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-[var(--text-tertiary)]">
          拖拉移動照片／色票；右下角控制點縮放；上方圓點旋轉。靠近頁面或其他圖片中心會自動吸附對齊（黃線）。
        </p>

        {/* 文字大小 */}
        <div className="flex items-center gap-3 px-1">
          <span className="w-14 shrink-0 text-xs text-[var(--text-tertiary)]">文字大小</span>
          <Slider
            min={0.7}
            max={1.2}
            step={0.05}
            value={[fontScale]}
            onValueChange={([v]) => setFontScale(v)}
            className="flex-1"
          />
          <span className="w-10 shrink-0 text-right text-xs text-[var(--text-tertiary)]">
            {Math.round(fontScale * 100)}%
          </span>
        </div>

        <div className="max-h-[68vh] overflow-auto rounded border border-[var(--border)]">
          <div
            id="wo-layout-canvas"
            className="relative bg-white"
            style={{ width: CANVAS_W, height: Math.round(A4_H * SCALE) }}
            onPointerDown={() => setSelected(null)}
          >
            {bgUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bgUrl}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full select-none"
              />
            )}
            {bgLoading && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/60">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
              </div>
            )}

            {/* Keynote 式對齊輔助線（吸附中才顯示） */}
            {guides.v !== null && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-[25] w-px bg-amber-400"
                style={{ left: guides.v * SCALE }}
              />
            )}
            {guides.h !== null && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-[25] h-px bg-amber-400"
                style={{ top: guides.h * SCALE }}
              />
            )}

            {items.map((it, i) => {
              const isSel = selected === i;
              const isSwatch = it.kind === "swatch";
              const isItemPhoto = it.kind === "itemPhoto";
              const src = isSwatch ? order.materialImageUrl : it.url;
              return (
                <div
                  key={isSwatch ? "swatch" : `${it.url}-${i}`}
                  className={`absolute cursor-move ${isSel ? "z-20" : "z-10"}`}
                  style={{
                    left: it.x * SCALE,
                    top: it.y * SCALE,
                    width: it.w * SCALE,
                    height: it.h * SCALE,
                    transform: `rotate(${it.rotation}deg)`,
                  }}
                  onPointerDown={(e) => startGesture("move", i, e)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    className={`h-full w-full select-none ${
                      isSwatch || isItemPhoto ? "object-contain bg-white" : "object-cover"
                    } ${isSel ? "ring-2 ring-[var(--accent)]" : "ring-1 ring-black/20"}`}
                  />
                  {isSwatch && (
                    <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-black/60 px-1 text-[9px] text-white">
                      色票
                    </span>
                  )}
                  {isItemPhoto && (
                    <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-black/60 px-1 text-[9px] text-white">
                      品項
                    </span>
                  )}
                  {isSel && (
                    <>
                      {/* 旋轉把手 */}
                      <div
                        className="absolute left-1/2 -top-7 flex h-5 w-5 -translate-x-1/2 cursor-grab items-center justify-center rounded-full bg-[var(--accent)] text-white shadow"
                        onPointerDown={(e) => startGesture("rotate", i, e)}
                      >
                        <RotateCw className="h-3 w-3" />
                      </div>
                      {/* 裁切按鈕 */}
                      <button
                        type="button"
                        className="absolute -top-7 left-1/2 -ml-11 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white shadow hover:bg-black"
                        title="裁切這張圖"
                        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onClick={(e) => { e.stopPropagation(); setCropIdx(i); }}
                      >
                        <Scissors className="h-3 w-3" />
                      </button>
                      <div className="pointer-events-none absolute left-1/2 -top-2.5 h-2.5 w-px -translate-x-1/2 bg-[var(--accent)]" />
                      {/* 右下縮放控制點 */}
                      <div
                        className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white bg-[var(--accent)] shadow"
                        onPointerDown={(e) => startGesture("resize", i, e)}
                      />
                      {/* 角度顯示 */}
                      {it.rotation !== 0 && (
                        <span className="absolute -top-7 left-1/2 ml-4 rounded bg-black/70 px-1 text-[10px] text-white">
                          {it.rotation}°
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onSave([], fontScale)}
            title="清除自訂版面，照片與色票回到自動排版（文字大小保留）"
          >
            重設為自動排版
          </Button>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave}>儲存版面</Button>
        </DialogFooter>

        {/* 選取項目的裁切（裁完自動上傳並取代原圖） */}
        {cropIdx !== null && items[cropIdx] && (
          <ImageCropModal
            open
            imageSrc={items[cropIdx].kind === "swatch" ? order.materialImageUrl : items[cropIdx].url}
            onClose={() => { if (!cropSaving) setCropIdx(null); }}
            onConfirm={(result) => void handleCropConfirm(result)}
          />
        )}
        {cropSaving && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-black/30">
            <span className="flex items-center gap-2 rounded bg-white px-3 py-2 text-sm shadow">
              <Loader2 className="h-4 w-4 animate-spin" /> 裁切上傳中…
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
