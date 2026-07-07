"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

interface Props {
  open: boolean;
  imageSrc: string;
  onClose: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

const ASPECT_PRESETS = [
  { label: "自由", value: undefined },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
] as const;

function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// 旋轉後的邊界框尺寸
function rotatedBox(width: number, height: number, rotation: number) {
  const rad = toRad(rotation);
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

// 將整張圖依角度畫到符合旋轉後邊界框的畫布
function drawRotated(image: HTMLImageElement, rotation: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas ctx");
  const { width: bw, height: bh } = rotatedBox(image.width, image.height, rotation);
  canvas.width = bw;
  canvas.height = bh;
  ctx.translate(bw / 2, bh / 2);
  ctx.rotate(toRad(rotation));
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);
  return canvas;
}

// 依 react-easy-crop 的旋轉座標系裁切（croppedAreaPixels 是相對旋轉後邊界框）
async function extractCrop(imageSrc: string, pixelCrop: Area, rotation: number): Promise<string> {
  const image = await createImage(imageSrc);
  const rotated = drawRotated(image, rotation);
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas ctx");
  ctx.drawImage(
    rotated,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height,
  );
  return canvas.toDataURL("image/jpeg", 0.92);
}

// 只旋轉、不裁切
async function rotateOnly(imageSrc: string, rotation: number): Promise<string> {
  const image = await createImage(imageSrc);
  return drawRotated(image, rotation).toDataURL("image/jpeg", 0.92);
}

// 正規化角度到 [-180, 180)
function normalizeDeg(deg: number): number {
  let x = ((deg % 360) + 360) % 360;
  if (x >= 180) x -= 360;
  return x;
}

export function ImageCropModal({ open, imageSrc, onClose, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [aspectIndex, setAspectIndex] = useState(0); // 0 = 自由

  const aspect = ASPECT_PRESETS[aspectIndex].value;

  // 每次開啟或換圖時重置縮放/位置/旋轉，避免沿用上一張的設定
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    }
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const dataUrl = await extractCrop(imageSrc, croppedAreaPixels, rotation);
      onConfirm(dataUrl);
    } catch {
      onConfirm(imageSrc);
    } finally {
      setProcessing(false);
    }
  }

  // 不裁切：無旋轉時直接用原圖；有旋轉時輸出整張旋轉後的圖，避免丟失旋轉
  async function handleUseWithoutCrop() {
    if (rotation % 360 === 0) {
      onConfirm(imageSrc);
      return;
    }
    setProcessing(true);
    try {
      onConfirm(await rotateOnly(imageSrc, rotation));
    } catch {
      onConfirm(imageSrc);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>調整材料圖片裁切範圍</DialogTitle>
        </DialogHeader>

        {/* Aspect ratio presets */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-tertiary)] mr-1">比例</span>
          {ASPECT_PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setAspectIndex(i); setCrop({ x: 0, y: 0 }); }}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                aspectIndex === i
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Crop area */}
        <div className="relative h-72 w-full overflow-hidden rounded-md bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-[var(--text-tertiary)] w-8">縮放</span>
          <Slider
            min={1}
            max={3}
            step={0.05}
            value={[zoom]}
            onValueChange={([v]) => setZoom(v)}
            className="flex-1"
          />
          <span className="text-xs text-[var(--text-tertiary)] w-8 text-right">
            {zoom.toFixed(1)}×
          </span>
        </div>

        {/* Rotation */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-[var(--text-tertiary)] w-8">旋轉</span>
          <button
            type="button"
            onClick={() => setRotation((r) => normalizeDeg(r - 90))}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            title="逆時針 90°"
          >
            ⟲ 90°
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => normalizeDeg(r + 90))}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            title="順時針 90°"
          >
            ⟳ 90°
          </button>
          <Slider
            min={-180}
            max={180}
            step={1}
            value={[rotation]}
            onValueChange={([v]) => setRotation(v)}
            className="flex-1"
          />
          <span className="text-xs text-[var(--text-tertiary)] w-9 text-right">
            {Math.round(rotation)}°
          </span>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleUseWithoutCrop} disabled={processing}>
            不裁切，直接使用
          </Button>
          <Button variant="outline" onClick={onClose} disabled={processing}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={processing}>
            {processing ? "處理中…" : "確認裁切"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
