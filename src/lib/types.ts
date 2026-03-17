export type Method =
  | "flat"
  | "single_headboard"
  | "removable_headboard"
  | "single_daybed"
  | "double_daybed"
  | "foam_core";

export type Channel = "wholesale" | "designer" | "retail" | "luxury_retail";

export type ExtraItem = "leather_labor" | "lining" | "anti_slip" | "power_hole";

export type AddonType =
  | "demolition"
  | "install"
  | "floor_surcharge"
  | "rush_3day"
  | "rush_1day";

export type Category = "fabric" | "pu_leather" | "pvc_leather" | "genuine_leather";

export type StockStatus = "in_stock" | "low" | "out_of_stock" | "order_only";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "deleted";

export type CommissionMode = "price_gap" | "rebate" | "none";

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
  channelMultipliers: Record<Channel, number>;
  taxRate: number;
  commissionMode: CommissionMode;
  commissionRate: number;
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

export interface QuoteRecord {
  quoteId: string;
  quoteDate: string;
  clientName: string;
  clientContact: string;
  clientPhone: string;
  projectName: string;
  projectAddress: string;
  channel: Channel;
  totalBeforeTax: number;
  tax: number;
  total: number;
  commissionMode: CommissionMode;
  commissionRate: number;
  commissionAmount: number;
  status: QuoteStatus;
  createdBy: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  clientId: string;
}

export interface QuoteLineRecord {
  quoteId: string;
  lineNumber: number;
  itemName: string;
  method: Method;
  widthCm: number;
  heightCm: number;
  caiCount: number;
  foamThickness: number;
  materialId: string;
  materialDesc: string;
  qty: number;
  laborRate: number;
  materialRate: number;
  extras: string;
  unitPrice: number;
  piecePrice: number;
  subtotal: number;
  notes: string;
}

export interface CompanyInfo {
  clientName: string;
  clientContact: string;
  clientPhone: string;
  projectName: string;
  projectAddress: string;
  notes: string;
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
  costPerUnit?: number; // pieceCost (raw cost before channel multiplier)
  laborRate?: number; // labor cost per cai
  materialRate?: number; // material cost per cai (after waste)
  method?: Method; // calculation method used
  materialId?: string; // material ID from database
}

export interface QuoteDocument {
  quoteId: string;
  quoteDate: string;
  validUntil: string;
  clientId: string;
  client: {
    companyName: string;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    taxId: string;
  };
  projectName: string;
  channel: Channel;
  items: FlexQuoteItem[];
  description: string;
  includeTax: boolean;
  subtotal: number;
  tax: number;
  total: number;
  termsTemplate: string;
  status: QuoteStatus;
}
