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
  DEFAULT_ADDONS,
  calcAddons,
  calcSeatDepthFee,
  calcBackHeightFee,
  getSlideRailRate,
  NO_SLIDE_RAIL_STYLES,
  SMALL_CHAIR_STYLES,
  type SofaProduct,
  type MaterialGrade,
  type SofaAddons,
} from "@/lib/sofa-quote-data";
import {
  ARMREST_OPTIONS,
  PILLOW_FILL_OPTIONS,
  BACKREST_COMPATIBLE_STYLES,
  BACKREST_STYLES,
  PLATFORM_STORAGE_STYLES,
  calcArmCost,
  getArmCompat,
  type ArmCompatEntry,
  type ArmMode,
} from "@/lib/sofa-addons-config";
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

// ─── Arm Panel ────────────────────────────────────────────────────────────────

function compatBadge(compatible: boolean | null) {
  if (compatible === true) return { text: "可搭配", cls: "text-green-600 bg-green-50" };
  if (compatible === false) return { text: "不可改", cls: "text-red-600 bg-red-50" };
  return { text: "待確認", cls: "text-amber-600 bg-amber-50" };
}

function ArmPanel({
  label, armCode, armWidth, boomStorage, pillowFill,
  compatEntry, onOpenPicker, onWidthChange, onBoomStorageChange, onPillowChange,
}: {
  label: string;
  armCode: string; armWidth: number; boomStorage: boolean; pillowFill: string;
  compatEntry: ArmCompatEntry | null;
  onOpenPicker: () => void;
  onWidthChange: (v: number) => void;
  onBoomStorageChange: (v: boolean) => void;
  onPillowChange: (v: string) => void;
}) {
  const opt = ARMREST_OPTIONS.find((o) => o.code === armCode);
  const badge = compatEntry ? compatBadge(compatEntry.compatible) : null;

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
      <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      <div className="flex items-center gap-2">
        <button onClick={onOpenPicker}
          className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)]">
          {opt ? `${opt.name}（${opt.default_width}cm）` : "選擇扶手款式"}
        </button>
        {badge && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
            {badge.text}
          </span>
        )}
      </div>
      {opt && (
        <div className="space-y-2">
          {opt.customizable_width && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">寬度 (cm)</span>
              <input type="number" value={armWidth} onChange={(e) => onWidthChange(Number(e.target.value))}
                min={opt.min_width} max={opt.max_width}
                className="w-20 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-center text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
            </div>
          )}
          {opt.has_storage_option && (
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={boomStorage} onChange={(e) => onBoomStorageChange(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]" />
              BOOM 置物
            </label>
          )}
          {opt.has_pillow && PILLOW_FILL_OPTIONS.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-[var(--text-tertiary)]">枕心填充</p>
              <div className="flex flex-wrap gap-1.5">
                {PILLOW_FILL_OPTIONS.map((p) => (
                  <button key={p} onClick={() => onPillowChange(p)}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      pillowFill === p ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
                    ].join(" ")}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {compatEntry?.note && (
            <p className="text-[10px] text-[var(--text-tertiary)]">{compatEntry.note}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Arm Modes ────────────────────────────────────────────────────────────────

const ARM_MODES: Array<{ value: ArmMode; label: string }> = [
  { value: "none",           label: "無" },
  { value: "both_same",      label: "兩側相同" },
  { value: "both_different", label: "左右分開" },
  { value: "left_only",      label: "僅左側" },
  { value: "right_only",     label: "僅右側" },
];

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
  const [addons, setAddons] = useState<SofaAddons>(DEFAULT_ADDONS);
  const [legStyle, setLegStyle] = useState(SOFA_PRODUCTS[0].defaultFoot);
  const [showAddons, setShowAddons] = useState(false);
  const [showArmPanel, setShowArmPanel] = useState(false);
  const [showLeftArmPicker, setShowLeftArmPicker] = useState(false);
  const [showRightArmPicker, setShowRightArmPicker] = useState(false);
  const [showBackrestPanel, setShowBackrestPanel] = useState(false);
  const [showBackrestPicker, setShowBackrestPicker] = useState(false);
  const [showPlatformPanel, setShowPlatformPanel] = useState(false);
  const [showPlatformStylePicker, setShowPlatformStylePicker] = useState(false);
  const [showSmallChair1Picker, setShowSmallChair1Picker] = useState(false);
  const [showSmallChair2Picker, setShowSmallChair2Picker] = useState(false);

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

  const effectiveRightCode = addons.armMode === "both_same" ? addons.leftArmCode : addons.rightArmCode;
  const effectiveRightWidth = addons.armMode === "both_same" ? addons.leftArmWidth : addons.rightArmWidth;
  const effectiveRightBoom = addons.armMode === "both_same" ? addons.leftBoomStorage : addons.rightBoomStorage;
  const effectiveRightPillow = addons.armMode === "both_same" ? addons.leftPillowFill : addons.rightPillowFill;
  const showLeft = addons.armMode !== "none" && addons.armMode !== "right_only";
  const showRight = addons.armMode === "right_only" || addons.armMode === "both_different";

  const leftCompat = getArmCompat(product.displayName, addons.leftArmCode);
  const rightCompat = getArmCompat(product.displayName, effectiveRightCode);
  const hasObaArm = addons.armMode !== "none" && (
    (addons.armMode !== "right_only" && addons.leftArmCode === "OBA") ||
    (addons.armMode === "right_only" && effectiveRightCode === "OBA") ||
    (addons.armMode === "both_different" && effectiveRightCode === "OBA")
  );
  const armCost = useMemo(
    () => calcArmCost(addons.armMode, addons.leftArmCode, effectiveRightCode),
    [addons.armMode, addons.leftArmCode, effectiveRightCode],
  );

  const selectedPlatformBase = PLATFORM_STORAGE_STYLES.find(
    (p) => p.code === addons.storagePlatformStyle,
  ) ?? null;

  const platformDimFees = useMemo(() => {
    if (addons.platformMode !== "changeStorage" || !addons.storagePlatformStyle || !selectedPlatformBase) {
      return { width: 0, depth: 0 };
    }
    const { storagePlatformWidthAdj: wAdj, storagePlatformDepthAdj: dAdj } = addons;
    const hasEnlargement = wAdj > 0 || dAdj > 0;
    const widthFee = wAdj > 0 ? calcPlatformFee(wAdj, grade.ratePerSeatPerCm)
      : wAdj < 0 && !hasEnlargement ? 500 : 0;
    const depthFee = dAdj > 0 ? calcPlatformFee(dAdj, grade.ratePerSeatPerCm)
      : dAdj < 0 && !hasEnlargement ? 500 : 0;
    return { width: widthFee, depth: depthFee };
  }, [addons.platformMode, addons.storagePlatformStyle, addons.storagePlatformWidthAdj, addons.storagePlatformDepthAdj, selectedPlatformBase, grade.ratePerSeatPerCm]);

  const storagePlatformAdjFee = useMemo(
    () => platformDimFees.width + platformDimFees.depth,
    [platformDimFees],
  );

  const addonTotal = useMemo(() => calcAddons(addons, seatCount, armCost, storagePlatformAdjFee), [addons, seatCount, armCost, storagePlatformAdjFee]);

  // 只計算「進階選項」card 自己的子項，不含改扶手／改背枕／改平台
  const advancedOnlyTotal = useMemo(() => calcAddons(
    { ...addons, armMode: "none", backrestChange: false, platformMode: "none" },
    seatCount, 0, 0,
  ), [addons, seatCount]);

  function handleProductSelect(p: SofaProduct, idx: number) {
    setProductIdx(idx);
    setInputWidth(p.width);
    setSeatCount(p.defaultSeat);
    setPlatformW(null);
    setPlatformH(null);
    setLegStyle(p.defaultFoot);
    setAddons((prev) => ({
      ...prev,
      slideRailRatePerSeat: getSlideRailRate(p.displayName),
      removeStandardUsb: false,
      platformNoStorage: false,
      backrestChange: false,
      backrestTargetStyle: "",
      backrestPillowFill: "",
      platformMode: "none",
      storagePlatformStyle: "",
      storagePlatformWidthAdj: 0,
      storagePlatformDepthAdj: 0,
      smallChair1Style: "",
      smallChair1Color: "",
      smallChair1Leg: "",
      smallChair2Style: "",
      smallChair2Color: "",
      smallChair2Leg: "",
    }));
  }

  function selectArmStyle(side: "left" | "right", code: string) {
    const opt = ARMREST_OPTIONS.find((o) => o.code === code);
    if (!opt) return;
    const firstPillow = PILLOW_FILL_OPTIONS[0];
    const isMirror = addons.armMode === "both_same";
    const setLeft = side === "left" || isMirror;
    const setRight = side === "right" || isMirror;
    const updates: Partial<typeof addons> = {};
    if (setLeft) {
      updates.leftArmCode = code;
      updates.leftArmWidth = opt.default_width;
      updates.leftBoomStorage = opt.storage_default;
      updates.leftPillowFill = opt.has_pillow ? (opt.pillow_default ?? firstPillow) : "";
    }
    if (setRight) {
      updates.rightArmCode = code;
      updates.rightArmWidth = opt.default_width;
      updates.rightBoomStorage = opt.storage_default;
      updates.rightPillowFill = opt.has_pillow ? (opt.pillow_default ?? firstPillow) : "";
    }
    const newLeft = updates.leftArmCode ?? addons.leftArmCode;
    const newRight = addons.armMode === "both_same" ? newLeft : (updates.rightArmCode ?? addons.rightArmCode);
    if (newLeft !== "OBA" && newRight !== "OBA") updates.obaCustomFrame = false;
    setAddons((prev) => ({ ...prev, ...updates }));
  }

  function handleQuote() {
    if (!basePrice) return;
    const result = buildQuoteOutput(product, grade, inputWidth, seatCount, basePrice, addons, armCost, storagePlatformAdjFee, legStyle);
    setModal({ detail: result.detailText, copy: result.copyText });
  }

  const { adjustCm, adjustPrice } = widthCalc;
  const seatWidthDiff = parseFloat((widthCalc.oneSeatWidth - product.seatWidth).toFixed(1));
  // enlargement = red (extra charge), reduction = blue (saving)
  const adjColor = adjustCm > 0 ? "text-red-500" : "text-blue-500";
  const seatDiffColor = seatWidthDiff > 0 ? "text-red-500" : "text-blue-500";
  const priceColor = adjustPrice > 0 ? "text-red-500" : "text-blue-500";

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
                    <div className={`text-[10px] font-semibold ${diffPW > 0 ? "text-red-500" : "text-blue-500"}`}>
                      {diffPW > 0 ? `+${diffPW}` : `${diffPW}`}
                    </div>
                    <div className={`text-[10px] font-semibold ${diffPW > 0 ? "text-red-500" : "text-blue-500"}`}>
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
                  <div className={`text-[10px] font-semibold ${diffPH > 0 ? "text-red-500" : "text-blue-500"}`}>
                    {diffPH > 0 ? `+${diffPH}` : `${diffPH}`}
                  </div>
                  <div className={`text-[10px] font-semibold ${diffPH > 0 ? "text-red-500" : "text-blue-500"}`}>
                    {diffPH < 0 ? "+500" : `+${fmtAmount(platformFeeH)}`}
                  </div>
                </div>
              )}
              <span className="text-[10px] text-[var(--text-tertiary)]">高</span>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)]">扶手 {product.armrestWidth}cm</p>
        </div>
      )}
      {!product.footSeatSize && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          扶手 {product.armrestWidth}cm（無固定平台尺寸）
        </div>
      )}

      {/* 椅腳樣式 */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-2">
        <p className="text-xs text-[var(--text-secondary)]">椅腳樣式</p>
        <div className="flex flex-wrap gap-1.5">
          {["黑鐵腳", "方木腳H12", "L鐵腳", "圓木腳H12", "U鋁腳", "方木腳H8"].map((opt) => (
            <button key={opt}
              onClick={() => setLegStyle(opt)}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                legStyle === opt
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
              ].join(" ")}
            >
              {opt}
            </button>
          ))}
        </div>
        <input
          value={legStyle}
          onChange={(e) => setLegStyle(e.target.value)}
          placeholder="自訂椅腳"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* 改扶手 */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
        <button
          onClick={() => setShowArmPanel((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)]"
        >
          <span>改扶手</span>
          <span className="flex items-center gap-2">
            {armCost > 0 && (
              <span className="text-sm font-semibold text-red-500">
                +${fmtAmount(armCost)}
              </span>
            )}
            <span className="text-[var(--text-tertiary)]">{showArmPanel ? "▲" : "▼"}</span>
          </span>
        </button>

        {showArmPanel && (
          <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
            {/* 扶手模式 */}
            <div className="space-y-1">
              <p className="text-xs text-[var(--text-secondary)]">扶手模式</p>
              <div className="flex flex-wrap gap-1.5">
                {ARM_MODES.map((m) => (
                  <button key={m.value}
                    onClick={() => setAddons((prev) => ({ ...prev, armMode: m.value, obaCustomFrame: m.value === "none" ? false : prev.obaCustomFrame }))}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      addons.armMode === m.value
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
                    ].join(" ")}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {showLeft && (
              <ArmPanel
                label={addons.armMode === "both_same" ? "扶手（兩側相同）" : addons.armMode === "both_different" ? "左側扶手" : "扶手"}
                armCode={addons.leftArmCode}
                armWidth={addons.leftArmWidth}
                boomStorage={addons.leftBoomStorage}
                pillowFill={addons.leftPillowFill}
                compatEntry={leftCompat}
                onOpenPicker={() => setShowLeftArmPicker(true)}
                onWidthChange={(v) => {
                  const u: Partial<typeof addons> = { leftArmWidth: v };
                  if (addons.armMode === "both_same") u.rightArmWidth = v;
                  setAddons((prev) => ({ ...prev, ...u }));
                }}
                onBoomStorageChange={(v) => {
                  const u: Partial<typeof addons> = { leftBoomStorage: v };
                  if (addons.armMode === "both_same") u.rightBoomStorage = v;
                  setAddons((prev) => ({ ...prev, ...u }));
                }}
                onPillowChange={(v) => {
                  const u: Partial<typeof addons> = { leftPillowFill: v };
                  if (addons.armMode === "both_same") u.rightPillowFill = v;
                  setAddons((prev) => ({ ...prev, ...u }));
                }}
              />
            )}

            {showRight && (
              <ArmPanel
                label="右側扶手"
                armCode={addons.rightArmCode}
                armWidth={effectiveRightWidth}
                boomStorage={effectiveRightBoom}
                pillowFill={effectiveRightPillow}
                compatEntry={rightCompat}
                onOpenPicker={() => setShowRightArmPicker(true)}
                onWidthChange={(v) => setAddons((prev) => ({ ...prev, rightArmWidth: v }))}
                onBoomStorageChange={(v) => setAddons((prev) => ({ ...prev, rightBoomStorage: v }))}
                onPillowChange={(v) => setAddons((prev) => ({ ...prev, rightPillowFill: v }))}
              />
            )}

            {hasObaArm && (
              <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2">
                <input
                  type="checkbox"
                  checked={!!addons.obaCustomFrame}
                  onChange={(e) => setAddons((prev) => ({ ...prev, obaCustomFrame: e.target.checked }))}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="text-sm text-[var(--text-primary)]">訂製扶手框</span>
                <span className="ml-auto text-xs text-red-500">+$1,000/只</span>
              </label>
            )}

            {addons.armMode !== "none" && armCost > 0 && (
              <div className="rounded-[var(--radius-md)] bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                改扶手費用：${fmtAmount(armCost)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 改背枕 */}
      {BACKREST_COMPATIBLE_STYLES.includes(product.displayName) && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
          <button
            onClick={() => setShowBackrestPanel((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)]"
          >
            <span>改背枕</span>
            <span className="flex items-center gap-2">
              {addons.backrestChange && addons.backrestTargetStyle && (
                <span className="text-sm font-semibold text-red-500">
                  +${fmtAmount(500 * seatCount)}
                </span>
              )}
              <span className="text-[var(--text-tertiary)]">{showBackrestPanel ? "▲" : "▼"}</span>
            </span>
          </button>

          {showBackrestPanel && (
            <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
              <p className="text-[10px] text-red-500">+500/座（共 {seatCount} 座 = +${(500 * seatCount).toLocaleString()}）</p>

              {/* 款式 */}
              <div className="space-y-1">
                <p className="text-xs text-[var(--text-secondary)]">背枕款式</p>
                <button
                  onClick={() => setShowBackrestPicker(true)}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)]"
                >
                  {addons.backrestTargetStyle || "選擇背枕款式（未選則不計費）"}
                </button>
              </div>

              {/* 枕心 */}
              {addons.backrestTargetStyle && (
                <div className="space-y-1">
                  <p className="text-xs text-[var(--text-secondary)]">枕心填充</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PILLOW_FILL_OPTIONS.map((p) => (
                      <button key={p}
                        onClick={() => setAddons((prev) => ({ ...prev, backrestPillowFill: p }))}
                        className={[
                          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          addons.backrestPillowFill === p
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
                        ].join(" ")}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 清除 */}
              {addons.backrestTargetStyle && (
                <button
                  onClick={() => setAddons((prev) => ({ ...prev, backrestChange: false, backrestTargetStyle: "", backrestPillowFill: "" }))}
                  className="text-xs text-[var(--text-tertiary)] underline"
                >
                  清除
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 改平台 */}
      {product.footSeatSize !== "" && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
          <button
            onClick={() => setShowPlatformPanel((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)]"
          >
            <span>改平台</span>
            <span className="flex items-center gap-2">
              {addons.platformMode === "changeStorage" && addons.storagePlatformStyle && (
                <span className="text-sm font-semibold text-red-500">+${fmtAmount(1500 + storagePlatformAdjFee)}</span>
              )}
              {addons.platformMode !== "none" && (
                <span className="text-xs text-[var(--accent)]">
                  {addons.platformMode === "changeStorage" ? "改置物平台" : "換小椅"}
                </span>
              )}
              <span className="text-[var(--text-tertiary)]">{showPlatformPanel ? "▲" : "▼"}</span>
            </span>
          </button>

          {showPlatformPanel && (
            <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
              {/* 模式選擇 */}
              <div className="space-y-1">
                <p className="text-xs text-[var(--text-secondary)]">平台選項</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["none", "changeStorage", "swapSmallChairs"] as const).map((mode) => (
                    <button key={mode}
                      onClick={() => setAddons((prev) => ({
                        ...prev,
                        platformMode: mode,
                        storagePlatformStyle: mode !== "changeStorage" ? "" : prev.storagePlatformStyle,
                        storagePlatformWidthAdj: mode !== "changeStorage" ? 0 : prev.storagePlatformWidthAdj,
                        storagePlatformDepthAdj: mode !== "changeStorage" ? 0 : prev.storagePlatformDepthAdj,
                        smallChair1Style: mode !== "swapSmallChairs" ? "" : prev.smallChair1Style,
                        smallChair1Color: mode !== "swapSmallChairs" ? "" : prev.smallChair1Color,
                        smallChair1Leg: mode !== "swapSmallChairs" ? "" : prev.smallChair1Leg,
                        smallChair2Style: mode !== "swapSmallChairs" ? "" : prev.smallChair2Style,
                        smallChair2Color: mode !== "swapSmallChairs" ? "" : prev.smallChair2Color,
                        smallChair2Leg: mode !== "swapSmallChairs" ? "" : prev.smallChair2Leg,
                      }))}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        addons.platformMode === mode
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
                      ].join(" ")}
                    >
                      {mode === "none" ? "不更改" : mode === "changeStorage" ? "改置物平台 +1,500" : "換兩張小椅子"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 改置物平台 */}
              {addons.platformMode === "changeStorage" && (
                <div className="space-y-2">
                  <button onClick={() => setShowPlatformStylePicker(true)}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)]">
                    {addons.storagePlatformStyle
                      ? PLATFORM_STORAGE_STYLES.find((p) => p.code === addons.storagePlatformStyle)?.name ?? addons.storagePlatformStyle
                      : "選擇平台款式"}
                  </button>
                  {addons.storagePlatformStyle && selectedPlatformBase && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <p className="text-[10px] text-[var(--text-tertiary)]">
                            平台寬（原 {selectedPlatformBase.standardWidth}cm）
                            {platformDimFees.width !== 0 && (
                              <span className={`ml-1 ${addons.storagePlatformWidthAdj < 0 ? "text-blue-500" : "text-red-500"}`}>
                                +{fmtAmount(platformDimFees.width)}
                              </span>
                            )}
                          </p>
                          <input type="number" value={selectedPlatformBase.standardWidth + addons.storagePlatformWidthAdj}
                            onChange={(e) => setAddons((prev) => ({ ...prev, storagePlatformWidthAdj: Number(e.target.value) - selectedPlatformBase.standardWidth }))}
                            min={1}
                            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-center text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-[var(--text-tertiary)]">
                            平台深（原 {selectedPlatformBase.standardDepth}cm）
                            {platformDimFees.depth !== 0 && (
                              <span className={`ml-1 ${addons.storagePlatformDepthAdj < 0 ? "text-blue-500" : "text-red-500"}`}>
                                +{fmtAmount(platformDimFees.depth)}
                              </span>
                            )}
                          </p>
                          <input type="number" value={selectedPlatformBase.standardDepth + addons.storagePlatformDepthAdj}
                            onChange={(e) => setAddons((prev) => ({ ...prev, storagePlatformDepthAdj: Number(e.target.value) - selectedPlatformBase.standardDepth }))}
                            min={1}
                            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-center text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        </div>
                      </div>
                      <div className="rounded-[var(--radius-md)] bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                        {storagePlatformAdjFee !== 0
                          ? `改置物平台費用：手續費 $1,500 + 訂製費 $${fmtAmount(storagePlatformAdjFee)} = 合計 $${fmtAmount(1500 + storagePlatformAdjFee)}`
                          : `改置物平台費用：$1,500`}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 換兩張小椅子 */}
              {addons.platformMode === "swapSmallChairs" && (
                <div className="space-y-3">
                  {(["1", "2"] as const).map((n) => {
                    const styleKey = `smallChair${n}Style` as "smallChair1Style" | "smallChair2Style";
                    const colorKey = `smallChair${n}Color` as "smallChair1Color" | "smallChair2Color";
                    const legKey = `smallChair${n}Leg` as "smallChair1Leg" | "smallChair2Leg";
                    return (
                      <div key={n} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3 space-y-2">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">小椅 {n === "1" ? "①" : "②"}</p>
                        <button
                          onClick={() => n === "1" ? setShowSmallChair1Picker(true) : setShowSmallChair2Picker(true)}
                          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)]"
                        >
                          {addons[styleKey] || "選擇款式"}
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <p className="text-[10px] text-[var(--text-tertiary)]">色號</p>
                            <input
                              type="text"
                              value={addons[colorKey]}
                              onChange={(e) => setAddons((prev) => ({ ...prev, [colorKey]: e.target.value }))}
                              placeholder="輸入色號"
                              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] text-[var(--text-tertiary)]">椅腳樣式</p>
                            <input
                              type="text"
                              value={addons[legKey]}
                              onChange={(e) => setAddons((prev) => ({ ...prev, [legKey]: e.target.value }))}
                              placeholder="輸入椅腳"
                              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Advanced options */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
        <button
          onClick={() => setShowAddons((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)]"
        >
          <span>進階選項</span>
          <span className="flex items-center gap-2">
            {advancedOnlyTotal !== 0 && (
              <span className={`text-sm font-semibold ${advancedOnlyTotal > 0 ? "text-red-500" : "text-blue-500"}`}>
                {advancedOnlyTotal > 0 ? "+" : ""}${fmtAmount(advancedOnlyTotal)}
              </span>
            )}
            <span className="text-[var(--text-tertiary)]">{showAddons ? "▲" : "▼"}</span>
          </span>
        </button>

        {showAddons && (
          <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">

            {/* 桶身落地 */}
            <div className="space-y-1">
              <p className="text-xs text-[var(--text-secondary)]">桶身落地</p>
              <div className="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] p-0.5">
                {(["none", "half", "full"] as const).map((opt) => (
                  <button key={opt}
                    onClick={() => setAddons((a) => ({ ...a, groundOption: opt }))}
                    className={[segBase, addons.groundOption === opt ? segActive : segInactive].join(" ")}
                  >
                    {opt === "none" ? "不落地" : opt === "half" ? "半落地 +1,500" : "全落地 +2,000"}
                  </button>
                ))}
              </div>
            </div>

            {/* 高度削減 */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--text-secondary)]">
                高度削減（最多 6cm）
                {addons.heightReductionCm > 0 && (
                  <span className="ml-1 text-blue-500">-1,000</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setAddons((a) => ({ ...a, heightReductionCm: Math.max(0, a.heightReductionCm - 1) }))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
                  <Minus className="h-3 w-3" />
                </button>
                <span className={`w-10 text-center text-sm font-bold ${addons.heightReductionCm > 0 ? "text-blue-500" : ""}`}>
                  {addons.heightReductionCm > 0 ? `-${addons.heightReductionCm}cm` : "0"}
                </span>
                <button onClick={() => setAddons((a) => ({ ...a, heightReductionCm: Math.min(6, a.heightReductionCm + 1) }))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* 坐深調整 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--text-secondary)]">
                  坐深調整（-12 ~ +18cm）
                  {addons.seatDepthAdj > 0 && (
                    <span className="ml-1 text-red-500">+${fmtAmount(calcSeatDepthFee(addons.seatDepthAdj))}</span>
                  )}
                  {addons.seatDepthAdj < 0 && (
                    <span className="ml-1 text-blue-500">縮減免費</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setAddons((a) => ({ ...a, seatDepthAdj: Math.max(-12, a.seatDepthAdj - 3) }))}
                    className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className={`w-10 text-center text-sm font-bold ${addons.seatDepthAdj !== 0 ? "text-[var(--accent)]" : ""}`}>
                    {addons.seatDepthAdj > 0 ? `+${addons.seatDepthAdj}` : addons.seatDepthAdj}cm
                  </span>
                  <button onClick={() => setAddons((a) => ({ ...a, seatDepthAdj: Math.min(18, a.seatDepthAdj + 3) }))}
                    className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* 椅背加高 */}
            <div className="space-y-1">
              <p className="text-xs text-[var(--text-secondary)]">
                椅背加高（+$1,200/6cm）
                {addons.backHeightAdj > 0 && (
                  <span className="ml-1 text-red-500">+${fmtAmount(calcBackHeightFee(addons.backHeightAdj))}</span>
                )}
              </p>
              <div className="flex gap-1.5">
                {([0, 3, 6, 9, 12] as const).map((cm) => (
                  <button key={cm}
                    onClick={() => setAddons((a) => ({ ...a, backHeightAdj: cm }))}
                    className={[
                      "flex-1 rounded-full py-1 text-xs font-medium transition-colors",
                      addons.backHeightAdj === cm
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
                    ].join(" ")}
                  >
                    {cm === 0 ? "不加高" : `+${cm}cm`}
                  </button>
                ))}
              </div>
            </div>

            {/* 移除扶手 */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--text-secondary)]">移除扶手（-1,500/個）</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setAddons((a) => ({ ...a, removeArmrestCount: Math.max(0, a.removeArmrestCount - 1) }))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-4 text-center text-sm font-bold">{addons.removeArmrestCount}</span>
                <button onClick={() => setAddons((a) => ({ ...a, removeArmrestCount: Math.min(2, a.removeArmrestCount + 1) }))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* USB */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--text-secondary)]">加裝 USB 充電（+1,500/組）</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setAddons((a) => ({ ...a, usbCount: Math.max(0, a.usbCount - 1) }))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-4 text-center text-sm font-bold">{addons.usbCount}</span>
                <button onClick={() => setAddons((a) => ({ ...a, usbCount: a.usbCount + 1 }))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* 扣除標配 USB (LEO/OBA only) */}
            {["LEO", "OBA"].includes(product.displayName) && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--text-secondary)]">扣除標配 USB <span className="text-blue-500">-1,000</span></p>
                <button
                  onClick={() => setAddons((a) => ({ ...a, removeStandardUsb: !a.removeStandardUsb }))}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${addons.removeStandardUsb ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--text-secondary)]"}`}
                >
                  {addons.removeStandardUsb ? "✓ 已選" : "選取"}
                </button>
              </div>
            )}

            {/* 滑軌 */}
            {!NO_SLIDE_RAIL_STYLES.includes(product.displayName) && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--text-secondary)]">
                加裝滑軌（+{addons.slideRailRatePerSeat.toLocaleString()}/座）
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setAddons((a) => ({ ...a, slideRailCount: Math.max(0, a.slideRailCount - 1) }))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-4 text-center text-sm font-bold">{addons.slideRailCount}</span>
                <button onClick={() => setAddons((a) => ({ ...a, slideRailCount: a.slideRailCount + 1 }))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)]">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
            )}

            {/* 平台無置物 (BOOM/BOOMs/LEMON/MULE only) */}
            {["BOOM", "BOOMs", "LEMON", "MULE"].includes(product.displayName) && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--text-secondary)]">平台無置物 <span className="text-blue-500">-1,000</span></p>
                <button
                  onClick={() => setAddons((a) => ({ ...a, platformNoStorage: !a.platformNoStorage }))}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${addons.platformNoStorage ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--text-secondary)]"}`}
                >
                  {addons.platformNoStorage ? "✓ 已選" : "選取"}
                </button>
              </div>
            )}

            {/* Reset button */}
            {advancedOnlyTotal !== 0 && (
              <button
                onClick={() => setAddons({ ...DEFAULT_ADDONS, slideRailRatePerSeat: getSlideRailRate(product.displayName) })}
                className="w-full rounded border border-[var(--border)] py-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                重置進階選項
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pickers */}
      <ActionSheetPicker open={showProductPicker} title="款式" options={SOFA_PRODUCTS}
        getLabel={(p) => `${p.displayName} ${p.moduleName}`}
        onSelect={handleProductSelect} onClose={() => setShowProductPicker(false)} />
      <ActionSheetPicker open={showGradePicker} title="面料" options={MATERIAL_GRADES}
        getLabel={(g) => g.displayName}
        onSelect={(_, idx) => setGradeIdx(idx)} onClose={() => setShowGradePicker(false)} />
      <ActionSheetPicker
        open={showLeftArmPicker}
        title="左側扶手款式"
        options={ARMREST_OPTIONS}
        getLabel={(o) => `${o.name}（${o.default_width}cm）$${o.total_fee.toLocaleString()}`}
        onSelect={(o, _) => { selectArmStyle("left", o.code); }}
        onClose={() => setShowLeftArmPicker(false)}
      />
      <ActionSheetPicker
        open={showRightArmPicker}
        title="右側扶手款式"
        options={ARMREST_OPTIONS}
        getLabel={(o) => `${o.name}（${o.default_width}cm）$${o.total_fee.toLocaleString()}`}
        onSelect={(o, _) => { selectArmStyle("right", o.code); }}
        onClose={() => setShowRightArmPicker(false)}
      />
      <ActionSheetPicker
        open={showBackrestPicker}
        title="背枕款式"
        options={[...BACKREST_STYLES].filter((s) => s !== product.displayName)}
        getLabel={(s) => s}
        onSelect={(s, _) => setAddons((prev) => ({ ...prev, backrestChange: true, backrestTargetStyle: s }))}
        onClose={() => setShowBackrestPicker(false)}
      />
      <ActionSheetPicker
        open={showPlatformStylePicker}
        title="置物平台款式"
        options={PLATFORM_STORAGE_STYLES}
        getLabel={(p) => `${p.name} ${p.standardWidth}×${p.standardDepth}cm`}
        onSelect={(p, _) => setAddons((prev) => ({ ...prev, storagePlatformStyle: p.code, storagePlatformWidthAdj: 0, storagePlatformDepthAdj: 0 }))}
        onClose={() => setShowPlatformStylePicker(false)}
      />
      <ActionSheetPicker
        open={showSmallChair1Picker}
        title="小椅①款式"
        options={[...SMALL_CHAIR_STYLES]}
        getLabel={(s) => s}
        onSelect={(s, _) => setAddons((prev) => ({ ...prev, smallChair1Style: s }))}
        onClose={() => setShowSmallChair1Picker(false)}
      />
      <ActionSheetPicker
        open={showSmallChair2Picker}
        title="小椅②款式"
        options={[...SMALL_CHAIR_STYLES]}
        getLabel={(s) => s}
        onSelect={(s, _) => setAddons((prev) => ({ ...prev, smallChair2Style: s }))}
        onClose={() => setShowSmallChair2Picker(false)}
      />

      {modal && (
        <MessageResultModal open={true} title="L型報價結果" message={modal.detail}
          onClose={() => setModal(null)} />
      )}
    </div>
  );
}
