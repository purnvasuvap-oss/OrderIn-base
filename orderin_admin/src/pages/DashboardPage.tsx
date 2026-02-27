import { useMemo } from 'react';
import { useAppStore } from '../store';
import { StatCard } from '../components/StatCard';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, DollarSign, Receipt, Zap } from 'lucide-react';
import { AppLayout } from '../layouts/AppLayout';
import { format } from 'date-fns';

// Custom Tooltip Component with white text - defined outside component
const CustomPieTooltip = (props: Record<string, unknown>) => {
  const active = props.active as boolean | undefined;
  const payload = props.payload as Array<{ name?: string; value?: number }> | undefined;
  
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(6, 182, 212, 0.5)',
        borderRadius: '0.75rem',
        padding: '8px 12px',
        color: '#f1f5f9',
      }}>
        <p style={{ margin: 0, color: '#f1f5f9', fontSize: '0.875rem' }}>
          {payload[0].name}: <span style={{ fontWeight: 'bold', color: '#f1f5f9' }}>₹{payload[0].value}</span>
        </p>
      </div>
    );
  }
  return null;
};

export const DashboardPage = () => {
  const { restaurants, transactions } = useAppStore();

  // Filter to only include online transactions
  const onlineTransactions = useMemo(() => {
    return transactions.filter(t => ['online', 'Online'].includes(t.paymentMethod));
  }, [transactions]);

  const stats = useMemo(() => {
    const totalRestaurants = restaurants.length;
    const totalTransactions = onlineTransactions.length;
    const totalGrossVolume = onlineTransactions.reduce((sum, t) => sum + t.grossAmount, 0);
    const totalPlatformEarnings = onlineTransactions.reduce((sum, t) => sum + t.netPlatformEarnings, 0);
    const totalGstPayable = onlineTransactions.reduce((sum, t) => sum + t.gst, 0);

    return {
      totalRestaurants,
      totalTransactions,
      totalGrossVolume,
      totalPlatformEarnings,
      totalGstPayable,
    };
  }, [restaurants, onlineTransactions]);

  const earningsByDate = useMemo(() => {
    const data: Record<string, { earnings: number; count: number }> = {};
    onlineTransactions.forEach((t) => {
      const date = format(new Date(t.createdAt), 'MMM dd');
      if (!data[date]) data[date] = { earnings: 0, count: 0 };
      data[date].earnings += t.netPlatformEarnings;
      data[date].count += 1;
    });
    return Object.entries(data).map(([date, { earnings, count }]) => ({
      date,
      earnings: Math.round(earnings),
      transactions: count,
    }));
  }, [onlineTransactions]);

  const paymentMethodSplit = useMemo(() => {
    const data: Record<string, number> = {};
    onlineTransactions.forEach((t) => {
      const method = t.OnlinePayMethod || t.paymentMethod || 'Unknown';
      data[method] = (data[method] || 0) + t.grossAmount;
    });
    return Object.entries(data).map(([method, amount]) => ({
      name: method,
      value: Math.round(amount),
    }));
  }, [onlineTransactions]);

  const topRestaurants = useMemo(() => {
    const volumeByRestaurant: Record<string, number> = {};
    onlineTransactions.forEach((t) => {
      volumeByRestaurant[t.restaurantId] = (volumeByRestaurant[t.restaurantId] || 0) + t.grossAmount;
    });
    return Object.entries(volumeByRestaurant)
      .map(([restId, volume]) => {
        const rest = restaurants.find((r) => r.id === restId);
        return { name: rest?.Restaurant_name || 'Unknown', volume: Math.round(volume) };
      })
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);
  }, [onlineTransactions, restaurants]);

  const colors = ['#06b6d4', '#a855f7', '#ec4899', '#f97316', '#10b981'];

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{
          background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%)',
          borderRadius: '1.5rem',
          padding: '2rem',
          color: 'white',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          animation: 'slideInUp 0.6s ease',
        }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: '900' }}>Dashboard</h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginTop: '0.5rem', fontSize: '1.125rem' }}>Global analytics and financial insights</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1.5rem',
        }}>
          <StatCard
            label="Total Restaurants"
            value={stats.totalRestaurants}
            icon={<Users size={28} />}
            color="cyan"
          />
          <StatCard
            label="Total Transactions"
            value={stats.totalTransactions}
            icon={<Receipt size={28} />}
            color="purple"
          />
          <StatCard
            label="Gross Volume"
            value={`₹${(stats.totalGrossVolume / 100000).toFixed(1)}L`}
            icon={<DollarSign size={28} />}
            color="pink"
          />
          <StatCard
            label="Platform Earnings"
            value={`₹${(stats.totalPlatformEarnings / 1000).toFixed(0)}K`}
            icon={<TrendingUp size={28} />}
            color="orange"
          />
          <StatCard
            label="GST Payable"
            value={`₹${(stats.totalGstPayable / 1000).toFixed(0)}K`}
            icon={<Zap size={28} />}
            color="emerald"
          />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '1.5rem',
        }}>
          <div className="card" style={{ animation: 'slideInLeft 0.6s ease' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#06b6d4' }}>
              <TrendingUp size={20} />
              Earnings Over Time
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={earningsByDate}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(6, 182, 212, 0.1)" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    borderRadius: '0.75rem',
                    color: '#f1f5f9',
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="earnings" stroke="#06b6d4" strokeWidth={3} name="Earnings (₹)" dot={{ fill: '#06b6d4', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card" style={{ animation: 'slideInRight 0.6s ease' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a855f7' }}>
              <DollarSign size={20} />
              Payment Method Split
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={paymentMethodSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={{ fill: '#f1f5f9', fontSize: 12 }}>
                  {paymentMethodSplit.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
                <Legend wrapperStyle={{ color: '#f1f5f9' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ animation: 'slideInUp 0.6s ease' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ec4899' }}>
            <Receipt size={20} />
            Top 10 Restaurants by Volume
          </h2>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={topRestaurants}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(6, 182, 212, 0.1)" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  borderRadius: '0.75rem',
                  color: '#f1f5f9',
                }}
              />
              <Bar dataKey="volume" fill="#06b6d4" name="Volume (₹)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppLayout>
  );
};
