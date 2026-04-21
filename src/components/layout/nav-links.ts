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
  Settings,
  ShoppingCart,
  Stethoscope,
  Wallet,
} from "lucide-react";

import type { UserRole } from "@/lib/types";

export type NavGroup = "daily" | "reference" | "system";

export type NavLinkDef = {
  href: string;
  label: string;
  icon: typeof Calculator;
  roles: UserRole[];
  group: NavGroup;
};

export const navLinks: NavLinkDef[] = [
  { href: "/", label: "報價工作台", icon: Calculator, roles: ["admin"], group: "daily" },
  { href: "/quotes", label: "報價紀錄", icon: FileText, roles: ["admin"], group: "daily" },
  { href: "/cases", label: "案件紀錄", icon: Briefcase, roles: ["admin"], group: "daily" },
  { href: "/purchases", label: "採購單", icon: ShoppingCart, roles: ["admin"], group: "daily" },
  { href: "/after-sales", label: "售後服務", icon: Stethoscope, roles: ["admin", "technician"], group: "daily" },
  { href: "/receivables", label: "應收帳款", icon: Wallet, roles: ["admin"], group: "daily" },
  { href: "/calendar", label: "行事曆", icon: Calendar, roles: ["admin"], group: "daily" },
  { href: "/commissions", label: "佣金結算", icon: HandCoins, roles: ["admin"], group: "daily" },
  { href: "/materials", label: "材質資料庫", icon: Palette, roles: ["admin"], group: "reference" },
  { href: "/purchase-products", label: "採購商品", icon: Package, roles: ["admin"], group: "reference" },
  { href: "/inventory", label: "庫存管理", icon: Archive, roles: ["admin"], group: "reference" },
  { href: "/reports", label: "採購報表", icon: BarChart3, roles: ["admin"], group: "system" },
  { href: "/settings", label: "系統設定", icon: Settings, roles: ["admin"], group: "system" },
  { href: "/help", label: "使用說明", icon: CircleHelp, roles: ["admin"], group: "system" },
];
