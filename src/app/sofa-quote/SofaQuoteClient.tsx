"use client";

import { useState, useMemo } from "react";
import { Minus, Plus } from "lucide-react";
import {
  SOFA_PRODUCTS,
  MATERIAL_GRADES,
  getBasePrice,
  calcWidthAdjustment,
  buildQuoteOutput,
  fmtAmount,
  type SofaProduct,
  type MaterialGrade,
} from "@/lib/sofa-quote-data";
import { MessageResultModal } from "@/components/sofa/MessageResultModal";

// ─── Action Sheet Picker ──────────────────────────────────────────────────────

function ActionSheetPicker<T>({
  open, title, options, getLabel, onSelect, onClose,
}: {
  open: boolean; title: string; options: T[];
  getLabel: (item: T) => string;
  onSelect: (item: T, idx: number) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-[var(--bg-elevated)]">
        <p className="py-3 text-center text-xs text-[var(--text-secondary)]">{title}</p>
        <div className="max-h-[60dvh] overflow-y-auto divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {options.map((item, idx) => (
            <button key={idx} onClick={() => { onSelect(item, idx); onClose(); }}
              className="w-full py-3.5 text-base font-medium text-[var(--accent)]">
              {getLabel(item)}
            </button>
          ))}
        </div>
        <div className="border-t-8 border-[var(--bg-subtle)]">
          <button onClick={onClose} className="w-full py-3.5 text-base font-medium text-[var(--accent)]">
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── L-shape Diagram ─────────────────────────────────────────────────────────

type FaceDir = "面右" | "面左" | "整座";

function LShapeDiagram({ dir, seatCount }: { dir: FaceDir; seatCount: number }) {
  const seats = Array.from({ length: seatCount });
  const cell = "flex-1 border border-[var(--border)] bg-[var(--bg-subtle)] rounded-sm";
  const platform = "w-12 border border-[var(--accent)]/40 bg-[var(--accent)]/10 rounded-sm";

  if (dir === "整座") {
    return (
      <div className="flex h-10 gap-0.5">
        {seats.map((_, i) => <div key={i} className={cell} />)}
      </div>
    );
  }

  const faceRight = dir === "面右";
  return (
    <div className={`flex gap-2 ${faceRight ? "flex-row" : "flex-row-reverse"}`}>
      {/* Main L3 section */}
      <div className="flex flex-col gap-0.5 flex-1">
        <div className="flex h-10 gap-0.5">
          {seats.map((_, i) => <div key={i} className={cell} />)}
        </div>
      </div>
      {/* L1 + platform */}
      <div className="flex flex-col gap-0.5">
        <div className={`h-10 ${platform}`} />
        <div className={`h-8 ${platform}`} />
      </div>
    </div>
  );
}

// ─── Platform Fee ──────────────────────────────────────────────────────────

function calcPlatformFee(diffCm: number, rate: number): number {
  if (diffCm === 0) return 0;
  if (diffCm < 0) return 500;        // reduction: one-time fixed $500
  return Math.round((rate / 2) * diffCm); // enlargement: (rate/2) × cm
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SofaQuoteClient() {
  const [productIdx, setProductIdx] = useState(0);
  const [gradeIdx, setGradeIdx] = useState(0);
  const [inputWidth, setInputWidth] = useState<number>(SOFA_PRODUCTS[0].width);
  const [seatCount, setSeatCount] = useState(SOFA_PRODUCTS[0].defaultSeat);
  const [faceDir, setFaceDir] = useState<FaceDir>("面右");

  // Platform overrides (null = default from product)
  const [platformW, setPlatformW] = useState<number | null>(null);
  const [platformH, setPlatformH] = useState<number | null>(null);

  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showGradePicker, setShowGradePicker] = useState(false);
  const [modal, setModal] = useState<{ detail: string; copy: string } | null>(null);

  const product: SofaProduct = SOFA_PRODUCTS[productIdx];
  const grade: MaterialGrade = MATERIAL_GRADES[gradeIdx];
  const basePrice = getBasePrice(product.displayName, grade.id);

  const [defaultPW, defaultPH] = product.footSeatSize
    ? product.footSeatSize.split("x").map(Number)
    : [null, null];
  const effectivePW = platformW ?? defaultPW;
  const effectivePH = platformH ?? defaultPH;
  const diffPW = defaultPW != null && effectivePW != null ? effectivePW - defaultPW : 0;
  const diffPH = defaultPH != null && effectivePH != null ? effectivePH - defaultPH : 0;
  const platformFeeW = calcPlatformFee(diffPW, grade.ratePerSeatPerCm);
  const platformFeeH = calcPlatformFee(diffPH, grade.ratePerSeatPerCm);

  const widthCalc = useMemo(
    () => calcWidthAdjustment(inputWidth, product, seatCount, grade),
    [inputWidth, product, seatCount, grade]
  );

  function handleProductSelect(p: SofaProduct, idx: number) {
    setProductIdx(idx);
    setInputWidth(p.width);
    setSeatCount(p.defaultSeat);
    setPlatformW(null);
    setPlatformH(null);
  }

  function handleQuote() {
    if (!basePrice) return;
    const result = buildQuoteOutput(product, grade, inputWidth, seatCount, basePrice);
    setModal({ detail: result.detailText, copy: result.copyText });
  }

  const { adjustCm, adjustPrice } = widthCalc;
  const seatWidthDiff = parseFloat((widthCalc.oneSeatWidth - product.seatWidth).toFixed(1));
  // Spec: enlargement = blue, reduction = red
  const adjColor = adjustCm > 0 ? "text-blue-500" : "text-red-500";
  const seatDiffColor = seatWidthDiff > 0 ? "text-blue-500" : "text-red-500";
  const priceColor = adjustPrice > 0 ? "text-blue-500" : "text-red-500";

  const segBase = "flex-1 rounded-[var(--radius-sm)] py-1 text-xs font-medium transition-colors";
  const segActive = "bg-[var(--accent)] text-white";
  const segInactive = "text-[var(--text-secondary)]";

  return (
    <div className="mx-auto max-w-lg p-4 space-y-3">
      <h1 className="text-base font-semibold text-[var(--text-primary)]">尺寸報價</h1>

      {/* Row 1: Product + Width */}
      <div className="grid grid-cols-2 gap-3 items-start">
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-secondary)]">款式</label>
          <button onClick={() => setShowProductPicker(true)}
            className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white text-center">
            {product.displayName}
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-secondary)]">尺寸（總寬）</label>
          <input type="number" value={inputWidth}
            onChange={(e) => setInputWidth(Number(e.target.value))}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-center text-2xl font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
      </div>

      {/* Row 2: Base price + Quote button */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
          <span className="text-2xl font-bold text-[var(--text-primary)]">
            {basePrice ? fmtAmount(basePrice) : "—"}
          </span>
        </div>
        <button onClick={handleQuote} disabled={!basePrice}
          className="rounded-[var(--radius-md)] bg-[var(--accent)] py-2.5 text-lg font-semibold text-white hover:opacity-90 disabled:opacity-40">
          報價
        </button>
      </div>

      {/* Row 3: Seat count + Material */}
      <div className="grid grid-cols-2 gap-3 items-center">
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-secondary)]">分幾人位</label>
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5">
            <span className="flex-1 text-center text-2xl font-bold text-[var(--text-primary)]">{seatCount}</span>
            <div className="flex flex-col gap-1">
              <button onClick={() => setSeatCount((n) => Math.max(1, n - 1))}
                className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setSeatCount((n) => n + 1)}
                className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-secondary)]">面料</label>
          <button onClick={() => setShowGradePicker(true)}
            className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white text-center">
            {grade.displayName}
          </button>
        </div>
      </div>

      {/* Width info */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-2">
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-[var(--text-secondary)]">原始坐寬：</span>
          <span className="text-xl font-bold text-[var(--text-primary)]">{product.seatWidth}</span>
          {seatWidthDiff !== 0 && (
            <span className={`text-base font-semibold ${seatDiffColor}`}>
              {seatWidthDiff > 0 ? "+" : ""}{seatWidthDiff.toFixed(1)}cm
            </span>
          )}
          {adjustCm !== 0 && (
            <span className={`text-base font-semibold ${adjColor}`}>
              ({adjustCm > 0 ? "+" : ""}{adjustCm}cm)
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-[var(--text-secondary)]">訂製坐寬：</span>
          <span className="text-xl font-bold text-[var(--text-primary)]">{widthCalc.oneSeatWidth.toFixed(1)}</span>
          {adjustPrice !== 0 && (
            <span className={`text-lg font-bold ${priceColor}`}>
              {adjustPrice > 0 ? "+" : ""}${fmtAmount(adjustPrice)}
            </span>
          )}
        </div>
      </div>

      {/* Platform size */}
      {product.footSeatSize && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--text-secondary)]">平台尺寸</p>
            {(diffPW !== 0 || diffPH !== 0) && (
              <button onClick={() => { setPlatformW(null); setPlatformH(null); }}
                className="text-[10px] text-[var(--text-tertiary)] underline">
                重置預設值
              </button>
            )}
          </div>
          {/* Spatial layout: box in top-left, 高 input on right, 同寬 input below */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col gap-1">
              {/* Platform box diagram — 同寬 button sets depth = oneSeatWidth */}
              <div className="flex h-16 w-28 items-center justify-center rounded border-2 border-[var(--text-secondary)]">
                <button
                  onClick={() => setPlatformW(Math.round(widthCalc.oneSeatWidth))}
                  className="rounded px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors"
                >
                  同寬
                </button>
              </div>
              {/* 同寬 (depth) input — below the box */}
              <div className="flex items-center gap-1">
                <input type="number" value={effectivePW ?? ""}
                  onChange={(e) => setPlatformW(Number(e.target.value))}
                  className="w-16 rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1 py-1 text-center text-lg font-bold text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                {diffPW !== 0 && (
                  <div className="text-right leading-tight">
                    <div className={`text-[10px] font-semibold ${diffPW > 0 ? "text-blue-500" : "text-red-500"}`}>
                      {diffPW > 0 ? `+${diffPW}` : `${diffPW}`}
                    </div>
                    <div className={`text-[10px] font-semibold ${diffPW > 0 ? "text-blue-500" : "text-red-500"}`}>
                      {diffPW < 0 ? "+500" : `+${fmtAmount(platformFeeW)}`}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* 高 input — to the right of box */}
            <div className="flex flex-col justify-center gap-1 pt-1">
              <input type="number" value={effectivePH ?? ""}
                onChange={(e) => setPlatformH(Number(e.target.value))}
                className="w-16 rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1 py-1 text-center text-lg font-bold text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
              {diffPH !== 0 && (
                <div className="text-right leading-tight">
                  <div className={`text-[10px] font-semibold ${diffPH > 0 ? "text-blue-500" : "text-red-500"}`}>
                    {diffPH > 0 ? `+${diffPH}` : `${diffPH}`}
                  </div>
                  <div className={`text-[10px] font-semibold ${diffPH > 0 ? "text-blue-500" : "text-red-500"}`}>
                    {diffPH < 0 ? "+500" : `+${fmtAmount(platformFeeH)}`}
                  </div>
                </div>
              )}
              <span className="text-[10px] text-[var(--text-tertiary)]">高</span>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)]">
            扶手 {product.armrestWidth}cm　椅腳 {product.defaultFoot}
          </p>
        </div>
      )}
      {!product.footSeatSize && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          扶手 {product.armrestWidth}cm　椅腳 {product.defaultFoot}　（無固定平台尺寸）
        </div>
      )}

      {/* Pickers */}
      <ActionSheetPicker open={showProductPicker} title="款式" options={SOFA_PRODUCTS}
        getLabel={(p) => `${p.displayName} ${p.moduleName}`}
        onSelect={handleProductSelect} onClose={() => setShowProductPicker(false)} />
      <ActionSheetPicker open={showGradePicker} title="面料" options={MATERIAL_GRADES}
        getLabel={(g) => g.displayName}
        onSelect={(_, idx) => setGradeIdx(idx)} onClose={() => setShowGradePicker(false)} />

      {modal && (
        <MessageResultModal open={true} title="L型報價結果" message={modal.detail}
          onClose={() => setModal(null)} />
      )}
    </div>
  );
}
