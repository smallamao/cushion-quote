import { useState, useMemo, useCallback } from "react";

// ===== 作法 (Methods) — 同業行情參考基準（窗簾通路供應商報價）=====
// 春懋實際工資 = 同業行情 ×（1 + 品質溢價%）
const METHODS = {
  flat: {
    label: "平貼",
    desc: "不貼合泡棉，直接平裱",
    foamType: "none",
    minCai: 1,
    baseThickness: null,
    baseRate: 60,
    incrementPer05: 0,
    thicknessOptions: [],
  },
  single_headboard: {
    label: "單面床頭板",
    desc: "有木板（基本3才）",
    foamType: "medium",
    minCai: 3,
    baseThickness: 1.0,
    baseRate: 100,
    incrementPer05: 15,
    thicknessOptions: [1.0, 1.5, 2.0, 2.5, 3.0],
  },
  removable_headboard: {
    label: "活動床頭板",
    desc: "基本3才",
    foamType: "medium",
    minCai: 3,
    baseThickness: 1.0,
    baseRate: 155,
    incrementPer05: 20,
    thicknessOptions: [1.0, 1.5, 2.0, 2.5, 3.0],
  },
  single_daybed: {
    label: "單面臥榻",
    desc: "有木板（基本3才）",
    foamType: "high",
    minCai: 3,
    baseThickness: 2.0,
    baseRate: 180,
    incrementPer05: 20,
    thicknessOptions: [2.0, 2.5, 3.0],
  },
  double_daybed: {
    label: "雙面臥榻",
    desc: "基本4才",
    foamType: "high",
    minCai: 4,
    baseThickness: 2.0,
    baseRate: 210,
    incrementPer05: 20,
    thicknessOptions: [2.0, 2.5, 3.0],
  },
};

// ===== 面料預設 =====
const FABRIC_PRESETS = {
  domestic_fabric: { label: "國產家飾布", costPerCai: 18 },
  import_fabric: { label: "進口機能布/貓抓布", costPerCai: 45 },
  cat_scratch_israel: { label: "以色列貓抓布", costPerCai: 65 },
  pu_leather: { label: "人造皮革 PU", costPerCai: 30 },
  pvc_leather: { label: "PVC 皮革", costPerCai: 22 },
  genuine_leather: { label: "真皮（牛皮）", costPerCai: 120 },
  custom: { label: "自訂材料", costPerCai: 0 },
};

// ===== 其他加工項目 (from price table) =====
const EXTRAS = {
  leather_labor: { label: "皮革加工", cost: 50, unit: "才", type: "per_cai", desc: "皮革工資加價" },
  lining: { label: "加車裡布", cost: 60, unit: "才", type: "per_cai", desc: "正面加車內裡布" },
  anti_slip: { label: "背車止滑布", cost: 60, unit: "才", type: "per_cai", desc: "背面車止滑布" },
  power_hole: { label: "代釘電源孔", cost: 50, unit: "孔", type: "per_unit", desc: "每孔加收" },
};

// ===== 附加工程 =====
const ADDONS = {
  demolition: { label: "拆舊工程", unit: "式", unitCost: 2000 },
  install: { label: "現場安裝", unit: "次", unitCost: 3500 },
  floor_surcharge: { label: "高樓層搬運加價", unit: "式", unitCost: 2000 },
  rush_3day: { label: "急件（3日內）", unit: "%", unitCost: 40 },
  rush_1day: { label: "超急件（隔日）", unit: "%", unitCost: 80 },
};

// ===== 通路設定 =====
const CHANNEL_DEFAULTS = {
  wholesale: { label: "批發價", sublabel: "窗簾店/軟裝店", min: 1.0, max: 2.0, default: 1.4, color: "#2563eb" },
  designer: { label: "設計師價", sublabel: "室內設計師", min: 1.5, max: 3.0, default: 2.0, color: "#7c3aed" },
  retail: { label: "終端屋主價", sublabel: "直客零售", min: 2.0, max: 4.0, default: 2.8, color: "#dc2626" },
};

// ===== Helper: calculate labor rate per 才 =====
function calcLaborRate(method, thickness) {
  const m = METHODS[method];
  if (m.foamType === "none") return m.baseRate;
  const steps = (thickness - m.baseThickness) / 0.5;
  return m.baseRate + steps * m.incrementPer05;
}

// ===== UI Components =====
function NumberInput({ value, onChange, min = 0, max, step = 1, unit, label, sublabel, compact, inputWidth: w }) {
  return (
    <div style={{ display: "flex", alignItems: compact ? "center" : "flex-start", gap: compact ? 8 : 4, flexDirection: compact ? "row" : "column" }}>
      {label && (
        <div style={{ minWidth: compact ? 100 : "auto" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>{label}</div>
          {sublabel && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{sublabel}</div>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.max(min, max !== undefined ? Math.min(max, v) : v));
          }}
          min={min}
          max={max}
          step={step}
          style={{
            width: w || (compact ? 72 : 88),
            padding: "6px 8px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "'DM Mono', monospace",
            background: "var(--input-bg)",
            color: "var(--text-primary)",
            textAlign: "right",
          }}
        />
        {unit && <span style={{ fontSize: 12, color: "var(--text-tertiary)", minWidth: 20 }}>{unit}</span>}
      </div>
    </div>
  );
}

function Section({ title, subtitle, children, accent }) {
  return (
    <div style={{
      background: "var(--card-bg)",
      borderRadius: 12,
      border: "1px solid var(--border)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
        background: accent ? `${accent}08` : "transparent",
        borderLeft: accent ? `3px solid ${accent}` : "none",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

function MethodCard({ method, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
        background: isSelected ? "var(--accent-dim)" : "var(--input-bg)",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s",
        width: "100%",
      }}
    >
      <div style={{
        fontSize: 14,
        fontWeight: isSelected ? 700 : 500,
        color: isSelected ? "var(--accent)" : "var(--text-primary)",
      }}>{method.label}</div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
        {method.desc}
        {method.foamType !== "none" && ` ・ ${method.foamType === "medium" ? "中密度" : "高密度"}泡棉`}
      </div>
    </button>
  );
}

function ThicknessSelector({ options, value, onChange, method, premium }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((t) => {
        const refRate = calcLaborRate(method, t);
        const actualRate = Math.round(refRate * (1 + premium / 100));
        const isSelected = value === t;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1.5px solid ${isSelected ? "#22c55e" : "var(--border)"}`,
              background: isSelected ? "#22c55e15" : "var(--input-bg)",
              cursor: "pointer",
              textAlign: "center",
              transition: "all 0.15s",
              minWidth: 70,
            }}
          >
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "'DM Mono', monospace",
              color: isSelected ? "#22c55e" : "var(--text-primary)",
            }}>{t}"</div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2, textDecoration: "line-through" }}>
              ${refRate}
            </div>
            <div style={{ fontSize: 12, color: isSelected ? "#22c55e" : "var(--text-secondary)", fontWeight: 600 }}>
              ${actualRate}/才
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ===== Main Calculator =====
export default function PricingCalculator() {
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(120);
  const [method, setMethod] = useState("single_headboard");
  const [thickness, setThickness] = useState(1.0);
  const [fabric, setFabric] = useState("import_fabric");
  const [customFabricCost, setCustomFabricCost] = useState(50);
  const [wasteRate, setWasteRate] = useState(15);
  const [qualityPremium, setQualityPremium] = useState(10); // 品質溢價 %，預設 10%
  const [activeExtras, setActiveExtras] = useState({});
  const [activeAddons, setActiveAddons] = useState({});
  const [channels, setChannels] = useState({
    wholesale: CHANNEL_DEFAULTS.wholesale.default,
    designer: CHANNEL_DEFAULTS.designer.default,
    retail: CHANNEL_DEFAULTS.retail.default,
  });
  const [qty, setQty] = useState(1);

  const handleMethodChange = useCallback((m) => {
    setMethod(m);
    const opts = METHODS[m].thicknessOptions;
    if (opts.length > 0 && !opts.includes(thickness)) {
      setThickness(opts[0]);
    }
  }, [thickness]);

  const toggleExtra = useCallback((key) => {
    setActiveExtras((prev) => {
      const next = { ...prev };
      if (next[key] !== undefined) { delete next[key]; } else { next[key] = EXTRAS[key].type === "per_unit" ? 1 : true; }
      return next;
    });
  }, []);

  const toggleAddon = useCallback((key) => {
    setActiveAddons((prev) => {
      const next = { ...prev };
      if (next[key] !== undefined) { delete next[key]; } else { next[key] = ADDONS[key].unit === "%" ? 1 : 1; }
      return next;
    });
  }, []);

  const calc = useMemo(() => {
    const m = METHODS[method];

    // 1. 才數
    const rawCai = (width * height) / 900;
    const caiCount = Math.max(Math.ceil(rawCai * 10) / 10, m.minCai);
    const appliedMinimum = rawCai < m.minCai;

    // 2. 工資/才（含絲棉）
    const refLaborRate = calcLaborRate(method, m.foamType === "none" ? 0 : thickness);
    const laborRate = Math.round(refLaborRate * (1 + qualityPremium / 100));

    // 3. 面料成本/才
    const fabricCost = fabric === "custom" ? customFabricCost : FABRIC_PRESETS[fabric].costPerCai;
    const fabricWithWaste = fabricCost * (1 + wasteRate / 100);

    // 4. 其他加工/才
    let extrasPerCai = 0;
    let extrasFixed = 0;
    Object.entries(activeExtras).forEach(([key, val]) => {
      const ex = EXTRAS[key];
      if (ex.type === "per_cai") {
        extrasPerCai += ex.cost;
      } else if (ex.type === "per_unit") {
        extrasFixed += ex.cost * val;
      }
    });

    // 5. 每才單價
    const pricePerCai = laborRate + fabricWithWaste + extrasPerCai;

    // 6. 每片基礎價格
    const basePricePerPiece = pricePerCai * caiCount + extrasFixed;

    // 7. 附加工程
    let addonFixed = 0;
    let addonPercent = 0;
    Object.entries(activeAddons).forEach(([key, addonQty]) => {
      const addon = ADDONS[key];
      if (addon.unit === "%") {
        addonPercent += addon.unitCost;
      } else {
        addonFixed += addon.unitCost * addonQty;
      }
    });
    const addonPercentAmount = basePricePerPiece * (addonPercent / 100);
    const totalAddonPerPiece = addonPercentAmount + (addonFixed / Math.max(qty, 1));

    // 8. 工廠完全成本
    const factoryCost = basePricePerPiece + totalAddonPerPiece;
    const costPerCai = factoryCost / caiCount;

    // 9. 三通路報價
    const channelPrices = {};
    const grossMargins = {};
    Object.entries(channels).forEach(([ch, mult]) => {
      const total = Math.round(factoryCost * mult / 10) * 10;
      const perCai = Math.round(total / caiCount);
      channelPrices[ch] = { total, perCai };
      grossMargins[ch] = ((total - factoryCost) / total * 100).toFixed(1);
    });

    return {
      rawCai: rawCai.toFixed(2),
      caiCount,
      appliedMinimum,
      refLaborRate,
      laborRate,
      fabricCost: Math.round(fabricCost),
      fabricWithWaste: Math.round(fabricWithWaste),
      extrasPerCai,
      extrasFixed,
      pricePerCai: Math.round(pricePerCai),
      basePricePerPiece: Math.round(basePricePerPiece),
      addonFixed,
      addonPercent,
      totalAddon: Math.round(totalAddonPerPiece),
      factoryCost: Math.round(factoryCost),
      costPerCai: Math.round(costPerCai),
      channelPrices,
      grossMargins,
      batchTotal: {
        wholesale: channelPrices.wholesale.total * qty,
        designer: channelPrices.designer.total * qty,
        retail: channelPrices.retail.total * qty,
      },
    };
  }, [width, height, method, thickness, fabric, customFabricCost, wasteRate, qualityPremium, activeExtras, activeAddons, channels, qty]);

  const currentMethod = METHODS[method];

  return (
    <div style={{
      "--bg": "#0c0e14",
      "--card-bg": "#14171f",
      "--input-bg": "#1a1e28",
      "--border": "#262b3a",
      "--text-primary": "#e8eaf0",
      "--text-secondary": "#9ca3b4",
      "--text-tertiary": "#5c6478",
      "--formula-bg": "#10131a",
      "--accent": "#f59e0b",
      "--accent-dim": "#f59e0b18",
      "--green": "#22c55e",
      fontFamily: "'Noto Sans TC', -apple-system, sans-serif",
      background: "var(--bg)",
      color: "var(--text-primary)",
      minHeight: "100vh",
      padding: "24px 16px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>
              繃布工程報價計算器
            </h1>
            <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, background: "var(--accent-dim)", padding: "2px 8px", borderRadius: 4 }}>
              春懋 v2.1
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
            報價 =（同業工資×品質溢價 + 面料×損耗 + 其他加工）× 才數 + 附加工程）× 通路倍率
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* ===== Left Column ===== */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* 尺寸 */}
            <Section title="尺寸" subtitle="寬 × 高 → 才數" accent="#3b82f6">
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <NumberInput value={width} onChange={setWidth} min={10} step={5} unit="cm" label="寬度" />
                <span style={{ fontSize: 20, color: "var(--text-tertiary)", marginTop: 18 }}>×</span>
                <NumberInput value={height} onChange={setHeight} min={10} step={5} unit="cm" label="高度" />
                <div style={{
                  background: "var(--accent-dim)",
                  borderRadius: 8,
                  padding: "8px 14px",
                  marginTop: 18,
                }}>
                  <div style={{ fontSize: 11, color: "var(--accent)" }}>才數</div>
                  <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'DM Mono', monospace", color: "var(--accent)" }}>
                    {calc.caiCount}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
                {width}×{height} ÷ 900 = {calc.rawCai} 才
                {calc.appliedMinimum && (
                  <span style={{ color: "var(--accent)", marginLeft: 6 }}>
                    ⚠ 低於基本才數，以 {currentMethod.minCai} 才計
                  </span>
                )}
              </div>
            </Section>

            {/* 作法 + 泡棉 */}
            <Section title="作法 ＆ 泡棉" subtitle="同業行情為基準，加品質溢價 → 春懋工資" accent="var(--accent)">
              {/* 品質溢價 slider */}
              <div style={{
                background: "#f59e0b10",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 14,
                border: "1px solid #f59e0b30",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>品質溢價</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>相對同業行情的加價幅度</div>
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 900, fontFamily: "'DM Mono', monospace", color: "var(--accent)" }}>
                    +{qualityPremium}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={qualityPremium}
                  onChange={(e) => setQualityPremium(parseInt(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-tertiary)" }}>
                  <span>0%（同行情）</span>
                  <span>+30%</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(METHODS).map(([key, m]) => (
                  <MethodCard
                    key={key}
                    method={m}
                    isSelected={method === key}
                    onClick={() => handleMethodChange(key)}
                  />
                ))}
              </div>

              {currentMethod.foamType !== "none" && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500, marginBottom: 8 }}>
                    {currentMethod.foamType === "medium" ? "中密度" : "高密度"}泡棉厚度
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 6 }}>
                      每半英吋 +${currentMethod.incrementPer05}/才
                    </span>
                  </div>
                  <ThicknessSelector
                    options={currentMethod.thicknessOptions}
                    value={thickness}
                    onChange={setThickness}
                    method={method}
                    premium={qualityPremium}
                  />
                </div>
              )}

              <div style={{
                marginTop: 14,
                background: "var(--formula-bg)",
                borderRadius: 8,
                padding: "12px 14px",
                border: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>春懋工資（含絲棉）</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                      同業 ${calc.refLaborRate} × {(1 + qualityPremium / 100).toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: 22,
                      fontWeight: 900,
                      fontFamily: "'DM Mono', monospace",
                      color: "var(--accent)",
                    }}>
                      ${calc.laborRate}<span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)" }}>/才</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", textDecoration: "line-through" }}>
                      同業行情 ${calc.refLaborRate}/才
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* 面料成本 */}
            <Section title="面料成本" subtitle="布料/皮革單價 + 損耗率" accent="#22c55e">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <select
                  value={fabric}
                  onChange={(e) => setFabric(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 13,
                    background: "var(--input-bg)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  {Object.entries(FABRIC_PRESETS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}{k !== "custom" ? ` (${v.costPerCai}元/才)` : ""}</option>
                  ))}
                </select>
                {fabric === "custom" && (
                  <NumberInput value={customFabricCost} onChange={setCustomFabricCost} min={1} unit="元/才" label="自訂面料單價" />
                )}
                <NumberInput value={wasteRate} onChange={setWasteRate} min={5} max={40} unit="%" label="損耗率" compact />
                <div style={{
                  background: "var(--formula-bg)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>面料含損耗</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                      ${calc.fabricCost} × {(1 + wasteRate / 100).toFixed(2)}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#22c55e" }}>
                    ${calc.fabricWithWaste}<span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)" }}>/才</span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 其他加工 */}
            <Section title="其他加工" subtitle="依春懋價目表" accent="#ec4899">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(EXTRAS).map(([key, ex]) => {
                  const isActive = activeExtras[key] !== undefined;
                  return (
                    <div key={key} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: isActive ? "#ec489915" : "transparent",
                      border: `1px solid ${isActive ? "#ec4899" : "var(--border)"}`,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}>
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => toggleExtra(key)}
                        style={{ accentColor: "#ec4899" }}
                      />
                      <div style={{ flex: 1 }} onClick={() => toggleExtra(key)}>
                        <span style={{ fontSize: 13, color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
                          {ex.label}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 8 }}>{ex.desc}</span>
                      </div>
                      {isActive && ex.type === "per_unit" && (
                        <NumberInput
                          value={activeExtras[key]}
                          onChange={(v) => setActiveExtras((prev) => ({ ...prev, [key]: v }))}
                          min={1}
                          max={50}
                          unit={ex.unit}
                          compact
                        />
                      )}
                      <span style={{
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: "'DM Mono', monospace",
                        color: isActive ? "#ec4899" : "var(--text-tertiary)",
                        minWidth: 60,
                        textAlign: "right",
                      }}>
                        +${ex.cost}/{ex.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* 附加工程 */}
            <Section title="附加工程" subtitle="安裝、急件等額外費用">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(ADDONS).map(([key, addon]) => {
                  const isActive = activeAddons[key] !== undefined;
                  return (
                    <div key={key} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: isActive ? "var(--accent-dim)" : "transparent",
                      border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}>
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => toggleAddon(key)}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      <span style={{ fontSize: 13, flex: 1, color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}
                        onClick={() => toggleAddon(key)}>
                        {addon.label}
                      </span>
                      {isActive && addon.unit !== "%" && (
                        <NumberInput
                          value={activeAddons[key]}
                          onChange={(v) => setActiveAddons((prev) => ({ ...prev, [key]: v }))}
                          min={1}
                          max={20}
                          unit={addon.unit}
                          compact
                        />
                      )}
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", minWidth: 70, textAlign: "right" }}>
                        {addon.unit === "%" ? `+${addon.unitCost}%` : `${addon.unitCost}元/${addon.unit}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>

          {/* ===== Right Column ===== */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* 每才單價拆解 */}
            <Section title="每才單價拆解" accent="var(--accent)">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: `工資含絲棉（${currentMethod.label}${currentMethod.foamType !== "none" ? ` ${thickness}"` : ""} +${qualityPremium}%溢價）`, value: calc.laborRate, color: "var(--accent)" },
                  { label: `面料含損耗（${FABRIC_PRESETS[fabric].label}）`, value: calc.fabricWithWaste, color: "#22c55e" },
                  ...(calc.extrasPerCai > 0 ? [{ label: "其他加工", value: calc.extrasPerCai, color: "#ec4899" }] : []),
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 3, height: 20, borderRadius: 2, background: item.color }} />
                    <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>{item.label}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                      ${item.value}
                    </span>
                  </div>
                ))}
                <div style={{ borderTop: "2px solid var(--accent)", paddingTop: 10, marginTop: 6, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>每才合計</span>
                  <span style={{ fontSize: 24, fontWeight: 900, fontFamily: "'DM Mono', monospace", color: "var(--accent)" }}>
                    NT${calc.pricePerCai}<span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)" }}>/才</span>
                  </span>
                </div>
              </div>
            </Section>

            {/* 每片成本 */}
            <Section title="每片成本" subtitle={`${calc.caiCount} 才 × $${calc.pricePerCai}/才${calc.extrasFixed > 0 ? ` + $${calc.extrasFixed}` : ""}`} accent="var(--accent)">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>基礎價格</span>
                  <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                    NT${calc.basePricePerPiece.toLocaleString()}
                  </span>
                </div>
                {calc.totalAddon > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      附加工程{calc.addonPercent > 0 && ` (+${calc.addonPercent}%)`}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                      +${calc.totalAddon.toLocaleString()}
                    </span>
                  </div>
                )}
                <div style={{ borderTop: "2px solid var(--accent)", paddingTop: 10, marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>工廠完全成本</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 26, fontWeight: 900, fontFamily: "'DM Mono', monospace", color: "var(--accent)" }}>
                      NT${calc.factoryCost.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>每才 ${calc.costPerCai}/才</div>
                  </div>
                </div>
              </div>
            </Section>

            {/* 通路倍率 */}
            <Section title="通路倍率" subtitle="拖動調整各通路加價倍率">
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {Object.entries(CHANNEL_DEFAULTS).map(([key, ch]) => (
                  <div key={key}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: ch.color }}>{ch.label}</span>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 6 }}>{ch.sublabel}</span>
                      </div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: ch.color }}>
                        ×{channels[key].toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={ch.min * 10}
                      max={ch.max * 10}
                      value={channels[key] * 10}
                      onChange={(e) => setChannels((prev) => ({ ...prev, [key]: parseInt(e.target.value) / 10 }))}
                      style={{ width: "100%", accentColor: ch.color }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-tertiary)" }}>
                      <span>{ch.min}×</span>
                      <span>{ch.max}×</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* 三通路報價 */}
            <Section title="三通路報價" subtitle="每片含工帶料報價">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(CHANNEL_DEFAULTS).map(([key, ch]) => {
                  const price = calc.channelPrices[key];
                  const margin = calc.grossMargins[key];
                  const profit = price.total - calc.factoryCost;
                  return (
                    <div key={key} style={{
                      background: `${ch.color}10`,
                      borderRadius: 10,
                      padding: "14px 16px",
                      borderLeft: `4px solid ${ch.color}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: ch.color }}>{ch.label}</div>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            ×{channels[key].toFixed(1)} ｜ 毛利 {margin}%
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'DM Mono', monospace", color: ch.color }}>
                            NT${price.total.toLocaleString()}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                            ${price.perCai}/才 ｜ 利潤 ${profit.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* 批量 */}
            <Section title="批量報價">
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <NumberInput value={qty} onChange={setQty} min={1} max={999} unit="片" label="訂購數量" compact />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {Object.entries(CHANNEL_DEFAULTS).map(([key, ch]) => (
                  <div key={key} style={{
                    textAlign: "center",
                    padding: "10px 8px",
                    borderRadius: 8,
                    background: `${ch.color}10`,
                  }}>
                    <div style={{ fontSize: 11, color: ch.color, fontWeight: 600 }}>{ch.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 900, fontFamily: "'DM Mono', monospace", color: ch.color, marginTop: 4 }}>
                      ${calc.batchTotal[key].toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* 公式參考 */}
            <div style={{
              background: "var(--formula-bg)",
              borderRadius: 10,
              padding: "14px 18px",
              border: "1px solid var(--border)",
              fontSize: 11,
              lineHeight: 2.2,
              fontFamily: "'DM Mono', monospace",
              color: "var(--text-tertiary)",
            }}>
              <div style={{ fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4, fontSize: 12 }}>完整公式</div>
              <div>才數 = max(⌈寬×高÷900⌉, 基本才數)</div>
              <div>工資/才 = (基準價 + 厚度加價) × (1+品質溢價%)</div>
              <div>面料/才 = 面料單價 × (1+損耗率)</div>
              <div>每才合計 = 工資 + 面料 + 其他加工</div>
              <div>每片成本 = 每才合計 × 才數 + 固定附加</div>
              <div style={{ color: "var(--accent)", fontWeight: 600 }}>
                報價 = 每片成本 × 通路倍率
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
