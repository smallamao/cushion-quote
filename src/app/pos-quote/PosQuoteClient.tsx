"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, FileImage, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PosSpec = {
  value: string;
  label: string;
  supports_platform: boolean;
  supports_reverse: boolean;
  seat_count: number;
};

type PosStyle = {
  code: string;
  name: string;
  base_prices: Record<string, number>;
  supports_backrest_change?: boolean;
  has_slide_rail?: boolean;
  supports_wireless_charging?: boolean;
  supports_standard_usb_removal?: boolean;
  has_platform_storage?: boolean;
};

type MatLevel = {
  category_id: string;
  category_name: string;
  description: string;
};

type MatGroup = {
  id: string;
  name: string;
  levels: MatLevel[];
};

type ArmrestOption = {
  code: string;
  name: string;
  has_storage_option: boolean;
  storage_default?: boolean;
  has_pillow: boolean;
  pillow_default?: string;
  default_width: number;
  customizable_width?: boolean;
  min_width?: number;
  max_width?: number;
};

// armrest_compatibility is keyed by style code → armrest code
type ArmrestCompatMatrix = Record<string, {
  armrest_adjustments?: Record<string, { compatible: boolean | null; note?: string }>;
}>;

type AdvancedConfig = {
  backrest_options?: {
    available_styles?: { styles?: string[] };
    pricing?: { per_seat?: number };
  };
  slide_rail_config?: {
    pricing?: { standard_discount_per_seat?: number; mule_discount_per_seat?: number };
  };
  platform_storage_config?: {
    available_storage_platforms?: {
      platforms?: Record<string, { name: string; depth: number }>;
    };
    processing_fee?: number;
  };
  usb_config?: {
    price_per_unit?: number;
    quantity_range?: { min: number; max: number };
  };
  wireless_charging_config?: {
    price_per_unit?: number;
    quantity_range?: { min: number; max: number };
  };
  ground_config?: { half_ground?: number; full_ground?: number };
  height_reduction?: number;
};

type PosConfig = {
  specifications: PosSpec[];
  styles: PosStyle[];
  material_groups: MatGroup[];
  armrest_options?: ArmrestOption[];
  armrest_compatibility?: ArmrestCompatMatrix;
  pillow_fill_options?: string[];
  advanced_customization?: AdvancedConfig;
  armrest_pricing?: {
    base_fee?: number;
    style_specific_fees?: Record<string, number>;
  };
};

type ArmMode = "none" | "both_same" | "left_only" | "right_only" | "both_different";

type GroundOption = "none" | "half" | "full";

type FormState = {
  styleCode: string;
  specValue: string;
  matLevelId: string;
  widthAdj: number;
  depthAdj: number;
  heightAdj: number;
  platWidthAdj: number;
  platDepthAdj: number;
  reverse: boolean;
  // 改扶手
  armMode: ArmMode;
  leftArmCode: string;
  rightArmCode: string;
  leftArmWidth: number;
  rightArmWidth: number;
  leftBoomStorage: boolean;
  rightBoomStorage: boolean;
  leftPillowFill: string;
  rightPillowFill: string;
  // 進階客製
  backrestChange: boolean;
  backrestTargetStyle: string;
  noSlideRail: boolean;
  platformNoStorage: boolean;
  changeStoragePlatform: boolean;
  storagePlatformStyle: string;
  storagePlatformWidthAdj: number;
  storagePlatformDepthAdj: number;
  addUsb: boolean;
  usbCount: number;
  removeStandardUsb: boolean;
  addWirelessCharging: boolean;
  wirelessChargingCount: number;
  groundOption: GroundOption;
  heightReduction: boolean;
};

type CalcResult = {
  total: number;
  deposit: number;
  breakdown: Record<string, number>;
  final_dimensions: {
    sofa_width: number;
    sofa_depth: number;
    sofa_height: number;
    platform_width: number;
    platform_depth: number;
  };
  customer_quote: { text: string; title: string };
  warnings: string[];
  purchase_items?: Array<{ item?: string; name?: string; quantity: number; unit?: string; remark?: string }>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_FORM: FormState = {
  styleCode: "", specValue: "", matLevelId: "",
  widthAdj: 0, depthAdj: 0, heightAdj: 0,
  platWidthAdj: 0, platDepthAdj: 0, reverse: false,
  armMode: "none",
  leftArmCode: "", rightArmCode: "",
  leftArmWidth: 0, rightArmWidth: 0,
  leftBoomStorage: false, rightBoomStorage: false,
  leftPillowFill: "", rightPillowFill: "",
  backrestChange: false, backrestTargetStyle: "",
  noSlideRail: false,
  platformNoStorage: false,
  changeStoragePlatform: false, storagePlatformStyle: "",
  storagePlatformWidthAdj: 0, storagePlatformDepthAdj: 0,
  addUsb: false, usbCount: 1, removeStandardUsb: false,
  addWirelessCharging: false, wirelessChargingCount: 1,
  groundOption: "none",
  heightReduction: false,
};

const ARM_MODES: Array<{ value: ArmMode; label: string }> = [
  { value: "none", label: "無" },
  { value: "both_same", label: "兩側相同" },
  { value: "both_different", label: "左右分開" },
  { value: "left_only", label: "僅左側" },
  { value: "right_only", label: "僅右側" },
];

const BREAKDOWN_LABELS: Record<string, string> = {
  base_price: "底價",
  width_adjustment: "寬度調整",
  depth_adjustment: "深度調整",
  height_adjustment: "高度調整",
  platform_adjustment: "平台調整",
  platform_width_adjustment: "平台寬調整",
  platform_depth_adjustment: "平台深調整",
  armrest_change: "改扶手",
  backrest_change: "改背枕",
  no_slide_rail_discount: "免滑軌折扣",
  no_slide_rail: "免滑軌",
  platform_storage: "平台收納",
  platform_no_storage: "扣除平台置物",
  change_storage_platform: "改置物平台",
  usb: "USB 充電",
  add_usb: "USB 充電",
  remove_standard_usb: "扣除標配 USB",
  wireless_charging: "無線充電",
  ground_option: "桶身落地",
  height_reduction: "高度削減",
  material_adjustment: "面料差價",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return `$${n.toLocaleString()}`;
}

function compatBadge(compatible: boolean | null) {
  if (compatible === true) return { text: "可搭配", cls: "text-green-600 bg-green-50" };
  if (compatible === false) return { text: "不可改", cls: "text-red-600 bg-red-50" };
  return { text: "待確認", cls: "text-amber-600 bg-amber-50" };
}

function calcArmCost(
  armMode: ArmMode,
  leftCode: string,
  rightCode: string,
  pricing?: PosConfig["armrest_pricing"],
): number {
  if (armMode === "none") return 0;
  const base = pricing?.base_fee ?? 500;
  const fees = pricing?.style_specific_fees ?? {};
  const sides =
    armMode === "both_same" ? [leftCode, leftCode]
      : armMode === "both_different" ? [leftCode, rightCode]
      : armMode === "left_only" ? [leftCode]
      : [rightCode];
  return sides.filter(Boolean).reduce((s, c) => s + base + (fees[c] ?? 0), 0);
}

function getArmCompat(
  compat: ArmrestCompatMatrix | undefined,
  styleCode: string,
  armCode: string,
): { compatible: boolean | null; note?: string } | null {
  return compat?.[styleCode]?.armrest_adjustments?.[armCode] ?? null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionSheetPicker<T>({
  open, title, options, getLabel, onSelect, onClose,
}: {
  open: boolean; title: string; options: T[];
  getLabel: (item: T) => string;
  onSelect: (item: T) => void; onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-[var(--bg-elevated)]">
        <p className="py-3 text-center text-xs text-[var(--text-secondary)]">{title}</p>
        <div className="max-h-[60dvh] overflow-y-auto divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {options.map((item, idx) => (
            <button key={idx} onClick={() => { onSelect(item); onClose(); }}
              className="w-full px-4 py-3.5 text-left text-base font-medium text-[var(--accent)]">
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

function AdjInput({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className={[
          "w-full rounded-[var(--radius-sm)] border bg-[var(--bg-elevated)] px-2 py-1.5 text-center text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent)]",
          value !== 0 ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-primary)]",
        ].join(" ")} />
    </div>
  );
}

function DiagramModal({ diagramUrl, onClose }: { diagramUrl: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-h-[90dvh] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={diagramUrl} alt="沙發圖面" className="max-h-[85dvh] max-w-full rounded-lg object-contain" />
        <button onClick={onClose} className="absolute right-2 top-2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
          關閉
        </button>
      </div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-[10px] font-semibold tracking-wider text-[var(--text-tertiary)]">{label}</span>
      <div className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

function PillRow<T extends string>({ options, value, onChange }: {
  options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className={[
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
          ].join(" ")}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ value, onChange, min = 0, max, suffix }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)]">
        −
      </button>
      <span className="min-w-[2rem] text-center text-sm font-semibold text-[var(--text-primary)]">
        {value}{suffix ?? ""}
      </span>
      <button onClick={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)]">
        +
      </button>
    </div>
  );
}

// ─── Arm Panel ────────────────────────────────────────────────────────────────

function ArmPanel({
  label, armCode, armWidth, boomStorage, pillowFill,
  compatEntry, armrestOptions, pillowFillOptions,
  onOpenPicker, onWidthChange, onBoomStorageChange, onPillowChange,
}: {
  label: string;
  armCode: string; armWidth: number; boomStorage: boolean; pillowFill: string;
  compatEntry: { compatible: boolean | null; note?: string } | null;
  armrestOptions: ArmrestOption[];
  pillowFillOptions: string[];
  onOpenPicker: () => void;
  onWidthChange: (v: number) => void;
  onBoomStorageChange: (v: boolean) => void;
  onPillowChange: (v: string) => void;
}) {
  const opt = armrestOptions.find((o) => o.code === armCode);
  const badge = compatEntry ? compatBadge(compatEntry.compatible) : null;

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
      <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      <div className="flex items-center gap-2">
        <button onClick={onOpenPicker}
          className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)]">
          {opt ? opt.name : "選擇扶手款式"}
        </button>
        {badge && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
            {badge.text}
          </span>
        )}
      </div>
      {opt && (
        <div className="space-y-2.5">
          {opt.customizable_width && (
            <AdjInput label="寬度 (cm)" value={armWidth} onChange={onWidthChange} />
          )}
          {opt.has_storage_option && (
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={boomStorage} onChange={(e) => onBoomStorageChange(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]" />
              BOOM 置物
            </label>
          )}
          {opt.has_pillow && pillowFillOptions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-[var(--text-tertiary)]">枕心填充</p>
              <PillRow
                options={pillowFillOptions.map((p) => ({ value: p, label: p }))}
                value={pillowFill}
                onChange={onPillowChange}
              />
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function PosQuoteClient() {
  const [config, setConfig] = useState<PosConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [calcError, setCalcError] = useState("");
  const [loadingDiagram, setLoadingDiagram] = useState(false);
  const [diagramUrl, setDiagramUrl] = useState<string | null>(null);
  const diagramBlobRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showSpecPicker, setShowSpecPicker] = useState(false);
  const [showMatPicker, setShowMatPicker] = useState(false);
  const [showLeftArmPicker, setShowLeftArmPicker] = useState(false);
  const [showRightArmPicker, setShowRightArmPicker] = useState(false);
  const [showBackrestPicker, setShowBackrestPicker] = useState(false);
  const [showPlatformStylePicker, setShowPlatformStylePicker] = useState(false);

  function patch(updates: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...updates }));
  }

  useEffect(() => {
    fetch("/api/legacy/pos/config")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PosConfig>;
      })
      .then((data) => {
        setConfig(data);
        setForm((prev) => {
          const firstStyle = data.styles[0];
          const firstSpec = data.specifications[0];
          return {
            ...prev,
            styleCode: firstStyle?.code ?? prev.styleCode,
            matLevelId: firstStyle ? (Object.keys(firstStyle.base_prices)[0] ?? "") : prev.matLevelId,
            specValue: firstSpec?.value ?? prev.specValue,
          };
        });
      })
      .catch(() => setConfigError("無法載入設定，請確認後端服務狀態"));
  }, []);

  function releaseDiagram() {
    if (diagramBlobRef.current) {
      URL.revokeObjectURL(diagramBlobRef.current);
      diagramBlobRef.current = null;
    }
    setDiagramUrl(null);
  }

  function selectArmStyle(side: "left" | "right", code: string) {
    if (!config) return;
    const opt = config.armrest_options?.find((o) => o.code === code);
    if (!opt) return;
    const firstPillow = config.pillow_fill_options?.[0] ?? "";
    const isMirror = form.armMode === "both_same";
    const setLeft = side === "left" || isMirror;
    const setRight = side === "right" || isMirror;
    const updates: Partial<FormState> = {};
    if (setLeft) {
      updates.leftArmCode = code;
      updates.leftArmWidth = opt.default_width ?? 0;
      updates.leftBoomStorage = opt.storage_default ?? false;
      updates.leftPillowFill = opt.has_pillow ? (opt.pillow_default ?? firstPillow) : "";
    }
    if (setRight) {
      updates.rightArmCode = code;
      updates.rightArmWidth = opt.default_width ?? 0;
      updates.rightBoomStorage = opt.storage_default ?? false;
      updates.rightPillowFill = opt.has_pillow ? (opt.pillow_default ?? firstPillow) : "";
    }
    patch(updates);
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const selectedStyle = config?.styles.find((s) => s.code === form.styleCode) ?? null;
  const selectedSpec = config?.specifications.find((s) => s.value === form.specValue) ?? null;
  const availableMatLevels = config
    ? config.material_groups.flatMap((g) =>
        g.levels
          .filter((l) => selectedStyle && l.category_id in selectedStyle.base_prices)
          .map((l) => ({ ...l, groupName: g.name })),
      )
    : [];
  const selectedMatLevel = availableMatLevels.find((l) => l.category_id === form.matLevelId) ?? null;
  const basePrice = selectedStyle && form.matLevelId ? (selectedStyle.base_prices[form.matLevelId] ?? null) : null;

  const adv = config?.advanced_customization ?? {};
  const armrestOptions = Array.isArray(config?.armrest_options) ? (config.armrest_options as ArmrestOption[]) : [];
  const pillowFillOptions = Array.isArray(config?.pillow_fill_options) ? (config.pillow_fill_options as string[]) : [];
  const compat = config?.armrest_compatibility;

  const backrestStyles = adv.backrest_options?.available_styles?.styles ?? [];
  const platformStyleMap = adv.platform_storage_config?.available_storage_platforms?.platforms ?? {};
  const platformStyles = Object.entries(platformStyleMap).map(([k, v]) => ({ code: k, name: v.name, depth: v.depth }));

  const showLeft = form.armMode === "left_only" || form.armMode === "both_different" || form.armMode === "both_same";
  const showRight = form.armMode === "right_only" || form.armMode === "both_different";
  const effectiveRightCode = form.armMode === "both_same" ? form.leftArmCode : form.rightArmCode;
  const effectiveRightWidth = form.armMode === "both_same" ? form.leftArmWidth : form.rightArmWidth;
  const effectiveRightBoom = form.armMode === "both_same" ? form.leftBoomStorage : form.rightBoomStorage;
  const effectiveRightPillow = form.armMode === "both_same" ? form.leftPillowFill : form.rightPillowFill;

  const leftCompat = getArmCompat(compat, form.styleCode, form.leftArmCode);
  const rightCompat = getArmCompat(compat, form.styleCode, effectiveRightCode);
  const armCost = calcArmCost(form.armMode, form.leftArmCode, effectiveRightCode, config?.armrest_pricing);

  // ── API Handlers ──────────────────────────────────────────────────────────────

  async function handleCalculate() {
    if (!form.styleCode || !form.specValue || !form.matLevelId) return;
    setCalculating(true);
    setCalcError("");
    setResult(null);
    releaseDiagram();
    try {
      const apiLeft = form.armMode === "right_only" ? "" : form.leftArmCode;
      const apiRight = form.armMode === "left_only" ? "" : effectiveRightCode;
      const res = await fetch("/api/legacy/pos/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style_code: form.styleCode,
          specification: form.specValue,
          material_level: form.matLevelId,
          width_adj: form.widthAdj,
          depth_adj: form.depthAdj,
          height_adj: form.heightAdj,
          platform_width_adj: form.platWidthAdj,
          platform_depth_adj: form.platDepthAdj,
          reverse_configuration: form.reverse,
          armrest_mode: form.armMode,
          left_armrest_style: apiLeft,
          right_armrest_style: apiRight,
          left_armrest_width: form.leftArmWidth,
          right_armrest_width: effectiveRightWidth,
          left_boom_storage: form.leftBoomStorage,
          right_boom_storage: effectiveRightBoom,
          left_armrest_pillow_fill: form.leftPillowFill,
          right_armrest_pillow_fill: effectiveRightPillow,
          backrest_change: form.backrestChange,
          backrest_target_style: form.backrestTargetStyle,
          no_slide_rail: form.noSlideRail,
          platform_no_storage: form.platformNoStorage,
          change_storage_platform: form.changeStoragePlatform,
          storage_platform_style: form.storagePlatformStyle,
          storage_platform_width_adj: form.storagePlatformWidthAdj,
          storage_platform_depth_adj: form.storagePlatformDepthAdj,
          add_usb: form.addUsb,
          usb_count: form.usbCount,
          remove_standard_usb: form.removeStandardUsb,
          add_wireless_charging: form.addWirelessCharging,
          wireless_charging_count: form.wirelessChargingCount,
          ground_option: form.groundOption,
          height_reduction: form.heightReduction,
        }),
      });
      const data = (await res.json()) as CalcResult & { detail?: string };
      if (!res.ok) setCalcError(data.detail ?? "計算失敗");
      else setResult(data);
    } catch {
      setCalcError("網路錯誤，請稍後再試");
    } finally {
      setCalculating(false);
    }
  }

  async function handleViewDiagram() {
    if (!form.styleCode || !form.specValue) return;
    setLoadingDiagram(true);
    const apiLeft = form.armMode === "right_only" ? "" : form.leftArmCode;
    const apiRight = form.armMode === "left_only" ? "" : effectiveRightCode;
    try {
      const res = await fetch("/api/legacy/diagrams/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style_code: form.styleCode,
          specification: form.specValue,
          width_adjustment: form.widthAdj,
          depth_adjustment: form.depthAdj,
          height_adjustment: form.heightAdj,
          platform_width_adjustment: form.platWidthAdj,
          platform_depth_adjustment: form.platDepthAdj,
          reverse_configuration: form.reverse,
          armrest_mode: form.armMode,
          left_armrest_style: apiLeft,
          right_armrest_style: apiRight,
          left_armrest_width: form.leftArmWidth,
          right_armrest_width: effectiveRightWidth,
        }),
      });
      if (!res.ok) { alert("圖面產生失敗"); return; }
      const blob = await res.blob();
      releaseDiagram();
      const url = URL.createObjectURL(blob);
      diagramBlobRef.current = url;
      setDiagramUrl(url);
    } catch {
      alert("圖面產生失敗");
    } finally {
      setLoadingDiagram(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.customer_quote.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (configError) {
    return <div className="mx-auto max-w-lg p-4"><p className="text-sm text-red-600">{configError}</p></div>;
  }
  if (!config) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
        <span className="ml-2 text-sm text-[var(--text-tertiary)]">載入設定中…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <h1 className="text-base font-semibold text-[var(--text-primary)]">POS 訂製報價</h1>

      {/* ── 款式 / 規格 / 面料 ──────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-secondary)]">款式</label>
          <button onClick={() => setShowStylePicker(true)}
            className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white">
            {selectedStyle ? `${selectedStyle.code} ${selectedStyle.name}` : "選擇款式"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-[var(--text-secondary)]">規格</label>
            <button onClick={() => setShowSpecPicker(true)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]">
              {form.specValue ? (selectedSpec?.label ?? form.specValue) : "選擇規格"}
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--text-secondary)]">面料</label>
            <button onClick={() => setShowMatPicker(true)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]">
              {selectedMatLevel ? selectedMatLevel.category_name : "選擇面料"}
            </button>
          </div>
        </div>
        {basePrice != null && (
          <p className="text-right text-xs text-[var(--text-tertiary)]">底價 {fmtPrice(basePrice)}</p>
        )}
      </div>

      {/* ── 尺寸微調 ─────────────────────────────────────────────────────── */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3 space-y-3">
        <p className="text-xs font-medium text-[var(--text-secondary)]">尺寸微調（cm）</p>
        <div className="grid grid-cols-3 gap-2">
          <AdjInput label="寬" value={form.widthAdj} onChange={(v) => patch({ widthAdj: v })} />
          <AdjInput label="深" value={form.depthAdj} onChange={(v) => patch({ depthAdj: v })} />
          <AdjInput label="高" value={form.heightAdj} onChange={(v) => patch({ heightAdj: v })} />
        </div>
        {selectedSpec?.supports_platform && (
          <>
            <p className="text-xs font-medium text-[var(--text-secondary)]">平台微調（cm）</p>
            <div className="grid grid-cols-2 gap-2">
              <AdjInput label="寬" value={form.platWidthAdj} onChange={(v) => patch({ platWidthAdj: v })} />
              <AdjInput label="深" value={form.platDepthAdj} onChange={(v) => patch({ platDepthAdj: v })} />
            </div>
          </>
        )}
        {selectedSpec?.supports_reverse && (
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" checked={form.reverse} onChange={(e) => patch({ reverse: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]" />
            反向配置
          </label>
        )}
      </div>

      {/* ── 改扶手 ───────────────────────────────────────────────────────── */}
      {armrestOptions.length > 0 && (
        <div className="space-y-2">
          <SectionDivider label="改扶手" />
          <div className="space-y-1">
            <label className="text-xs text-[var(--text-secondary)]">扶手模式</label>
            <PillRow
              options={ARM_MODES}
              value={form.armMode}
              onChange={(v) => { patch({ armMode: v }); setResult(null); releaseDiagram(); }}
            />
          </div>

          {showLeft && (
            <ArmPanel
              label={form.armMode === "both_same" ? "扶手（兩側相同）" : form.armMode === "both_different" ? "左側扶手" : "扶手"}
              armCode={form.leftArmCode}
              armWidth={form.leftArmWidth}
              boomStorage={form.leftBoomStorage}
              pillowFill={form.leftPillowFill}
              compatEntry={leftCompat}
              armrestOptions={armrestOptions}
              pillowFillOptions={pillowFillOptions}
              onOpenPicker={() => setShowLeftArmPicker(true)}
              onWidthChange={(v) => {
                const u: Partial<FormState> = { leftArmWidth: v };
                if (form.armMode === "both_same") u.rightArmWidth = v;
                patch(u);
              }}
              onBoomStorageChange={(v) => {
                const u: Partial<FormState> = { leftBoomStorage: v };
                if (form.armMode === "both_same") u.rightBoomStorage = v;
                patch(u);
              }}
              onPillowChange={(v) => {
                const u: Partial<FormState> = { leftPillowFill: v };
                if (form.armMode === "both_same") u.rightPillowFill = v;
                patch(u);
              }}
            />
          )}

          {showRight && (
            <ArmPanel
              label="右側扶手"
              armCode={form.rightArmCode}
              armWidth={form.rightArmWidth}
              boomStorage={form.rightBoomStorage}
              pillowFill={form.rightPillowFill}
              compatEntry={rightCompat}
              armrestOptions={armrestOptions}
              pillowFillOptions={pillowFillOptions}
              onOpenPicker={() => setShowRightArmPicker(true)}
              onWidthChange={(v) => patch({ rightArmWidth: v })}
              onBoomStorageChange={(v) => patch({ rightBoomStorage: v })}
              onPillowChange={(v) => patch({ rightPillowFill: v })}
            />
          )}

          {/* 即時改扶手費用 */}
          {form.armMode !== "none" && armCost > 0 && (
            <div className="rounded-[var(--radius-md)] bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
              改扶手費用：{fmtPrice(armCost)}
            </div>
          )}
        </div>
      )}

      {/* ── 進階客製 ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <SectionDivider label="進階客製" />
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] divide-y divide-[var(--border)]">

          {/* 改背枕 */}
          {selectedStyle?.supports_backrest_change && backrestStyles.length > 0 && (
            <div className="px-3 py-2.5 space-y-2">
              <label className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-primary)]">改背枕</p>
                  {adv.backrest_options?.pricing?.per_seat != null && (
                    <p className="text-xs text-red-500">+{adv.backrest_options.pricing.per_seat.toLocaleString()}/座</p>
                  )}
                </div>
                <input type="checkbox" checked={form.backrestChange}
                  onChange={(e) => patch({ backrestChange: e.target.checked, backrestTargetStyle: e.target.checked ? form.backrestTargetStyle : "" })}
                  className="h-5 w-5 rounded border-[var(--border)] accent-[var(--accent)]" />
              </label>
              {form.backrestChange && (
                <button onClick={() => setShowBackrestPicker(true)}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)]">
                  {form.backrestTargetStyle || "選擇背枕款式"}
                </button>
              )}
            </div>
          )}

          {/* 免滑軌 */}
          {selectedStyle?.has_slide_rail && (
            <label className="flex items-center justify-between px-3 py-2.5">
              <div>
                <p className="text-sm text-[var(--text-primary)]">免滑軌</p>
                {adv.slide_rail_config?.pricing?.standard_discount_per_seat != null && (
                  <p className="text-xs text-blue-500">
                    -{adv.slide_rail_config.pricing.standard_discount_per_seat.toLocaleString()}/座
                  </p>
                )}
              </div>
              <input type="checkbox" checked={form.noSlideRail} onChange={(e) => patch({ noSlideRail: e.target.checked })}
                className="h-5 w-5 rounded border-[var(--border)] accent-[var(--accent)]" />
            </label>
          )}

          {/* 平台置物 */}
          {selectedSpec?.supports_platform && (
            <div className="px-3 py-2.5 space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">平台置物</p>
              {selectedStyle?.has_platform_storage && (
                <label className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">扣除平台置物</span>
                  <input type="checkbox" checked={form.platformNoStorage}
                    onChange={(e) => patch({ platformNoStorage: e.target.checked })}
                    className="h-5 w-5 rounded border-[var(--border)] accent-[var(--accent)]" />
                </label>
              )}
              {platformStyles.length > 0 && (
                <>
                  <label className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-[var(--text-secondary)]">改置物平台款式</span>
                      {adv.platform_storage_config?.processing_fee != null && (
                        <p className="text-xs text-red-500">+手續費 {adv.platform_storage_config.processing_fee.toLocaleString()}</p>
                      )}
                    </div>
                    <input type="checkbox" checked={form.changeStoragePlatform}
                      onChange={(e) => patch({ changeStoragePlatform: e.target.checked, storagePlatformStyle: e.target.checked ? form.storagePlatformStyle : "" })}
                      className="h-5 w-5 rounded border-[var(--border)] accent-[var(--accent)]" />
                  </label>
                  {form.changeStoragePlatform && (
                    <div className="space-y-2">
                      <button onClick={() => setShowPlatformStylePicker(true)}
                        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)]">
                        {form.storagePlatformStyle || "選擇平台款式"}
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <AdjInput label="平台寬調整" value={form.storagePlatformWidthAdj} onChange={(v) => patch({ storagePlatformWidthAdj: v })} />
                        <AdjInput label="平台深調整" value={form.storagePlatformDepthAdj} onChange={(v) => patch({ storagePlatformDepthAdj: v })} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* USB 充電 */}
          <div className="px-3 py-2.5 space-y-2">
            <label className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-primary)]">USB 充電</p>
                {adv.usb_config?.price_per_unit != null && (
                  <p className="text-xs text-red-500">+{adv.usb_config.price_per_unit.toLocaleString()}/組</p>
                )}
              </div>
              <input type="checkbox" checked={form.addUsb} onChange={(e) => patch({ addUsb: e.target.checked })}
                className="h-5 w-5 rounded border-[var(--border)] accent-[var(--accent)]" />
            </label>
            {form.addUsb && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">數量</span>
                <Stepper value={form.usbCount} onChange={(v) => patch({ usbCount: v })} min={1}
                  max={adv.usb_config?.quantity_range?.max} />
              </div>
            )}
            {selectedStyle?.supports_standard_usb_removal && (
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input type="checkbox" checked={form.removeStandardUsb}
                  onChange={(e) => patch({ removeStandardUsb: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]" />
                扣除標配 USB
              </label>
            )}
          </div>

          {/* 無線充電 */}
          {selectedStyle?.supports_wireless_charging && (
            <div className="px-3 py-2.5 space-y-2">
              <label className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-primary)]">無線充電</p>
                  {adv.wireless_charging_config?.price_per_unit != null && (
                    <p className="text-xs text-red-500">+{adv.wireless_charging_config.price_per_unit.toLocaleString()}/組</p>
                  )}
                </div>
                <input type="checkbox" checked={form.addWirelessCharging}
                  onChange={(e) => patch({ addWirelessCharging: e.target.checked })}
                  className="h-5 w-5 rounded border-[var(--border)] accent-[var(--accent)]" />
              </label>
              {form.addWirelessCharging && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">數量</span>
                  <Stepper value={form.wirelessChargingCount} onChange={(v) => patch({ wirelessChargingCount: v })} min={1}
                    max={adv.wireless_charging_config?.quantity_range?.max} />
                </div>
              )}
            </div>
          )}

          {/* 桶身落地 */}
          <div className="px-3 py-2.5 space-y-1.5">
            <p className="text-sm text-[var(--text-primary)]">桶身落地</p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { value: "none" as GroundOption, label: "不落地", price: null },
                  { value: "half" as GroundOption, label: "半落地", price: adv.ground_config?.half_ground },
                  { value: "full" as GroundOption, label: "全落地", price: adv.ground_config?.full_ground },
                ] as const
              ).map((opt) => (
                <button key={opt.value} onClick={() => patch({ groundOption: opt.value })}
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    form.groundOption === opt.value
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
                  ].join(" ")}>
                  {opt.label}{opt.price != null ? ` (+${opt.price.toLocaleString()})` : ""}
                </button>
              ))}
            </div>
          </div>

          {/* 高度削減 */}
          <label className="flex items-center justify-between px-3 py-2.5">
            <div>
              <p className="text-sm text-[var(--text-primary)]">高度削減</p>
              {typeof adv.height_reduction === "number" && (
                <p className="text-xs text-blue-500">{adv.height_reduction.toLocaleString()}</p>
              )}
            </div>
            <input type="checkbox" checked={form.heightReduction} onChange={(e) => patch({ heightReduction: e.target.checked })}
              className="h-5 w-5 rounded border-[var(--border)] accent-[var(--accent)]" />
          </label>
        </div>
      </div>

      {/* ── 計算按鈕 ─────────────────────────────────────────────────────── */}
      <button onClick={() => void handleCalculate()}
        disabled={calculating || !form.styleCode || !form.specValue || !form.matLevelId}
        className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-base font-semibold text-white hover:opacity-90 disabled:opacity-40">
        {calculating ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 計算中…
          </span>
        ) : "計算報價"}
      </button>

      {calcError && <p className="text-sm text-red-600">{calcError}</p>}

      {/* ── 結果 ─────────────────────────────────────────────────────────── */}
      {result && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-3">
          {result.customer_quote.title && (
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {result.customer_quote.title}
            </p>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{fmtPrice(result.total)}</span>
            <span className="text-sm text-[var(--text-tertiary)]">訂金 {fmtPrice(result.deposit)}</span>
          </div>

          <div className="space-y-0.5 text-sm text-[var(--text-secondary)]">
            <div>沙發：{result.final_dimensions.sofa_width} × {result.final_dimensions.sofa_depth} cm</div>
            {result.final_dimensions.platform_width > 0 && (
              <div>平台：{result.final_dimensions.platform_width} × {result.final_dimensions.platform_depth} cm</div>
            )}
          </div>

          {Object.entries(result.breakdown).some(([, v]) => v !== 0) && (
            <div className="space-y-0.5 border-t border-[var(--border)] pt-2 text-xs">
              {Object.entries(result.breakdown)
                .filter(([, v]) => v !== 0)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[var(--text-tertiary)]">{BREAKDOWN_LABELS[k] ?? k}</span>
                    <span className={v > 0 ? "text-red-500" : "text-blue-500"}>
                      {v > 0 ? "+" : ""}{v.toLocaleString()}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="space-y-0.5">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600">⚠ {w}</p>
              ))}
            </div>
          )}

          {result.purchase_items && result.purchase_items.length > 0 && (
            <div className="space-y-1 border-t border-[var(--border)] pt-2">
              <p className="text-xs font-medium text-[var(--text-tertiary)]">採購品項</p>
              {result.purchase_items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-[var(--text-secondary)]">
                  <span>{item.name ?? item.item}</span>
                  <span>{item.quantity} {item.unit ?? item.remark ?? ""}</span>
                </div>
              ))}
            </div>
          )}

          {result.customer_quote.text && (
            <div className="border-t border-[var(--border)] pt-2 space-y-1">
              <p className="text-xs font-medium text-[var(--text-tertiary)]">報價明細</p>
              <pre className="whitespace-pre-wrap font-sans text-xs text-[var(--text-secondary)] leading-relaxed">
                {result.customer_quote.text}
              </pre>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => void handleCopy()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
              <Copy className="h-4 w-4" />
              {copied ? "已複製" : "複製文案"}
            </button>
            <button onClick={() => void handleViewDiagram()} disabled={loadingDiagram}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40">
              {loadingDiagram ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
              查看圖面
            </button>
          </div>
        </div>
      )}

      {/* ── Pickers ───────────────────────────────────────────────────────── */}
      <ActionSheetPicker
        open={showStylePicker} title="選擇款式"
        options={config.styles} getLabel={(s) => `${s.code} ${s.name}`}
        onSelect={(s) => {
          patch({ styleCode: s.code, matLevelId: Object.keys(s.base_prices)[0] ?? "" });
          setResult(null); releaseDiagram();
        }}
        onClose={() => setShowStylePicker(false)}
      />
      <ActionSheetPicker
        open={showSpecPicker} title="選擇規格"
        options={config.specifications} getLabel={(s) => s.label}
        onSelect={(s) => { patch({ specValue: s.value }); setResult(null); releaseDiagram(); }}
        onClose={() => setShowSpecPicker(false)}
      />
      <ActionSheetPicker
        open={showMatPicker} title="選擇面料"
        options={availableMatLevels} getLabel={(l) => `[${l.groupName}] ${l.category_name}`}
        onSelect={(l) => { patch({ matLevelId: l.category_id }); setResult(null); }}
        onClose={() => setShowMatPicker(false)}
      />
      <ActionSheetPicker
        open={showLeftArmPicker} title="選擇扶手款式"
        options={armrestOptions}
        getLabel={(o) => {
          const entry = getArmCompat(compat, form.styleCode, o.code);
          const badge = entry ? compatBadge(entry.compatible) : null;
          return badge ? `${o.name}  [${badge.text}]` : o.name;
        }}
        onSelect={(o) => selectArmStyle("left", o.code)}
        onClose={() => setShowLeftArmPicker(false)}
      />
      <ActionSheetPicker
        open={showRightArmPicker} title="選擇右側扶手款式"
        options={armrestOptions}
        getLabel={(o) => {
          const entry = getArmCompat(compat, form.styleCode, o.code);
          const badge = entry ? compatBadge(entry.compatible) : null;
          return badge ? `${o.name}  [${badge.text}]` : o.name;
        }}
        onSelect={(o) => selectArmStyle("right", o.code)}
        onClose={() => setShowRightArmPicker(false)}
      />
      {backrestStyles.length > 0 && (
        <ActionSheetPicker
          open={showBackrestPicker} title="選擇背枕款式"
          options={backrestStyles}
          getLabel={(s) => s}
          onSelect={(s) => patch({ backrestTargetStyle: s })}
          onClose={() => setShowBackrestPicker(false)}
        />
      )}
      {platformStyles.length > 0 && (
        <ActionSheetPicker
          open={showPlatformStylePicker} title="選擇置物平台款式"
          options={platformStyles}
          getLabel={(p) => `${p.name}（深度 ${p.depth}cm）`}
          onSelect={(p) => patch({ storagePlatformStyle: p.code })}
          onClose={() => setShowPlatformStylePicker(false)}
        />
      )}

      {diagramUrl && <DiagramModal diagramUrl={diagramUrl} onClose={releaseDiagram} />}
    </div>
  );
}
