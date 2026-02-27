import { AppLayout } from '../layouts/AppLayout';
import { useAppStore } from '../store';
import { DataTable } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

export const SettlementsPage = () => {
  const { settlements } = useAppStore();
  const restaurants = useAppStore((state) => state.restaurants);
  const navigate = useNavigate();

  const settlementsWithTotals = useMemo(() => {
    return settlements.map((s) => {
      // Get current month key in "Feb 2026" format
      const currentMonthKey = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
      const currentMonthData = s.settlements?.[currentMonthKey];
      
      const payments = (currentMonthData && Array.isArray(currentMonthData.paymentHistory)) ? currentMonthData.paymentHistory : [];
      const totalPaid = payments.reduce((sum: number, p) => sum + (p.amount || 0), 0);
      const due = (currentMonthData && typeof currentMonthData.totalAmountDue === 'number') ? currentMonthData.totalAmountDue : (s.defaultSettlementAmount ?? 0);
      const pending = Math.max(0, due - totalPaid);
      const cycleStartDate = (currentMonthData && typeof currentMonthData.cycleStartDate === 'number') ? currentMonthData.cycleStartDate : (s.defaultSettlementStartDate ?? 0);
      
      // Look up restaurant status
      const restaurant = restaurants.find((r) => r.id === s.restaurantId);
      const restaurantStatus = restaurant?.status ?? 'Off';
      
      // Determine display status
      let displayStatus = 'Unpaid';
      if (restaurantStatus === 'Off') {
        displayStatus = 'Off';
      } else if (pending === 0) {
        displayStatus = 'Paid';
      }
      
      return {
        ...s,
        totalPaid,
        pending,
        displayStatus,
        totalAmountDue: due,
        cycleStartDate,
      };
    });
  }, [settlements, restaurants]);

  const columns = [
    {
      header: 'Restaurant',
      accessor: 'restaurantName',
      render: (value: unknown) => (value as React.ReactNode),
    },
    {
      header: 'Start Month',
      accessor: 'cycleStartDate',
      render: (value: unknown) => {
        if (typeof value === 'number' && value > 0) {
          return new Date(value).toLocaleString('default', { month: 'short', year: 'numeric' });
        }
        return '—';
      },
    },
    {
      header: 'Amount Due',
      accessor: 'totalAmountDue',
      render: (value: unknown) => {
        if (typeof value === 'number') {
          return `₹${value} / month`;
        }
        return '—';
      },
    },
    {
      header: 'Total Paid',
      accessor: 'totalPaid',
      render: (value: unknown) => `₹${value}`,
    },
    {
      header: 'Pending',
      accessor: 'pending',
      render: (value: unknown) => `₹${value}`,
    },
    {
      header: 'Status',
      accessor: 'displayStatus',
      render: (value: unknown) => {
        const status = value as string;
        return (
          <Badge
            variant={
              status === 'Paid' ? 'success' : status === 'Off' ? 'default' : 'warning'
            }
          >
            {status}
          </Badge>
        );
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{
          background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #a855f7 100%)',
          borderRadius: '1.5rem',
          padding: '2rem',
          color: 'white',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          animation: 'slideInUp 0.6s ease',
        }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: '900' }}>Settlements</h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginTop: '0.5rem', fontSize: '1.125rem' }}>Track restaurant settlement and payouts</p>
        </div>

        <div className="card" style={{ animation: 'slideInUp 0.8s ease' }}>
          <DataTable
            columns={columns}
            data={settlementsWithTotals as unknown as Record<string, unknown>[]}
            onRowClick={(row) => {
              if (row && typeof row.restaurantId === 'string') {
                navigate(`/restaurants/${row.restaurantId}`);
              }
            }}
          />
        </div>
      </div>
    </AppLayout>
  );
};
