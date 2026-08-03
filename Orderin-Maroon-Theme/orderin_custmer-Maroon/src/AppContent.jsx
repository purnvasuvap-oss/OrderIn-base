import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import AwaitingConfirmation from './payments/AwaitingConfirmation';
import Loading from './Loading';
import ProtectedRoute from './components/ProtectedRoute';
import AcceptingOrdersModal from './components/AcceptingOrdersModal';
import { subscribeAcceptingOrders } from './firebaseConfig';
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

  const location = useLocation();

  // Global "restaurant not serving" popup — shown on every page except
  // Login (which already surfaces this inline) so an already-logged-in
  // customer browsing the menu/cart/etc. finds out immediately, not just
  // when they try to check out.
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [acceptingOrdersDismissed, setAcceptingOrdersDismissed] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeAcceptingOrders((value) => {
      setAcceptingOrders(value);
      // Reset the dismissal once orders resume, so if it's paused again
      // later the popup shows fresh instead of staying dismissed forever.
      if (value) setAcceptingOrdersDismissed(false);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const showAcceptingOrdersModal =
    !acceptingOrders && !acceptingOrdersDismissed && location.pathname !== '/';

  return (
    <div className="App">
      <Loading isLoading={isLoading} />
      {showAcceptingOrdersModal && (
        <AcceptingOrdersModal onClose={() => setAcceptingOrdersDismissed(true)} />
      )}
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

        {/* ===== AWAITING CONFIRMATION ROUTE ===== */}
        <Route
          path="/awaiting-confirmation"
          element={
            <ProtectedRoute>
              <AwaitingConfirmation setIsLoading={setIsLoading} />
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
