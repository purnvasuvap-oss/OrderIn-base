import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store';
import { AppLayout } from '../layouts/AppLayout';
import { DataTable } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { format } from 'date-fns';
import { Eye, Download } from 'lucide-react';
import type { Transaction } from '../types';

export const LedgerPage = () => {
  const { restaurants, getFilteredTransactions, loadCustomerTransactions, isLoadingTransactions } = useAppStore();
  const [groupBy, setGroupBy] = useState<'restaurant' | 'date' | 'paymentMethod'>('date');
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  // Load customer transactions on mount AND when restaurants are loaded
  useEffect(() => {
    if (restaurants.length > 0) {
      console.log('[LedgerPage] Trigger loadCustomerTransactions - restaurants loaded:', restaurants.length);
      loadCustomerTransactions().catch(e => {
        console.error('[LedgerPage] loadCustomerTransactions failed:', e);
      });
    }
  }, [restaurants.length, loadCustomerTransactions]);

  const filteredTransactions = getFilteredTransactions();

  // Debug logging
  useEffect(() => {
    console.log('[LedgerPage] Debug Info:', {
      restaurants: restaurants.length,
      filteredTransactionsCount: filteredTransactions.length,
      transactions: filteredTransactions.map(t => ({
        id: t.id,
        orderId: t.orderId,
        paymentMethod: t.paymentMethod,
        OnlinePayMethod: t.OnlinePayMethod,
        restaurantName: restaurants.find(r => r.id === t.restaurantId)?.Restaurant_name || 'Unknown'
      })),
      isLoading: isLoadingTransactions
    });
  }, [filteredTransactions, isLoadingTransactions, restaurants]);

  // Filter transactions to show only those explicitly marked as 'online' payment method
  // NOTE: Store already filters these, but applying here as well for safety
  const onlineTransactions = useMemo(() => {
    return filteredTransactions.length > 0 ? filteredTransactions : [];
  }, [filteredTransactions]);

  // Debug: Log filtering details
  useEffect(() => {
    console.log('[LedgerPage] Online Transactions:', {
      count: onlineTransactions.length,
      transactions: onlineTransactions
    });
  }, [onlineTransactions]);

  const groupedData = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};

    onlineTransactions.forEach((txn) => {
      let key = '';
      if (groupBy === 'restaurant') {
        const rest = restaurants.find((r) => r.id === txn.restaurantId);
        key = rest?.Restaurant_name || 'Unknown';
      } else if (groupBy === 'date') {
        key = format(new Date(txn.createdAt), 'dd MMM yyyy');
      } else {
        // Group by OnlinePayMethod instead of paymentMethod
        key = txn.OnlinePayMethod || 'Unknown';
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(txn);
    });

    // Sort each group by date (newest first)
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });

    // Sort the groups themselves
    const sortedGroups: Record<string, Transaction[]> = {};
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (groupBy === 'date') {
        // For date grouping, sort dates in descending order (newest first)
        return new Date(b).getTime() - new Date(a).getTime();
      }
      // For other groupings, keep alphabetical order
      return a.localeCompare(b);
    });

    sortedKeys.forEach((key) => {
      sortedGroups[key] = groups[key];
    });

    return sortedGroups;
  }, [onlineTransactions, groupBy, restaurants]);

  const columns = useMemo(() => [
    {
      header: 'DateTime',
      accessor: 'createdAt',
      render: (value: unknown): React.ReactNode => format(new Date(value as Date), 'dd MMM HH:mm'),
    },
    { header: 'Order ID', accessor: 'orderId' },
    {
      header: 'Restaurant',
      accessor: 'restaurantId',
      render: (value: unknown): React.ReactNode => {
        const id = value as string;
        const rest = restaurants.find((r) => r.id === id);
        return rest?.Restaurant_name || 'Unknown';
      },
    },
    {
      header: 'Method',
      accessor: 'id',
      render: (_value: unknown, row: unknown): React.ReactNode => {
        const txn = row as Transaction;
        console.log('[Method Column Direct] Transaction:', txn, 'OnlinePayMethod:', txn.OnlinePayMethod);
        return txn.OnlinePayMethod || 'N/A';
      },
    },
    {
      header: 'Gross',
      accessor: 'grossAmount',
      render: (value: unknown): React.ReactNode => `₹${value}`,
    },
    {
      header: 'Platform Fee',
      accessor: 'platformFee',
      render: (value: unknown): React.ReactNode => `₹${value}`,
    },
    {
      header: 'GST',
      accessor: 'gst',
      render: (value: unknown): React.ReactNode => `₹${value}`,
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (value: unknown): React.ReactNode => (
        <Badge variant={value === 'Paid' ? 'success' : value === 'Failed' ? 'error' : 'warning'}>
          {value as React.ReactNode}
        </Badge>
      ),
    },
    {
      header: '',
      accessor: 'id',
      render: (): React.ReactNode => <Eye size={18} className="text-blue-600 cursor-pointer" />,
    },
  ], [restaurants]);

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{
          background: 'linear-gradient(135deg, #06b6d4 0%, #10b981 50%, #a855f7 100%)',
          borderRadius: '1.5rem',
          padding: '2rem',
          color: 'white',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          animation: 'slideInUp 0.6s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: '900' }}>Finance Ledger</h1>
              <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginTop: '0.5rem', fontSize: '1.125rem' }}>Complete transaction history and breakdowns</p>
            </div>
            <button style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              paddingLeft: '1.5rem',
              paddingRight: '1.5rem',
              paddingTop: '0.75rem',
              paddingBottom: '0.75rem',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              borderRadius: '0.75rem',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.2)';
            }}>
              <Download size={18} />
              Export
            </button>
          </div>
        </div>

        <div className="card">
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#cbd5e1', marginBottom: '1rem' }}>Group By</label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {(['date', 'restaurant', 'paymentMethod'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setGroupBy(option)}
                style={{
                  paddingLeft: '1.5rem',
                  paddingRight: '1.5rem',
                  paddingTop: '0.75rem',
                  paddingBottom: '0.75rem',
                  borderRadius: '0.75rem',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  border: 'none',
                  cursor: 'pointer',
                  background: groupBy === option 
                    ? 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)'
                    : 'rgba(6, 182, 212, 0.1)',
                  color: groupBy === option ? 'white' : '#06b6d4',
                  boxShadow: groupBy === option ? '0 4px 15px rgba(6, 182, 212, 0.3)' : 'none',
                  transform: groupBy === option ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {option === 'paymentMethod' ? 'Payment Method' : option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {isLoadingTransactions ? (
            // Loading skeleton
            [...Array(3)].map((_, i) => (
              <div key={`skeleton-${i}`} className="card" style={{ overflow: 'hidden', animation: 'slideInUp 0.6s ease' }}>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.8) 0%, rgba(168, 85, 247, 0.1) 100%)',
                  borderBottom: '1px solid rgba(6, 182, 212, 0.2)',
                  padding: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{
                    height: '1.5rem',
                    width: '20%',
                    background: 'rgba(100, 100, 100, 0.3)',
                    borderRadius: '0.5rem',
                    animation: 'pulse 2s infinite'
                  }}></div>
                  <div style={{
                    height: '1.75rem',
                    width: '15%',
                    background: 'rgba(100, 100, 100, 0.3)',
                    borderRadius: '0.5rem',
                    animation: 'pulse 2s infinite'
                  }}></div>
                </div>
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {[...Array(4)].map((_, j) => (
                      <div key={`skeleton-row-${j}`} style={{
                        height: '2.5rem',
                        background: 'rgba(100, 100, 100, 0.2)',
                        borderRadius: '0.5rem',
                        animation: 'pulse 2s infinite',
                        animationDelay: `${j * 0.1}s`
                      }}></div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          ) : Object.entries(groupedData).length > 0 ? (
            // Actual data
            Object.entries(groupedData).map(([groupName, txns]) => {
              const groupTotal = txns.reduce((sum, t) => sum + t.netPlatformEarnings, 0);
              return (
                <div key={groupName} className="card" style={{ overflow: 'hidden', animation: 'slideInUp 0.6s ease' }}>
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.8) 0%, rgba(168, 85, 247, 0.1) 100%)',
                    borderBottom: '1px solid rgba(6, 182, 212, 0.2)',
                    padding: '1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <h3 style={{ fontWeight: '700', color: '#f1f5f9', fontSize: '1.125rem' }}>{groupName}</h3>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>Earnings</p>
                      <p style={{ fontSize: '1.75rem', fontWeight: '900', background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>₹{groupTotal}</p>
                    </div>
                  </div>
                  <div style={{ padding: '1.5rem' }}>
                    <DataTable columns={columns} data={txns as unknown as Record<string, unknown>[]} onRowClick={(row) => setSelectedTxn(row as unknown as Transaction)} />
                  </div>
                </div>
              );
            })
          ) : (
            // No data state
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ color: '#94a3b8', fontSize: '1.125rem' }}>No transactions found</p>
            </div>
          )}
        </div>

        {selectedTxn && (
          <Modal isOpen={!!selectedTxn} onClose={() => setSelectedTxn(null)} title="Transaction Details">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
                <div>
                  <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Order ID</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#f1f5f9' }}>{selectedTxn.orderId}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Reference ID</p>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>{selectedTxn.referenceId}</p>
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(6, 182, 212, 0.2)', paddingTop: '1rem' }}>
                <h3 style={{ fontWeight: '700', marginBottom: '1rem', color: '#f1f5f9' }}>Payment Split</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#cbd5e1' }}>Gross Amount</span>
                    <span style={{ fontWeight: '600', color: '#f1f5f9' }}>₹{selectedTxn.grossAmount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '1rem', borderLeft: '2px solid rgba(6, 182, 212, 0.3)' }}>
                    <span style={{ color: '#94a3b8' }}>Restaurant Receivable</span>
                    <span style={{ color: '#cbd5e1' }}>₹{selectedTxn.restaurantReceivable}</span>
                  </div>
                  
                  <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(6, 182, 212, 0.15)', paddingTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '1rem', fontWeight: '600', color: '#10b981' }}>
                      <span>Platform Fee (Before Fees)</span>
                      <span>₹{selectedTxn.platformFee}</span>
                    </div>
                  </div>

                  <div style={{ paddingLeft: '2rem', color: '#94a3b8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                      <span>Less: Razorpay Fee (2% + 18% of 2%)</span>
                      <span style={{ color: '#ef4444' }}>-₹{selectedTxn.razorpayFee}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      <span>Less: GST (18% on net)</span>
                      <span style={{ color: '#ef4444' }}>-₹{selectedTxn.gst}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '2rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(6, 182, 212, 0.15)', fontSize: '0.875rem', fontWeight: '700', color: '#06b6d4', marginTop: '0.5rem' }}>
                    <span>Net Platform Earnings</span>
                    <span>₹{selectedTxn.netPlatformEarnings}</span>
                  </div>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AppLayout>
  );
};
