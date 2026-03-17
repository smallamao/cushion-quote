import type {
  AddonType,
  Category,
  Channel,
  ClientType,
  ExtraItem,
  FlexQuoteItem,
  Material,
  MethodConfig,
  SystemSettings,
} from "@/lib/types";

export const METHODS: Record<MethodConfig["id"], MethodConfig> = {
  flat: {
    id: "flat",
    label: "平貼",
    desc: "不貼合泡棉，直接平裱。",
    minCai: 1,
    baseThickness: null,
    baseRate: 60,
    incrementPerHalfInch: 0,
    thicknessOptions: [],
  },
  single_headboard: {
    id: "single_headboard",
    label: "單面床頭板",
    desc: "有木板，基本 3 才。",
    minCai: 3,
    baseThickness: 1,
    baseRate: 100,
    incrementPerHalfInch: 15,
    thicknessOptions: [1, 1.5, 2, 2.5, 3],
  },
  removable_headboard: {
    id: "removable_headboard",
    label: "活動床頭板",
    desc: "可拆式板件，基本 3 才。",
    minCai: 3,
    baseThickness: 1,
    baseRate: 155,
    incrementPerHalfInch: 20,
    thicknessOptions: [1, 1.5, 2, 2.5, 3],
  },
  single_daybed: {
    id: "single_daybed",
    label: "單面臥榻",
    desc: "有木板，基本 3 才。",
    minCai: 3,
    baseThickness: 2,
    baseRate: 180,
    incrementPerHalfInch: 20,
    thicknessOptions: [2, 2.5, 3],
  },
  double_daybed: {
    id: "double_daybed",
    label: "雙面臥榻",
    desc: "雙面包覆，基本 4 才。",
    minCai: 4,
    baseThickness: 2,
    baseRate: 210,
    incrementPerHalfInch: 20,
    thicknessOptions: [2, 2.5, 3],
  },
  foam_core: {
    id: "foam_core",
    label: "泡棉內裡",
    desc: "純泡棉內裡，以體積(立方英吋)×係數計價，不含布料。",
    minCai: 1,
    baseThickness: 2,
    baseRate: 0,
    incrementPerHalfInch: 0,
    thicknessOptions: [1, 1.5, 2, 2.5, 3],
  },
};

export const FOAM_CORE_VOLUME_FACTORS: Record<Channel, number> = {
  wholesale: 0.24,
  designer: 0.30,
  retail: 0.40,
  luxury_retail: 0.50,
};

export const FOAM_CORE_CHANNEL_LABELS: Record<Channel, string> = {
  wholesale: "同業/批發",
  designer: "設計師",
  retail: "直客",
  luxury_retail: "終端客戶",
};

export const EXTRA_DEFS: Record<ExtraItem, { label: string; unit: string; unitCost: number; perUnit: boolean }> = {
  leather_labor: { label: "皮革加工", unit: "才", unitCost: 50, perUnit: false },
  lining: { label: "加車裡布", unit: "才", unitCost: 60, perUnit: false },
  anti_slip: { label: "背車止滑布", unit: "才", unitCost: 60, perUnit: false },
  power_hole: { label: "代釘電源孔", unit: "孔", unitCost: 50, perUnit: true },
};

export const ADDON_DEFS: Record<AddonType, { label: string; unit: string; unitCost: number; isPercent: boolean }> = {
  demolition: { label: "拆舊工程", unit: "式", unitCost: 2000, isPercent: false },
  install: { label: "現場安裝", unit: "次", unitCost: 3500, isPercent: false },
  floor_surcharge: { label: "高樓層搬運加價", unit: "式", unitCost: 2000, isPercent: false },
  rush_3day: { label: "急件（3日內）", unit: "%", unitCost: 40, isPercent: true },
  rush_1day: { label: "超急件（隔日）", unit: "%", unitCost: 80, isPercent: true },
};

export const CHANNEL_LABELS: Record<Channel, { label: string; description: string }> = {
  wholesale: { label: "批發價", description: "窗簾店 / 軟裝店" },
  designer: { label: "設計師價", description: "設計師合作價" },
  retail: { label: "屋主價", description: "直客零售價" },
  luxury_retail: { label: "豪華屋主價", description: "高端客戶零售價" },
};

export const CATEGORY_LABELS: Record<Category, string> = {
  fabric: "布料",
  pu_leather: "PU 皮革",
  pvc_leather: "PVC 皮革",
  genuine_leather: "真皮",
};

export const STOCK_STATUS_LABELS = {
  in_stock: "有庫存",
  low: "低庫存",
  out_of_stock: "缺貨",
  order_only: "接單採購",
} as const;

export const DEFAULT_SETTINGS: SystemSettings = {
  qualityPremium: 10,
  wasteRate: 15,
  channelMultipliers: {
    wholesale: 1.4,
    designer: 2,
    retail: 2.8,
    luxury_retail: 3.2,
  },
  taxRate: 5,
  commissionMode: "price_gap",
  commissionRate: 12,
  quoteValidityDays: 30,
  companyName: "馬鈴薯沙發",
  companyFullName: "馬鈴薯沙發企業社",
  companyPhone: "0978-280-280",
  companyFax: "",
  companyAddress: "",
  companyLine: "",
  companyTaxId: "85164778",
  companyContact: "周春懋",
  companyEmail: "",
};

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  curtain_shop: "窗簾店",
  soft_furnish: "軟裝店",
  designer: "設計師",
  design_firm: "設計公司",
  builder: "建商/工班",
  homeowner: "屋主",
  other: "其他",
};

export const ITEM_TEMPLATES: Array<{ label: string; item: Omit<FlexQuoteItem, "id"> }> = [
  { label: "雙北市區運費", item: { name: "雙北市區運費", spec: "包含產品配送、垃圾清運", qty: 1, unit: "式", unitPrice: 4000, amount: 4000, isCostItem: true, notes: "" } },
  { label: "外縣市運費", item: { name: "外縣市運費", spec: "包含產品配送、垃圾清運", qty: 1, unit: "式", unitPrice: 0, amount: 0, isCostItem: true, notes: "" } },
  { label: "來回收/送運費", item: { name: "來回收/送運費", spec: "", qty: 2, unit: "式", unitPrice: 2500, amount: 5000, isCostItem: true, notes: "" } },
  { label: "現場安裝工資", item: { name: "現場安裝工資", spec: "產品安裝與定位", qty: 1, unit: "式", unitPrice: 3000, amount: 3000, isCostItem: true, notes: "" } },
  { label: "夜間施工工資", item: { name: "夜間施工工資", spec: "產品安裝與定位", qty: 1, unit: "式", unitPrice: 3500, amount: 3500, isCostItem: true, notes: "" } },
  { label: "製版費", item: { name: "製版費", spec: "", qty: 1, unit: "式", unitPrice: 6500, amount: 6500, isCostItem: false, notes: "" } },
];

export const DEFAULT_TERMS = `1. 付款方式：匯款
2. 訂金：製作前需先支付總額之50%訂金
3. 履約期限：機關簽包後於30個工作天內完成施作及交貨。
4. 逾期罰則：逾期違約金以日為單位，按逾期日數，每日以契約價金總千分之一計算逾期違約金，所有日數(包括放假日等)均應繳入，不因履約期限以工作天或日曆天計算而有差別，並以契約價金總額之20%為上限。
5. 本報價已含營業稅金`;

export const SAMPLE_MATERIALS: Material[] = [
  {
    id: "MAT-001",
    brand: "JF 輝煌",
    series: "貓抓布 N200 系列",
    colorCode: "N200-03",
    colorName: "駝色",
    category: "fabric",
    costPerCai: 45,
    listPricePerCai: 80,
    supplier: "宏亞布行",
    widthCm: 150,
    minOrder: "1碼",
    leadTimeDays: 3,
    stockStatus: "in_stock",
    features: ["防貓抓", "防潑水"],
    notes: "以色列進口。",
    isActive: true,
    createdAt: "2026-03-16",
    updatedAt: "2026-03-16",
  },
  {
    id: "MAT-002",
    brand: "Potato Sofa",
    series: "商空皮革",
    colorCode: "PU-21",
    colorName: "焦糖棕",
    category: "pu_leather",
    costPerCai: 30,
    listPricePerCai: 58,
    supplier: "同安皮行",
    widthCm: 137,
    minOrder: "2碼",
    leadTimeDays: 2,
    stockStatus: "low",
    features: ["易清潔"],
    notes: "適合床頭板。",
    isActive: true,
    createdAt: "2026-03-16",
    updatedAt: "2026-03-16",
  },
];
