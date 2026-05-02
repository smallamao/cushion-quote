import {
  Archive,
  BarChart3,
  Briefcase,
  Calculator,
  Calendar,
  CircleHelp,
  FileText,
  HandCoins,
  Package,
  Palette,
  ReceiptText,
  Ruler,
  Settings,
  ShoppingCart,
  Stethoscope,
  Truck,
  Wallet,
} from "lucide-react";

import type { UserRole } from "@/lib/types";

export type NavGroup = "business" | "operations" | "finance" | "inventory" | "system";

export type NavLinkDef = {
  href: string;
  label: string;
  icon: typeof Calculator;
  roles: UserRole[];
  group: NavGroup;
};

export const navLinks: NavLinkDef[] = [
  // ── 業務 ──
  { href: "/sofa-quote", label: "尺寸報價", icon: Ruler, roles: ["admin", "technician"], group: "business" },
  { href: "/pos-quote", label: "POS 訂製報價", icon: Palette, roles: ["admin", "technician"], group: "business" },
  { href: "/", label: "報價工作台", icon: Calculator, roles: ["admin"], group: "business" },
  { href: "/quotes", label: "報價紀錄", icon: FileText, roles: ["admin"], group: "business" },
  { href: "/cases", label: "案件紀錄", icon: Briefcase, roles: ["admin"], group: "business" },
  // ── 作業 ──
  { href: "/purchases", label: "採購單", icon: ShoppingCart, roles: ["admin"], group: "operations" },
  { href: "/shipping-notice", label: "出貨通知", icon: Truck, roles: ["admin", "technician"], group: "operations" },
  { href: "/after-sales", label: "售後服務", icon: Stethoscope, roles: ["admin", "technician"], group: "operations" },
  { href: "/calendar", label: "行事曆", icon: Calendar, roles: ["admin", "technician"], group: "operations" },
  // ── 財務 ──
  { href: "/remittance", label: "匯款資訊", icon: Wallet, roles: ["admin"], group: "finance" },
  { href: "/receivables", label: "應收帳款", icon: Wallet, roles: ["admin"], group: "finance" },
  { href: "/commissions", label: "佣金結算", icon: HandCoins, roles: ["admin"], group: "finance" },
  { href: "/einvoices", label: "電子發票", icon: ReceiptText, roles: ["admin"], group: "finance" },
  // ── 倉儲 ──
  { href: "/purchase-products", label: "採購商品", icon: Package, roles: ["admin"], group: "inventory" },
  { href: "/inventory", label: "庫存管理", icon: Archive, roles: ["admin", "technician"], group: "inventory" },
  { href: "/reports", label: "採購報表", icon: BarChart3, roles: ["admin"], group: "inventory" },
  // ── 系統 ──
  { href: "/settings", label: "系統設定", icon: Settings, roles: ["admin"], group: "system" },
  // { href: "/help", label: "使用說明", icon: CircleHelp, roles: ["admin"], group: "system" },
];
