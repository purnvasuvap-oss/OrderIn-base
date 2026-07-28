import type { Restaurant, Transaction, Settlement } from '../types';

const restaurantNames = [
  'The Golden Fork', 'Spice Route', 'Urban Bites', 'Pizza Palace',
  'Curry House', 'Sushi Delight', 'Burger Barn', 'Taco Fiesta',
  'Café Mumbai', 'Dragon Dynasty', 'Pasta Perfetto', 'Biryani Express',
  'Taj Mahal', 'Neptune Seafood', 'Kebab King', 'The Dosa House',
];

const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata', 'Jaipur'];

const paymentMethods = ['UPI', 'Card', 'Cash', 'Net Banking', 'Wallet'] as const;

export const mockRestaurants: Restaurant[] = restaurantNames.map((name, idx) => {
  const status = idx % 10 === 0 ? 'Inactive' : idx % 7 === 0 ? 'Suspended' : 'Active';
  const inactiveTimestamp = status === 'Inactive' ? Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000) : undefined; // Random timestamp within last 30 days for inactive restaurants
  
  return {
    id: `rest_${idx + 1}`,
    code: `R${String(idx + 1).padStart(3, '0')}`,
    Restaurant_name: name,
    city: cities[idx % cities.length],
    status: status as any,
    totalOrders: Math.floor(Math.random() * 5000) + 500,
    totalVolume: Math.floor(Math.random() * 500000) + 50000,
    earnings: Math.floor(Math.random() * 100000) + 10000,
    Owner: `Owner ${idx + 1}`,
    Owner_Contact: `+91${Math.floor(Math.random() * 9000000000) + 1000000000}`,
    email: `owner${idx + 1}@restaurant.com`,
    address: `${idx + 1} Main Street, ${cities[idx % cities.length]}`,
    account: `ACC${String(idx + 1).padStart(8, '0')}`,
    IFSC: `IFSC${String(idx + 1).padStart(4, '0')}`,
    joinDate: new Date(2023 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
    inactiveTimestamp,
  };
});

const generateTransactions = (): Transaction[] => {
  const transactions: Transaction[] = [];
  for (let i = 0; i < 250; i++) {
    const restaurantId = mockRestaurants[Math.floor(Math.random() * mockRestaurants.length)].id;
    const grossAmount = Math.floor(Math.random() * 10000) + 100;
    const platformFeePct = 0.05; // 5% platform fee
    const platformFee = Math.floor(grossAmount * platformFeePct);
    const razorpayFee = Math.floor(platformFee * 0.2);
    const gst = Math.floor(platformFee * 0.18);
    const netPlatformEarnings = platformFee - razorpayFee - gst;
    const restaurantReceivable = grossAmount - platformFee;

    const statuses = ['Paid', 'Paid', 'Paid', 'Paid', 'Failed', 'Refunded'] as const;
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    const daysAgo = Math.floor(Math.random() * 90);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

    transactions.push({
      id: `txn_${i + 1}`,
      restaurantId,
      orderId: `ORD${String(i + 1).padStart(6, '0')}`,
      customerId: `cust_${Math.floor(Math.random() * 100000)}`,
      paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
      grossAmount,
      restaurantReceivable,
      platformFee,
      razorpayFee,
      gst,
      netPlatformEarnings,
      status: status as 'Paid' | 'Failed' | 'Refunded',
      createdAt: date,
      referenceId: `ref_${Math.random().toString(36).substr(2, 9)}`,
    });
  }
  return transactions;
};

export const mockTransactions = generateTransactions();

export const mockSettlements: Settlement[] = mockRestaurants.map((rest, idx) => {
  const totalDue = Math.floor(Math.random() * 50000) + 10000;
  const paid1 = Math.floor(totalDue * 0.4);
  const paid2 = Math.floor(totalDue * 0.25);
  const totalPaid = paid1 + paid2;
  const startDate = Date.now() - 15 * 24 * 60 * 60 * 1000; // 15 days ago
  
  const currentPeriod = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
  
  return {
    settlementId: `settlement_${rest.id}`, // Fixed ID
    restaurantId: rest.id,
    restaurantName: rest.Restaurant_name,
    
    // Default amount settings
    defaultSettlementAmount: totalDue,
    defaultSettlementStartDate: startDate,
    currentOverpayment: 0, // Initialize global overpayment
    
    // Month-wise settlements
    settlements: {
      [currentPeriod]: {
        period: currentPeriod,
        totalAmountDue: totalDue,
        defaultAmountForMonth: totalDue,
        totalPaid: totalPaid,
        status: totalPaid >= totalDue ? 'Paid' : totalPaid > 0 ? 'Processing' : 'Pending',
        installments: 2,
        cycleStartDate: startDate,
        paymentHistory: [
          {
            id: `pay_${idx}_1`,
            amount: paid1,
            date: Date.now() - 2 * 24 * 60 * 60 * 1000,
            timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
            isAutoPayment: false,
          },
          {
            id: `pay_${idx}_2`,
            amount: paid2,
            date: Date.now() - 1 * 24 * 60 * 60 * 1000,
            timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
            isAutoPayment: false,
          },
        ],
        settledDate: totalPaid >= totalDue ? Date.now() - 1 * 24 * 60 * 60 * 1000 : undefined,
      },
      'Jan 2026': {
        period: 'Jan 2026',
        totalAmountDue: totalDue,
        defaultAmountForMonth: totalDue,
        totalPaid: totalDue,
        status: 'Paid',
        installments: 1,
        cycleStartDate: Date.now() - 45 * 24 * 60 * 60 * 1000,
        paymentHistory: [
          {
            id: `pay_hist_${idx}_1`,
            amount: totalDue,
            date: Date.now() - 30 * 24 * 60 * 60 * 1000,
            timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
            isAutoPayment: false,
          },
        ],
        settledDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      },
    },
    
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };
});
