// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import routes from "./routes.jsx";
import Header from "./components/Header.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Orders from "./pages/Orders.jsx";
import MenuLogin from "./pages/MenuLogin.jsx";
import MenuPage from "./pages/MenuPage.jsx";
import Promotions from "./pages/Promotions.jsx";
import FinanceLogin from "./pages/FinanceLogin.jsx";

import InventoryLogin from "./pages/InventoryLogin.jsx";
import Inventory from "./pages/Inventory.jsx";
import Finance from "./pages/Finance.jsx";
import NotificationPage from "./pages/NotificationPage.jsx";
import { NotificationProvider } from "./contexts/NotificationContext.jsx";

function App() {
  return (
    <NotificationProvider>
      <Router>
      <Routes>
        {/* Public login route (no header) */}
        <Route path={routes.login} element={<Login />} />

        {/* Protected Routes with Header */}
        <Route
          path={routes.dashboard}
          element={
            <ProtectedRoute>
              <>
                <Header />
                <Dashboard />
              </>
            </ProtectedRoute>
          }
        />

        <Route
          path={routes.orders}
          element={
            <ProtectedRoute>
              <>
                <Header />
                <Orders />
              </>
            </ProtectedRoute>
          }
        />

        {/* Menu Routes */}
        <Route
          path={routes.menuLogin}
          element={
            <ProtectedRoute>
              <MenuLogin />
            </ProtectedRoute>
          }
        />
        <Route
          path={routes.menu}
          element={
            <ProtectedRoute>
              <>
                <Header />
                <MenuPage />
              </>
            </ProtectedRoute>
          }
        />

        {/* Promotions Route */}
        <Route
          path={routes.promotions}
          element={
            <ProtectedRoute>
              <>
                <Header />
                <Promotions />
              </>
            </ProtectedRoute>
          }
        />

        {/* Finance Routes */}
        <Route
          path={routes.financeLogin}
          element={
            <ProtectedRoute>
              <FinanceLogin />
            </ProtectedRoute>
          }
        />
        <Route
          path={routes.finance}
          element={
            <ProtectedRoute>
              <>
                <Header />
                <Finance />
              </>
            </ProtectedRoute>
          }
        />

        {/* Inventory Routes */}
        <Route
          path={routes.inventoryLogin}
          element={
            <ProtectedRoute>
              <InventoryLogin />
            </ProtectedRoute>
          }
        />
        <Route
          path={routes.inventory}
          element={
            <ProtectedRoute>
              <>
                <Header />
                <Inventory />
              </>
            </ProtectedRoute>
          }
        />

        {/* Notification Route */}
        <Route
          path={routes.notification}
          element={
            <ProtectedRoute>
              <>
                <Header />
                <NotificationPage />
              </>
            </ProtectedRoute>
          }
        />

        {/* Redirect unknown paths */}
        <Route path="*" element={<Navigate to={routes.login} />} />
      </Routes>
      </Router>
    </NotificationProvider>
  );
}

export default App;