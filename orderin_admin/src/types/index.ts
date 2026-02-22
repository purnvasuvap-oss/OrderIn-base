export type PaymentMethod = 'UPI' | 'Card' | 'Cash' | 'Net Banking' | 'Wallet';
export type TransactionStatus = 'Paid' | 'Failed' | 'Refunded' | 'Pending';
export type RestaurantStatus = 'Active' | 'Inactive' | 'Suspended' | 'Off';
export type SettlementStatus = 'Pending' | 'Paid' | 'Processing';

export interface Restaurant {
  id: string;
  code: string;
  Restaurant_name: string;
  city: string;
  status: RestaurantStatus;
  totalOrders: number;
  totalVolume: number;
  earnings: number;
  Owner: string;
  Owner_Contact: string;
  email: string;
  address: string;
  account: string;
  IFSC: string;
  joinDate: Date;
  inactiveTimestamp?: number; // Timestamp when restaurant was made inactive
}

export interface Transaction {
  id: string;
  restaurantId: string;
  orderId: string;
  customerId: string;
  paymentMethod: PaymentMethod;
  OnlinePayMethod?: string; // Specific online payment method (UPI, Card, Net Banking, Wallet, etc.)
  grossAmount: number;
  restaurantReceivable: number;
  platformFee: number;
  razorpayFee: number;
  gst: number;
  netPlatformEarnings: number;
  status: TransactionStatus;
  createdAt: Date;
  referenceId: string;
}

export interface PaymentEntry {
  id: string;
  amount: number;
  date: Date | number;
  timestamp?: number;
  isAutoPayment?: boolean;
}

export interface SettlementPeriod {
  period: string; // e.g., "Mar 2024"
  totalAmountDue: number; // Amount due after applying carryover credit
  defaultAmountForMonth?: number; // The default amount that was set when this month was created
  carryOverCredit?: number; // Credit amount carried over from previous month's overpayment
  overpaymentAmount?: number; // Amount paid over the due amount (carries to next month as credit)
  totalPaid: number;
  status: SettlementStatus;
  installments: number;
  cycleStartDate?: number;
  paymentHistory: PaymentEntry[];
  settledDate?: number;
}

export interface Settlement {
  settlementId: string; // Fixed ID: "settlement_{restaurantId}"
  restaurantId: string;
  restaurantName: string;
  
  // Default amount settings
  defaultSettlementAmount: number; // Current default amount
  defaultSettlementStartDate: number; // Never changes - fixed start date in ms
  
  // Global overpayment tracking
  currentOverpayment: number; // Available credit from overpayments (auto-reduces when applied to next month)
  
  // Month-wise settlements (e.g., { "Feb 2026": {...}, "Mar 2026": {...} })
  // Each month key contains its own period data with payments
  settlements: {
    [monthKey: string]: SettlementPeriod;
  };
  
  // Metadata
  createdAt?: number; // When settlement doc was created
  lastUpdated?: number; // When document was last updated
}

export interface DashboardStats {
  totalRestaurants: number;
  totalTransactions: number;
  totalGrossVolume: number;
  totalPlatformEarnings: number;
  totalGstPayable: number;
}

export interface EarningsByDate {
  date: string;
  earnings: number;
  transactions: number;
}

export interface PaymentMethodSplit {
  method: PaymentMethod;
  count: number;
  amount: number;
}

export interface RestaurantVolume {
  restaurantName: string;
  volume: number;
}
