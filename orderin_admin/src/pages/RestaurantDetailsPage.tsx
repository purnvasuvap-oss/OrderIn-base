import { useState, useMemo, useEffect } from 'react';
import type { RestaurantStatus } from '../types';
import { useParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { AppLayout } from '../layouts/AppLayout';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { format } from 'date-fns';
import { DollarSign, TrendingUp, Zap, Activity, ChevronLeft, Eye, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Transaction, PaymentEntry } from '../types';

export const RestaurantDetailsPage = () => {
  const { restaurantId } = useParams();
  const navigate = useNavigate();
  const { getRestaurantById, getRestaurantTransactions, getSettlementsByRestaurant, ensureMonthlySettlement, setDefaultSettlementAmount, addPaymentToSettlementById, createNextSettlementIfNeeded, setRestaurantStatus, loadCustomerTransactions } = useAppStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [defaultAmountInput, setDefaultAmountInput] = useState<string>('');
  const [paymentInputs, setPaymentInputs] = useState<Record<string, string>>({});
  const [daysRemaining, setDaysRemaining] = useState(30);

  const restaurant = getRestaurantById(restaurantId!);
  const allTransactions = getRestaurantTransactions(restaurantId!);
  
  // Filter transactions to only show those explicitly marked as 'online' payment method
  const transactions = useMemo(() => {
    const filtered = allTransactions.filter(txn => ['online', 'Online'].includes(txn.paymentMethod));
    // Sort by date (newest first)
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allTransactions]);
  
  const settlements = getSettlementsByRestaurant(restaurantId!);
  const settlement = settlements.length > 0 ? settlements[0] : null; // Single settlement per restaurant

  // One minute in milliseconds for testing (change to 30 * 24 * 60 * 60 * 1000 for 30 days in production)
  const SETTLEMENT_INTERVAL_MS = 60 * 1000; // 1 minute

  // Load transactions on mount (similar to LedgerPage)
  useEffect(() => {
    if (restaurantId) {
      loadCustomerTransactions().catch(() => {});
    }
  }, [restaurantId, loadCustomerTransactions]);
  const getCurrentMonthKey = (): string => {
    return new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
  };

  // Helper: Get current month's settlement data
  const getCurrentMonthSettlement = () => {
    if (!settlement?.settlements) return null;
    return settlement.settlements[getCurrentMonthKey()] || null;
  };

  // Debug logging: show settlement object to help diagnose UI/DB mismatch
  useEffect(() => {
    if (settlement) { 
      console.log('[Debug] RestaurantDetailsPage settlement', settlement);
    }
  }, [settlement]);

  useEffect(() => {
    if (restaurantId) {
      ensureMonthlySettlement(restaurantId);
      
      // Set up interval to check every 5 minutes if a new cycle should be created
      // Only create new period after 30 days (or SETTLEMENT_INTERVAL_MS for testing) from current period start
      const interval = setInterval(() => {
        createNextSettlementIfNeeded(restaurantId);
      }, 5 * 60 * 1000); // Check every 5 minutes
      
      return () => clearInterval(interval);
    }
  }, [ensureMonthlySettlement, createNextSettlementIfNeeded, restaurantId, SETTLEMENT_INTERVAL_MS]);

  // Calculate days remaining dynamically based on current month settlement start time
  useEffect(() => {
    if (!settlement?.settlements) {
      return;
    }
    
    const currentMonthKey = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
    const currentMonthSettlement = settlement.settlements[currentMonthKey];
    
    if (!currentMonthSettlement?.cycleStartDate) {
      return;
    }
    
    const cycleStartDate = currentMonthSettlement.cycleStartDate;
    
    const calculateAndUpdate = () => {
      const now = Date.now();
      const timeSinceCycleStart = now - cycleStartDate;
      const daysSinceCycleStart = Math.floor(timeSinceCycleStart / (24 * 60 * 60 * 1000));
      const remaining = Math.max(0, 30 - daysSinceCycleStart);
      setDaysRemaining(remaining);
    };
    
    // Calculate and update every minute
    calculateAndUpdate(); // Initial calculation
    const interval = setInterval(calculateAndUpdate, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [settlement?.settlements]);

  const handleSetDefaultAmount = () => {
    const amount = parseFloat(defaultAmountInput || '0');
    if (!isNaN(amount) && amount > 0 && restaurantId) {
      setDefaultSettlementAmount(restaurantId, amount);
      setDefaultAmountInput('');
    }
  };

  // Format value to max 4 decimals, removing trailing zeros
  const formatValue = (value: number): string => {
    return parseFloat(value.toFixed(4)).toString();
  };

  const stats = useMemo(() => {
    // Total Orders = count of transactions loaded for this restaurant
    const totalOrders = transactions.length;
    
    // Calculate aggregates based on transaction breakdowns
    const totalRevenue = transactions.reduce((sum: number, t) => sum + t.grossAmount, 0);
    const restaurantShare = transactions.reduce((sum: number, t) => sum + t.restaurantReceivable, 0);
    
    // Platform earnings = sum of all platformFee (before GST)
    const platformEarningsBeforeGst = transactions.reduce((sum: number, t) => sum + t.platformFee, 0);
    
    // Total GST collected on platform earnings
    const gstPayable = transactions.reduce((sum: number, t) => sum + t.gst, 0);
    
    // Total Razorpay fees (already included in platformFee calculation)
    const razorpayFees = transactions.reduce((sum: number, t) => sum + t.razorpayFee, 0);
    
    // Net Platform Earnings = platform fee - razorpay fee - GST
    const platformEarningsAfterFees = transactions.reduce((sum: number, t) => sum + t.netPlatformEarnings, 0);

    return { 
      totalOrders, 
      totalRevenue, 
      platformEarningsBeforeGst,
      platformEarningsAfterFees,
      gstPayable, 
      razorpayFees, 
      restaurantShare 
    };
  }, [transactions]);

  if (!restaurant) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-bold text-gray-900">Restaurant not found</h2>
        </div>
      </AppLayout>
    );
  }

  const transactionColumns = [
    {
      header: 'DateTime',
      accessor: 'createdAt',
      render: (value: unknown) => format(new Date(value as Date), 'dd MMM HH:mm'),
    },
    { header: 'Order ID', accessor: 'orderId' },
    {
      header: 'Method',
      accessor: 'id',
      render: (_value: unknown, row: unknown): React.ReactNode => {
        const txn = row as Transaction;
        return txn.OnlinePayMethod || 'N/A';
      },
    },
    {
      header: 'Gross Amount',
      accessor: 'grossAmount',
      render: (value: unknown) => `₹${value}`,
    },
    {
      header: 'Platform Fee',
      accessor: 'platformFee',
      render: (value: unknown) => `₹${value}`,
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (value: unknown) => (
        <Badge variant={value === 'Paid' ? 'success' : value === 'Failed' ? 'error' : 'warning'}>
          {value as React.ReactNode}
        </Badge>
      ),
    },
    {
      header: '',
      accessor: 'id',
      render: () => <Eye size={18} className="text-blue-600 cursor-pointer" />,
    },
  ];

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <button
          onClick={() => navigate('/restaurants')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#06b6d4',
            background: 'none',
            border: 'none',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'color 0.2s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = '#0891b2';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = '#06b6d4';
          }}
        >
          <ChevronLeft size={20} />
          Back to Restaurants
        </button>

        <div
          style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%)',
            borderRadius: '1.5rem',
            padding: '2rem',
            color: 'white',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            animation: 'slideInUp 0.6s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: '900' }}>{restaurant.Restaurant_name}</h1>
              <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginTop: '0.5rem', fontSize: '1.125rem' }}>
                Code: {restaurant.code}
              </p>
            </div>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '9999px',
                paddingLeft: '0.75rem',
                paddingRight: '0.75rem',
                paddingTop: '0.375rem',
                paddingBottom: '0.375rem',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: 'white',
              }}
            >
              {restaurant.status}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.5rem',
          }}
        >
          <StatCard label="Total Orders" value={stats.totalOrders} icon={<Activity size={24} />} color="cyan" />
          <StatCard
            label="Gross Revenue"
            value={`₹${formatValue(stats.totalRevenue)}`}
            icon={<DollarSign size={24} />}
            color="purple"
          />
          <StatCard
            label="Restaurant Share"
            value={`₹${formatValue(stats.restaurantShare)}`}
            icon={<TrendingUp size={24} />}
            color="emerald"
          />
          <StatCard
            label="Platform Earnings"
            value={`₹${formatValue(stats.platformEarningsAfterFees)}`}
            icon={<DollarSign size={24} />}
            color="pink"
          />
          <StatCard
            label="Razorpay Fees"
            value={`₹${formatValue(stats.razorpayFees)}`}
            icon={<Zap size={24} />}
            color="orange"
          />
          <StatCard
            label="GST (18%)"
            value={`₹${formatValue(stats.gstPayable)}`}
            icon={<TrendingUp size={24} />}
            color="cyan"
          />
        </div>

        <div className="card">
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(6, 182, 212, 0.2)', background: 'rgba(30, 27, 75, 0.5)' }}>
            {['overview', 'transactions', 'settlement', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  paddingLeft: '2rem',
                  paddingRight: '2rem',
                  paddingTop: '1.25rem',
                  paddingBottom: '1.25rem',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  transition: 'all 0.2s ease',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: activeTab === tab ? '#06b6d4' : '#94a3b8',
                  position: 'relative',
                  borderBottom: activeTab === tab ? '2px solid #06b6d4' : 'none',
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ padding: '1.5rem' }}>
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600">Code</p>
                  <p className="text-lg font-semibold text-gray-900">{restaurant.code}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Owner</p>
                  <p className="text-lg font-semibold text-gray-900">{restaurant.Owner}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Owner Contact</p>
                  <p className="text-lg font-semibold text-gray-900">{restaurant.Owner_Contact}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="text-lg font-semibold text-gray-900">{restaurant.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Address</p>
                  <p className="text-lg font-semibold text-gray-900">{restaurant.address}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Bank Account</p>
                  <p className="text-lg font-semibold text-gray-900">{restaurant.account}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">IFSC</p>
                  <p className="text-lg font-semibold text-gray-900">{restaurant.IFSC}</p>
                </div>
              </div>
            )}

            {activeTab === 'transactions' && (
              <DataTable
                columns={transactionColumns}
                data={transactions as unknown as Record<string, unknown>[]}
                onRowClick={(row) => setSelectedTransaction(row as unknown as Transaction)}
              />
            )}

            {activeTab === 'settlement' && settlement ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Default Amount Due Setting */}
                <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Default Monthly Amount Due</p>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <input
                      type="number"
                      placeholder="Set default amount for all new settlements"
                      value={defaultAmountInput}
                      onChange={(e) => setDefaultAmountInput(e.target.value)}
                      style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid rgba(99,102,241,0.2)', background: 'transparent', color: '#f1f5f9' }}
                    />
                    <button onClick={handleSetDefaultAmount} style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', fontWeight: 700 }}>Set</button>
                  </div>
                  {settlement.defaultSettlementAmount > 0 && (
                    <p style={{ fontSize: '0.875rem', color: '#10b981', marginTop: '0.5rem' }}>Current default: ₹{settlement.defaultSettlementAmount}</p>
                  )}
                </div>

                {/* Additional Amount - Global Overpayment Section */}
                {(() => {
                  const globalOverpayment = settlement?.currentOverpayment ?? 0;
                  
                  return (
                    <div style={{ padding: '1rem', borderRadius: '0.75rem', background: globalOverpayment > 0 ? 'rgba(251,146,60,0.1)' : 'rgba(56,189,248,0.05)', border: globalOverpayment > 0 ? '1px solid rgba(251,146,60,0.3)' : '1px solid rgba(56,189,248,0.2)' }}>
                      <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.75rem' }}>Additional Amount</p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontSize: '0.875rem', color: '#f1f5f9' }}>Available from Previous Overpayments</p>
                          <p style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.25rem' }}>This will be automatically deducted from next month</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '1.75rem', fontWeight: 900, color: globalOverpayment > 0 ? '#f59e0b' : '#94a3b8' }}>₹{globalOverpayment}</p>
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Present</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {settlement && getCurrentMonthSettlement() ? (
                <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(56,189,248,0.08)' }}>
                  {(() => {
                    const currentMonthData = getCurrentMonthSettlement();
                    if (!currentMonthData) return null;

                    return (
                      <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Current Period</p>
                        {currentMonthData.totalPaid >= currentMonthData.totalAmountDue && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', borderRadius: '0.375rem', background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#22c55e' }}>✓ Completed</span>
                            {currentMonthData.settledDate && (
                              <span style={{ fontSize: '0.65rem', color: '#10b981', marginLeft: '0.25rem' }}>
                                {new Date(currentMonthData.settledDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <p style={{ fontSize: '1rem', fontWeight: 700, color: '#f1f5f9' }}>{currentMonthData.period}</p>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Days Remaining: {daysRemaining}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Default Amount</p>
                        <p style={{ fontSize: '1rem', fontWeight: 800, color: '#f1f5f9' }}>₹{currentMonthData.defaultAmountForMonth || currentMonthData.totalAmountDue}</p>
                      </div>
                      {(currentMonthData.carryOverCredit ?? 0) > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Carryover Credit</p>
                          <p style={{ fontSize: '1rem', fontWeight: 800, color: '#8b5cf6' }}>-₹{currentMonthData.carryOverCredit ?? 0}</p>
                        </div>
                      )}
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Due</p>
                        <p style={{ fontSize: '1rem', fontWeight: 800, color: '#f1f5f9' }}>₹{currentMonthData.totalAmountDue}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Paid</p>
                        <p style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981' }}>₹{currentMonthData.totalPaid}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Pending</p>
                        <p style={{ fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>₹{Math.max(0, currentMonthData.totalAmountDue - currentMonthData.totalPaid)}</p>
                      </div>
                      {(currentMonthData.overpaymentAmount ?? 0) > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Overpayment</p>
                          <p style={{ fontSize: '1rem', fontWeight: 800, color: '#f59e0b' }}>₹{currentMonthData.overpaymentAmount ?? 0}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Carryover Credit Breakdown */}
                  {(currentMonthData.carryOverCredit ?? 0) > 0 && (
                    <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', marginBottom: '0.75rem' }}>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Amount Calculation Breakdown</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#cbd5e1' }}>
                        <div>
                          <div>Default Amount: <span style={{ fontWeight: 700, color: '#f1f5f9' }}>₹{currentMonthData.defaultAmountForMonth || currentMonthData.totalAmountDue}</span></div>
                          <div style={{ marginTop: '0.25rem' }}>Carryover Credit: <span style={{ fontWeight: 700, color: '#8b5cf6' }}>-₹{currentMonthData.carryOverCredit ?? 0}</span></div>
                        </div>
                        <div style={{ textAlign: 'right', borderTop: '1px solid rgba(139,92,246,0.3)', paddingTop: '0.5rem' }}>
                          <div>Amount Due This Month: <span style={{ fontWeight: 700, color: '#f1f5f9' }}>₹{currentMonthData.totalAmountDue}</span></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Period Status and Closure Message */}
                  {(() => {
                    const dueAmount = currentMonthData.totalAmountDue;
                    const totalPaid = currentMonthData.totalPaid;
                    const isClosed = totalPaid >= dueAmount;
                    
                    if (isClosed) {
                      let closureReason = 'Period closed — Paid in full';
                      if (totalPaid > dueAmount) {
                        const overpaid = totalPaid - dueAmount;
                        closureReason = `Period closed — Overpaid by ₹${overpaid}`;
                      }
                      return (
                        <div style={{ marginBottom: '0.75rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ fontWeight: 700, color: '#10b981' }}>✓ {closureReason}</div>
                          <div style={{ fontSize: '0.875rem' }}>No further payments can be added for this period.</div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Payment Input - Only show if period is NOT fully paid */}
                  {(() => {
                    const dueAmount = currentMonthData.totalAmountDue;
                    const totalPaid = currentMonthData.totalPaid;
                    const remaining = Math.max(0, dueAmount - totalPaid);
                    const isClosed = totalPaid >= dueAmount;
                    
                    // If period is closed, don't show this section at all
                    if (isClosed) {
                      return null;
                    }

                    return (
                      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                        <input
                          type="number"
                          placeholder={`Add payment (₹${remaining} remaining)`}
                          value={paymentInputs[settlement.restaurantId] || ''}
                          onChange={(e) => setPaymentInputs((m) => ({ ...m, [settlement.restaurantId]: e.target.value }))}
                          style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid rgba(6,182,212,0.2)', background: 'transparent', color: '#f1f5f9' }}
                        />
                        <button onClick={() => {
                          const raw = paymentInputs[settlement.restaurantId];
                          const amount = parseFloat(raw || '0');
                          if (!isNaN(amount) && amount > 0) {
                            addPaymentToSettlementById(settlement.restaurantId, amount);
                            setPaymentInputs((m) => ({ ...m, [settlement.restaurantId]: '' }));
                          }
                        }} style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg,#10b981,#06b6d4)', color: 'white', fontWeight: 700, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <Plus size={16} />
                          Add
                        </button>
                      </div>
                    );
                  })()}

                  {/* Payment History */}
                  {(() => {
                    const rawPayments = currentMonthData.paymentHistory || [];
                    // Only show payments with positive amounts
                    const payments = rawPayments.filter((p) => p && p.amount && p.amount > 0);
                    if (payments.length === 0) return null;

                    // Sort by timestamp (desc)
                    payments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                    const installmentsCount = payments.length;
                    const paymentsTotal = payments.reduce((s: number, x: PaymentEntry) => s + (x.amount || 0), 0);
                    const isFullyPaid = currentMonthData.totalPaid >= currentMonthData.totalAmountDue;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Payment History</p>
                          <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>{isFullyPaid ? 'Settled' : 'Partial'} — {installmentsCount} {installmentsCount > 1 ? 'installments' : 'installment'} • ₹{paymentsTotal}</div>
                        </div>

                        {payments.map((p: PaymentEntry) => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem', borderRadius: '0.5rem', background: p.isAutoPayment ? 'rgba(34,197,94,0.15)' : 'rgba(15,23,42,0.4)' }}>
                            <div>
                              <div style={{ color: '#cbd5e1', fontSize: '0.875rem' }}>{format(new Date(typeof p.date === 'number' ? p.date : (p.date as Date).getTime()), 'dd MMM yyyy, HH:mm')}</div>
                              {p.isAutoPayment && (
                                <div style={{ fontSize: '0.7rem', color: '#22c55e', marginTop: '0.25rem', fontStyle: 'italic' }}>Auto-paid from Previous Cycle</div>
                              )}
                            </div>
                            <div style={{ fontWeight: 700, color: p.isAutoPayment ? '#22c55e' : '#10b981' }}>₹{p.amount}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                      </>
                    );
                  })()}
                </div>
                ) : (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>
                    <p>Settlement data is being initialized...</p>
                  </div>
                )}
              </div>
            ) : activeTab === 'settlement' ? (
              <div className="text-center py-8 text-gray-600">
                <p>No settlement data for this restaurant yet.</p>
              </div>
            ) : null}

            {activeTab === 'settings' && (
              <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(56,189,248,0.08)' }}>
                <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Restaurant State</p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  {(['Off', 'Inactive', 'Active'] as RestaurantStatus[]).map((s) => (
                      <button
                      key={s}
                      onClick={() => {
                        if (restaurant) setRestaurantStatus(restaurant.id, s);
                      }}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: restaurant?.status === s ? '2px solid rgba(99,102,241,0.6)' : '1px solid rgba(99,102,241,0.12)',
                        background: restaurant?.status === s ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent',
                        color: restaurant?.status === s ? 'white' : '#cbd5e1',
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                  <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Current status: <strong style={{ color: '#f1f5f9' }}>{restaurant?.status}</strong></p>
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedTransaction && (
          <Modal
            isOpen={!!selectedTransaction}
            onClose={() => setSelectedTransaction(null)}
            title="Transaction Details"
          >
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600">Order ID</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedTransaction.orderId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Customer ID</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedTransaction.customerId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Reference ID</p>
                  <p className="text-lg font-semibold text-gray-900 font-mono text-xs">{selectedTransaction.referenceId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Method</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedTransaction.paymentMethod}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-bold text-gray-900 mb-4">Payment Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between font-semibold">
                    <span className="text-gray-700">Gross Amount</span>
                    <span className="text-gray-900">₹{selectedTransaction.grossAmount}</span>
                  </div>
                  <div className="flex justify-between pl-4 border-l-2 border-emerald-300">
                    <span className="text-gray-600">Restaurant Receivable</span>
                    <span className="text-gray-700">₹{selectedTransaction.restaurantReceivable}</span>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex justify-between font-semibold text-emerald-700">
                      <span>Platform Fee (Before Fees)</span>
                      <span>₹{selectedTransaction.platformFee}</span>
                    </div>
                  </div>

                  <div className="pl-4 text-xs space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Less: Razorpay Fee (2% + 18% of 2%)</span>
                      <span className="text-red-600 font-semibold">-₹{selectedTransaction.razorpayFee}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Less: GST (18% on net)</span>
                      <span className="text-red-600 font-semibold">-₹{selectedTransaction.gst}</span>
                    </div>
                  </div>

                  <div className="flex justify-between pl-4 pt-3 border-t text-sm font-bold text-cyan-600">
                    <span>Net Platform Earnings</span>
                    <span>₹{selectedTransaction.netPlatformEarnings}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <span className="font-semibold text-gray-900">Status</span>
                <Badge
                  variant={
                    selectedTransaction.status === 'Paid'
                      ? 'success'
                      : selectedTransaction.status === 'Failed'
                        ? 'error'
                        : 'warning'
                  }
                >
                  {selectedTransaction.status}
                </Badge>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AppLayout>
  );
};
