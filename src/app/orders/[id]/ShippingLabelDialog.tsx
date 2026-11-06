"use client";

import { Loader2, Minus, Plus, Printer } from "lucide-react";
import { useState } from "react";

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
import {
  defaultLabelCopies,
  defaultLabelLines,
  type LabelLines,
} from "@/lib/shipping-label";
import type { CustomOrder } from "@/lib/types";

const MAX_COPIES = 50;

/**
 * 出貨標籤：三行預設從訂單帶入，印之前可以臨時改（改的字不存回訂單）；
 * 張數預設＝訂單「出貨包數」。取代 Keynote 手改底稿（老闆 2026-11-06）。
 */
export function ShippingLabelDialog({
  order,
  open,
  onOpenChange,
}: {
  order: CustomOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // 每次打開都重新從訂單帶預設值（上次臨時改的字不殘留）
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && <LabelForm order={order} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function LabelForm({ order, onDone }: { order: CustomOrder; onDone: () => void }) {
  const [lines, setLines] = useState<LabelLines>(() => defaultLabelLines(order));
  const [copies, setCopies] = useState(() => defaultLabelCopies(order));
  // 輸入框自己的文字：打字中允許暫時清空，離開欄位才校正成 1~50
  const [copiesText, setCopiesText] = useState(() => String(defaultLabelCopies(order)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setLine = (key: keyof LabelLines, value: string) =>
    setLines((prev) => ({ ...prev, [key]: value }));
  const clampCopies = (n: number) => Math.min(MAX_COPIES, Math.max(1, Math.floor(n) || 1));
  const applyCopies = (n: number) => {
    const v = clampCopies(n);
    setCopies(v);
    setCopiesText(String(v));
  };

  async function handleDownload() {
    setBusy(true);
    setError("");
    try {
      const { generateShippingLabelPdfBlob } = await import("@/components/pdf/ShippingLabelPDF");
      const blob = await generateShippingLabelPdfBlob(lines, copies);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `出貨標籤-${(order.clientPoNumber || order.orderNumber || order.orderId).trim()}-${copies}張.pdf`;
      // 掛上 DOM 再點、延後釋放網址：Safari 同步 revoke 會中斷下載
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "標籤產生失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>出貨標籤</DialogTitle>
        <DialogDescription>
          內容從訂單自動帶入，可以直接改；改的字只用在這次列印，不會存回訂單。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div>
          <Label className="text-xs">第一行（單號／門市）</Label>
          <Input value={lines.line1} onChange={(e) => setLine("line1", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">第二行（品名）</Label>
          <Input value={lines.line2} onChange={(e) => setLine("line2", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">第三行（面料，紅字）</Label>
          <Input
            value={lines.line3}
            onChange={(e) => setLine("line3", e.target.value)}
            className="text-[#FF2600]"
          />
        </div>

        <div>
          <Label className="text-xs">張數</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              disabled={copies <= 1}
              onClick={() => applyCopies(copies - 1)}
              aria-label="少一張"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              min={1}
              max={MAX_COPIES}
              value={copiesText}
              onChange={(e) => {
                setCopiesText(e.target.value);
                const n = Math.floor(Number(e.target.value));
                if (n >= 1 && n <= MAX_COPIES) setCopies(n);
              }}
              onBlur={() => applyCopies(Number(copiesText))}
              className="h-8 w-16 text-center"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              disabled={copies >= MAX_COPIES}
              onClick={() => applyCopies(copies + 1)}
              aria-label="多一張"
            >
              <Plus className="h-3 w-3" />
            </Button>
            <span className="text-xs text-[var(--text-tertiary)]">
              {order.packageCount ? `訂單出貨包數 ${order.packageCount}` : "訂單沒填出貨包數，預設 1 張"}
            </span>
          </div>
        </div>

        {/* 預覽：跟印出來的三行同樣排法 */}
        <div className="rounded border-[3px] border-black px-3 py-3 text-center leading-relaxed">
          <div className="text-lg font-bold">{lines.line1 || "　"}</div>
          <div className="text-base">{lines.line2 || "　"}</div>
          <div className="text-base text-[#FF2600]">
            <span className="border-b-2 border-[#FF2600]">{lines.line3 || "　"}</span>
          </div>
        </div>

        {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>
          取消
        </Button>
        <Button onClick={() => void handleDownload()} disabled={busy || !lines.line1.trim()}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />}
          下載 PDF（{copies} 張）
        </Button>
      </DialogFooter>
    </>
  );
}
