import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  const loadPrimaryRestaurants = useAppStore((s) => s.loadPrimaryRestaurants);
  const loadCustomerTransactions = useAppStore((s) => s.loadCustomerTransactions);

  useEffect(() => {
    console.log('[App] useEffect: calling loadPrimaryRestaurants and loadCustomerTransactions');
    // fetch all restaurants from Firebase on app start
    loadPrimaryRestaurants().then(() => {
      console.log('[App] loadPrimaryRestaurants completed');
    }).catch((err) => {
      console.error('[App] loadPrimaryRestaurants failed:', err);
    });
    // fetch all customer transactions from Firebase on app start
    loadCustomerTransactions().then(() => {
      console.log('[App] loadCustomerTransactions completed');
    }).catch((err) => {
      console.error('[App] loadCustomerTransactions failed:', err);
    });
  }, [loadPrimaryRestaurants, loadCustomerTransactions]);

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}

export default App;
