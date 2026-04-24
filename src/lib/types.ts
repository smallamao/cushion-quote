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
  | "association_network"
  | "other";

export type ClientSource =
  | "unknown"
  | "bni"
  | "rotary"
  | "guild_association"
  | "peer_referral"
  | "designer_referral"
  | "client_referral"
  | "google_search"
  | "facebook_instagram"
  | "line"
  | "exhibition"
  | "cold_outreach"
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

export type QuoteLoadRequestSource =
  | "client-history"
  | "quotes-list"
  | "cases-list"
  | "quote-editor-copy";

export type QuoteDraftSessionSource =
  | "new-quote"
  | "loaded-version"
  | "restored-legacy-draft"
  | QuoteLoadRequestSource;

export type UserRole = "admin" | "technician" | "sales";

export type AfterSalesStatus =
  | "pending"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface Session {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  picture?: string;
  iat: number;
  exp: number;
}

export interface User {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastReadRepliesAt?: string;
}

export interface AfterSalesService {
  serviceId: string;
  receivedDate: string;
  relatedOrderNo: string;
  shipmentDate: string;
  clientName: string;
  clientPhone: string;
  clientContact2: string;
  clientPhone2: string;
  deliveryAddress: string;
  modelCode: string;
  modelNameSnapshot: string;
  issueDescription: string;
  issuePhotos: string[];
  status: AfterSalesStatus;
  assignedTo: string;
  scheduledDate: string;
  dispatchNotes: string;
  completedDate: string;
  completionNotes: string;
  completionPhotos: string[];
  customerSignature?: string;
  customerSignedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface AfterSalesReply {
  replyId: string;
  serviceId: string;
  occurredAt: string;
  author: string;
  content: string;
  attachments: string[];
  createdAt: string;
}

export interface EquipmentModel {
  modelCode: string;
  modelName: string;
  category: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionOverride {
  mode: CommissionMode;
  rate: number;
  fixedAmount: number;
}

export interface CommissionPartnerSplit {
  name: string;
  partnerId: string;
  role: PartnerRole;
  amount: number;
}

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
  factoryAddress: string;
}

export type ShippingStatus =
  | "not_started"
  | "pending"
  | "shipped"
  | "delivered"
  | "installed"
  | "returned";

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
  leadSourceDetail: string;
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
  shippingStatus: ShippingStatus;
  trackingNo: string;
  shippedAt: string;
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
  signedBack: boolean;
  signedBackDate: string;
  signedContractUrls: string[];
  signedNotes: string;
  createdAt: string;
  updatedAt: string;
}

// ===== 應收帳款 (Accounts Receivable) =====

export type ARStatus =
  | "draft"
  | "active"
  | "partial"
  | "paid"
  | "overdue"
  | "cancelled";

export type ARScheduleStatus =
  | "pending"
  | "partial"
  | "paid"
  | "overdue"
  | "waived";

export type ARPaymentMethod =
  | "cash"
  | "transfer"
  | "check"
  | "credit_card"
  | "other"
  | "";

export interface ARScheduleRecord {
  scheduleId: string;
  arId: string;
  seq: number;
  label: string;
  ratio: number;
  amount: number;
  dueDate: string;
  receivedAmount: number;
  receivedDate: string;
  paymentMethod: ARPaymentMethod;
  scheduleStatus: ARScheduleStatus;
  adjustmentAmount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ARRecord {
  arId: string;
  issueDate: string;
  caseId: string;
  caseNameSnapshot: string;
  quoteId: string;
  versionId: string;
  clientId: string;
  clientNameSnapshot: string;
  contactNameSnapshot: string;
  clientPhoneSnapshot: string;
  projectNameSnapshot: string;
  totalAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  scheduleCount: number;
  arStatus: ARStatus;
  hasOverdue: boolean;
  lastReceivedAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ARScheduleDraft {
  label: string;
  ratio: number;
  amount: number;
  dueDate: string;
}

export interface CreateARPayload {
  versionId: string;
  schedules: ARScheduleDraft[];
  notes?: string;
}

export interface RecordARPaymentPayload {
  scheduleId: string;
  receivedAmount: number;
  receivedDate: string;
  paymentMethod: ARPaymentMethod;
  notes?: string;
}

export type PendingMonthlyStatus = "pending" | "consolidated" | "cancelled";

export interface PendingMonthlyRecord {
  pendingId: string;
  versionId: string;
  quoteId: string;
  caseId: string;
  clientId: string;
  clientNameSnapshot: string;
  caseNameSnapshot: string;
  projectNameSnapshot: string;
  amount: number;
  acceptedAt: string; // YYYY-MM-DD
  consolidatedArId: string;
  status: PendingMonthlyStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ===== 電子發票 (E-Invoice, v0.8) =====

export type EInvoiceSourceType =
  | "quote_version"
  | "ar"
  | "pending_monthly"
  | "manual";

export type EInvoiceBuyerType = "b2b" | "b2c";

export type EInvoiceCarrierType = "none" | "mobile_barcode" | "member_code";

export type EInvoiceStatus =
  | "draft"
  | "issuing"
  | "issued"
  | "failed"
  | "cancelled";

export type EInvoiceEventType =
  | "draft_created"
  | "issue_started"
  | "issue_succeeded"
  | "issue_failed"
  | "sync_succeeded"
  | "sync_failed"
  | "cancel_succeeded"
  | "cancel_failed";

export interface EInvoiceItemSnapshot {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  remark: string;
  taxType: 0 | 1 | 2;
}

export interface EInvoiceRecord {
  invoiceId: string;
  retryOfInvoiceId: string;
  sourceType: EInvoiceSourceType;
  sourceId: string;
  sourceSubId: string;
  quoteId: string;
  versionId: string;
  caseId: string;
  clientId: string;
  buyerType: EInvoiceBuyerType;
  buyerName: string;
  buyerTaxId: string;
  email: string;
  carrierType: EInvoiceCarrierType;
  carrierValue: string;
  donationCode: string;
  invoiceDate: string;
  taxType: 0 | 1 | 2 | 4;
  untaxedAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  itemCount: number;
  itemsJson: string;
  content: string;
  status: EInvoiceStatus;
  providerName: string;
  providerInvoiceNo: string;
  providerTrackNo: string;
  providerResponseJson: string;
  requestPayloadJson: string;
  errorCode: string;
  errorMessage: string;
  cancelledAt: string;
  cancelReason: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EInvoiceEventRecord {
  eventId: string;
  invoiceId: string;
  eventType: EInvoiceEventType;
  fromStatus: string;
  toStatus: string;
  message: string;
  requestJson: string;
  responseJson: string;
  actor: string;
  occurredAt: string;
}

export interface EInvoiceCandidate {
  candidateId: string;
  sourceType: EInvoiceSourceType;
  sourceId: string;
  sourceSubId: string;
  quoteId: string;
  versionId: string;
  caseId: string;
  clientId: string;
  clientName: string;
  contactName: string;
  clientPhone: string;
  clientEmail: string;
  clientTaxId: string;
  projectName: string;
  amount: number;
  untaxedAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  invoiceDate: string;
  lineItems: EInvoiceItemSnapshot[];
  existingInvoiceId: string;
  existingInvoiceStatus: EInvoiceStatus | "";
}

export interface ConsolidatePendingPayload {
  clientId: string;
  pendingIds: string[];
  dueDate: string;
  notes?: string;
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
  unitPriceLocked?: boolean; // 手動修改過單價後鎖定，不再被自動重算覆蓋
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

export interface QuoteDraftComparable {
  selectedClientId: string;
  companyName: string;
  contactName: string;
  phone: string;
  taxId: string;
  projectName: string;
  quoteName: string;
  email: string;
  address: string;
  channel: Channel;
  leadSource: LeadSource;
  leadSourceDetail: string;
  leadSourceContact: string;
  leadSourceNotes: string;
  items: FlexQuoteItem[];
  description: string;
  descriptionImageUrl: string;
  includeTax: boolean;
  termsTemplate: string;
  commissionOverride: CommissionOverride | null;
  commissionPartners: CommissionPartnerSplit[];
}

export interface QuoteDraftSession extends QuoteDraftComparable {
  sessionId: string;
  savedAt: string;
  signature: string;
  caseId: string;
  quoteId: string;
  versionId: string;
  versionNo: number;
  versionLabel: string;
  isEditMode: boolean;
  source: QuoteDraftSessionSource;
}

export interface QuoteLoadRequest {
  requestId: string;
  createdAt: string;
  source: QuoteLoadRequestSource;
  caseId: string;
  quoteId: string;
  versionId: string;
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

// ===== 採購系統 (Purchase System, v0.4) =====

export type PurchaseOrderStatus =
  | "draft" // 草稿
  | "sent" // 已送出
  | "confirmed" // 已確認
  | "received" // 已到貨
  | "cancelled"; // 已取消

export type PurchaseProductCategory =
  | "面料" // 布料
  | "椅腳" // 椅腳/支腳
  | "泡棉" // 泡棉/海綿
  | "木料" // 木材/木架
  | "皮革" // 皮革
  | "五金" // 五金配件
  | "其他"; // 其他材料

export type PurchaseUnit = "碼" | "才" | "米" | "只" | "片" | "件" | "組" | "包" | "個";

export type InventoryTransactionType =
  | "opening"
  | "purchase_receipt"
  | "manual_adjustment"
  | "return_out"
  | "return_in"
  | "issue_out";

/**
 * 廠商 (Supplier)
 * 簡化自 Ragic 廠商表（24 欄 → 13 欄）
 */
export interface Supplier {
  supplierId: string; // PS006
  name: string; // 阿布實業有限公司 (全名)
  shortName: string; // 阿布ABU (簡稱)
  contactPerson: string; // 曾根倚(阿賢)
  phone: string; // 03-3501-578
  mobile: string; // 0939-923-133
  fax: string; // 03-3502-465
  email: string; // abu.sofacloth@gmail.com
  taxId: string; // 28549325 (統一編號)
  address: string; // 333桃園市龜山區忠義路一段1196-35號 (完整地址)
  paymentMethod: string; // 電匯 (T/T) / 支票 (Cheque) / 現金
  paymentTerms: string; // 月結 30 (Net 30)
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 採購商品 (PurchaseProduct)
 * 合併自 Ragic 採購商品 + 商品廠商價格 (25 欄 → 12 欄)
 * 一個商品對應一家廠商的價格；若同商品多家廠商，建多筆
 */
export interface PurchaseProduct {
  id: string;
  productCode: string;
  supplierProductCode: string;
  productName: string;
  specification: string;
  category: PurchaseProductCategory;
  unit: PurchaseUnit;
  supplierId: string;
  supplierName?: string;
  unitPrice?: number;
  costPerCai?: number;
  listPricePerCai?: number;
  widthCm?: number;
  brand?: string;
  series?: string;
  colorCode?: string;
  colorName?: string;
  imageUrl: string;
  notes: string;
  minOrder?: string;
  leadTimeDays?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 採購單主檔 (PurchaseOrder)
 * 簡化自 Ragic 採購單 (22 欄 → 12 欄)
 * 廠商資訊透過 supplierId 關聯取得，並保存快照保留歷史
 */
export interface PurchaseOrder {
  orderId: string; // PS-20260409-02
  orderDate: string; // 2026/04/09 (採購日期)
  supplierId: string; // PS006 (關聯廠商)
  caseId: string;
  caseNameSnapshot: string;
  // 廠商快照（建立時拍照，確保歷史不可變）
  supplierSnapshot: {
    name: string;
    shortName: string;
    contactPerson: string;
    phone: string;
    fax: string;
    email: string;
    taxId: string;
    address: string;
    paymentMethod: string;
    paymentTerms: string;
  };
  subtotal: number; // 小計
  shippingFee: number; // 運費
  taxAmount: number; // 稅額（預設 0）
  totalAmount: number; // 合計金額
  notes: string; // 附註 (如 "P6009,P5990")
  status: PurchaseOrderStatus;
  deliveryAddress: string; // 交貨地址（預設從系統設定取，可覆寫）
  expectedDeliveryDate: string; // 到貨日期
  createdAt: string;
  updatedAt: string;
}

/**
 * 採購單明細 (PurchaseOrderItem)
 * 簡化自 Ragic 採購細項 (11 欄 → 9 欄)
 */
export interface PurchaseOrderItem {
  itemId: string;
  orderId: string; // PS-20260409-02
  sortOrder: number; // 1, 2, 3...
  productId: string; // ABU100009-PS006 (關聯採購商品)
  // 商品資訊快照（建立時拍照）
  productSnapshot: {
    productCode: string; // ABU100009
    productName: string; // ABU 1000系列 透氣貓抓布
    specification: string; // 100009
    unit: PurchaseUnit; // 碼
  };
  quantity: number; // 9
  receivedQuantity: number;
  unitPrice: number; // 350 (可手動覆寫)
  amount: number; // 3150 (= quantity × unitPrice)
  notes: string; // 備註（選填，每項可不同）
}

export interface InventorySummary {
  inventoryId: string;
  productId: string;
  supplierId: string;
  productSnapshot: {
    productCode: string;
    productName: string;
    specification: string;
    category: PurchaseProductCategory;
    unit: PurchaseUnit;
  };
  quantityOnHand: number;
  lastUnitCost: number;
  lastReceivedAt: string;
  lastTransactionAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransaction {
  transactionId: string;
  inventoryId: string;
  productId: string;
  supplierId: string;
  orderId: string;
  orderItemId: string;
  transactionType: InventoryTransactionType;
  quantityDelta: number;
  unit: PurchaseUnit;
  unitCost: number;
  occurredAt: string;
  referenceNumber: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  lotId: string;
}

export interface InventoryLot {
  lotId: string;         // LOT-YYYYMMDD-###
  inventoryId: string;
  productId: string;
  sourceRef: string;     // 來源參考，e.g. "採購單 #P5570"
  description: string;   // 批次說明，e.g. "裁剩回庫"
  initialQty: number;
  unit: PurchaseUnit;
  createdAt: string;
  notes: string;
  remainingQty?: number; // computed: sum of transactions for this lot
}

export interface PurchaseProductHistoryItem {
  orderDate: string;
  orderId: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  caseId: string;
  caseName: string;
}

export interface PurchaseProductHistorySummary {
  totalPurchases: number;
  totalQuantity: number;
  averagePrice: number;
  lastPurchaseDate: string;
  minPrice: number;
  maxPrice: number;
}

export interface PurchaseProductHistoryProduct {
  productId: string;
  productCode: string;
  productName: string;
  specification: string;
  unit: string;
  supplierId: string;
  supplierName: string;
}

export interface PurchaseProductHistoryResponse {
  ok: boolean;
  product: PurchaseProductHistoryProduct;
  summary: PurchaseProductHistorySummary;
  history: PurchaseProductHistoryItem[];
  error?: string;
}

// Re-export Company/Contact types
export type { Company, Contact, CompanyWithContacts, CompanyWithPrimaryContact } from "./types/company";
export { companyToClient } from "./types/company";
