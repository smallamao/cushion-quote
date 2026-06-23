"use client";

import { useCallback, useState } from "react";
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

async function extractCrop(imageSrc: string, pixelCrop: Area): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas ctx")); return; }
      ctx.drawImage(
        img,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, pixelCrop.width, pixelCrop.height,
      );
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = reject;
    img.src = imageSrc;
  });
}

export function ImageCropModal({ open, imageSrc, onClose, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [aspectIndex, setAspectIndex] = useState(0); // 0 = 自由

  const aspect = ASPECT_PRESETS[aspectIndex].value;

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const dataUrl = await extractCrop(imageSrc, croppedAreaPixels);
      onConfirm(dataUrl);
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
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
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

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onConfirm(imageSrc)} disabled={processing}>
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
