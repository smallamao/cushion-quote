import {
  BarChart3,
  Briefcase,
  Calculator,
  CircleHelp,
  FileText,
  HandCoins,
  Package,
  Palette,
  Settings,
  ShoppingCart,
  Stethoscope,
} from "lucide-react";

import type { UserRole } from "@/lib/types";

export type NavLinkDef = {
  href: string;
  label: string;
  icon: typeof Calculator;
  roles: UserRole[];
};

export const navLinks: NavLinkDef[] = [
  { href: "/", label: "報價工作台", icon: Calculator, roles: ["admin"] },
  { href: "/cases", label: "案件紀錄", icon: Briefcase, roles: ["admin"] },
  { href: "/materials", label: "材質資料庫", icon: Palette, roles: ["admin"] },
  { href: "/quotes", label: "報價紀錄", icon: FileText, roles: ["admin"] },
  { href: "/commissions", label: "佣金結算", icon: HandCoins, roles: ["admin"] },
  { href: "/purchases", label: "採購單", icon: ShoppingCart, roles: ["admin"] },
  { href: "/purchase-products", label: "採購商品", icon: Package, roles: ["admin"] },
  { href: "/reports", label: "採購報表", icon: BarChart3, roles: ["admin"] },
  { href: "/after-sales", label: "售後服務", icon: Stethoscope, roles: ["admin", "technician"] },
  { href: "/settings", label: "系統設定", icon: Settings, roles: ["admin"] },
  { href: "/help", label: "使用說明", icon: CircleHelp, roles: ["admin"] },
];
