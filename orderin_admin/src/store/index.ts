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
  count?: number;
}

interface FirebaseCustomerData {
  pastOrders?: FirebaseOrderData[];
  [key: string]: unknown;
}

interface FirebaseOrderData {
  id?: string;
  paymentMethod?: string;
  OnlinePayMethod?: string;
  subtotal?: string | number;
  taxes?: string | number;
  paymentStatus?: string;
  createdAt?: string | number;
  paidAt?: string | number;
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
  setRestaurantStatus: (restaurantId: string, status: 'Active' | 'Inactive' | 'Suspended' | 'Off') => void;
  createNextSettlementIfNeeded: (restaurantId: string) => void;
  loadPrimaryRestaurants: (limitCount?: number) => Promise<void>;
  loadCustomerTransactions: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => {
  // Keep snapshot listeners per restaurant to provide realtime updates and avoid duplicate listeners
  const snapshotListeners: Record<string, Unsubscribe> = {};

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
          try {
            const restDoc = await getDoc(doc(db, 'Restaurant', restaurantId));
            if (restDoc.exists()) {
              const restData = restDoc.data() as FirebaseRestaurantData;
              restaurantName = restData.Restaurant_name || restaurantName;
            }
          } catch (e) {
            console.error('[Store] failed to fetch restaurant name for', restaurantId, e);
          }

          // Normalize fields and update store similar to ensureMonthlySettlement's success path
          const normalizePayments = (arr: unknown[]) => {
            const getTimestamp = (date: unknown, timestamp: unknown): number => {
              if (typeof timestamp === 'number') return timestamp;
              if (typeof date === 'number') return date;
              if (date && typeof date === 'object' && 'getTime' in date && typeof (date as unknown as { getTime: () => number }).getTime === 'function') {
                return (date as unknown as { getTime: () => number }).getTime();
              }
              return Date.now();
            };
            return (arr || []).filter((p) => {
              const payment = p as Record<string, unknown>;
              return payment && typeof payment.amount === 'number' && (payment.amount as number) > 0;
            }).map((p) => {
            const payment = p as Record<string, unknown>;
            return {
            id: payment.id || `pay_${Date.now()}`,
            amount: payment.amount as number,
            date: (payment.date ?? payment.timestamp ?? Date.now()) as number,
            timestamp: getTimestamp(payment.date, payment.timestamp),
            isAutoPayment: !!payment.isAutoPayment,
          } as PaymentEntry;
          });
          };

          // Normalize month-wise settlements
          const normalizeSettlements = (settlements: Record<string, unknown> = {}) => {
            const result: Record<string, SettlementPeriod> = {};
            for (const [monthKey, period] of Object.entries(settlements || {})) {
              const monthData = period as Record<string, unknown>;
              const paymentHistory = (monthData?.paymentHistory || []) as unknown[];
              const normalizedPayments = normalizePayments(paymentHistory);
              const totalPaid = normalizedPayments.reduce((s, p) => s + (p.amount || 0), 0);
              const totalDue = (monthData?.totalAmountDue as number) ?? 0;
              const carryOverCredit = ((monthData?.carryOverCredit as number) || 0);
              // Calculate overpayment: if field doesn't exist in Firebase, calculate from paid vs due
              const overpaymentAmount = (monthData?.overpaymentAmount as number) ?? (totalPaid > totalDue ? totalPaid - totalDue : 0);
              const status = (totalPaid >= totalDue ? 'Paid' : totalPaid > 0 ? 'Processing' : 'Pending') as SettlementStatus;
              
              result[monthKey] = {
                period: monthKey,
                totalAmountDue: totalDue,
                defaultAmountForMonth: (monthData?.defaultAmountForMonth as number) ?? totalDue,
                carryOverCredit: carryOverCredit,
                overpaymentAmount: overpaymentAmount,
                totalPaid: totalPaid,
                status: status,
                installments: normalizedPayments.length,
                cycleStartDate: (monthData?.cycleStartDate as number) ?? Date.now(),
                paymentHistory: normalizedPayments,
                settledDate: monthData?.settledDate as number | undefined,
              };
            }
            return result;
          };

          console.log('[Store] onSnapshot received', { restaurantId, restaurantName, settlements: Object.keys(data.settlements || {}) });

          const loaded: Settlement = {
            settlementId: data.settlementId || `settlement_${restaurantId}`,
            restaurantId,
            restaurantName: restaurantName,
            defaultSettlementAmount: data.defaultSettlementAmount ?? 0,
            defaultSettlementStartDate: data.defaultSettlementStartDate ?? 0,
            currentOverpayment: data.currentOverpayment ?? 0, // Preserve global overpayment
            settlements: normalizeSettlements(data.settlements),
            createdAt: data.createdAt ?? Date.now(),
            lastUpdated: data.lastUpdated ?? Date.now(),
          };

          set((s) => ({ settlements: [...s.settlements.filter((x) => x.restaurantId !== restaurantId), loaded] }));
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
          cycleStartDate: Date.now(),
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
      
      const updated: Settlement = {
        ...settlement,
        defaultSettlementAmount: amount,
        defaultSettlementStartDate: startDate,
        settlements: settlements,
        lastUpdated: Date.now(),
      };

      // Save to Firebase
      (async () => {
        try {
          const settRef = doc(db, 'Restaurant', restaurantId, 'Settlement', 'settlement');
          const updateData: Record<string, unknown> = {
            defaultSettlementAmount: amount,
            defaultSettlementStartDate: startDate,
            lastUpdated: Date.now(),
          };
          
          // Only update the current month's amount due if no payments have been made
          if (settlements[currentMonthKey] && settlements[currentMonthKey].totalPaid === 0) {
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
              createdAt: Date.now(),
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

  setRestaurantStatus: (restaurantId: string, status: 'Active' | 'Inactive' | 'Suspended' | 'Off') => {
    set((state) => {
      const updated = state.restaurants.map((r) => {
        if (r.id === restaurantId) {
          const updatedRestaurant = { ...r, status };
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
          const updateData: Record<string, unknown> = { status };
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
          console.log('[Firebase] setRestaurantStatus: saved', { restaurantId, status });
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
        const currentMonthKey = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
        
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
            // Add current month if it doesn't exist
            await updateDoc(settRef, {
              [`settlements.${currentMonthKey}`]: {
                period: currentMonthKey,
                totalAmountDue: data.defaultSettlementAmount || 0,
                defaultAmountForMonth: data.defaultSettlementAmount || 0,
                totalPaid: 0,
                status: 'Pending',
                installments: 0,
                cycleStartDate: Date.now(),
                paymentHistory: [],
              },
            });
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

    // Pause monthly generation if restaurant is not Active
    const restaurant = state.restaurants.find((r) => r.id === restaurantId);
    const restaurantStatus = (restaurant as Restaurant)?.status ?? 'Off';
    if (restaurantStatus !== 'Active') {
      console.log('[Store] createNextSettlementIfNeeded: paused — restaurant status', restaurantStatus, restaurantId);
      return;
    }
    
    const cycleStartDate = settlement.defaultSettlementStartDate;
    if (!cycleStartDate || cycleStartDate === 0) return; // No cycle started yet
    
    // Get current and next month keys
    const now = new Date();
    const currentMonthKey = now.toLocaleString('default', { month: 'short', year: 'numeric' });
    
    // Check if we need to create next month's settlement
    const currentMonthData = settlement.settlements?.[currentMonthKey];
    if (!currentMonthData) {
      // Current month doesn't exist yet, create it
      console.log('[Store] createNextSettlementIfNeeded: creating current month settlement', { restaurantId, month: currentMonthKey });
      
      // Get carryover credit from global overpayment field
      const carryOverCredit = settlement.currentOverpayment ?? 0;
      
      // Calculate amount due after applying carryover
      const defaultAmount = settlement.defaultSettlementAmount;
      const amountDueAfterCarryover = Math.max(0, defaultAmount - carryOverCredit);
      const statusAfterCarryover = amountDueAfterCarryover === 0 ? 'Paid' : 'Pending';
      
      // Reduce global overpayment after applying it as carryover
      const remainingOverpayment = Math.max(0, carryOverCredit - defaultAmount);
      
      const newSettlement: Settlement = {
        ...settlement,
        currentOverpayment: remainingOverpayment, // Auto-reduce global overpayment after applying to this month
        settlements: {
          ...settlement.settlements,
          [currentMonthKey]: {
            period: currentMonthKey,
            totalAmountDue: amountDueAfterCarryover,
            defaultAmountForMonth: settlement.defaultSettlementAmount,
            carryOverCredit: carryOverCredit,
            totalPaid: 0,
            status: statusAfterCarryover,
            installments: 0,
            cycleStartDate: Date.now(),
            paymentHistory: [],
          },
        },
        lastUpdated: Date.now(),
      };
      
      set((s) => ({
        settlements: s.settlements.map((sett) => (sett.restaurantId === restaurantId ? newSettlement : sett)),
      }));
      
      // Save to Firebase
      (async () => {
        try {
          const settRef = doc(db, 'Restaurant', restaurantId, 'Settlement', 'settlement');
          console.log('[Store] createNextSettlementIfNeeded: writing new month settlement', { restaurantId, month: currentMonthKey, carryOverCredit, amountDueAfterCarryover, remainingOverpayment });
          await updateDoc(settRef, {
            currentOverpayment: remainingOverpayment, // Update global overpayment after deduction
            [`settlements.${currentMonthKey}`]: {
              period: currentMonthKey,
              totalAmountDue: amountDueAfterCarryover,
              defaultAmountForMonth: settlement.defaultSettlementAmount,
              carryOverCredit: carryOverCredit,
              totalPaid: 0,
              status: statusAfterCarryover,
              installments: 0,
              cycleStartDate: Date.now(),
              paymentHistory: [],
            },
            lastUpdated: Date.now(),
          });
          console.log('[Store] createNextSettlementIfNeeded: write complete', { restaurantId, month: currentMonthKey });
        } catch (err) {
          console.error('Failed to create next settlement in Firebase:', err);
        }
      })();
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
        };
        console.log('[Store] loadPrimaryRestaurants: mapped restaurant', { 
          id: restaurant.id, 
          Restaurant_name: restaurant.Restaurant_name,
          status: restaurant.status,
          Owner: restaurant.Owner 
        });
        return restaurant;
      });
      
      console.log('[Store] loadPrimaryRestaurants: mapped', fetched.length, 'restaurants to app state');
      
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
            const normalizePayments = (arr: unknown[]) => {
              const getTimestamp = (date: unknown, timestamp: unknown): number => {
                if (typeof timestamp === 'number') return timestamp;
                if (typeof date === 'number') return date;
                if (date && typeof date === 'object' && 'getTime' in date && typeof (date as unknown as { getTime: () => number }).getTime === 'function') {
                  return (date as unknown as { getTime: () => number }).getTime();
                }
                return Date.now();
              };
              return (arr || []).filter((p) => {
                const payment = p as Record<string, unknown>;
                return payment && typeof payment.amount === 'number' && (payment.amount as number) > 0;
              }).map((p) => {
              const payment = p as Record<string, unknown>;
              return {
              id: payment.id || `pay_${Date.now()}`,
              amount: payment.amount as number,
              date: (payment.date ?? payment.timestamp ?? Date.now()) as number,
              timestamp: getTimestamp(payment.date, payment.timestamp),
              isAutoPayment: !!payment.isAutoPayment,
            } as PaymentEntry;
            });
            };

            // Normalize month-wise settlements
            const normalizeSettlements = (settlements: Record<string, unknown> = {}) => {
              const result: Record<string, SettlementPeriod> = {};
              for (const [monthKey, period] of Object.entries(settlements || {})) {
                const monthData = period as Record<string, unknown>;
                const paymentHistory = (monthData?.paymentHistory || []) as unknown[];
                const normalizedPayments = normalizePayments(paymentHistory);
                const totalPaid = normalizedPayments.reduce((s, p) => s + (p.amount || 0), 0);
                const totalDue = (monthData?.totalAmountDue as number) ?? 0;
                const status = (totalPaid >= totalDue ? 'Paid' : totalPaid > 0 ? 'Processing' : 'Pending') as SettlementStatus;
                
                result[monthKey] = {
                  period: monthKey,
                  totalAmountDue: totalDue,
                  totalPaid: totalPaid,
                  status: status,
                  installments: normalizedPayments.length,
                  cycleStartDate: (monthData?.cycleStartDate as number) ?? Date.now(),
                  paymentHistory: normalizedPayments,
                  settledDate: monthData?.settledDate as number | undefined,
                };
              }
              return result;
            };

            const loaded: Settlement = {
              settlementId: data.settlementId || `settlement_${rest.id}`,
              restaurantId: rest.id,
              restaurantName: data.restaurantName || rest.Restaurant_name,
              defaultSettlementAmount: data.defaultSettlementAmount ?? 0,
              defaultSettlementStartDate: data.defaultSettlementStartDate ?? 0,
              currentOverpayment: data.currentOverpayment ?? 0, // Preserve global overpayment
              settlements: normalizeSettlements(data.settlements),
              createdAt: data.createdAt ?? Date.now(),
              lastUpdated: data.lastUpdated ?? Date.now(),
            };

            settlementsAcc.push(loaded);
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

  loadCustomerTransactions: async () => {
    try {
      set({ isLoadingTransactions: true });
      console.log('[Store] loadCustomerTransactions: starting fetch');
      const state = get();
      const fetchedTransactions: Transaction[] = [];

      console.log('[Store] loadCustomerTransactions: processing', state.restaurants.length, 'restaurants');
      
      // Fetch customer transactions for each restaurant
      for (const restaurant of state.restaurants) {
        try {
          console.log('[Store] loadCustomerTransactions: fetching customers for restaurant', {
            restaurantId: restaurant.id,
            restaurantName: restaurant.Restaurant_name,
            path: `Restaurant/${restaurant.id}/customers`
          });
          const customersCol = collection(db, 'Restaurant', restaurant.id, 'customers');
          const customersSnap = await getDocs(customersCol);
          console.log('[Store] loadCustomerTransactions: found', customersSnap.docs.length, 'customers in', restaurant.id);

          // For each customer, fetch their pastOrders (which is an array field in the customer document)
          for (const customerDoc of customersSnap.docs) {
            const customerPhone = customerDoc.id;
            const customerData = customerDoc.data() as FirebaseCustomerData;
            
            try {
              console.log('[Store] loadCustomerTransactions: processing customer', {
                restaurantId: restaurant.id,
                customerPhone: customerPhone,
                path: `Restaurant/${restaurant.id}/customers/${customerPhone}`,
                pastOrdersCount: Array.isArray(customerData.pastOrders) ? customerData.pastOrders.length : 0
              });
              
              // pastOrders is an array field within the customer document
              const pastOrders = customerData.pastOrders;
              if (Array.isArray(pastOrders)) {
                console.log('[Store] loadCustomerTransactions: found', pastOrders.length, 'past orders for customer', customerPhone);

                pastOrders.forEach((orderData: FirebaseOrderData, index: number) => {
                  try {
                    // Parse values
                    const subtotal = parseFloat(orderData.subtotal as string) || 0; // Restaurant's cut
                    const taxes = parseFloat(orderData.taxes as string) || 0; // Total platform fee collected
                    
                    // Calculate fees and earnings
                    // razorpayFee = 2% of subtotal + 18% of (2% of subtotal)
                    const razorpayFee = subtotal * (0.02 + 0.18 * 0.02);
                    
                    // gst = 18% of (taxes - razorpayFee)
                    const gst = 0.18 * (taxes - razorpayFee);
                    
                    // earnings = taxes - gst
                    const earnings = taxes - gst;
                    
                    // Map customer order data to Transaction format
                    const txn: Transaction = {
                      id: orderData.id || `${customerPhone}_${index}`, // Use order ID for uniqueness
                      orderId: orderData.id || `order_${index}`,
                      restaurantId: restaurant.id,
                      customerId: customerPhone,
                      paymentMethod: (orderData.paymentMethod || 'UPI') as PaymentMethod,
                      OnlinePayMethod: (orderData.OnlinePayMethod as string) || undefined,
                      grossAmount: subtotal + taxes, // Total paid by customer (subtotal + taxes)
                      restaurantReceivable: subtotal, // Restaurant's cut
                      platformFee: taxes, // Total platform fee collected
                      razorpayFee: razorpayFee, // Razorpay's cut
                      gst: gst, // GST we owe (18% of our earnings)
                      netPlatformEarnings: earnings, // Our earnings after GST
                      status: (orderData.paymentStatus || 'Paid') as TransactionStatus,
                      createdAt: orderData.createdAt ? new Date(orderData.createdAt) : new Date(orderData.paidAt || Date.now()),
                      referenceId: orderData.id || `order_${index}`,
                    };
                    fetchedTransactions.push(txn);
                    console.log('[Store] loadCustomerTransactions: mapped transaction', { 
                      id: txn.id, 
                      orderId: txn.orderId, 
                      paymentMethod: txn.paymentMethod,
                      OnlinePayMethod: txn.OnlinePayMethod,
                      subtotal: txn.restaurantReceivable,
                      platformFee: txn.platformFee,
                      razorpayFee: txn.razorpayFee.toFixed(2),
                      gst: txn.gst.toFixed(2),
                      earnings: txn.netPlatformEarnings.toFixed(2),
                      status: txn.status
                    });
                  } catch (e) {
                    console.error('[Store] loadCustomerTransactions: ❌ failed to map order', index, 'for customer', customerPhone, e);
                  }
                });
              } else {
                console.log('[Store] loadCustomerTransactions: ⚠️ pastOrders is not an array or does not exist for customer', customerPhone);
              }
            } catch (e) {
              console.error('[Store] loadCustomerTransactions: ❌ failed to process customer', customerPhone, 'in', restaurant.id, e);
            }
          }
        } catch (e) {
          console.error('[Store] loadCustomerTransactions: failed to fetch customers for restaurant', restaurant.id, e);
        }
      }

      // Merge fetched transactions with existing transactions
      console.log('[Store] loadCustomerTransactions: fetched total', fetchedTransactions.length, 'transactions from all restaurants and customers');
      if (fetchedTransactions.length > 0) {
        set((s) => ({
          transactions: [
            ...s.transactions.filter((x) => !fetchedTransactions.some((ft) => ft.id === x.id)),
            ...fetchedTransactions,
          ],
        }));
        console.log('[Store] loadCustomerTransactions: merged transactions, total transactions in store:', fetchedTransactions.length);
      }
    } catch (err) {
      console.error('Failed to load customer transactions from Firebase', err);
    } finally {
      set({ isLoadingTransactions: false });
    }
  },
};
});
