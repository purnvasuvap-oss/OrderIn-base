import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ChefHat } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { seedIfEmpty } from "./lib/seed";
import { dedupeLegacySeeds } from "./lib/migrations";
import { ROLE_HOME } from "./lib/auth";
import { tryAutoReconnectSerial } from "./lib/printer";
import { startRealtimeSync } from "./lib/realtime";
import { flushSyncQueue } from "./lib/sync";
import { ensureRestaurantDoc } from "./lib/firebase";

import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Orders from "./pages/Orders";
import Kitchen from "./pages/Kitchen";
import Menu from "./pages/Menu";
import Inventory from "./pages/Inventory";
import Suppliers from "./pages/Suppliers";
import Expenses from "./pages/Expenses";
import Employees from "./pages/Employees";
import Customers from "./pages/Customers";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import Invoices from "./pages/Invoices";
import Settings from "./pages/Settings";
import AuditLog from "./pages/AuditLog";

const PAGE_TITLES = {
  "/dashboard": "Dashboard", "/pos": "Point of Sale", "/orders": "Orders", "/kitchen": "Kitchen Display",
  "/menu": "Menu Management", "/inventory": "Inventory", "/suppliers": "Suppliers", "/expenses": "Expenses",
  "/employees": "Employees", "/customers": "Customers", "/reports": "Reports", "/analytics": "Analytics",
  "/invoices": "Invoices", "/settings": "Settings", "/audit": "Audit Log",
};

function withLayout(path, navKey, element) {
  return (
    <Route element={<ProtectedRoute navKey={navKey}><AppLayout title={PAGE_TITLES[path]} /></ProtectedRoute>}>
      <Route path={path} element={element} />
    </Route>
  );
}

function RootRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return <Navigate to={user ? ROLE_HOME[user.role] || "/dashboard" : "/login"} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      {withLayout("/dashboard", "dashboard", <Dashboard />)}
      {withLayout("/pos", "pos", <POS />)}
      {withLayout("/orders", "orders", <Orders />)}
      {withLayout("/kitchen", "kitchen", <Kitchen />)}
      {withLayout("/menu", "menu", <Menu />)}
      {withLayout("/inventory", "inventory", <Inventory />)}
      {withLayout("/suppliers", "suppliers", <Suppliers />)}
      {withLayout("/expenses", "expenses", <Expenses />)}
      {withLayout("/employees", "employees", <Employees />)}
      {withLayout("/customers", "customers", <Customers />)}
      {withLayout("/reports", "reports", <Reports />)}
      {withLayout("/analytics", "analytics", <Analytics />)}
      {withLayout("/invoices", "invoices", <Invoices />)}
      {withLayout("/settings", "settings", <Settings />)}
      {withLayout("/audit", "audit", <AuditLog />)}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    seedIfEmpty().then(dedupeLegacySeeds).then(() => {
      setBooted(true);
      startRealtimeSync();
      flushSyncQueue();
      ensureRestaurantDoc();
    });
    tryAutoReconnectSerial();
  }, []);

  if (!booted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-muted)", background: "var(--background)" }}>
        <ChefHat size={20} /> Loading Orderin POS…
      </div>
    );
  }

  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
