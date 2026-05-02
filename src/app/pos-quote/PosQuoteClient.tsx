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

type PosConfig = {
  specifications: PosSpec[];
  styles: PosStyle[];
  material_groups: MatGroup[];
};

type CalcResult = {
  total: number;
  deposit: number;
  style_name: string;
  material_name: string;
  specification: string;
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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return `$${n.toLocaleString()}`;
}

// ─── Action Sheet Picker ──────────────────────────────────────────────────────

function ActionSheetPicker<T>({
  open,
  title,
  options,
  getLabel,
  onSelect,
  onClose,
}: {
  open: boolean;
  title: string;
  options: T[];
  getLabel: (item: T) => string;
  onSelect: (item: T) => void;
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
            <button
              key={idx}
              onClick={() => {
                onSelect(item);
                onClose();
              }}
              className="w-full px-4 py-3.5 text-left text-base font-medium text-[var(--accent)]"
            >
              {getLabel(item)}
            </button>
          ))}
        </div>
        <div className="border-t-8 border-[var(--bg-subtle)]">
          <button
            onClick={onClose}
            className="w-full py-3.5 text-base font-medium text-[var(--accent)]"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Number Adj Input ─────────────────────────────────────────────────────────

function AdjInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={[
          "w-full rounded-[var(--radius-sm)] border bg-[var(--bg-elevated)] px-2 py-1.5 text-center text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent)]",
          value !== 0
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-[var(--border)] text-[var(--text-primary)]",
        ].join(" ")}
      />
    </div>
  );
}

// ─── Diagram Modal ────────────────────────────────────────────────────────────

function DiagramModal({
  diagramUrl,
  onClose,
}: {
  diagramUrl: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-h-[90dvh] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={diagramUrl} alt="沙發圖面" className="max-h-[85dvh] max-w-full rounded-lg object-contain" />
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded-full bg-black/50 px-3 py-1 text-sm text-white"
        >
          關閉
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PosQuoteClient() {
  const [config, setConfig] = useState<PosConfig | null>(null);
  const [configError, setConfigError] = useState("");

  const [styleCode, setStyleCode] = useState("");
  const [specValue, setSpecValue] = useState("");
  const [matLevelId, setMatLevelId] = useState("");

  const [widthAdj, setWidthAdj] = useState(0);
  const [depthAdj, setDepthAdj] = useState(0);
  const [heightAdj, setHeightAdj] = useState(0);
  const [platWidthAdj, setPlatWidthAdj] = useState(0);
  const [platDepthAdj, setPlatDepthAdj] = useState(0);
  const [reverse, setReverse] = useState(false);

  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [calcError, setCalcError] = useState("");

  const [loadingDiagram, setLoadingDiagram] = useState(false);
  const [diagramUrl, setDiagramUrl] = useState<string | null>(null);
  const diagramBlobRef = useRef<string | null>(null);

  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showSpecPicker, setShowSpecPicker] = useState(false);
  const [showMatPicker, setShowMatPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/legacy/pos/config")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PosConfig>;
      })
      .then((data) => {
        setConfig(data);
        if (data.styles.length > 0) {
          const first = data.styles[0];
          setStyleCode(first.code);
          const firstLevelId = Object.keys(first.base_prices)[0] ?? "";
          setMatLevelId(firstLevelId);
        }
        if (data.specifications.length > 0) {
          setSpecValue(data.specifications[0].value);
        }
      })
      .catch(() => setConfigError("無法載入設定，請確認後端服務狀態"));
  }, []);

  const selectedStyle = config?.styles.find((s) => s.code === styleCode) ?? null;
  const selectedSpec = config?.specifications.find((s) => s.value === specValue) ?? null;

  const availableMatLevels: (MatLevel & { groupName: string })[] = config
    ? config.material_groups.flatMap((g) =>
        g.levels
          .filter((l) => selectedStyle && l.category_id in selectedStyle.base_prices)
          .map((l) => ({ ...l, groupName: g.name })),
      )
    : [];

  const selectedMatLevel = availableMatLevels.find((l) => l.category_id === matLevelId) ?? null;

  // Reset mat level when style changes to first available
  function handleStyleSelect(s: PosStyle) {
    setStyleCode(s.code);
    const firstId = Object.keys(s.base_prices)[0] ?? "";
    setMatLevelId(firstId);
    setResult(null);
    releaseDiagram();
  }

  function releaseDiagram() {
    if (diagramBlobRef.current) {
      URL.revokeObjectURL(diagramBlobRef.current);
      diagramBlobRef.current = null;
    }
    setDiagramUrl(null);
  }

  async function handleCalculate() {
    if (!styleCode || !specValue || !matLevelId) return;
    setCalculating(true);
    setCalcError("");
    setResult(null);
    releaseDiagram();

    try {
      const res = await fetch("/api/legacy/pos/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style_code: styleCode,
          specification: specValue,
          material_level: matLevelId,
          width_adj: widthAdj,
          depth_adj: depthAdj,
          height_adj: heightAdj,
          platform_width_adj: platWidthAdj,
          platform_depth_adj: platDepthAdj,
          armrest_mode: "none",
          left_armrest_style: "",
          right_armrest_style: "",
          reverse_configuration: reverse,
          include_material: true,
          include_advanced: false,
        }),
      });
      const data = (await res.json()) as CalcResult & { detail?: string };
      if (!res.ok) {
        setCalcError(data.detail ?? "計算失敗");
      } else {
        setResult(data);
      }
    } catch {
      setCalcError("網路錯誤，請稍後再試");
    } finally {
      setCalculating(false);
    }
  }

  async function handleViewDiagram() {
    if (!styleCode || !specValue) return;
    setLoadingDiagram(true);
    try {
      const res = await fetch("/api/legacy/diagrams/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style_code: styleCode,
          specification: specValue,
          width_adjustment: widthAdj,
          depth_adjustment: depthAdj,
          height_adjustment: heightAdj,
          platform_width_adjustment: platWidthAdj,
          platform_depth_adjustment: platDepthAdj,
          armrest_mode: "none",
          left_armrest_style: "",
          right_armrest_style: "",
          reverse_configuration: reverse,
        }),
      });
      if (!res.ok) {
        alert("圖面產生失敗");
        return;
      }
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

  const basePrice =
    selectedStyle && matLevelId ? (selectedStyle.base_prices[matLevelId] ?? null) : null;

  if (configError) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <p className="text-sm text-red-600">{configError}</p>
      </div>
    );
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

      {/* Selectors */}
      <div className="space-y-2">
        {/* Style */}
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-secondary)]">款式</label>
          <button
            onClick={() => setShowStylePicker(true)}
            className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white"
          >
            {selectedStyle ? `${selectedStyle.code} ${selectedStyle.name}` : "選擇款式"}
          </button>
        </div>

        {/* Spec + Material in 2 cols */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-[var(--text-secondary)]">規格</label>
            <button
              onClick={() => setShowSpecPicker(true)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
            >
              {specValue || "選擇規格"}
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--text-secondary)]">面料</label>
            <button
              onClick={() => setShowMatPicker(true)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
            >
              {selectedMatLevel ? selectedMatLevel.category_name : "選擇面料"}
            </button>
          </div>
        </div>

        {/* Base price hint */}
        {basePrice != null && (
          <p className="text-right text-xs text-[var(--text-tertiary)]">
            底價 {fmtPrice(basePrice)}
          </p>
        )}
      </div>

      {/* Adjustments */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3 space-y-3">
        <p className="text-xs font-medium text-[var(--text-secondary)]">尺寸微調（cm）</p>
        <div className="grid grid-cols-3 gap-2">
          <AdjInput label="寬" value={widthAdj} onChange={setWidthAdj} />
          <AdjInput label="深" value={depthAdj} onChange={setDepthAdj} />
          <AdjInput label="高" value={heightAdj} onChange={setHeightAdj} />
        </div>
        {selectedSpec?.supports_platform && (
          <>
            <p className="text-xs font-medium text-[var(--text-secondary)]">平台微調（cm）</p>
            <div className="grid grid-cols-2 gap-2">
              <AdjInput label="寬" value={platWidthAdj} onChange={setPlatWidthAdj} />
              <AdjInput label="深" value={platDepthAdj} onChange={setPlatDepthAdj} />
            </div>
          </>
        )}
        {selectedSpec?.supports_reverse && (
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={reverse}
              onChange={(e) => setReverse(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
            />
            反向配置
          </label>
        )}
      </div>

      {/* Calculate button */}
      <button
        onClick={() => void handleCalculate()}
        disabled={calculating || !styleCode || !specValue || !matLevelId}
        className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-base font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        {calculating ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 計算中…
          </span>
        ) : (
          "計算報價"
        )}
      </button>

      {calcError && <p className="text-sm text-red-600">{calcError}</p>}

      {/* Result */}
      {result && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold text-[var(--text-primary)]">
              {fmtPrice(result.total)}
            </span>
            <span className="text-sm text-[var(--text-tertiary)]">
              訂金 {fmtPrice(result.deposit)}
            </span>
          </div>

          {/* Dimensions */}
          <div className="space-y-0.5 text-sm text-[var(--text-secondary)]">
            <div>
              沙發：{result.final_dimensions.sofa_width} × {result.final_dimensions.sofa_depth} cm
            </div>
            {result.final_dimensions.platform_width > 0 && (
              <div>
                平台：{result.final_dimensions.platform_width} ×{" "}
                {result.final_dimensions.platform_depth} cm
              </div>
            )}
          </div>

          {/* Breakdown — only non-zero items */}
          {Object.entries(result.breakdown).some(([, v]) => v !== 0) && (
            <div className="space-y-0.5 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-tertiary)]">
              {Object.entries(result.breakdown)
                .filter(([, v]) => v !== 0)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span className={v > 0 ? "text-blue-500" : "text-red-500"}>
                      {v > 0 ? "+" : ""}
                      {v.toLocaleString()}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="space-y-0.5">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void handleCopy()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              <Copy className="h-4 w-4" />
              {copied ? "已複製" : "複製文案"}
            </button>
            <button
              onClick={() => void handleViewDiagram()}
              disabled={loadingDiagram}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              {loadingDiagram ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileImage className="h-4 w-4" />
              )}
              查看圖面
            </button>
          </div>
        </div>
      )}

      {/* Pickers */}
      <ActionSheetPicker
        open={showStylePicker}
        title="選擇款式"
        options={config.styles}
        getLabel={(s) => `${s.code} ${s.name}`}
        onSelect={handleStyleSelect}
        onClose={() => setShowStylePicker(false)}
      />
      <ActionSheetPicker
        open={showSpecPicker}
        title="選擇規格"
        options={config.specifications}
        getLabel={(s) => s.label}
        onSelect={(s) => {
          setSpecValue(s.value);
          setResult(null);
          releaseDiagram();
        }}
        onClose={() => setShowSpecPicker(false)}
      />
      <ActionSheetPicker
        open={showMatPicker}
        title="選擇面料"
        options={availableMatLevels}
        getLabel={(l) => `[${l.groupName}] ${l.category_name}`}
        onSelect={(l) => {
          setMatLevelId(l.category_id);
          setResult(null);
        }}
        onClose={() => setShowMatPicker(false)}
      />

      {diagramUrl && (
        <DiagramModal diagramUrl={diagramUrl} onClose={releaseDiagram} />
      )}
    </div>
  );
}
