# Settlement Payment Logic - Implementation Guide

## Overview

The settlement system now implements a monthly payment cycle with automatic overpayment handling and period-based restrictions. Here's how it works:

## Core Concepts

### 1. **Settlement Period**
- Each restaurant has a **current active period** (e.g., "Feb 2026")
- Each period has a **due amount** (set by restaurant owner or default)
- Payments are tracked per period with a **payment history** array

### 2. **Payment States**
- **Pending**: Due amount not yet paid (totalPaid < totalAmountDue)
- **Processing**: Partial payment received (totalPaid > 0 but < totalAmountDue)
- **Paid**: Period fully satisfied (totalPaid >= totalAmountDue)

### 3. **Additional Paid (Overpayment Overflow)**
- When `totalPaid > totalAmountDue`, the excess is stored in `additionalPaid`
- Example: Due = ₹10,000, Paid = ₹20,000 → additionalPaid = ₹10,000
- This amount automatically carries to the next period

---

## Case Examples

### Case 1: Exact Payment
```
Due Amount: ₹10,000
Payment 1: ₹10,000
Result: totalPaid = ₹10,000
Status: PAID
additionalPaid: ₹0
Payment Input: CLOSED ❌
```

### Case 2: Overpayment (Single)
```
Due Amount: ₹10,000
Payment 1: ₹20,000
Result: totalPaid = ₹20,000
Status: PAID
additionalPaid: ₹10,000 (overflow)
Payment Input: CLOSED ❌
```

### Case 3: Multiple Installments → Exact
```
Due Amount: ₹10,000
Payment 1: ₹2,000  → totalPaid = ₹2,000  (Pending)
Payment 2: ₹3,000  → totalPaid = ₹5,000  (Processing)
Payment 3: ₹5,000  → totalPaid = ₹10,000 (Paid)
Status: PAID
additionalPaid: ₹0
Payment Input: CLOSED ❌
```

### Case 4: Multiple Installments → Overpayment
```
Due Amount: ₹10,000
Payment 1: ₹2,000  → totalPaid = ₹2,000  (Processing)
Payment 2: ₹3,000  → totalPaid = ₹5,000  (Processing)
Payment 3: ₹6,000  → totalPaid = ₹11,000 (Paid)
Status: PAID
additionalPaid: ₹1,000 (overflow)
Payment Input: CLOSED ❌
```

### Case 5: Partial Payment (Awaiting More)
```
Due Amount: ₹10,000
Payment 1: ₹5,000
Result: totalPaid = ₹5,000 (still < ₹10,000)
Status: PROCESSING
additionalPaid: ₹0
Payment Input: OPEN ✅ (can add more)
```

---

## Next Period Behavior

### When a new settlement period is created:

1. **Current period is archived** to `settlementHistory`
2. **additionalPaid from previous period** is applied to new period
3. **Status determination**:
   - If `additionalPaid >= newDueAmount` → Period marked as PAID, Payment Input CLOSED ❌
   - If `0 < additionalPaid < newDueAmount` → Period marked as PROCESSING, Payment Input OPEN ✅
   - If `additionalPaid = 0` → Period marked as PENDING, Payment Input OPEN ✅

### Example: Multi-Month Flow

**Month 1:**
```
Due: ₹10,000
Paid: ₹20,000
additionalPaid: ₹10,000
Status: PAID
```

**Month 2 (Automatic):**
```
Auto-Payment: ₹10,000 (from additionalPaid)
Due: ₹10,000
totalPaid: ₹10,000 (auto-applied)
additionalPaid: ₹0 (no overflow)
Status: PAID (auto-closed)
Payment Input: CLOSED ❌
```

**Month 3:**
```
Due: ₹10,000
Paid: ₹0 (no carry-over from Month 2)
additionalPaid: ₹0
Status: PENDING
Payment Input: OPEN ✅ (ready for new payments)
```

---

## Implementation Details

### Store Functions

#### `addPaymentToSettlementById(settlementId, amount)`
```typescript
// Check if period is already fully paid
if (currentPaid >= dueAmount) {
  reject(); // No more payments accepted
}

// Calculate new totals
newTotalPaid = currentPaid + amount;
newAdditionalPaid = Math.max(0, newTotalPaid - dueAmount);

// Set status
status = newTotalPaid >= dueAmount ? 'Paid' : 'Processing';
```

#### `createNextSettlementIfNeeded(restaurantId, intervalMs)`
```typescript
// Archive current period
settlementHistory.push(currentPeriod);

// Get overflow from previous period
carryForwardAmount = settlement.additionalPaid;

// Create new period with auto-payment
newPaymentHistory.push({
  id: auto_pay_id,
  amount: carryForwardAmount,
  isAutoPayment: true,
});

// Calculate new overflow
newAdditionalPaid = Math.max(0, carryForwardAmount - nextDueAmount);

// Determine new status
status = carryForwardAmount >= nextDueAmount ? 'Paid' : 'Processing';
```

### UI Logic

The payment input closure is determined by:
```typescript
const isClosed = totalPaid >= totalAmountDue;
```

When closed, shows:
- If exact payment: "Period closed — Paid"
- If overpaid: "Period closed — Overpaid by ₹{amount}"

The **Additional Paid** section:
- **Only shows** when `additionalPaid > 0`
- **Hidden** when `additionalPaid = 0` (no overflow)
- Color: Green (success) when positive

---

## Key Features

✅ **Period Locking**: Once due amount is reached, no more payments can be added  
✅ **Automatic Overflow**: Overpaid amounts automatically carry to next period  
✅ **Auto-Settlement**: If carry-over covers next period's due, it's auto-paid and locked  
✅ **Payment History**: Each payment tracked with timestamp and auto-payment flag  
✅ **Settlement History**: Past periods archived for audit trail  
✅ **Clear UI Feedback**: Shows when period is closed, overpaid, or accepting payments  

---

## Data Flow

```
Payment Added
    ↓
Check if period already fully paid
    ├─ YES: Reject ❌
    └─ NO: Continue ✓
    ↓
Calculate new totals
    ├─ newTotalPaid = currentPaid + incomingAmount
    ├─ newAdditionalPaid = max(0, newTotalPaid - dueAmount)
    └─ newStatus = (newTotalPaid >= dueAmount) ? 'Paid' : 'Processing'
    ↓
Update currentPeriod
    ├─ paymentHistory.push(newPayment)
    ├─ totalPaid = newTotalPaid
    ├─ status = newStatus
    └─ installments += 1
    ↓
Update settlement
    ├─ additionalPaid = newAdditionalPaid
    └─ Save to Firebase
    ↓
UI reflects closure/opening
    └─ Payment input: OPEN/CLOSED based on isClosed flag
```

---

## Firebase Schema

```
Restaurant/{restaurantId}/Settlement/settlement
├── defaultSettlementAmount: number
├── defaultSettlementStartDate: number (never changes)
├── currentMonthlyAmount: number
├── currentMonthlyPaid: number
├── additionalPaid: number ⭐
├── daysRemaining: number
├── currentPeriod: {
│   ├── period: string (e.g., "Feb 2026")
│   ├── totalAmountDue: number
│   ├── totalPaid: number
│   ├── status: 'Pending' | 'Processing' | 'Paid'
│   ├── installments: number
│   ├── cycleStartDate: number
│   └── paymentHistory: [
│       └── { id, amount, date, isAutoPayment }
│   ]
├── settlementHistory: [ // Past periods
│   └── { period, totalAmountDue, totalPaid, status, paymentHistory }
├── allPaymentsHistory: [ // All payments ever
│   └── { id, amount, date, isAutoPayment }
]
└── lastUpdated: number
```

---

## Testing Notes

- Settlement cycle is set to **1 minute** for testing (line 32 in RestaurantDetailsPage.tsx)
- Change to `30 * 24 * 60 * 60 * 1000` (30 days) in production
- Period check interval: **5 minutes** (can be adjusted)

---

## Summary

The system now:
1. ✅ Locks payment input when period due amount is reached
2. ✅ Tracks overpaid amounts in `additionalPaid`
3. ✅ Automatically applies overpaid amounts to next period
4. ✅ Auto-locks periods that are pre-paid by overpayment
5. ✅ Provides clear UI feedback on payment status
6. ✅ Maintains complete payment audit trail
