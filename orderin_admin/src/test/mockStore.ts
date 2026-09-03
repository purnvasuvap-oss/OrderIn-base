import { vi } from 'vitest';
import type { Restaurant, Transaction, Settlement } from '../types';

/**
 * Builds a complete fake `useAppStore` state. Every selector/action a page
 * might read is present so `useAppStore((s) => s.whatever)` never throws.
 * Pass `overrides` to seed the slice a given test cares about.
 */
export const buildStoreState = (overrides: Record<string, unknown> = {}) => ({
  restaurants: [] as Restaurant[],
  transactions: [] as Transaction[],
  settlements: [] as Settlement[],
  selectedDateRange: null,
  searchQuery: '',
  showStaticRestaurantInfo: false,
  isLoadingTransactions: false,
  defaultSettlementAmounts: {},
  defaultSettlementStartDates: {},
  setDateRange: vi.fn(),
  setSearchQuery: vi.fn(),
  toggleStaticRestaurantInfo: vi.fn(),
  getRestaurantById: vi.fn(() => undefined),
  getRestaurantTransactions: vi.fn(() => [] as Transaction[]),
  getFilteredTransactions: vi.fn(() => [] as Transaction[]),
  getSettlement: vi.fn(() => undefined),
  getSettlementsByRestaurant: vi.fn(() => [] as Settlement[]),
  setDefaultSettlementAmount: vi.fn(),
  getDefaultSettlementAmount: vi.fn(() => 0),
  setSettlementAmountDue: vi.fn(),
  addPaymentToSettlementById: vi.fn(),
  ensureMonthlySettlement: vi.fn(),
  setRestaurantStatus: vi.fn(),
  createNextSettlementIfNeeded: vi.fn(),
  loadPrimaryRestaurants: vi.fn().mockResolvedValue(undefined),
  reloadAllRestaurants: vi.fn().mockResolvedValue(undefined),
  watchRestaurants: vi.fn(),
  loadCustomerTransactions: vi.fn().mockResolvedValue(undefined),
  updateTransactionSettlement: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn(),
  ...overrides,
});

type MockableStore = { mockImplementation: (fn: (sel?: (s: unknown) => unknown) => unknown) => void };

/** Wires a `vi.fn()`-backed `useAppStore` mock to return `state`, with selector support. */
export const applyStoreMock = (useAppStore: unknown, state: Record<string, unknown>) => {
  (useAppStore as MockableStore).mockImplementation((selector) =>
    typeof selector === 'function' ? selector(state) : state,
  );
};

export const makeRestaurant = (overrides: Partial<Restaurant> = {}): Restaurant => ({
  id: 'r1',
  code: 'REST01',
  Restaurant_name: 'Test Diner',
  city: 'Chennai',
  status: 'Active',
  totalOrders: 0,
  totalVolume: 0,
  earnings: 0,
  Owner: 'Owner One',
  Owner_Contact: '9999999999',
  email: 'owner@test.com',
  address: '1 Main St',
  account: '00011122233',
  IFSC: 'HDFC0000123',
  joinDate: new Date('2026-01-01'),
  ...overrides,
});

export const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  restaurantId: 'r1',
  orderId: 'ORD-1',
  customerId: 'c1',
  paymentMethod: 'Online',
  OnlinePayMethod: 'UPI',
  grossAmount: 1000,
  restaurantReceivable: 900,
  platformFee: 100,
  razorpayFee: 20,
  gst: 18,
  netPlatformEarnings: 62,
  status: 'Paid',
  createdAt: new Date('2026-02-01T10:00:00Z'),
  referenceId: 'REF-1',
  ...overrides,
});
