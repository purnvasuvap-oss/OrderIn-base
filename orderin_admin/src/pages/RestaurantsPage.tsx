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

  // Load transactions on mount
  useEffect(() => {
    loadCustomerTransactions().catch(() => {});
  }, [loadCustomerTransactions]);

  // Filter restaurants to only show those with online transactions
  const restaurantsWithOnlineTransactions = useMemo(() => {
    return restaurants.filter(restaurant => {
      const txns = getRestaurantTransactions(restaurant.id);
      return txns.some(txn => ['online', 'Online'].includes(txn.paymentMethod));
    });
  }, [restaurants, getRestaurantTransactions]);

  const filteredRestaurants = useMemo(() => {
    const query = (localSearch || searchQuery).toLowerCase();
    return restaurantsWithOnlineTransactions.filter(
      (r) =>
        r.Restaurant_name.toLowerCase().includes(query) ||
        r.code.toLowerCase().includes(query) ||
        r.city.toLowerCase().includes(query)
    );
  }, [restaurantsWithOnlineTransactions, searchQuery, localSearch]);

  // Format value to max 4 decimals, removing trailing zeros
  const formatValue = (value: number): string => {
    return parseFloat(value.toFixed(4)).toString();
  };

  const columns = [
    { header: 'Code', accessor: 'code', render: (value: unknown, row: Record<string, unknown>) => (value as string) || (row.id as string) },
    { header: 'Restaurant Name', accessor: 'Restaurant_name' },
    { header: 'City', accessor: 'city' },
    {
      header: 'Status',
      accessor: 'status',
      render: (value: unknown) => (
        <Badge variant={
          value === 'Active' ? 'success' : value === 'Suspended' ? 'error' : value === 'Off' ? 'info' : 'warning'
        }>
          {value as React.ReactNode}
        </Badge>
      ),
    },
    {
      header: 'Orders',
      accessor: 'id',
      render: (value: unknown) => {
        const restaurantId = value as string;
        const transactions = getRestaurantTransactions(restaurantId);
        const onlineTransactions = transactions.filter(t => ['online', 'Online'].includes(t.paymentMethod));
        return onlineTransactions.length.toLocaleString();
      },
    },
    {
      header: 'Volume',
      accessor: 'id',
      render: (value: unknown) => {
        const restaurantId = value as string;
        const transactions = getRestaurantTransactions(restaurantId);
        const onlineTransactions = transactions.filter(t => ['online', 'Online'].includes(t.paymentMethod));
        const totalRevenue = onlineTransactions.reduce((sum, t) => sum + t.grossAmount, 0);
        return `₹${formatValue(totalRevenue)}`;
      },
    },
    {
      header: 'Your Earnings',
      accessor: 'id',
      render: (value: unknown) => {
        const restaurantId = value as string;
        const transactions = getRestaurantTransactions(restaurantId);
        const onlineTransactions = transactions.filter(t => ['online', 'Online'].includes(t.paymentMethod));
        const platformEarnings = onlineTransactions.reduce((sum, t) => sum + t.netPlatformEarnings, 0);
        return `₹${formatValue(platformEarnings)}`;
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
