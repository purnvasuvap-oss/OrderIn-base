import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, type ReactElement } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useAppStore } from './store';
import { auth } from './config/firebase';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { RestaurantsPage } from './pages/RestaurantsPage';
import { RestaurantDetailsPage } from './pages/RestaurantDetailsPage';
import { LedgerPage } from './pages/LedgerPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PaymentHubPage } from './pages/PaymentHubPage';
import { PaymentStatusPage } from './pages/PaymentStatusPage';

const USE_FIREBASE_AUTH = import.meta.env.VITE_USE_FIREBASE_AUTH === 'true';

function RequireAuth({ children }: { children: ReactElement }) {
  const location = useLocation();
  const [ready, setReady] = useState(!USE_FIREBASE_AUTH);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!USE_FIREBASE_AUTH) return undefined;
    return onAuthStateChanged(auth, (user) => {
      setSignedIn(Boolean(user));
      setReady(true);
    });
  }, []);

  if (USE_FIREBASE_AUTH) {
    if (!ready) return null;
    if (!signedIn) return <Navigate to="/login" replace state={{ from: location }} />;
    return children;
  }

  if (sessionStorage.getItem('orderin_admin_auth') !== 'true') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

// History guard component to prevent back navigation on login page
function HistoryGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Push a new history state when on login page
    if (location.pathname === '/login') {
      // Replace current state to clear history
      window.history.pushState(null, '', window.location.pathname);
    }
  }, [location.pathname]);

  useEffect(() => {
    // Handle popstate (back button press)
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      
      // If on login page, prevent going back
      if (location.pathname === '/login') {
        // Push state again to prevent going back
        window.history.pushState(null, '', window.location.pathname);
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [location.pathname, navigate]);

  return null;
}

function AppContent() {
  const loadPrimaryRestaurants = useAppStore((s) => s.loadPrimaryRestaurants);
  const loadCustomerTransactions = useAppStore((s) => s.loadCustomerTransactions);
  const watchRestaurants = useAppStore((s) => s.watchRestaurants);
  const reloadAllRestaurants = useAppStore((s) => s.reloadAllRestaurants);

  useEffect(() => {
    console.log('[App] useEffect: initializing data load');
    
    // Step 1: Initial load
    loadPrimaryRestaurants().then(() => {
      console.log('[App] loadPrimaryRestaurants completed');
      loadCustomerTransactions().then(() => {
        console.log('[App] loadCustomerTransactions completed after restaurants loaded');
      }).catch((err) => {
        console.error('[App] loadCustomerTransactions after restaurants failed:', err);
      });
      
      // Step 2: Set up real-time listener
      watchRestaurants();
      console.log('[App] watchRestaurants activated');
      
      // Step 3: Verify all restaurants are loaded (handle race conditions)
      setTimeout(() => {
        reloadAllRestaurants().catch(() => {
          console.error('[App] reloadAllRestaurants failed');
        });
      }, 1000);
    }).catch((err) => {
      console.error('[App] loadPrimaryRestaurants failed:', err);
    });
    
    // Fetch transactions
    loadCustomerTransactions().then(() => {
      console.log('[App] loadCustomerTransactions completed');
    }).catch((err) => {
      console.error('[App] loadCustomerTransactions failed:', err);
    });
  }, [loadPrimaryRestaurants, loadCustomerTransactions, watchRestaurants, reloadAllRestaurants]);

  return (
    <>
      <HistoryGuard />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/restaurants" element={<RequireAuth><RestaurantsPage /></RequireAuth>} />
        <Route path="/restaurants/:restaurantId" element={<RequireAuth><RestaurantDetailsPage /></RequireAuth>} />
        <Route path="/ledger" element={<RequireAuth><LedgerPage /></RequireAuth>} />
        <Route path="/settlements" element={<RequireAuth><SettlementsPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        {/* /pay and /pay/status are customer-facing Razorpay hand-off pages — no admin gate. */}
        <Route path="/pay" element={<PaymentHubPage />} />
        <Route path="/pay/status" element={<PaymentStatusPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
