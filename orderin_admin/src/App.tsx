import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAppStore } from './store';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { RestaurantsPage } from './pages/RestaurantsPage';
import { RestaurantDetailsPage } from './pages/RestaurantDetailsPage';
import { LedgerPage } from './pages/LedgerPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PaymentHubPage } from './pages/PaymentHubPage';
import { PaymentStatusPage } from './pages/PaymentStatusPage';

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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/restaurants" element={<RestaurantsPage />} />
        <Route path="/restaurants/:restaurantId" element={<RestaurantDetailsPage />} />
        <Route path="/ledger" element={<LedgerPage />} />
        <Route path="/settlements" element={<SettlementsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/pay" element={<PaymentHubPage />} />
        <Route path="/pay/status" element={<PaymentStatusPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
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
