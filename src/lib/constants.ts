import type {
  AddonType,
  Channel,
  ClientType,
  ExtraItem,
  FlexQuoteItem,
  InstallHeightTier,
  ClientSource,
  LeadSource,
  MethodConfig,
  PanelSizeTier,
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

export const LEAD_SOURCE_OPTIONS: LeadSource[] = [
  "unknown",
  "google_search",
  "google_maps",
  "facebook_instagram",
  "line",
  "referral",
  "repeat_customer",
  "walk_in",
  "association_network",
  "other",
];

export const LEAD_SOURCE_LABELS: Record<LeadSource, { label: string; description: string }> = {
  unknown: { label: "未分類", description: "尚未標記案件來源" },
  google_search: { label: "Google 搜尋", description: "來自自然搜尋" },
  google_maps: { label: "Google 地圖", description: "來自地圖或商家頁" },
  facebook_instagram: { label: "Facebook / Instagram", description: "來自社群或 Meta 廣告" },
  line: { label: "LINE", description: "來自 LINE 洽詢" },
  referral: { label: "介紹", description: "朋友或合作夥伴介紹" },
  repeat_customer: { label: "舊客回購", description: "既有客戶再次下單" },
  walk_in: { label: "路過來店", description: "現場來店或看板導流" },
  association_network: { label: "商會／協會", description: "來自商會、協會或人脈組織" },
  other: { label: "其他", description: "未涵蓋的其他來源" },
};

export const LEAD_SOURCE_DETAIL_ENABLED: LeadSource[] = ["association_network"];

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
  qualityPremium: 0,
  wasteRate: 0,
  fabricDiscount: 0.5,
  channelMultipliers: {
    wholesale: 1.0,
    designer: 1.25,
    retail: 1.35,
    luxury_retail: 1.5,
  },
  taxRate: 5,
  commissionMode: "price_gap",
  commissionRate: 12,
  commissionFixedAmount: 0,
  quoteValidityDays: 30,
  companyName: "馬鈴薯沙發",
  companyFullName: "馬鈴薯沙發",
  companyPhone: "0978-280-280",
  companyFax: "",
  companyAddress: "",
  companyLine: "",
  companyTaxId: "85164778",
  companyContact: "周春懋",
  companyEmail: "",
  factoryAddress: "236新北市土城區廣福街77巷6-6號",
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

export const CLIENT_SOURCE_LABELS: Record<ClientSource, string> = {
  unknown: "未分類",
  bni: "BNI 商會",
  rotary: "扶輪社",
  guild_association: "公會 / 協會",
  peer_referral: "同業介紹",
  designer_referral: "設計師介紹",
  client_referral: "舊客介紹",
  google_search: "Google 搜尋",
  facebook_instagram: "Facebook / Instagram",
  line: "LINE",
  exhibition: "展覽 / 活動",
  cold_outreach: "主動開發",
  other: "其他",
};

export const CONTACT_ROLE_SUGGESTIONS = [
  "老闆",
  "採購",
  "設計師",
  "工程",
  "業務",
  "會計",
  "其他",
] as const;

export interface QuoteTemplate {
  id: string;
  label: string;
  description: string;
  items: Array<Omit<FlexQuoteItem, "id">>;
  defaultTerms?: string;
}

export const ITEM_TEMPLATES: Array<{ label: string; item: Omit<FlexQuoteItem, "id"> }> = [
  { label: "雙北市區運費", item: { name: "雙北市區運費", spec: "包含產品配送、垃圾清運", qty: 1, unit: "式", unitPrice: 4000, amount: 4000, isCostItem: true, notes: "" } },
  { label: "外縣市運費", item: { name: "外縣市運費", spec: "包含產品配送、垃圾清運", qty: 1, unit: "式", unitPrice: 0, amount: 0, isCostItem: true, notes: "" } },
  { label: "來回收/送運費", item: { name: "來回收/送運費", spec: "", qty: 2, unit: "式", unitPrice: 2500, amount: 5000, isCostItem: true, notes: "" } },
  { label: "現場安裝工資", item: { name: "現場安裝工資", spec: "產品安裝與定位", qty: 1, unit: "式", unitPrice: 3000, amount: 3000, isCostItem: true, notes: "" } },
  { label: "夜間施工工資", item: { name: "夜間施工工資", spec: "產品安裝與定位", qty: 1, unit: "式", unitPrice: 3500, amount: 3500, isCostItem: true, notes: "" } },
  { label: "製版費", item: { name: "製版費", spec: "", qty: 1, unit: "式", unitPrice: 6500, amount: 6500, isCostItem: false, notes: "" } },
];

export const QUOTE_TEMPLATES: QuoteTemplate[] = [
  {
    id: "sofa-reupholster",
    label: "沙發換皮標準組",
    description: "換皮 + 運費 + 安裝",
    items: [
      { name: "沙發換皮", spec: "", qty: 1, unit: "只", unitPrice: 0, amount: 0, isCostItem: false, notes: "" },
      { name: "雙北市區運費", spec: "包含產品配送、垃圾清運", qty: 1, unit: "式", unitPrice: 4000, amount: 4000, isCostItem: true, notes: "" },
      { name: "現場安裝工資", spec: "產品安裝與定位", qty: 1, unit: "式", unitPrice: 3000, amount: 3000, isCostItem: true, notes: "" },
    ],
  },
  {
    id: "cushion-set",
    label: "訂製坐墊組",
    description: "坐墊 + 運費",
    items: [
      { name: "訂製坐墊", spec: "", qty: 1, unit: "只", unitPrice: 0, amount: 0, isCostItem: false, notes: "" },
      { name: "雙北市區運費", spec: "包含產品配送、垃圾清運", qty: 1, unit: "式", unitPrice: 4000, amount: 4000, isCostItem: true, notes: "" },
    ],
  },
  {
    id: "commercial-project",
    label: "商空工程組",
    description: "訂製品項 + 運費 + 安裝 + 製版費",
    items: [
      { name: "訂製沙發", spec: "", qty: 1, unit: "只", unitPrice: 0, amount: 0, isCostItem: false, notes: "" },
      { name: "製版費", spec: "", qty: 1, unit: "式", unitPrice: 6500, amount: 6500, isCostItem: false, notes: "" },
      { name: "雙北市區運費", spec: "包含產品配送、垃圾清運", qty: 1, unit: "式", unitPrice: 4000, amount: 4000, isCostItem: true, notes: "" },
      { name: "現場安裝工資", spec: "產品安裝與定位", qty: 1, unit: "式", unitPrice: 3000, amount: 3000, isCostItem: true, notes: "" },
    ],
  },
];

export const DEFAULT_TERMS = `1.\u00A0付款方式：匯款
2.\u00A0訂金：製作前需先支付總額之50%訂金
3.\u00A0履約期限：機關簽包後於30個工作天內完成施作及交貨。
4.\u00A0逾期罰則：逾期違約金以日為單位，按逾期日數，每日以契約價金總千分之一計算逾期違約金，所有日數(包括放假日等)均應繳入，不因履約期限以工作天或日曆天計算而有差別，並以契約價金總額之20%為上限。
5.\u00A0本報價已含營業稅金`;

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

// ===== 施工加給分級 (v0.3.1) =====

export const INSTALL_HEIGHT_TIERS: Record<
  InstallHeightTier,
  { label: string; description: string; maxCm: number | null; surchargePercent: number }
> = {
  normal: { label: "一般", description: "≤200cm", maxCm: 200, surchargePercent: 0 },
  mid_high: { label: "中高", description: "200-300cm", maxCm: 300, surchargePercent: 25 },
  high_altitude: { label: "高空", description: ">300cm", maxCm: null, surchargePercent: 60 },
};

export const PANEL_SIZE_TIERS: Record<
  PanelSizeTier,
  { label: string; description: string; maxLongSideCm: number | null; surchargePercent: number }
> = {
  standard: { label: "標準", description: "≤180cm", maxLongSideCm: 180, surchargePercent: 0 },
  large: { label: "大型", description: "180-240cm", maxLongSideCm: 240, surchargePercent: 20 },
  extra_large: { label: "超大型", description: ">240cm", maxLongSideCm: null, surchargePercent: 40 },
};

export const INSTALL_HEIGHT_OPTIONS: InstallHeightTier[] = [
  "normal", "mid_high", "high_altitude",
];

export const PANEL_SIZE_OPTIONS: PanelSizeTier[] = [
  "standard", "large", "extra_large",
];
