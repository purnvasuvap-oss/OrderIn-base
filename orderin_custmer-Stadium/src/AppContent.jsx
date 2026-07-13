import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './login/login';
import Menu from './menu/Menu';
import Help from './help/Help';
import About from './help/About';
import OrderInAbout from './help/OrderInAbout';
import ItemDetails from './itemDetails/ItemDetails';
import Profile from './profile/Profile';
import Cart from './cart/Cart';
import Bill from './Bill';
import Payments from './payments/Payments';
import PaymentSuccess from './payments/PaymentSuccess';
import CounterCode from './payments/CounterCode';
import OnlinePayment from './payments/OnlinePayment';
import Loading from './Loading';
import ProtectedRoute from './components/ProtectedRoute';
import { useGlobalBackButton } from './hooks/useGlobalBackButton';

/**
 * AppContent - Main routing component
 * 
 * ROUTING STRUCTURE & BACK-BUTTON BEHAVIOR:
 * 
 * PUBLIC ROUTES (No auth required):
 * - / (Login) → Back button: PREVENT
 * 
 * PROTECTED ROUTES (Auth required):
 * - /menu → Back button: Go to Login
 * - /help, /about, /about-orderin → Back button: Go to Menu
 * - /item/:slug → Back button: Go to Menu
 * - /profile → Back button: Go to Menu
 * 
 * PAYMENT FLOW (Special handling - normal back within flow):
 * - /cart → Back button: Go to Menu (exits payment)
 * - /bill → Back button: Go to Menu (exits payment)
 * - /payments → Back button: Go to Cart (payment flow)
 * - /online-payment → Back button: Go to Payments (payment flow - Online payment only)
 * - /counter-code → Back button: Go to Payments (payment flow)
 * - /payment-success → Back button: Go to Menu
 * 
 * KEY DECISIONS:
 * 1. Payment flow pages keep normal back to allow navigation within flow
 * 2. All other pages use 'replace' navigation to prevent history stepping
 * 3. ProtectedRoute guards prevent unauthorized access
 * 4. Global back button handler enforces rules across the app
 */
function AppContent({ isLoading, setIsLoading }) {
  // Enable strict global back button handler
  useGlobalBackButton();

  return (
    <div className="App">
      <Loading isLoading={isLoading} />
      <Routes>
        {/* ===== PUBLIC ROUTES (No Auth Required) ===== */}
        
        {/* Login - Gateway to app */}
        <Route path="/" element={<Login setIsLoading={setIsLoading} />} />

        {/* ===== PROTECTED ROUTES (Auth Required) ===== */}
        
        {/* Main Navigation Routes */}
        <Route
          path="/menu"
          element={
            <ProtectedRoute>
              <Menu setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />

        {/* Info & Help Routes */}
        <Route
          path="/help"
          element={
            <ProtectedRoute>
              <Help setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/about"
          element={
            <ProtectedRoute>
              <About setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/about-orderin"
          element={
            <ProtectedRoute>
              <OrderInAbout setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />

        {/* Item & Details Routes */}
        <Route
          path="/item/:slug"
          element={
            <ProtectedRoute>
              <ItemDetails setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />

        {/* User Account Routes */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />

        {/* ===== PAYMENT FLOW ROUTES (Sequential: Cart → Bill → Payments → Counter Code → Success) ===== */}
        
        <Route
          path="/cart"
          element={
            <ProtectedRoute>
              <Cart setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/bill"
          element={
            <ProtectedRoute>
              <Bill setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/payments"
          element={
            <ProtectedRoute>
              <Payments setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/payment-success"
          element={
            <ProtectedRoute>
              <PaymentSuccess setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/counter-code"
          element={
            <ProtectedRoute>
              <CounterCode setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/online-payment"
          element={
            <ProtectedRoute>
              <OnlinePayment setIsLoading={setIsLoading} />
            </ProtectedRoute>
          }
        />

        {/* ===== CATCH-ALL (404 Redirect) ===== */}
        <Route path="*" element={<Navigate to="/menu" replace />} />
      </Routes>
    </div>
  );
}

export default AppContent;
