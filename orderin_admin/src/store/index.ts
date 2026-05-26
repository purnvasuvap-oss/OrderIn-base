import { create } from 'zustand';
import type { Restaurant, Transaction, Settlement, RestaurantStatus, PaymentEntry, PaymentMethod, TransactionStatus, SettlementPeriod, SettlementStatus } from '../types';
import { db } from '../config/firebase';
import { collection, getDocs, query, limit as fbLimit, doc, setDoc, updateDoc, getDoc, onSnapshot } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

// Firebase data interfaces
interface FirebaseSettlementData {
  settlementId?: string;
  restaurantId?: string;
  restaurantName?: string;
  defaultSettlementAmount?: number;
  defaultSettlementStartDate?: number;
  currentOverpayment?: number;
  settlements?: Record<string, Record<string, unknown>>;
  createdAt?: number;
  lastUpdated?: number;
}

interface FirebaseRestaurantData {
  code?: string;
  Restaurant_name?: string;
  name?: string;
  city?: string;
  status?: RestaurantStatus;
  totalOrders?: number;
  totalVolume?: number;
  earnings?: number;
  Owner?: string;
  owner?: string;
  Owner_Contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  account?: string;
  bankAccount?: string;
  IFSC?: string;
  ifsc?: string;
  inactiveTimestamp?: number;
  statusManagedBy?: 'manual' | 'system';
  statusReason?: string | null;
  count?: number;
}

interface FirebaseCustomerData {
  pastOrders?: FirebaseOrderData[];
  [key: string]: unknown;
}

interface FirebaseOrderData {
  id?: string;
  paymentMethod?: string;
  PaymentMethod?: string;
  OnlinePayMethod?: string;
  subtotal?: string | number;
  taxes?: string | number;
  paymentStatus?: string;
  createdAt?: string | number;
  paidAt?: string | number;
  paymentTimestamp?: string | number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  razorpayMethod?: string;
  razorpayStatus?: string;
  razorpayAmount?: string | number;
  razorpayCurrency?: string;
  razorpayCapturedAt?: string | number;
  razorpayFeeAmount?: string | number;
  razorpayTaxAmount?: string | number;
  razorpaySettlementId?: string;
  razorpaySettlementStatus?: string;
  razorpaySettlementAmount?: string | number;
  razorpayAdminSettlementAmount?: string | number;
  razorpaySettlementUtr?: string;
  razorpaySettlementCreatedAt?: string | number;
  razorpaySettlementExpectedAt?: string | number;
  razorpayTransferSettlementExpectedAt?: string | number;
  razorpayTransferSettlementCreatedAt?: string | number;
  razorpaySyncSource?: 'api' | 'webhook' | 'manual';
  razorpaySyncedAt?: string | number;
  [key: string]: unknown;
}

interface AppState {
  restaurants: Restaurant[];
  transactions: Transaction[];
  settlements: Settlement[];
  selectedDateRange: { from: Date; to: Date } | null;
  searchQuery: string;
  showStaticRestaurantInfo: boolean;
  isLoadingTransactions: boolean;
  defaultSettlementAmounts: Record<string, number>; // per-restaurant default amount due
  defaultSettlementStartDates: Record<string, number>; // when default amount was set (timestamp in ms)
  setDateRange: (from: Date, to: Date) => void;
  setSearchQuery: (query: string) => void;
  toggleStaticRestaurantInfo: (v?: boolean) => void;
  getRestaurantById: (id: string) => Restaurant | undefined;
  getRestaurantTransactions: (restaurantId: string) => Transaction[];
  getFilteredTransactions: () => Transaction[];
  getSettlement: (restaurantId: string) => Settlement | undefined;
  getSettlementsByRestaurant: (restaurantId: string) => Settlement[];
  setDefaultSettlementAmount: (restaurantId: string, amount: number) => void;
  getDefaultSettlementAmount: (restaurantId: string) => number;
  setSettlementAmountDue: (restaurantId: string, amount: number) => void;
  addPaymentToSettlementById: (settlementId: string, amount: number) => void;
  ensureMonthlySettlement: (restaurantId: string) => void;
  setRestaurantStatus: (restaurantId: string, status: 'Active' | 'Inactive' | 'Suspended' | 'Off', source?: 'manual' | 'system', reason?: string | null) => void;
  createNextSettlementIfNeeded: (restaurantId: string) => void;
  loadPrimaryRestaurants: (limitCount?: number) => Promise<void>;
  reloadAllRestaurants: () => Promise<void>;
  watchRestaurants: () => void;
  loadCustomerTransactions: () => Promise<void>;
  updateTransactionSettlement: (payload: {
    restaurantId: string;
    customerId: string;
    orderId: string;
    razorpayPaymentId?: string;
    adminReceivedAmount: number;
    settlementDate: string;
    settlementUtr?: string;
    razorpayFeeAmount?: number;
    razorpayTaxAmount?: number;
    settlementStatus?: string;
  }) => Promise<void>;
  logout: () => void;
}

const toFiniteNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const hasRazorpayFields = (order: FirebaseOrderData): boolean => (
  Boolean(order.razorpayPaymentId) ||
  Boolean(order.razorpayOrderId) ||
  Boolean(order.razorpayMethod) ||
  Boolean(order.razorpayStatus) ||
  toFiniteNumber(order.razorpayAmount) !== undefined
);

const normalizeTransactionStatus = (order: FirebaseOrderData): TransactionStatus => {
  const normalized = String(order.paymentStatus || order.razorpayStatus || '').toLowerCase().trim();

  if (normalized.includes('refund')) return 'Refunded';
  if (normalized.includes('fail') || normalized.includes('error')) return 'Failed';
  if (
    normalized === 'paid' ||
    normalized === 'captured' ||
    normalized === 'success' ||
    normalized === 'completed' ||
    normalized === 'processed' ||
    normalized === 'settled'
  ) {
    return 'Paid';
  }

  return 'Pending';
};

const normalizePaymentMethod = (order: FirebaseOrderData): PaymentMethod => {
  const explicitMethod = String(order.paymentMethod || order.PaymentMethod || '').toLowerCase().trim();

  if (explicitMethod.includes('online') || hasRazorpayFields(order)) return 'Online';

  const rawMethod = String(
    order.paymentMethod ||
    order.PaymentMethod ||
    order.OnlinePayMethod ||
    ''
  ).toLowerCase().trim();

  if (rawMethod.includes('cash')) return 'Cash';
  if (rawMethod.includes('net')) return 'Net Banking';
  if (rawMethod.includes('wallet')) return 'Wallet';
  if (rawMethod.includes('card') || rawMethod.includes('visa') || rawMethod.includes('master') || rawMethod.includes('rupay')) return 'Card';
  if (rawMethod.includes('upi')) return hasRazorpayFields(order) ? 'Online' : 'UPI';
  if (rawMethod.includes('online') || hasRazorpayFields(order)) return 'Online';

  return 'UPI';
};

const normalizeOnlinePayMethod = (order: FirebaseOrderData): string | undefined => {
  const sourceMethod = order.razorpayMethod || order.OnlinePayMethod;
  const rawMethod = String(sourceMethod || '').toLowerCase().trim();
  if (!rawMethod) return undefined;
  if (rawMethod.includes('upi')) return 'UPI';
  if (rawMethod.includes('card') || rawMethod.includes('visa') || rawMethod.includes('master') || rawMethod.includes('rupay')) return 'Card';
  if (rawMethod.includes('net')) return 'Net Banking';
  if (rawMethod.includes('wallet')) return 'Wallet';
  if (rawMethod.includes('emi')) return 'EMI';
  if (rawMethod.includes('paylater') || rawMethod.includes('pay later')) return 'Pay Later';
  return sourceMethod;
};

const toDateFromUnknown = (value: unknown): Date => {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }

  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const toOptionalIsoString = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === '') return undefined;

  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    const timestampDate = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(timestampDate.getTime()) ? undefined : timestampDate.toISOString();
  }

  const normalizedValue =
    typeof value === 'number' && value > 0 && value < 100000000000
      ? value * 1000
      : value;
  const date = new Date(normalizedValue as string | number | Date);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const getCurrentMonthKey = (): string => new Date().toLocaleString('default', { month: 'short', year: 'numeric' });

const getTimestampFromUnknown = (date: unknown, timestamp: unknown): number => {
  if (typeof timestamp === 'number') return timestamp;
  if (typeof date === 'number') return date;
  if (date && typeof date === 'object' && 'toMillis' in date && typeof (date as { toMillis: () => number }).toMillis === 'function') {
    return (date as { toMillis: () => number }).toMillis();
  }
  if (date && typeof date === 'object' && 'getTime' in date && typeof (date as { getTime: () => number }).getTime === 'function') {
    return (date as { getTime: () => number }).getTime();
  }
  return Date.now();
};

const normalizePayments = (arr: unknown[] = []): PaymentEntry[] => {
  return arr.filter((p) => {
    const payment = p as Record<string, unknown>;
    return payment && typeof payment.amount === 'number' && payment.amount > 0;
  }).map((p) => {
    const payment = p as Record<string, unknown>;
    const timestamp = getTimestampFromUnknown(payment.date, payment.timestamp);
    return {
      id: String(payment.id || `pay_${timestamp}`),
      amount: payment.amount as number,
      date: (payment.date ?? payment.timestamp ?? timestamp) as number,
      timestamp,
      isAutoPayment: !!payment.isAutoPayment,
    };
  });
};

const normalizeSettlementPeriods = (settlements: Record<string, unknown> = {}): Record<string, SettlementPeriod> => {
  const result: Record<string, SettlementPeriod> = {};
  for (const [monthKey, period] of Object.entries(settlements || {})) {
    const monthData = period as Record<string, unknown>;
    const paymentHistory = normalizePayments((monthData?.paymentHistory || []) as unknown[]);
    const totalPaid = paymentHistory.reduce((s, p) => s + (p.amount || 0), 0);
    const totalDue = toFiniteNumber(monthData?.totalAmountDue) ?? 0;
    const status = (totalPaid >= totalDue ? 'Paid' : totalPaid > 0 ? 'Processing' : 'Pending') as SettlementStatus;

    result[monthKey] = {
      period: String(monthData?.period || monthKey),
      totalAmountDue: totalDue,
      defaultAmountForMonth: toFiniteNumber(monthData?.defaultAmountForMonth) ?? totalDue,
      carryOverCredit: toFiniteNumber(monthData?.carryOverCredit) ?? 0,
      overpaymentAmount: toFiniteNumber(monthData?.overpaymentAmount) ?? Math.max(0, totalPaid - totalDue),
      totalPaid,
      status,
      installments: paymentHistory.length,
      cycleStartDate: toFiniteNumber(monthData?.cycleStartDate) ?? Date.now(),
      paymentHistory,
      settledDate: toFiniteNumber(monthData?.settledDate),
    };
  }
  return result;
};

const getCurrentSettlementPeriod = (settlement: Settlement): SettlementPeriod | undefined => {
  return settlement.settlements?.[getCurrentMonthKey()];
};

const isCurrentMonthSettlementPaid = (settlement: Settlement): boolean => {
  const period = getCurrentSettlementPeriod(settlement);
  if (!period || period.totalAmountDue <= 0) return false;
  return (period.totalPaid || 0) >= period.totalAmountDue;
};

const hasCurrentMonthUnpaidSettlement = (settlement: Settlement): boolean => {
  const period = getCurrentSettlementPeriod(settlement);
  if (!period || period.totalAmountDue <= 0) return false;
  return (period.totalPaid || 0) < period.totalAmountDue;
};

const applyOverpaymentToPeriod = (
  period: SettlementPeriod,
  restaurantId: string,
  monthKey: string,
  availableCredit: number,
  now = Date.now()
): { period: SettlementPeriod; appliedCredit: number; remainingOverpayment: number } => {
  const pendingBeforeCredit = Math.max(0, (period.totalAmountDue || 0) - (period.totalPaid || 0));
  const appliedCredit = Math.min(Math.max(0, availableCredit), pendingBeforeCredit);
  const remainingOverpayment = Math.max(0, availableCredit - appliedCredit);

  if (appliedCredit <= 0) {
    return { period, appliedCredit: 0, remainingOverpayment: availableCredit };
  }

  const autoPayment: PaymentEntry = {
    id: `auto_${restaurantId}_${monthKey}_${now}`,
    amount: appliedCredit,
    date: now,
    timestamp: now,
    isAutoPayment: true,
  };
  const paymentHistory = [...(period.paymentHistory || []), autoPayment];
  const totalPaid = (period.totalPaid || 0) + appliedCredit;
  const status: SettlementStatus = totalPaid >= period.totalAmountDue ? 'Paid' : 'Processing';

  return {
    period: {
      ...period,
      carryOverCredit: (period.carryOverCredit || 0) + appliedCredit,
      paymentHistory,
      totalPaid,
      status,
      installments: paymentHistory.length,
      ...(status === 'Paid' ? { settledDate: period.settledDate || now } : {}),
    },
    appliedCredit,
    remainingOverpayment,
  };
};

const canSystemManageSettlementStatus = (restaurant?: Pick<Restaurant, 'statusManagedBy'> | FirebaseRestaurantData | null): boolean => {
  return restaurant?.statusManagedBy !== 'manual';
};

const buildTransactionsFromCustomers = (
  restaurant: Restaurant,
  customerDocs: Array<{ id: string; data: () => FirebaseCustomerData }>
): Transaction[] => {
  const transactions: Transaction[] = [];

  for (const customerDoc of customerDocs) {
    const customerPhone = customerDoc.id;
    const customerData = customerDoc.data();
    const pastOrders = customerData.pastOrders;

    if (!Array.isArray(pastOrders)) {
      continue;
    }

    pastOrders.forEach((orderData: FirebaseOrderData, index: number) => {
      try {
        const subtotal = toFiniteNumber(orderData.subtotal) || 0;
        const taxes = toFiniteNumber(orderData.taxes) || 0;
        const razorpayAmount = toFiniteNumber(orderData.razorpayAmount);
        const paymentMethod = normalizePaymentMethod(orderData);
        const onlinePayMethod = normalizeOnlinePayMethod(orderData);
        const normalizedStatus = normalizeTransactionStatus(orderData);
        const createdAtSource = orderData.paymentTimestamp || orderData.createdAt || orderData.paidAt || Date.now();
        const grossAmount = razorpayAmount ?? subtotal + taxes;
        const razorpayFee = subtotal * (0.02 + 0.18 * 0.02);
        const gst = 0.18 * (taxes - razorpayFee);
        const earnings = taxes - gst;
        const sourceOrderId = orderData.id || `order_${index}`;

        transactions.push({
          id: `${restaurant.id}_${customerPhone}_${sourceOrderId}`,
          orderId: sourceOrderId,
          restaurantId: restaurant.id,
          customerId: customerPhone,
          paymentMethod,
          OnlinePayMethod: onlinePayMethod,
          grossAmount,
          restaurantReceivable: subtotal,
          platformFee: taxes,
          razorpayFee,
          gst,
          netPlatformEarnings: earnings,
          status: normalizedStatus,
          createdAt: toDateFromUnknown(createdAtSource),
          referenceId: sourceOrderId,
          paymentTimestamp: toOptionalIsoString(orderData.paymentTimestamp),
          razorpayOrderId: orderData.razorpayOrderId,
          razorpayPaymentId: orderData.razorpayPaymentId,
          razorpaySignature: orderData.razorpaySignature,
          razorpayMethod: orderData.razorpayMethod,
          razorpayStatus: orderData.razorpayStatus,
          razorpayAmount,
          razorpayCurrency: orderData.razorpayCurrency,
          razorpayCapturedAt: toOptionalIsoString(orderData.razorpayCapturedAt),
          razorpayFeeAmount: toFiniteNumber(orderData.razorpayFeeAmount),
          razorpayTaxAmount: toFiniteNumber(orderData.razorpayTaxAmount),
          razorpaySettlementId: orderData.razorpaySettlementId,
          razorpaySettlementStatus: orderData.razorpaySettlementStatus,
          razorpaySettlementAmount: toFiniteNumber(orderData.razorpaySettlementAmount),
          razorpayAdminSettlementAmount: toFiniteNumber(orderData.razorpayAdminSettlementAmount),
          razorpaySettlementUtr: orderData.razorpaySettlementUtr,
          razorpaySettlementCreatedAt: toOptionalIsoString(orderData.razorpaySettlementCreatedAt),
          razorpaySettlementExpectedAt: toOptionalIsoString(orderData.razorpaySettlementExpectedAt),
          razorpayTransferSettlementExpectedAt: toOptionalIsoString(orderData.razorpayTransferSettlementExpectedAt),
          razorpayTransferSettlementCreatedAt: toOptionalIsoString(orderData.razorpayTransferSettlementCreatedAt),
          razorpaySyncSource: orderData.razorpaySyncSource,
          razorpaySyncedAt: toOptionalIsoString(orderData.razorpaySyncedAt),
        });
      } catch (e) {
        console.error('[Store] failed to map order for realtime transaction update', {
          restaurantId: restaurant.id,
          customerPhone,
          index,
          error: e,
        });
      }
    });
  }

  return transactions;
};

export const useAppStore = create<AppState>((set, get) => {
  // Keep snapshot listeners per restaurant to provide realtime updates and avoid duplicate listeners
  const snapshotListeners: Record<string, Unsubscribe> = {};
  const customerOrderListeners: Record<string, Unsubscribe> = {};
  let restaurantCollectionListener: Unsubscribe | null = null;

  const syncRestaurantStatusForCurrentSettlement = (
    restaurantId: string,
    settlement: Settlement,
    restaurantData?: FirebaseRestaurantData | Restaurant | null
  ) => {
    const localRestaurant = get().restaurants.find((r) => r.id === restaurantId);
    const status = restaurantData?.status || localRestaurant?.status;
    const controlSource = restaurantData || localRestaurant;

    if (!status || !canSystemManageSettlementStatus(controlSource)) return;

    if ((status === 'Inactive' || status === 'Off') && isCurrentMonthSettlementPaid(settlement)) {
      get().setRestaurantStatus(restaurantId, 'Active', 'system', 'settlement_paid');
      return;
    }

    if (status === 'Active' && hasCurrentMonthUnpaidSettlement(settlement)) {
      get().setRestaurantStatus(restaurantId, 'Inactive', 'system', 'settlement_overdue');
    }
  };

  const ensureSnapshotFor = (restaurantId: string) => {
    if (snapshotListeners[restaurantId]) return; // already listening
    try {
      const settRef = doc(db, 'Restaurant', restaurantId, 'Settlement', 'settlement');
      const unsub = onSnapshot(settRef, async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as FirebaseSettlementData;
        // reuse existing normalization logic by calling internal handler
        try {
          // Fetch restaurant name from Restaurant document
          let restaurantName = data.restaurantName || '';
          let restaurantStatusData: FirebaseRestaurantData | null = null;
          try {
            const restDoc = await getDoc(doc(db, 'Restaurant', restaurantId));
            if (restDoc.exists()) {
              const restData = restDoc.data() as FirebaseRestaurantData;
              restaurantStatusData = restData;
              restaurantName = restData.Restaurant_name || restaurantName;
            }
          } catch (e) {
            console.error('[Store] failed to fetch restaurant name for', restaurantId, e);
          }

          console.log('[Store] onSnapshot received', { restaurantId, restaurantName, settlements: Object.keys(data.settlements || {}) });

          const loaded: Settlement = {
            settlementId: data.settlementId || `settlement_${restaurantId}`,
            restaurantId,
            restaurantName: restaurantName,
            defaultSettlementAmount: data.defaultSettlementAmount ?? 0,
            defaultSettlementStartDate: data.defaultSettlementStartDate ?? 0,
            currentOverpayment: data.currentOverpayment ?? 0, // Preserve global overpayment
            settlements: normalizeSettlementPeriods(data.settlements),
            createdAt: data.createdAt ?? Date.now(),
            lastUpdated: data.lastUpdated ?? Date.now(),
          };

          let resolvedLoaded = loaded;
          const currentMonthKey = getCurrentMonthKey();
          const currentPeriod = loaded.settlements[currentMonthKey];
          if (currentPeriod && loaded.currentOverpayment > 0) {
            const now = Date.now();
            const creditResult = applyOverpaymentToPeriod(
              currentPeriod,
              restaurantId,
              currentMonthKey,
              loaded.currentOverpayment,
              now
            );

            if (creditResult.appliedCredit > 0) {
              resolvedLoaded = {
                ...loaded,
                currentOverpayment: creditResult.remainingOverpayment,
                settlements: {
                  ...loaded.settlements,
                  [currentMonthKey]: creditResult.period,
                },
                lastUpdated: now,
              };

              await updateDoc(settRef, {
                currentOverpayment: creditResult.remainingOverpayment,
                [`settlements.${currentMonthKey}`]: creditResult.period,
                lastUpdated: now,
              });
            }
          }

          set((s) => ({ settlements: [...s.settlements.filter((x) => x.restaurantId !== restaurantId), resolvedLoaded] }));
          syncRestaurantStatusForCurrentSettlement(restaurantId, resolvedLoaded, restaurantStatusData);
        } catch (e) {
          console.error('[Store] snapshot normalization error', e);
        }
      }, (err) => console.error('[Store] onSnapshot error', err));

      snapshotListeners[restaurantId] = unsub;
    } catch (e) {
      console.error('[Store] ensureSnapshotFor failed', e);
    }
  };

  
  return {
  restaurants: [],
  transactions: [],
  settlements: [],
  selectedDateRange: null,
  searchQuery: '',
  showStaticRestaurantInfo: false,
  isLoadingTransactions: false,
  defaultSettlementAmounts: {}, // empty initially, populated as user sets defaults
  defaultSettlementStartDates: {}, // tracks when default was set

  setDateRange: (from: Date, to: Date) => {
    set({ selectedDateRange: { from, to } });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  toggleStaticRestaurantInfo: (v?: boolean) => {
    const current = get().showStaticRestaurantInfo;
    set({ showStaticRestaurantInfo: typeof v === 'boolean' ? v : !current });
  },

  setDefaultSettlementAmount: (restaurantId: string, amount: number) => {
    set((state) => {
      const settlement = state.settlements.find((s) => s.restaurantId === restaurantId);
      
      // Only update if settlement exists, otherwise create it
      if (!settlement) return { settlements: state.settlements };
      
      const isFirstTime = !settlement.defaultSettlementStartDate || settlement.defaultSettlementStartDate === 0;
      const startDate = isFirstTime ? Date.now() : settlement.defaultSettlementStartDate; // Never change after first set
      
      // Get current month key in "Feb 2026" format
      const currentMonthKey = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
      
      const now = Date.now();

      // Create or update current month's settlement entry if it doesn't exist
      const settlements = { ...settlement.settlements };
      if (!settlements[currentMonthKey]) {
        settlements[currentMonthKey] = {
          period: currentMonthKey,
          totalAmountDue: amount,
          defaultAmountForMonth: amount,
          totalPaid: 0,
          status: 'Pending' as const,
          installments: 0,
          cycleStartDate: now,
          paymentHistory: [],
        };
      } else {
        // Only update the amount due if no payments have been made yet
        const currentMonthData = settlements[currentMonthKey];
        if (currentMonthData.totalPaid === 0) {
          settlements[currentMonthKey].totalAmountDue = amount;
          // Update the default amount for month if no payments made
          settlements[currentMonthKey].defaultAmountForMonth = amount;
        }
        // If payments have been made, don't change the current month's amount due
        // The new default will apply to future months
      }

      const creditResult = applyOverpaymentToPeriod(
        settlements[currentMonthKey],
        restaurantId,
        currentMonthKey,
        settlement.currentOverpayment || 0,
        now
      );
      settlements[currentMonthKey] = creditResult.period;
      
      const updated: Settlement = {
        ...settlement,
        defaultSettlementAmount: amount,
        defaultSettlementStartDate: startDate,
        currentOverpayment: creditResult.remainingOverpayment,
        settlements: settlements,
        lastUpdated: now,
      };

      // Save to Firebase
      (async () => {
        try {
          const settRef = doc(db, 'Restaurant', restaurantId, 'Settlement', 'settlement');
          const updateData: Record<string, unknown> = {
            defaultSettlementAmount: amount,
            defaultSettlementStartDate: startDate,
            currentOverpayment: creditResult.remainingOverpayment,
            lastUpdated: now,
          };
          
          // Update the current month when amount changed or a carry-forward credit was consumed.
          if (settlements[currentMonthKey] && (settlements[currentMonthKey].totalPaid === 0 || creditResult.appliedCredit > 0)) {
            updateData[`settlements.${currentMonthKey}`] = settlements[currentMonthKey];
          }
          
          console.log('[Firebase] setDefaultSettlementAmount: writing', { restaurantId, amount, startDate, currentMonth: currentMonthKey, path: settRef.path });
          
          // Check if document exists, if not create it, otherwise update
          const docSnap = await getDoc(settRef);
          if (docSnap.exists()) {
            await updateDoc(settRef, updateData);
          } else {
            // Create the document with the update data
            const fullData = {
              settlementId: `settlement_${restaurantId}`,
              restaurantId,
              restaurantName: settlement.restaurantName,
              ...updateData,
              settlements: settlements,
              createdAt: now,
            };
            await setDoc(settRef, fullData);
          }
          
          console.log('[Firebase] setDefaultSettlementAmount: write complete', { restaurantId, path: settRef.path });
        } catch (err) {
          console.error('Failed to save default settlement amount to Firebase:', err);
        }
      })();

      return {
        settlements: state.settlements.map((s) => (s.restaurantId === restaurantId ? updated : s)),
      };
    });
  },

  setRestaurantStatus: (restaurantId: string, status: 'Active' | 'Inactive' | 'Suspended' | 'Off', source: 'manual' | 'system' = 'manual', reason: string | null = null) => {
    set((state) => {
      const updated = state.restaurants.map((r) => {
        if (r.id === restaurantId) {
          const updatedRestaurant = { ...r, status, statusManagedBy: source, statusReason: reason };
          // Handle inactive timestamp based on status change
          if (status === 'Inactive') {
            // Set timestamp when becoming inactive
            updatedRestaurant.inactiveTimestamp = Date.now();
          } else if (r.status === 'Inactive') {
            // Clear timestamp when changing from inactive to something else
            updatedRestaurant.inactiveTimestamp = undefined;
          }
          return updatedRestaurant;
        }
        return r;
      });

      // Persist to Firestore (Restaurant doc)
      (async () => {
        try {
          const rRef = doc(db, 'Restaurant', restaurantId);
          const updateData: Record<string, unknown> = {
            status,
            statusManagedBy: source,
            statusReason: reason,
          };
          // Find the current restaurant to check its previous status
          const currentRestaurant = state.restaurants.find(r => r.id === restaurantId);
          if (status === 'Inactive') {
            // Set timestamp when becoming inactive
            updateData.inactiveTimestamp = Date.now();
          } else if (currentRestaurant?.status === 'Inactive') {
            // Clear timestamp when changing from inactive to something else
            updateData.inactiveTimestamp = null; // Firestore accepts null
          }
          await setDoc(rRef, updateData, { merge: true });
          console.log('[Firebase] setRestaurantStatus: saved', { restaurantId, status, source, reason });
        } catch (err) {
          console.error('[Firebase] setRestaurantStatus: failed', err);
        }
      })();

      return { restaurants: updated };
    });
  },

  getDefaultSettlementAmount: (restaurantId: string) => {
    return get().defaultSettlementAmounts[restaurantId] || 0;
  },

  getRestaurantById: (id: string) => {
    return get().restaurants.find((r) => r.id === id || r.code === id);
  },

  getRestaurantTransactions: (restaurantId: string) => {
    return get().transactions.filter((t) => t.restaurantId === restaurantId);
  },

  getFilteredTransactions: () => {
    const state = get();
    
    // Show ONLY transactions explicitly marked as 'online' payment method
    // This excludes Card, UPI, Cash, and other payment methods
    let filtered = state.transactions.filter(t => 
      ['online', 'Online'].includes(t.paymentMethod)
    );

    if (state.selectedDateRange) {
      filtered = filtered.filter(
        (t) =>
          t.createdAt >= state.selectedDateRange!.from &&
          t.createdAt <= state.selectedDateRange!.to
      );
    }

    return filtered;
  },

  getSettlement: (restaurantId: string) => {
    return get().settlements.find((s) => s.restaurantId === restaurantId);
  },
  getSettlementsByRestaurant: (restaurantId: string) => {
    // Returns array with single settlement doc (for compatibility with existing UI)
    const settlement = get().settlements.find((s) => s.restaurantId === restaurantId);
    return settlement ? [settlement] : [];
  },

  setSettlementAmountDue: (restaurantId: string, amount: number) => {
    set((state) => ({
      settlements: state.settlements.map((s) =>
        s.restaurantId === restaurantId ? { ...s, totalAmountDue: amount } : s
      ),
    }));
  },

  addPaymentToSettlementById: (settlementId: string, amount: number) => {
    set((state) => {
      // Find settlement by restaurantId (settlementId is actually restaurantId in this new model)
      const settlementIndex = state.settlements.findIndex((s) => s.restaurantId === settlementId);
      if (settlementIndex === -1) return { settlements: state.settlements };

      const settlement = state.settlements[settlementIndex];
      
      // Get current month key
      const currentMonthKey = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
      const currentMonthData = settlement.settlements?.[currentMonthKey];
      
      if (!currentMonthData) {
        console.warn('[Store] addPaymentToSettlementById: no settlement for current month', { restaurantId: settlement.restaurantId, month: currentMonthKey });
        return { settlements: state.settlements };
      }

      const dueAmount = currentMonthData.totalAmountDue ?? 0;
      const currentPaid = currentMonthData.totalPaid ?? 0;

      // If period already fully paid, reject additional payments
      if (currentPaid >= dueAmount) {
        console.warn('[Store] addPaymentToSettlementById: current period already fully paid, rejecting additional payment', { restaurantId: settlement.restaurantId, month: currentMonthKey, dueAmount, currentPaid });
        return { settlements: state.settlements };
      }

      // Guard against zero/negative payments at store level
      if (!amount || amount <= 0) {
        console.warn('[Store] addPaymentToSettlementById: ignoring zero or negative payment', { restaurantId: settlement.restaurantId, amount });
        return { settlements: state.settlements };
      }

      // Create new payment entry
      const newPayment: PaymentEntry = {
        id: `pay_${settlement.settlementId}_${Date.now()}`,
        amount: amount,
        date: Date.now(),
        timestamp: Date.now(),
        isAutoPayment: false,
      };

      // Ensure paymentHistory is an array
      const currentPaymentHistory = currentMonthData.paymentHistory || [];

      // Calculate new totals
      const updatedPaymentHistory = [...currentPaymentHistory, newPayment].filter((p) => p.amount && p.amount > 0);
      // Deduplicate payment history by id to avoid accidental duplicates
      const dedupeById = (arr: PaymentEntry[]) => Array.from(new Map(arr.map((p) => [p.id, p])).values());
      const dedupedPaymentHistory = dedupeById(updatedPaymentHistory);
      const newTotalPaid = currentPaid + amount;
      
      // Status: Paid if totalPaid >= due, else Processing or Pending
      const newStatus = newTotalPaid >= dueAmount ? 'Paid' : newTotalPaid > 0 ? 'Processing' : 'Pending';
      
      // Calculate overpayment if total paid exceeds amount due
      const overpaymentAmount = newTotalPaid > dueAmount ? newTotalPaid - dueAmount : 0;
      // Update global overpayment: add new overpayment to existing global overpayment
      const newGlobalOverpayment = (settlement.currentOverpayment || 0) + overpaymentAmount;
      
      // Record settlementDate when period becomes fully paid
      const settledDate = newStatus === 'Paid' && currentPaid < dueAmount ? Date.now() : currentMonthData.settledDate;

      const updatedSettlement: Settlement = {
        ...settlement,
        currentOverpayment: newGlobalOverpayment, // Update global overpayment
        settlements: {
          ...settlement.settlements,
          [currentMonthKey]: {
            ...currentMonthData,
            paymentHistory: dedupedPaymentHistory,
            totalPaid: newTotalPaid,
            status: newStatus,
            installments: (currentMonthData.installments || 0) + 1,
            settledDate: settledDate,
            overpaymentAmount: overpaymentAmount, // Store overpayment for historical tracking in this month
          },
        },
        lastUpdated: Date.now(),
      };

      console.log('[Store] addPaymentToSettlementById: payment processed', {
        restaurantId: settlement.restaurantId,
        month: currentMonthKey,
        incomingAmount: amount,
        previousPaid: currentPaid,
        newTotalPaid,
        dueAmount,
        newStatus,
        overpaymentAmount,
        newGlobalOverpayment,
      });

      // Save to Firebase
      (async () => {
          try {
          const settRef = doc(db, 'Restaurant', settlement.restaurantId, 'Settlement', 'settlement');
          console.log('[Firebase] addPaymentToSettlementById: writing payment', { restaurantId: settlement.restaurantId, month: currentMonthKey, newPayment, path: settRef.path });
          // Update the entire paymentHistory array to ensure all payments are preserved
          await updateDoc(settRef, {
            currentOverpayment: newGlobalOverpayment, // Update global overpayment
            [`settlements.${currentMonthKey}.paymentHistory`]: dedupedPaymentHistory,
            [`settlements.${currentMonthKey}.totalPaid`]: newTotalPaid,
            [`settlements.${currentMonthKey}.status`]: newStatus,
            [`settlements.${currentMonthKey}.overpaymentAmount`]: overpaymentAmount,
            [`settlements.${currentMonthKey}.installments`]: (currentMonthData.installments || 0) + 1,
            [`settlements.${currentMonthKey}.settledDate`]: settledDate,
            lastUpdated: Date.now(),
          });

          console.log('[Firebase] addPaymentToSettlementById: write complete', { restaurantId: settlement.restaurantId, month: currentMonthKey, newTotalPaid });
          if (newStatus === 'Paid') {
            const restaurantRef = doc(db, 'Restaurant', settlement.restaurantId);
            const restaurantSnap = await getDoc(restaurantRef);
            const restaurantData = restaurantSnap.exists() ? restaurantSnap.data() as FirebaseRestaurantData : null;
            if (
              (restaurantData?.status === 'Inactive' || restaurantData?.status === 'Off') &&
              canSystemManageSettlementStatus(restaurantData)
            ) {
              get().setRestaurantStatus(settlement.restaurantId, 'Active', 'system', 'settlement_paid');
            }
          }
        } catch (err) {
          console.error('Failed to save payment to Firebase:', err);
        }
      })();

      return {
        settlements: state.settlements.map((s, i) => (i === settlementIndex ? updatedSettlement : s)),
      };
    });
  },

  ensureMonthlySettlement: (restaurantId: string) => {
    // Attach realtime listener which will normalize and update local store
    try {
      ensureSnapshotFor(restaurantId);
    } catch (e) {
      console.error('[Store] ensureMonthlySettlement: ensureSnapshotFor failed', e);
    }

    // Also ensure a minimal document exists so listener has a document to read
    (async () => {
      try {
        const state = get();
        const restaurant = state.restaurants.find((r) => r.id === restaurantId);
        if (!restaurant) return;

        const settRef = doc(db, 'Restaurant', restaurantId, 'Settlement', 'settlement');
        const snap = await getDoc(settRef);
        const currentMonthKey = getCurrentMonthKey();
        
        if (!snap.exists()) {
          // Create new settlement document with empty settlements object
          const newSettlement: Settlement = {
            settlementId: `settlement_${restaurantId}`,
            restaurantId,
            restaurantName: restaurant.Restaurant_name,
            defaultSettlementAmount: 0,
            defaultSettlementStartDate: 0,
            currentOverpayment: 0, // Initialize global overpayment
            settlements: {},
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          };
          await setDoc(settRef, newSettlement, { merge: true });
          // onSnapshot will pick up the newly created document and normalize it into the store
        } else {
          // Document exists, but ensure current month exists in settlements
          const data = snap.data() as FirebaseSettlementData;
          if (!data.settlements?.[currentMonthKey]) {
            const defaultAmount = data.defaultSettlementAmount || 0;
            const availableCredit = data.currentOverpayment || 0;
            const appliedCredit = Math.min(availableCredit, defaultAmount);
            const remainingOverpayment = Math.max(0, availableCredit - appliedCredit);
            const now = Date.now();
            const autoPayment: PaymentEntry | null = appliedCredit > 0 ? {
              id: `auto_${restaurantId}_${currentMonthKey}_${now}`,
              amount: appliedCredit,
              date: now,
              timestamp: now,
              isAutoPayment: true,
            } : null;
            const totalPaid = appliedCredit;
            const status: SettlementStatus = totalPaid >= defaultAmount ? 'Paid' : totalPaid > 0 ? 'Processing' : 'Pending';
            const currentPeriod: SettlementPeriod = {
              period: currentMonthKey,
              totalAmountDue: defaultAmount,
              defaultAmountForMonth: defaultAmount,
              carryOverCredit: appliedCredit,
              totalPaid,
              status,
              installments: autoPayment ? 1 : 0,
              cycleStartDate: now,
              paymentHistory: autoPayment ? [autoPayment] : [],
              ...(status === 'Paid' ? { settledDate: now } : {}),
            };

            // Add current month if it doesn't exist and consume any previous overpayment as an auto payment.
            await updateDoc(settRef, {
              currentOverpayment: remainingOverpayment,
              [`settlements.${currentMonthKey}`]: currentPeriod,
              lastUpdated: now,
            });
            syncRestaurantStatusForCurrentSettlement(restaurantId, {
              settlementId: data.settlementId || `settlement_${restaurantId}`,
              restaurantId,
              restaurantName: data.restaurantName || restaurant.Restaurant_name,
              defaultSettlementAmount: data.defaultSettlementAmount || 0,
              defaultSettlementStartDate: data.defaultSettlementStartDate || 0,
              currentOverpayment: remainingOverpayment,
              settlements: {
                ...normalizeSettlementPeriods(data.settlements),
                [currentMonthKey]: currentPeriod,
              },
              createdAt: data.createdAt,
              lastUpdated: now,
            }, restaurant);
          } else {
            const settlements = normalizeSettlementPeriods(data.settlements);
            const currentPeriod = settlements[currentMonthKey];
            const availableCredit = data.currentOverpayment || 0;
            const now = Date.now();
            const creditResult = applyOverpaymentToPeriod(currentPeriod, restaurantId, currentMonthKey, availableCredit, now);

            if (creditResult.appliedCredit > 0) {
              await updateDoc(settRef, {
                currentOverpayment: creditResult.remainingOverpayment,
                [`settlements.${currentMonthKey}`]: creditResult.period,
                lastUpdated: now,
              });
              syncRestaurantStatusForCurrentSettlement(restaurantId, {
                settlementId: data.settlementId || `settlement_${restaurantId}`,
                restaurantId,
                restaurantName: data.restaurantName || restaurant.Restaurant_name,
                defaultSettlementAmount: data.defaultSettlementAmount || 0,
                defaultSettlementStartDate: data.defaultSettlementStartDate || 0,
                currentOverpayment: creditResult.remainingOverpayment,
                settlements: {
                  ...settlements,
                  [currentMonthKey]: creditResult.period,
                },
                createdAt: data.createdAt,
                lastUpdated: now,
              }, restaurant);
            } else {
              syncRestaurantStatusForCurrentSettlement(restaurantId, {
                settlementId: data.settlementId || `settlement_${restaurantId}`,
                restaurantId,
                restaurantName: data.restaurantName || restaurant.Restaurant_name,
                defaultSettlementAmount: data.defaultSettlementAmount || 0,
                defaultSettlementStartDate: data.defaultSettlementStartDate || 0,
                currentOverpayment: availableCredit,
                settlements,
                createdAt: data.createdAt,
                lastUpdated: data.lastUpdated,
              }, restaurant);
            }
          }
        }
      } catch (err) {
        console.error('[Store] ensureMonthlySettlement: create-if-missing failed', err);
      }
    })();
  },

  createNextSettlementIfNeeded: (restaurantId: string) => {
    const state = get();
    const settlement = state.settlements.find((s) => s.restaurantId === restaurantId);
    
    if (!settlement) return;

    const restaurant = state.restaurants.find((r) => r.id === restaurantId);
    
    const cycleStartDate = settlement.defaultSettlementStartDate;
    if (!cycleStartDate || cycleStartDate === 0) return; // No cycle started yet
    
    // Get current and next month keys
    const currentMonthKey = getCurrentMonthKey();
    
    // Check if we need to create next month's settlement
    const currentMonthData = settlement.settlements?.[currentMonthKey];
    if (!currentMonthData) {
      // Current month doesn't exist yet, create it
      console.log('[Store] createNextSettlementIfNeeded: creating current month settlement', { restaurantId, month: currentMonthKey });
      
      const defaultAmount = settlement.defaultSettlementAmount;
      const availableCredit = settlement.currentOverpayment ?? 0;
      const appliedCredit = Math.min(availableCredit, defaultAmount);
      const remainingOverpayment = Math.max(0, availableCredit - appliedCredit);
      const nowMs = Date.now();
      const autoPayment: PaymentEntry | null = appliedCredit > 0 ? {
        id: `auto_${restaurantId}_${currentMonthKey}_${nowMs}`,
        amount: appliedCredit,
        date: nowMs,
        timestamp: nowMs,
        isAutoPayment: true,
      } : null;
      const totalPaid = appliedCredit;
      const statusAfterCarryover: SettlementStatus = totalPaid >= defaultAmount ? 'Paid' : totalPaid > 0 ? 'Processing' : 'Pending';
      const newPeriod: SettlementPeriod = {
        period: currentMonthKey,
        totalAmountDue: defaultAmount,
        defaultAmountForMonth: defaultAmount,
        carryOverCredit: appliedCredit,
        totalPaid,
        status: statusAfterCarryover,
        installments: autoPayment ? 1 : 0,
        cycleStartDate: nowMs,
        paymentHistory: autoPayment ? [autoPayment] : [],
        ...(statusAfterCarryover === 'Paid' ? { settledDate: nowMs } : {}),
      };
      
      const newSettlement: Settlement = {
        ...settlement,
        currentOverpayment: remainingOverpayment, // Auto-reduce global overpayment after applying to this month
        settlements: {
          ...settlement.settlements,
          [currentMonthKey]: newPeriod,
        },
        lastUpdated: nowMs,
      };
      
      set((s) => ({
        settlements: s.settlements.map((sett) => (sett.restaurantId === restaurantId ? newSettlement : sett)),
      }));
      syncRestaurantStatusForCurrentSettlement(restaurantId, newSettlement, restaurant);
      
      // Save to Firebase
      (async () => {
        try {
          const settRef = doc(db, 'Restaurant', restaurantId, 'Settlement', 'settlement');
          console.log('[Store] createNextSettlementIfNeeded: writing new month settlement', { restaurantId, month: currentMonthKey, appliedCredit, remainingOverpayment });
          await updateDoc(settRef, {
            currentOverpayment: remainingOverpayment, // Update global overpayment after deduction
            [`settlements.${currentMonthKey}`]: newPeriod,
            lastUpdated: nowMs,
          });
          console.log('[Store] createNextSettlementIfNeeded: write complete', { restaurantId, month: currentMonthKey });
        } catch (err) {
          console.error('Failed to create next settlement in Firebase:', err);
        }
      })();
    } else {
      const nowMs = Date.now();
      const creditResult = applyOverpaymentToPeriod(
        currentMonthData,
        restaurantId,
        currentMonthKey,
        settlement.currentOverpayment || 0,
        nowMs
      );

      if (creditResult.appliedCredit > 0) {
        const updatedSettlement: Settlement = {
          ...settlement,
          currentOverpayment: creditResult.remainingOverpayment,
          settlements: {
            ...settlement.settlements,
            [currentMonthKey]: creditResult.period,
          },
          lastUpdated: nowMs,
        };

        set((s) => ({
          settlements: s.settlements.map((sett) => (sett.restaurantId === restaurantId ? updatedSettlement : sett)),
        }));
        syncRestaurantStatusForCurrentSettlement(restaurantId, updatedSettlement, restaurant);

        (async () => {
          try {
            const settRef = doc(db, 'Restaurant', restaurantId, 'Settlement', 'settlement');
            await updateDoc(settRef, {
              currentOverpayment: creditResult.remainingOverpayment,
              [`settlements.${currentMonthKey}`]: creditResult.period,
              lastUpdated: nowMs,
            });
          } catch (err) {
            console.error('Failed to apply overpayment to current settlement in Firebase:', err);
          }
        })();
      } else {
        syncRestaurantStatusForCurrentSettlement(restaurantId, settlement, restaurant);
      }
    }
  },

  loadPrimaryRestaurants: async (limitCount?: number) => {
    try {
      console.log('[Store] loadPrimaryRestaurants: starting fetch from /Restaurant collection', { limitCount, dbInstance: !!db });
      const col = collection(db, 'Restaurant');
      console.log('[Store] loadPrimaryRestaurants: collection reference created', { path: col.path });
      
      // If no limit specified, fetch all restaurants; otherwise apply limit
      const q = limitCount ? query(col, fbLimit(limitCount)) : query(col);
      console.log('[Store] loadPrimaryRestaurants: query created, executing getDocs...');
      
      const snap = await getDocs(q);
      console.log('[Store] loadPrimaryRestaurants: getDocs completed', { 
        docCount: snap.docs.length,
        empty: snap.empty,
        size: snap.size
      });
      
      // Log each document ID
      console.log('[Store] loadPrimaryRestaurants: Debugging - total docs in snapshot:', snap.docs.length);
      snap.docs.forEach((doc, index) => {
        console.log(`[Store] loadPrimaryRestaurants: Doc ${index}:`, {
          id: doc.id,
          exists: doc.exists(),
          data: doc.data()
        });
      });
      
      if (snap.empty) {
        console.warn('[Store] loadPrimaryRestaurants: ⚠️ Firebase returned EMPTY result - no restaurants found in /Restaurant collection');
        console.warn('[Store] loadPrimaryRestaurants: Check: 1) Collection path is correct, 2) Data exists in Firebase, 3) Firebase rules allow read access');
        set({ restaurants: [] });
        return;
      }
      
      const fetched: Restaurant[] = snap.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        console.log('[Store] loadPrimaryRestaurants: raw doc data for', doc.id, data);
        
        // helper to read a string field safely
        const s = (key: string) => (data[key] as string) || '';
        const restaurant: Restaurant = {
          id: doc.id,
          code: s('code') || doc.id,
          Restaurant_name: s('Restaurant_name') || s('name'),
          city: s('city'),
          status: (data.status as unknown as RestaurantStatus) || 'Off',
          totalOrders: (data.totalOrders as number) || 0,
          totalVolume: (data.totalVolume as number) || 0,
          earnings: (data.earnings as number) || 0,
          Owner: s('Owner') || s('owner'),
          Owner_Contact: s('Owner_Contact') || s('phone'),
          email: s('email'),
          address: s('address'),
          account: s('account') || s('bankAccount'),
          IFSC: s('IFSC') || s('ifsc'),
          joinDate: new Date(),
          inactiveTimestamp: (data.inactiveTimestamp as number) || undefined,
          statusManagedBy: (data.statusManagedBy as 'manual' | 'system' | undefined),
          statusReason: (data.statusReason as string | null | undefined),
        };
        console.log('[Store] loadPrimaryRestaurants: mapped restaurant', { 
          id: restaurant.id, 
          Restaurant_name: restaurant.Restaurant_name,
          status: restaurant.status,
          Owner: restaurant.Owner 
        });
        return restaurant;
      });
      
      console.log('[Store] loadPrimaryRestaurants: TOTAL FETCHED:', fetched.length, 'restaurants');
      fetched.forEach((rest, i) => {
        console.log(`[Store] loadPrimaryRestaurants: Restaurant ${i}:`, rest.id, rest.Restaurant_name);
      });
      
      // Fetch daily order counters for each restaurant and compute total orders
      const restaurantsWithOrders = await Promise.all(
        fetched.map(async (rest) => {
          try {
            const dailyCountersCol = collection(db, 'Restaurant', rest.id, 'dailyOrderCounters');
            const countersSnap = await getDocs(dailyCountersCol);
            const totalOrders = countersSnap.docs.reduce((sum: number, doc) => {
              const data = doc.data() as FirebaseRestaurantData;
              return sum + ((data.count as number) || 0);
            }, 0);
            console.log('[Store] loadPrimaryRestaurants: fetched daily order counters for', rest.id, { totalOrders });
            return { ...rest, totalOrders };
          } catch (e) {
            console.error('[Store] loadPrimaryRestaurants: failed to fetch daily counters for', rest.id, e);
            return rest; // fallback to stored totalOrders
          }
        })
      );
      
      // Set restaurants list
      set({ restaurants: restaurantsWithOrders });
      console.log('[Store] loadPrimaryRestaurants: SET STATE with', restaurantsWithOrders.length, 'restaurants');
      restaurantsWithOrders.forEach((rest, i) => {
        console.log(`[Store] loadPrimaryRestaurants: In State ${i}:`, rest.id, rest.Restaurant_name);
      });

      // For each fetched restaurant fetch settlement doc (sequentially) and attach listener
      const settlementsAcc: Settlement[] = [];
      const ensureFn = get().ensureMonthlySettlement;
      for (const rest of restaurantsWithOrders) {
        // Attach realtime listener (will also normalize when updates arrive)
        try {
          if (typeof ensureFn === 'function') ensureFn(rest.id);
        } catch {
          // ignore
        }

        // Attempt to fetch the settlement doc immediately so UI can show data without waiting for snapshot
        try {
          const settRef = doc(db, 'Restaurant', rest.id, 'Settlement', 'settlement');
          const snapSet = await getDoc(settRef);
          if (snapSet.exists()) {
            const data = snapSet.data() as FirebaseSettlementData;
            const loaded: Settlement = {
              settlementId: data.settlementId || `settlement_${rest.id}`,
              restaurantId: rest.id,
              restaurantName: data.restaurantName || rest.Restaurant_name,
              defaultSettlementAmount: data.defaultSettlementAmount ?? 0,
              defaultSettlementStartDate: data.defaultSettlementStartDate ?? 0,
              currentOverpayment: data.currentOverpayment ?? 0, // Preserve global overpayment
              settlements: normalizeSettlementPeriods(data.settlements),
              createdAt: data.createdAt ?? Date.now(),
              lastUpdated: data.lastUpdated ?? Date.now(),
            };

            let resolvedLoaded = loaded;
            const currentMonthKey = getCurrentMonthKey();
            const currentPeriod = loaded.settlements[currentMonthKey];
            if (currentPeriod && loaded.currentOverpayment > 0) {
              const now = Date.now();
              const creditResult = applyOverpaymentToPeriod(
                currentPeriod,
                rest.id,
                currentMonthKey,
                loaded.currentOverpayment,
                now
              );

              if (creditResult.appliedCredit > 0) {
                resolvedLoaded = {
                  ...loaded,
                  currentOverpayment: creditResult.remainingOverpayment,
                  settlements: {
                    ...loaded.settlements,
                    [currentMonthKey]: creditResult.period,
                  },
                  lastUpdated: now,
                };

                await updateDoc(settRef, {
                  currentOverpayment: creditResult.remainingOverpayment,
                  [`settlements.${currentMonthKey}`]: creditResult.period,
                  lastUpdated: now,
                });
              }
            }

            settlementsAcc.push(resolvedLoaded);
            syncRestaurantStatusForCurrentSettlement(rest.id, resolvedLoaded, rest);
          }
        } catch (e: unknown) {
          console.error('[Store] loadPrimaryRestaurants: failed to fetch settlement for', rest.id, e);
        }
      }

      // Merge any fetched settlements with existing state
      if (settlementsAcc.length > 0) {
        set((s) => ({ settlements: [...s.settlements.filter((x) => !settlementsAcc.some((ns) => ns.restaurantId === x.restaurantId)), ...settlementsAcc] }));
      }
      console.log('[Store] loadPrimaryRestaurants: ✅ completed successfully');
    } catch (err) {
      console.error('❌ [Store] loadPrimaryRestaurants FAILED:', err);
      console.error('[Store] Error details:', { message: (err as Error)?.message, code: (err as Record<string, unknown>)?.code });
    }
  },

  reloadAllRestaurants: async () => {
    // Force reload all restaurants - used to sync missing restaurants
    try {
      console.log('[Store] reloadAllRestaurants: forcing fresh load of all restaurants');
      
      // First, do a diagnostic fetch
      try {
        const col = collection(db, 'Restaurant');
        const diagnosticSnap = await getDocs(col);
        console.log('[Store] reloadAllRestaurants: DIAGNOSTIC - Total docs in /Restaurant collection:', diagnosticSnap.docs.length);
        diagnosticSnap.docs.forEach((doc, i) => {
          console.log(`[Store] reloadAllRestaurants: DIAGNOSTIC Doc ${i}:`, doc.id, {
            name: (doc.data() as Record<string, unknown>)?.Restaurant_name,
            code: (doc.data() as Record<string, unknown>)?.code
          });
        });
      } catch (diagErr) {
        console.error('[Store] reloadAllRestaurants: DIAGNOSTIC ERROR:', diagErr);
      }
      
      await get().loadPrimaryRestaurants(); // Call without limit to get ALL
      console.log('[Store] reloadAllRestaurants: ✅ completed successfully');
    } catch (err) {
      console.error('❌ [Store] reloadAllRestaurants FAILED:', err);
    }
  },

  watchRestaurants: () => {
    // Set up a real-time listener on the /Restaurant collection to sync new restaurants automatically
    try {
      console.log('[Store] watchRestaurants: setting up real-time listener on /Restaurant collection');
      
      // Clean up existing listener if any
      if (restaurantCollectionListener) {
        restaurantCollectionListener();
      }

      const restaurantCol = collection(db, 'Restaurant');
      
      restaurantCollectionListener = onSnapshot(
        restaurantCol,
        async (snap) => {
          try {
            console.log('[Store] watchRestaurants: collection snapshot received with', snap.docs.length, 'restaurants');
            
            // Get the current restaurants in state
            const currentRestaurants = get().restaurants;
            const currentIds = new Set(currentRestaurants.map(r => r.id));
            
            // Map Firebase docs to Restaurant objects
            const allUpdatedRestaurants: Restaurant[] = [];
            
            for (const docSnap of snap.docs) {
              const data = docSnap.data() as Record<string, unknown>;
              const s = (key: string) => (data[key] as string) || '';
              
              const restaurant: Restaurant = {
                id: docSnap.id,
                code: s('code') || docSnap.id,
                Restaurant_name: s('Restaurant_name') || s('name'),
                city: s('city'),
                status: (data.status as unknown as RestaurantStatus) || 'Off',
                totalOrders: (data.totalOrders as number) || 0,
                totalVolume: (data.totalVolume as number) || 0,
                earnings: (data.earnings as number) || 0,
                Owner: s('Owner') || s('owner'),
                Owner_Contact: s('Owner_Contact') || s('phone'),
                email: s('email'),
                address: s('address'),
                account: s('account') || s('bankAccount'),
                IFSC: s('IFSC') || s('ifsc'),
                joinDate: new Date(),
                inactiveTimestamp: (data.inactiveTimestamp as number) || undefined,
                statusManagedBy: (data.statusManagedBy as 'manual' | 'system' | undefined),
                statusReason: (data.statusReason as string | null | undefined),
              };
              
              allUpdatedRestaurants.push(restaurant);
            }

            // Check for new restaurants
            const newRestaurants = allUpdatedRestaurants.filter(r => !currentIds.has(r.id));
            console.log('[Store] watchRestaurants: current restaurants:', currentIds.size, 'updated restaurants:', allUpdatedRestaurants.length, 'new:', newRestaurants.length);
            
            // If there are new restaurants, process and add them
            if (newRestaurants.length > 0) {
              console.log('[Store] watchRestaurants: detected', newRestaurants.length, 'new restaurants:', newRestaurants.map(r => r.Restaurant_name));
              
              // Fetch daily order counters for new restaurants
              const newRestaurantsWithOrders = await Promise.all(
                newRestaurants.map(async (rest) => {
                  try {
                    const dailyCountersCol = collection(db, 'Restaurant', rest.id, 'dailyOrderCounters');
                    const countersSnap = await getDocs(dailyCountersCol);
                    const totalOrders = countersSnap.docs.reduce((sum: number, doc) => {
                      const data = doc.data() as FirebaseRestaurantData;
                      return sum + ((data.count as number) || 0);
                    }, 0);
                    console.log('[Store] watchRestaurants: fetched daily order counters for', rest.id, { totalOrders });
                    return { ...rest, totalOrders };
                  } catch (e) {
                    console.error('[Store] watchRestaurants: failed to fetch daily counters for', rest.id, e);
                    return rest;
                  }
                })
              );

              // Update state: keep existing restaurants + add new ones
              set((s) => {
                const merged = [
                  ...s.restaurants.filter(r => allUpdatedRestaurants.some(u => u.id === r.id)), // Keep existing
                  ...newRestaurantsWithOrders, // Add new
                ];
                console.log('[Store] watchRestaurants: merged total restaurants:', merged.length);
                return { restaurants: merged };
              });

              // Ensure monthly settlement for new restaurants
              for (const rest of newRestaurants) {
                try {
                  const ensureFn = get().ensureMonthlySettlement;
                  if (typeof ensureFn === 'function') {
                    ensureFn(rest.id);
                  }
                } catch {
                  // ignore
                }
              }

              get().loadCustomerTransactions().catch((e) => {
                console.error('[Store] watchRestaurants: failed to attach transaction listeners for new restaurants', e);
              });
            }
          } catch (e) {
            console.error('[Store] watchRestaurants: snapshot processing error', e);
          }
        },
        (err) => {
          console.error('[Store] watchRestaurants: listener error', err);
        }
      );

      console.log('[Store] watchRestaurants: real-time listener attached successfully');
    } catch (e) {
      console.error('[Store] watchRestaurants: failed to set up listener', e);
    }
  },

  loadCustomerTransactions: async () => {
    try {
      console.log('[Store] loadCustomerTransactions: attaching realtime listeners');
      const state = get();

      console.log('[Store] loadCustomerTransactions: processing', state.restaurants.length, 'restaurants');

      const restaurantsNeedingListeners = state.restaurants.filter(
        (restaurant) => !customerOrderListeners[restaurant.id]
      );

      if (restaurantsNeedingListeners.length === 0) {
        set({ isLoadingTransactions: false });
        return;
      }

      set({ isLoadingTransactions: true });

      let pendingInitialSnapshots = restaurantsNeedingListeners.length;
      const markInitialSnapshotDone = () => {
        pendingInitialSnapshots -= 1;
        if (pendingInitialSnapshots <= 0) {
          set({ isLoadingTransactions: false });
        }
      };

      for (const restaurant of restaurantsNeedingListeners) {
        let hasReceivedInitialSnapshot = false;

        try {
          console.log('[Store] loadCustomerTransactions: listening to customers for restaurant', {
            restaurantId: restaurant.id,
            restaurantName: restaurant.Restaurant_name,
            path: `Restaurant/${restaurant.id}/customers`
          });
          const customersCol = collection(db, 'Restaurant', restaurant.id, 'customers');
          customerOrderListeners[restaurant.id] = onSnapshot(
            customersCol,
            (customersSnap) => {
              const restaurantTransactions = buildTransactionsFromCustomers(
                restaurant,
                customersSnap.docs.map((customerDoc) => ({
                  id: customerDoc.id,
                  data: () => customerDoc.data() as FirebaseCustomerData,
                }))
              );

              set((s) => ({
                transactions: [
                  ...s.transactions.filter((transaction) => transaction.restaurantId !== restaurant.id),
                  ...restaurantTransactions,
                ],
              }));

              if (!hasReceivedInitialSnapshot) {
                hasReceivedInitialSnapshot = true;
                markInitialSnapshotDone();
              }

              console.log('[Store] loadCustomerTransactions: realtime transaction update', {
                restaurantId: restaurant.id,
                customers: customersSnap.docs.length,
                transactions: restaurantTransactions.length,
              });
            },
            (err) => {
              console.error('[Store] loadCustomerTransactions: listener error', restaurant.id, err);
              if (!hasReceivedInitialSnapshot) {
                hasReceivedInitialSnapshot = true;
                markInitialSnapshotDone();
              }
            }
          );
        } catch (e) {
          console.error('[Store] loadCustomerTransactions: failed to listen to customers for restaurant', restaurant.id, e);
          if (!hasReceivedInitialSnapshot) {
            hasReceivedInitialSnapshot = true;
            markInitialSnapshotDone();
          }
        }
      }
    } catch (err) {
      console.error('Failed to load customer transactions from Firebase', err);
      set({ isLoadingTransactions: false });
    }
  },

  updateTransactionSettlement: async (payload) => {
    const customerRef = doc(db, 'Restaurant', payload.restaurantId, 'customers', payload.customerId);
    const customerSnap = await getDoc(customerRef);

    if (!customerSnap.exists()) {
      throw new Error('Customer transaction document was not found.');
    }

    const customerData = customerSnap.data() as FirebaseCustomerData;
    const pastOrders = Array.isArray(customerData.pastOrders) ? customerData.pastOrders : [];
    const settlementDate = toOptionalIsoString(payload.settlementDate);

    if (!settlementDate) {
      throw new Error('Settlement date is invalid.');
    }

    let updated = false;
    const updatedPastOrders = pastOrders.map((order) => {
      const orderIdMatches = String(order.id || '') === payload.orderId;
      const paymentIdMatches = payload.razorpayPaymentId
        ? String(order.razorpayPaymentId || '') === payload.razorpayPaymentId
        : false;

      if (!orderIdMatches && !paymentIdMatches) {
        return order;
      }

      updated = true;
      return {
        ...order,
        razorpayPaymentId: order.razorpayPaymentId || payload.razorpayPaymentId,
        razorpaySettlementStatus: payload.settlementStatus || 'processed',
        razorpayAdminSettlementAmount: payload.adminReceivedAmount,
        razorpaySettlementAmount: payload.adminReceivedAmount,
        razorpaySettlementCreatedAt: settlementDate,
        razorpaySettlementExpectedAt: settlementDate,
        razorpaySettlementUtr: payload.settlementUtr || order.razorpaySettlementUtr || null,
        razorpayFeeAmount: payload.razorpayFeeAmount ?? order.razorpayFeeAmount ?? null,
        razorpayTaxAmount: payload.razorpayTaxAmount ?? order.razorpayTaxAmount ?? null,
        razorpaySyncSource: 'manual',
        razorpaySyncedAt: new Date().toISOString(),
      };
    });

    if (!updated) {
      throw new Error('Matching order was not found in the customer transaction document.');
    }

    await updateDoc(customerRef, {
      pastOrders: updatedPastOrders,
    });
  },

  logout: () => {
    Object.values(snapshotListeners).forEach((unsubscribe) => unsubscribe());
    Object.keys(snapshotListeners).forEach((restaurantId) => {
      delete snapshotListeners[restaurantId];
    });
    Object.values(customerOrderListeners).forEach((unsubscribe) => unsubscribe());
    Object.keys(customerOrderListeners).forEach((restaurantId) => {
      delete customerOrderListeners[restaurantId];
    });
    if (restaurantCollectionListener) {
      restaurantCollectionListener();
      restaurantCollectionListener = null;
    }

    // Clear all app state
    set({
      restaurants: [],
      transactions: [],
      settlements: [],
      selectedDateRange: null,
      searchQuery: '',
      showStaticRestaurantInfo: false,
      isLoadingTransactions: false,
      defaultSettlementAmounts: {},
      defaultSettlementStartDates: {},
    });
  },
};
});
