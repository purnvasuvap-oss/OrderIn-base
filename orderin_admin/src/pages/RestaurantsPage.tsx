import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store';
import { AppLayout } from '../layouts/AppLayout';
import { DataTable } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';

export const RestaurantsPage = () => {
  const navigate = useNavigate();
  const { restaurants, searchQuery, getRestaurantTransactions, loadCustomerTransactions } = useAppStore();
  const [localSearch, setLocalSearch] = useState('');

  // Debug: Log restaurants
  useEffect(() => {
    console.log('[RestaurantsPage] Restaurants in store:', restaurants.length);
    restaurants.forEach((r, i) => {
      console.log(`[RestaurantsPage] Restaurant ${i}:`, {
        id: r.id,
        name: r.Restaurant_name,
        code: r.code,
        city: r.city
      });
    });
  }, [restaurants]);

  // Load transactions on mount
  useEffect(() => {
    loadCustomerTransactions().catch(() => {});
  }, [loadCustomerTransactions]);

  // Show all restaurants (not filtered by transactions)
  const filteredRestaurants = useMemo(() => {
    const query = (localSearch || searchQuery).toLowerCase();
    return restaurants.filter((r) => {
      try {
        const name = (r.Restaurant_name || r.code || r.id || '').toLowerCase();
        const code = (r.code || r.id || '').toLowerCase();
        const city = (r.city || '').toLowerCase();
        
        return (
          name.includes(query) ||
          code.includes(query) ||
          city.includes(query) ||
          query === '' // Show all if search is empty
        );
      } catch (e) {
        console.error('[RestaurantsPage] Filter error for restaurant:', r, e);
        return true; // Show restaurant even if there's an error
      }
    });
  }, [restaurants, searchQuery, localSearch]);

  // Format value to max 4 decimals, removing trailing zeros
  const formatValue = (value: number): string => {
    return parseFloat(value.toFixed(4)).toString();
  };

  const columns = [
    { 
      header: 'Code', 
      accessor: 'code', 
      render: (value: unknown, row: Record<string, unknown>) => {
        return (value as string) || (row.id as string) || '—';
      }
    },
    { 
      header: 'Restaurant Name', 
      accessor: 'Restaurant_name',
      render: (value: unknown) => (value as string) || '—'
    },
    { 
      header: 'City', 
      accessor: 'city',
      render: (value: unknown) => (value as string) || '—'
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (value: unknown) => (
        <Badge variant={
          value === 'Active' ? 'success' : value === 'Suspended' ? 'error' : value === 'Off' ? 'info' : 'warning'
        }>
          {(value as React.ReactNode) || 'Off'}
        </Badge>
      ),
    },
    {
      header: 'Orders',
      accessor: 'id',
      render: (value: unknown) => {
        try {
          const restaurantId = value as string;
          const transactions = getRestaurantTransactions(restaurantId);
          const onlineTransactions = transactions.filter(t => ['online', 'Online'].includes(t.paymentMethod));
          return onlineTransactions.length.toLocaleString();
        } catch (e) {
          console.error('[RestaurantsPage] Orders render error:', e);
          return '0';
        }
      },
    },
    {
      header: 'Volume',
      accessor: 'id',
      render: (value: unknown) => {
        try {
          const restaurantId = value as string;
          const transactions = getRestaurantTransactions(restaurantId);
          const onlineTransactions = transactions.filter(t => ['online', 'Online'].includes(t.paymentMethod));
          const totalRevenue = onlineTransactions.reduce((sum, t) => sum + t.grossAmount, 0);
          return `₹${formatValue(totalRevenue)}`;
        } catch (e) {
          console.error('[RestaurantsPage] Volume render error:', e);
          return '₹0';
        }
      },
    },
    {
      header: 'Your Earnings',
      accessor: 'id',
      render: (value: unknown) => {
        try {
          const restaurantId = value as string;
          const transactions = getRestaurantTransactions(restaurantId);
          const onlineTransactions = transactions.filter(t => ['online', 'Online'].includes(t.paymentMethod));
          const platformEarnings = onlineTransactions.reduce((sum, t) => sum + t.netPlatformEarnings, 0);
          return `₹${formatValue(platformEarnings)}`;
        } catch (e) {
          console.error('[RestaurantsPage] Earnings render error:', e);
          return '₹0';
        }
      },
    },
    {
      header: '',
      accessor: 'id',
      render: () => <ChevronRight size={20} className="text-gray-400" />,
    },
  ];

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{
          background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f97316 100%)',
          borderRadius: '1.5rem',
          padding: '2rem',
          color: 'white',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          animation: 'slideInUp 0.6s ease',
        }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: '900' }}>Restaurants</h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginTop: '0.5rem', fontSize: '1.125rem' }}>Manage and monitor all partner restaurants</p>
        </div>

        <div style={{ position: 'relative', animation: 'slideInUp 0.7s ease' }}>
          <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#a855f7' }} />
          <input
            type="text"
            placeholder="Search by name, code, or city..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '2.75rem',
              paddingRight: '1rem',
              paddingTop: '0.75rem',
              paddingBottom: '0.75rem',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '0.75rem',
              background: 'rgba(30, 27, 75, 0.5)',
              color: '#f1f5f9',
              fontSize: '1rem',
              transition: 'all 0.3s ease',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#a855f7';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(168, 85, 247, 0.2)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        <div className="card" style={{ animation: 'slideInUp 0.8s ease' }}>
          <DataTable
            columns={columns}
            data={filteredRestaurants as unknown as Record<string, unknown>[]}
            onRowClick={(row) => {
              const r = row as unknown as { code?: string; id?: string };
              const key = r.code || r.id;
              navigate(`/restaurants/${key}`);
            }}
          />
        </div>
      </div>
    </AppLayout>
  );
};
