import {
  LayoutDashboard, ShoppingCart, ClipboardList, ChefHat, UtensilsCrossed,
  Boxes, Truck, Receipt, Users, Contact, BarChart3, PieChart, FileText, Settings, ScrollText, Bell,
} from "lucide-react";

export const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "pos", label: "POS", path: "/pos", icon: ShoppingCart },
  { key: "orders", label: "Orders", path: "/orders", icon: ClipboardList },
  { key: "kitchen", label: "Kitchen", path: "/kitchen", icon: ChefHat },
  { key: "menu", label: "Menu", path: "/menu", icon: UtensilsCrossed },
  { key: "inventory", label: "Inventory", path: "/inventory", icon: Boxes },
  { key: "suppliers", label: "Suppliers", path: "/suppliers", icon: Truck },
  { key: "expenses", label: "Expenses", path: "/expenses", icon: Receipt },
  { key: "employees", label: "Employees", path: "/employees", icon: Users },
  { key: "customers", label: "Customers", path: "/customers", icon: Contact },
  { key: "reports", label: "Reports", path: "/reports", icon: BarChart3 },
  { key: "analytics", label: "Analytics", path: "/analytics", icon: PieChart },
  { key: "invoices", label: "Invoices", path: "/invoices", icon: FileText },
  { key: "notifications", label: "Notifications", path: "/notifications", icon: Bell },
  { key: "settings", label: "Settings", path: "/settings", icon: Settings },
  { key: "audit", label: "Audit Log", path: "/audit", icon: ScrollText },
];
