export type Method =
  | "flat"
  | "single_headboard"
  | "removable_headboard"
  | "single_daybed"
  | "double_daybed"
  | "foam_core";

export type Channel = "wholesale" | "designer" | "retail" | "luxury_retail";

export type LeadSource =
  | "unknown"
  | "google_search"
  | "google_maps"
  | "facebook_instagram"
  | "line"
  | "referral"
  | "repeat_customer"
  | "walk_in"
  | "bni"
  | "rotary"
  | "other";

export type ExtraItem = "leather_labor" | "lining" | "anti_slip" | "power_hole";

export type AddonType =
  | "demolition"
  | "install"
  | "floor_surcharge"
  | "rush_3day"
  | "rush_1day";

export type Category = "fabric" | "pu_leather" | "pvc_leather" | "genuine_leather";

export type StockStatus = "in_stock" | "low" | "out_of_stock" | "order_only";

export type CaseStatus =
  | "new"
  | "quoting"
  | "following_up"
  | "won"
  | "lost"
  | "on_hold"
  | "closed";

export type QuotePlanStatus =
  | "draft"
  | "quoting"
  | "negotiating"
  | "adopted"
  | "not_adopted"
  | "cancelled"
  | "archived";

export type VersionStatus =
  | "draft"
  | "sent"
  | "following_up"
  | "negotiating"
  | "accepted"
  | "rejected"
  | "superseded";

export type ReminderStatus =
  | "not_sent"
  | "pending"
  | "due_today"
  | "overdue"
  | "done";

export type CommissionMode = "price_gap" | "rebate" | "fixed" | "none";

export type SettlementStatus = "pending" | "paid" | "cancelled";

export type PartnerRole = "designer" | "installer" | "referrer" | "other";

export interface CommissionSettlement {
  settlementId: string;
  quoteId: string;
  versionId: string;
  caseId: string;
  partnerName: string;
  partnerId: string;
  partnerRole: PartnerRole;
  commissionMode: CommissionMode;
  commissionRate: number;
  commissionAmount: number;
  settlementStatus: SettlementStatus;
  paidAt: string;
  paymentMethod: string;
  receiptNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MethodConfig {
  id: Method;
  label: string;
  desc: string;
  minCai: number;
  baseThickness: number | null;
  baseRate: number;
  incrementPerHalfInch: number;
  thicknessOptions: number[];
}

export interface Material {
  id: string;
  brand: string;
  series: string;
  colorCode: string;
  colorName: string;
  category: Category;
  costPerCai: number;
  listPricePerCai: number;
  supplier: string;
  widthCm: number;
  minOrder: string;
  leadTimeDays: number;
  stockStatus: StockStatus;
  features: string[];
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteLineItem {
  id: string;
  itemName: string;
  method: Method;
  widthCm: number;
  heightCm: number;
  qty: number;
  foamThickness: number | null;
  material: Material | null;
  customMaterialCost: number | null;
  useListPrice: boolean;
  extras: ExtraItem[];
  powerHoleCount: number;
  notes: string;
}

export interface AddonItem {
  type: AddonType;
  qty: number;
}

export interface PricingConfig {
  qualityPremium: number;
  wasteRate: number;
  fabricDiscount: number;
  channelMultipliers: Record<Channel, number>;
  taxRate: number;
  commissionMode: CommissionMode;
  commissionRate: number;
  commissionFixedAmount: number;
}

export interface SystemSettings extends PricingConfig {
  quoteValidityDays: number;
  companyName: string;
  companyFullName: string;
  companyPhone: string;
  companyFax: string;
  companyAddress: string;
  companyLine: string;
  companyTaxId: string;
  companyContact: string;
  companyEmail: string;
}

export interface CaseRecord {
  caseId: string;
  caseName: string;
  clientId: string;
  clientNameSnapshot: string;
  contactNameSnapshot: string;
  phoneSnapshot: string;
  projectAddress: string;
  channelSnapshot: Channel;
  leadSource: LeadSource;
  leadSourceContact: string;
  leadSourceNotes: string;
  caseStatus: CaseStatus;
  inquiryDate: string;
  latestQuoteId: string;
  latestVersionId: string;
  latestSentAt: string;
  nextFollowUpDate: string;
  lastFollowUpAt: string;
  wonVersionId: string;
  lostReason: string;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuotePlanRecord {
  quoteId: string;
  caseId: string;
  quoteSeq: number;
  quoteName: string;
  quoteType: string;
  scopeNote: string;
  quoteStatus: QuotePlanStatus;
  currentVersionId: string;
  selectedVersionId: string;
  versionCount: number;
  latestSentAt: string;
  nextFollowUpDate: string;
  sortOrder: number;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteVersionRecord {
  versionId: string;
  quoteId: string;
  caseId: string;
  versionNo: number;
  basedOnVersionId: string;
  versionLabel: string;
  versionStatus: VersionStatus;
  quoteDate: string;
  sentAt: string;
  validUntil: string;
  followUpDays: number;
  nextFollowUpDate: string;
  lastFollowUpAt: string;
  reminderStatus: ReminderStatus;
  subtotalBeforeTax: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  commissionMode: CommissionMode;
  commissionRate: number;
  commissionAmount: number;
  commissionFixedAmount: number;
  commissionPartners: string;
  estimatedCostTotal: number;
  grossMarginAmount: number;
  grossMarginRate: number;
  channel: Channel;
  termsTemplate: string;
  publicDescription: string;
  descriptionImageUrl: string;
  internalNotes: string;
  snapshotLocked: boolean;
  snapshotLockedAt: string;
  clientNameSnapshot: string;
  contactNameSnapshot: string;
  clientPhoneSnapshot: string;
  projectNameSnapshot: string;
  projectAddressSnapshot: string;
  channelSnapshot: Channel;
  quoteNameSnapshot: string;
  createdAt: string;
  updatedAt: string;
}

export interface VersionLineRecord {
  itemId: string;
  versionId: string;
  quoteId: string;
  caseId: string;
  lineNo: number;
  itemName: string;
  spec: string;
  materialId: string;
  qty: number;
  unit: ItemUnit;
  unitPrice: number;
  lineAmount: number;
  estimatedUnitCost: number;
  estimatedCostAmount: number;
  lineMarginAmount: number;
  lineMarginRate: number;
  isCostItem: boolean;
  showOnQuote: boolean;
  notes: string;
  imageUrl: string;
  specImageUrl: string;
  createdAt: string;
  updatedAt: string;
  installHeightTier: string;    // v0.3.1
  panelSizeTier: string;        // v0.3.1
  installSurchargeRate: number; // v0.3.1
  // v0.3.2: 多片組合輸入模式 (indices 26-31, cols AA-AF)
  panelInputMode: string;
  surfaceWidthCm: number;
  surfaceHeightCm: number;
  splitDirection: string;
  splitCount: number;
  caiRoundingMode: string;
  customSplitSizesCsv: string;
}

// ===== 客戶資料庫 =====

export type ClientType =
  | "curtain_shop"
  | "soft_furnish"
  | "designer"
  | "design_firm"
  | "builder"
  | "homeowner"
  | "other";

export interface Client {
  id: string;
  companyName: string;
  shortName: string;
  clientType: ClientType;
  channel: Channel;
  contactName: string;
  phone: string;
  phone2: string;
  lineId: string;
  email: string;
  address: string;
  taxId: string;
  commissionMode: CommissionMode | "default";
  commissionRate: number;
  commissionFixedAmount: number;
  paymentTerms: string;
  defaultNotes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

// ===== 彈性報價品項（新架構）=====

export type ItemUnit = "只" | "式" | "件" | "才" | "組" | "碼" | "張" | "片";

export interface FlexQuoteItem {
  id: string;
  name: string;
  spec: string;
  qty: number;
  unit: ItemUnit;
  unitPrice: number;
  amount: number;
  isCostItem: boolean;
  notes: string;
  imageUrl?: string;
  specImageUrl?: string;
  autoPriced?: boolean;
  costPerUnit?: number; // pieceCost (raw cost before channel multiplier)
  laborRate?: number; // labor cost per cai
  materialRate?: number; // material cost per cai (after waste)
  method?: Method; // calculation method used
  materialId?: string; // material ID from database
  installHeightTier?: InstallHeightTier;
  panelSizeTier?: PanelSizeTier;
  installSurchargeRate?: number; // 加給百分比合計 (e.g. 45 = 45%)
  // 多片組合輸入模式 (v0.3.2)
  panelInputMode?: PanelInputMode;
  surfaceWidthCm?: number;
  surfaceHeightCm?: number;
  splitDirection?: SplitDirection;
  splitCount?: number;
  caiRoundingMode?: CaiRoundingMode;
  customSplitSizes?: number[];
}

// ===== 施工加給分級 (v0.3.1) =====

export type InstallHeightTier = "normal" | "mid_high" | "high_altitude";
export type PanelSizeTier = "standard" | "large" | "extra_large";

export interface InstallSurchargeConfig {
  heightTier: InstallHeightTier;
  panelSizeTier: PanelSizeTier;
}

// ===== 多片組合輸入模式 (v0.3.2) =====
export type PanelInputMode = "per_piece" | "divide_surface";
export type CaiRoundingMode = "per_piece_ceil" | "surface_ceil";
export type SplitDirection = "horizontal" | "vertical";

// ===== 報價範本 (Quote Templates) =====

export interface QuoteTemplate {
  templateId: string; // TPL-001, TPL-002, ...
  templateName: string; // 範本名稱，如「標準臥室套餐」
  description: string; // 範本說明
  items: FlexQuoteItem[]; // 範本包含的品項列表
  isActive: boolean; // 是否啟用
  createdAt: string; // 建立時間
  updatedAt: string; // 更新時間
}

export interface TemplateRecord {
  templateId: string; // col A
  templateName: string; // col B
  description: string; // col C
  itemsJson: string; // col D - JSON stringified FlexQuoteItem[]
  isActive: boolean; // col E
  createdAt: string; // col F
  updatedAt: string; // col G
}
