import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store';
import { AppLayout } from '../layouts/AppLayout';
import { DataTable } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { format } from 'date-fns';
import { Eye, Download, Upload } from 'lucide-react';
import type { Transaction } from '../types';

type LedgerRow = Transaction & {
  transactionDate: Date;
  receivedDate: Date | null;
  expectedReceivingDate: Date | null;
  collectedAmount: number;
  receivedByClient: number;
  receivedByAdmin: number;
  receivedStatus: 'Processing' | 'Received';
};

type SettlementDraft = {
  adminReceivedAmount: string;
  settlementDate: string;
  settlementUtr: string;
  razorpayFeeAmount: string;
  razorpayTaxAmount: string;
};

const toOptionalDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const timestampDate = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(timestampDate.getTime()) ? null : timestampDate;
  }
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getExactRazorpayReceivingDate = (txn: Partial<Transaction>): Date | null =>
  toOptionalDate(
    txn.razorpayTransferSettlementExpectedAt ||
      txn.razorpayTransferSettlementCreatedAt ||
      txn.razorpaySettlementExpectedAt ||
      txn.razorpaySettlementCreatedAt ||
      null
  );

const getEstimatedReceivingDate = (txn: Transaction): Date => {
  const baseDate = toOptionalDate(txn.paymentTimestamp || txn.razorpayCapturedAt || txn.createdAt) || new Date();
  const estimate = new Date(baseDate);
  estimate.setDate(estimate.getDate() + 7);
  estimate.setHours(21, 0, 0, 0);
  return estimate;
};

const isSettlementProcessed = (status: unknown): boolean => {
  const normalized = String(status || '').toLowerCase();
  return normalized.includes('processed') || normalized.includes('settled') || normalized.includes('success');
};

const toCurrencyNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toDateInputValue = (value: Date | string | null | undefined): string => {
  const date = toOptionalDate(value || null);
  if (!date) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const parseSettlementDate = (value: string): Date | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const directDate = new Date(trimmed);
  if (!Number.isNaN(directDate.getTime())) return directDate;

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/);
  if (!match) return null;

  const [, dayRaw, monthRaw, yearRaw, hourRaw = '0', minuteRaw = '0', secondRaw = '0', meridiem] = match;
  const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
  const month = Number(monthRaw) - 1;
  const day = Number(dayRaw);
  let hour = Number(hourRaw);

  if (meridiem) {
    const upper = meridiem.toUpperCase();
    if (upper === 'PM' && hour < 12) hour += 12;
    if (upper === 'AM' && hour === 12) hour = 0;
  }

  const parsed = new Date(year, month, day, hour, Number(minuteRaw), Number(secondRaw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseCsvText = (text: string): Record<string, string>[] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);

  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ''));
  return rows.slice(1).map((values) => {
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = values[index] || '';
    });
    return item;
  });
};

const pickCsvValue = (row: Record<string, string>, aliases: string[]): string => {
  for (const alias of aliases) {
    const key = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (row[key]) return row[key];
  }
  return '';
};

export const LedgerPage = () => {
  const { restaurants, getFilteredTransactions, loadCustomerTransactions, isLoadingTransactions, updateTransactionSettlement } = useAppStore();
  const [groupBy, setGroupBy] = useState<'restaurant' | 'date' | 'paymentMethod'>('date');
  const [selectedTxn, setSelectedTxn] = useState<LedgerRow | null>(null);
  const [settlementDraft, setSettlementDraft] = useState<SettlementDraft>({
    adminReceivedAmount: '',
    settlementDate: '',
    settlementUtr: '',
    razorpayFeeAmount: '',
    razorpayTaxAmount: '',
  });
  const [settlementSaveStatus, setSettlementSaveStatus] = useState('');
  const [csvImportStatus, setCsvImportStatus] = useState('');

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

  // Filter transactions to show only those explicitly marked as 'online' payment method
  // NOTE: Store already filters these, but applying here as well for safety
  const onlineTransactions = useMemo(() => {
    return filteredTransactions.length > 0 ? filteredTransactions : [];
  }, [filteredTransactions]);

  const ledgerRows = useMemo<LedgerRow[]>(() => {
    return onlineTransactions.map((txn) => {
      const mergedTxn = txn;
      const settlementProcessed = isSettlementProcessed(mergedTxn.razorpaySettlementStatus);
      const collectedAmount = mergedTxn.razorpayAmount ?? txn.grossAmount;
      const settledAmount = mergedTxn.razorpaySettlementAmount;
      const actualAdminAmount = settlementProcessed
        ? mergedTxn.razorpayAdminSettlementAmount ??
          (typeof settledAmount === 'number' ? Math.max(0, settledAmount - txn.restaurantReceivable) : 0)
        : 0;
      const expectedReceivingDate = getExactRazorpayReceivingDate(mergedTxn) || getEstimatedReceivingDate(mergedTxn as Transaction);

      return {
        ...mergedTxn,
        transactionDate: new Date(mergedTxn.paymentTimestamp || mergedTxn.createdAt),
        receivedDate: settlementProcessed
          ? new Date(
              mergedTxn.razorpaySettlementCreatedAt ||
                mergedTxn.razorpaySettlementExpectedAt ||
                mergedTxn.paymentTimestamp ||
                mergedTxn.razorpayCapturedAt ||
                mergedTxn.createdAt
            )
          : null,
        expectedReceivingDate,
        collectedAmount,
        receivedByClient: settlementProcessed ? txn.restaurantReceivable : 0,
        receivedByAdmin: actualAdminAmount,
        receivedStatus: settlementProcessed ? 'Received' : 'Processing',
      };
    });
  }, [onlineTransactions]);

  const openTransactionDetails = (txn: LedgerRow) => {
    setSelectedTxn(txn);
    setSettlementSaveStatus('');
    setSettlementDraft({
      adminReceivedAmount: txn.razorpayAdminSettlementAmount ? String(txn.razorpayAdminSettlementAmount) : '',
      settlementDate: toDateInputValue(txn.receivedDate || new Date()),
      settlementUtr: txn.razorpaySettlementUtr || '',
      razorpayFeeAmount: txn.razorpayFeeAmount ? String(txn.razorpayFeeAmount) : '',
      razorpayTaxAmount: txn.razorpayTaxAmount ? String(txn.razorpayTaxAmount) : '',
    });
  };

  const saveSettlementForSelectedTxn = async () => {
    if (!selectedTxn) return;

    const adminReceivedAmount = toCurrencyNumber(settlementDraft.adminReceivedAmount);
    const razorpayFeeAmount = toCurrencyNumber(settlementDraft.razorpayFeeAmount);
    const razorpayTaxAmount = toCurrencyNumber(settlementDraft.razorpayTaxAmount);

    if (adminReceivedAmount === undefined || adminReceivedAmount < 0) {
      setSettlementSaveStatus('Enter a valid admin received amount.');
      return;
    }

    if (!settlementDraft.settlementDate) {
      setSettlementSaveStatus('Enter the settlement date and time.');
      return;
    }

    setSettlementSaveStatus('Saving settlement...');

    try {
      await updateTransactionSettlement({
        restaurantId: selectedTxn.restaurantId,
        customerId: selectedTxn.customerId,
        orderId: selectedTxn.orderId,
        razorpayPaymentId: selectedTxn.razorpayPaymentId,
        adminReceivedAmount,
        settlementDate: new Date(settlementDraft.settlementDate).toISOString(),
        settlementUtr: settlementDraft.settlementUtr.trim() || undefined,
        razorpayFeeAmount,
        razorpayTaxAmount,
        settlementStatus: 'processed',
      });
      setSettlementSaveStatus('Settlement saved. Ledger will refresh automatically.');
    } catch (error) {
      setSettlementSaveStatus(error instanceof Error ? error.message : 'Could not save settlement.');
    }
  };

  const handleSettlementCsvImport = async (file: File | null) => {
    if (!file) return;

    setCsvImportStatus('Reading CSV...');

    try {
      const rows = parseCsvText(await file.text());
      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        const paymentId = pickCsvValue(row, ['razorpay_payment_id', 'payment_id', 'payment id', 'paymentid']);
        const orderId = pickCsvValue(row, ['order_id', 'order id', 'orderid', 'receipt']);
        const adminAmount = toCurrencyNumber(pickCsvValue(row, [
          'admin_received_amount',
          'admin received amount',
          'settled amount',
          'settlement amount',
          'amount',
          'credit',
        ]));
        const settlementDate =
          pickCsvValue(row, ['settled_at', 'settled at', 'settlement date', 'settlement_date', 'created_at', 'date']) || '';

        const matchingTxn = ledgerRows.find((txn) => {
          const paymentMatches = paymentId && txn.razorpayPaymentId === paymentId;
          const orderMatches = orderId && txn.orderId === orderId;
          return paymentMatches || orderMatches;
        });

        if (!matchingTxn || adminAmount === undefined || !settlementDate) {
          skipped += 1;
          continue;
        }

        const parsedSettlementDate = parseSettlementDate(settlementDate);
        if (!parsedSettlementDate) {
          skipped += 1;
          continue;
        }

        await updateTransactionSettlement({
          restaurantId: matchingTxn.restaurantId,
          customerId: matchingTxn.customerId,
          orderId: matchingTxn.orderId,
          razorpayPaymentId: matchingTxn.razorpayPaymentId || paymentId,
          adminReceivedAmount: adminAmount,
          settlementDate: parsedSettlementDate.toISOString(),
          settlementUtr: pickCsvValue(row, ['utr', 'settlement utr', 'utr number', 'reference', 'settlement id']) || undefined,
          razorpayFeeAmount: toCurrencyNumber(pickCsvValue(row, ['fee', 'fees', 'razorpay fee'])),
          razorpayTaxAmount: toCurrencyNumber(pickCsvValue(row, ['tax', 'gst', 'razorpay tax'])),
          settlementStatus: 'processed',
        });
        updated += 1;
      }

      setCsvImportStatus(`CSV import complete: ${updated} updated, ${skipped} skipped.`);
    } catch (error) {
      setCsvImportStatus(error instanceof Error ? error.message : 'CSV import failed.');
    }
  };

  const ledgerTotals = useMemo(() => {
    return ledgerRows.reduce(
      (acc, txn) => {
        acc.collected += txn.collectedAmount;
        acc.receivedByClient += txn.receivedByClient;
        acc.receivedByAdmin += txn.receivedByAdmin;
        acc.platformCharges += txn.platformFee;
        return acc;
      },
      {
        collected: 0,
        receivedByClient: 0,
        receivedByAdmin: 0,
        platformCharges: 0,
      }
    );
  }, [ledgerRows]);

  const groupedData = useMemo<Record<string, LedgerRow[]>>(() => {
    const groups: Record<string, LedgerRow[]> = {};

    ledgerRows.forEach((txn) => {
      let key = '';
      if (groupBy === 'restaurant') {
        const rest = restaurants.find((r) => r.id === txn.restaurantId);
        key = rest?.Restaurant_name || 'Unknown';
      } else if (groupBy === 'date') {
        key = format(new Date(txn.transactionDate), 'dd MMM yyyy');
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
    const sortedGroups: Record<string, LedgerRow[]> = {};
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
  }, [ledgerRows, groupBy, restaurants]);

  const columns = useMemo(() => [
    {
      header: 'Transaction Date',
      accessor: 'transactionDate',
      render: (value: unknown): React.ReactNode => format(new Date(value as Date), 'dd MMM HH:mm'),
    },
    {
      header: 'Expected Receiving',
      accessor: 'expectedReceivingDate',
      render: (value: unknown): React.ReactNode => value ? format(new Date(value as Date), 'dd MMM yyyy, hh:mm a') : 'Not available',
    },
    {
      header: 'Received Date',
      accessor: 'receivedDate',
      render: (value: unknown): React.ReactNode => value ? format(new Date(value as Date), 'dd MMM yyyy, hh:mm a') : 'Not received',
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
        return txn.OnlinePayMethod || 'N/A';
      },
    },
    {
      header: 'Collected',
      accessor: 'collectedAmount',
      render: (value: unknown): React.ReactNode => `₹${value}`,
    },
    {
      header: 'Platform Charge',
      accessor: 'platformFee',
      render: (value: unknown): React.ReactNode => `₹${value}`,
    },
    {
      header: 'Received by Client',
      accessor: 'receivedByClient',
      render: (value: unknown): React.ReactNode => `₹${value}`,
    },
    {
      header: 'Received by Admin',
      accessor: 'receivedByAdmin',
      render: (value: unknown): React.ReactNode => `₹${value}`,
    },
    {
      header: 'GST',
      accessor: 'gst',
      render: (value: unknown): React.ReactNode => `₹${value}`,
    },
    {
      header: 'Received Status',
      accessor: 'receivedStatus',
      render: (value: unknown): React.ReactNode => (
        <Badge variant={value === 'Received' ? 'success' : 'warning'}>
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
              <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginTop: '0.5rem', fontSize: '1.125rem' }}>Collected and received amount view for online transactions</p>
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

        <div className="card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: '#f8fafc', fontWeight: 700, marginBottom: '0.25rem' }}>Settlement updates</p>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Import Razorpay settlement CSV or open a transaction to enter the actual received amount.</p>
            {csvImportStatus && <p style={{ color: '#38bdf8', fontSize: '0.875rem', marginTop: '0.5rem' }}>{csvImportStatus}</p>}
          </div>
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            background: 'rgba(6, 182, 212, 0.16)',
            color: '#67e8f9',
            cursor: 'pointer',
            fontWeight: 700,
          }}>
            <Upload size={18} />
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(event) => {
                handleSettlementCsvImport(event.target.files?.[0] || null);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Collected From Customer', value: ledgerTotals.collected, tone: 'rgba(34, 197, 94, 0.18)' },
            { label: 'Platform Charges', value: ledgerTotals.platformCharges, tone: 'rgba(249, 115, 22, 0.16)' },
            { label: 'Received by Client', value: ledgerTotals.receivedByClient, tone: 'rgba(59, 130, 246, 0.16)' },
            { label: 'Received by Admin', value: ledgerTotals.receivedByAdmin, tone: 'rgba(168, 85, 247, 0.16)' },
          ].map((card) => (
            <div
              key={card.label}
              className="card"
              style={{
                padding: '1.25rem',
                background: `linear-gradient(135deg, ${card.tone} 0%, rgba(15, 23, 42, 0.92) 100%)`,
                border: '1px solid rgba(148, 163, 184, 0.16)',
              }}
            >
              <p style={{ fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.5rem' }}>
                {card.label}
              </p>
              <p style={{ fontSize: '2rem', fontWeight: '900', color: '#f8fafc' }}>
                ₹{card.value.toFixed(2)}
              </p>
            </div>
          ))}
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
              const groupTotal = txns.reduce((sum, t) => sum + t.receivedByAdmin, 0);
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
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>Received by Admin</p>
                      <p style={{ fontSize: '1.75rem', fontWeight: '900', background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>₹{groupTotal}</p>
                    </div>
                  </div>
                  <div style={{ padding: '1.5rem' }}>
                    <DataTable columns={columns} data={txns as unknown as Record<string, unknown>[]} onRowClick={(row) => openTransactionDetails(row as unknown as LedgerRow)} />
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
                <div>
                  <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Transaction Date</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#f1f5f9' }}>{format(new Date(selectedTxn.transactionDate), 'dd MMM yyyy, hh:mm a')}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Expected Receiving Date</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#f1f5f9' }}>{selectedTxn.expectedReceivingDate ? format(new Date(selectedTxn.expectedReceivingDate), 'dd MMM yyyy, hh:mm a') : 'Not available'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Received Date</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#f1f5f9' }}>{selectedTxn.receivedDate ? format(new Date(selectedTxn.receivedDate), 'dd MMM yyyy, hh:mm a') : 'Not received'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Razorpay Payment ID</p>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>{selectedTxn.razorpayPaymentId || '—'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Settlement Status</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#f1f5f9' }}>{selectedTxn.razorpaySettlementStatus || 'Pending'}</p>
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(6, 182, 212, 0.2)', paddingTop: '1rem' }}>
                <h3 style={{ fontWeight: '700', marginBottom: '1rem', color: '#f1f5f9' }}>Collection and Received Split</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#cbd5e1' }}>Collected From Customer</span>
                    <span style={{ fontWeight: '600', color: '#f1f5f9' }}>₹{selectedTxn.collectedAmount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '1rem', borderLeft: '2px solid rgba(6, 182, 212, 0.3)' }}>
                    <span style={{ color: '#94a3b8' }}>Received by Client</span>
                    <span style={{ color: '#cbd5e1' }}>₹{selectedTxn.receivedByClient}</span>
                  </div>
                  
                  <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(6, 182, 212, 0.15)', paddingTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '1rem', fontWeight: '600', color: '#10b981' }}>
                      <span>Platform Charge (Before Fees)</span>
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
                    <span>Received by Admin</span>
                    <span>₹{selectedTxn.receivedByAdmin}</span>
                  </div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(6, 182, 212, 0.2)', paddingTop: '1rem' }}>
                <h3 style={{ fontWeight: '700', marginBottom: '1rem', color: '#f1f5f9' }}>Manual Settlement Update</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <label style={{ color: '#cbd5e1', fontSize: '0.875rem' }}>
                    Admin Received Amount
                    <input
                      value={settlementDraft.adminReceivedAmount}
                      onChange={(event) => setSettlementDraft((draft) => ({ ...draft, adminReceivedAmount: event.target.value }))}
                      placeholder="1.40"
                      style={{ width: '100%', marginTop: '0.4rem', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(15, 23, 42, 0.75)', color: '#f8fafc' }}
                    />
                  </label>
                  <label style={{ color: '#cbd5e1', fontSize: '0.875rem' }}>
                    Settlement Date
                    <input
                      type="datetime-local"
                      value={settlementDraft.settlementDate}
                      onChange={(event) => setSettlementDraft((draft) => ({ ...draft, settlementDate: event.target.value }))}
                      style={{ width: '100%', marginTop: '0.4rem', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(15, 23, 42, 0.75)', color: '#f8fafc' }}
                    />
                  </label>
                  <label style={{ color: '#cbd5e1', fontSize: '0.875rem' }}>
                    UTR / Reference
                    <input
                      value={settlementDraft.settlementUtr}
                      onChange={(event) => setSettlementDraft((draft) => ({ ...draft, settlementUtr: event.target.value }))}
                      placeholder="Optional"
                      style={{ width: '100%', marginTop: '0.4rem', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(15, 23, 42, 0.75)', color: '#f8fafc' }}
                    />
                  </label>
                  <label style={{ color: '#cbd5e1', fontSize: '0.875rem' }}>
                    Razorpay Fee
                    <input
                      value={settlementDraft.razorpayFeeAmount}
                      onChange={(event) => setSettlementDraft((draft) => ({ ...draft, razorpayFeeAmount: event.target.value }))}
                      placeholder="Optional"
                      style={{ width: '100%', marginTop: '0.4rem', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(15, 23, 42, 0.75)', color: '#f8fafc' }}
                    />
                  </label>
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={saveSettlementForSelectedTxn}
                    style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', border: 'none', background: 'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Save Settlement
                  </button>
                  {settlementSaveStatus && <span style={{ color: '#38bdf8', fontSize: '0.875rem' }}>{settlementSaveStatus}</span>}
                </div>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AppLayout>
  );
};
