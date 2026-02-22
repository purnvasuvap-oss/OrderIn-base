# Firebase Database Structure for Settlements

## Collection Hierarchy

```
Firestore Root
├── Restaurant/                          # Main restaurant documents
│   ├── {restaurantId}
│   │   ├── Main Restaurant Fields:
│   │   │   ├── Restaurant_name: string
│   │   │   ├── code: string
│   │   │   ├── city: string
│   │   │   ├── status: 'Active' | 'Inactive' | 'Suspended'
│   │   │   ├── email: string
│   │   │   ├── address: string
│   │   │   ├── account: string (Bank account)
│   │   │   ├── IFSC: string
│   │   │   ├── Owner: string
│   │   │   └── Owner_Contact: string
│   │   │
│   │   └── Settlement (Single Document)          # ONE settlement record per restaurant
│   │       ├── settlementId: string              # Fixed unique ID (e.g., "settlement_rest123")
│   │       ├── restaurantId: string
│   │       ├── restaurantName: string
│   │       ├── defaultSettlementAmount: number   # Current default amount
│   │       ├── defaultSettlementStartDate: number (Timestamp when first set, never changes)
│   │       ├── currentMonthlyAmount: number      # Due amount for current cycle
│   │       ├── currentMonthlyPaid: number        # Total paid in current cycle
│   │       ├── additionalPaid: number            # Overpaid amount awaiting consumption
│   │       ├── daysRemaining: number             # Days left in 30-day cycle
│   │       ├── createdAt: Timestamp              # When settlement doc created
│   │       ├── lastUpdated: Timestamp
│   │       │
│   │       ├── currentPeriod: Object             # Current settlement period data
│   │       │   ├── period: string (e.g., "Mar 2024")
│   │       │   ├── totalAmountDue: number
│   │       │   ├── totalPaid: number
│   │       │   ├── status: 'Pending' | 'Processing' | 'Paid'
│   │       │   ├── installments: number
│   │       │   ├── cycleStartDate: number (Timestamp when current cycle started)
│   │       │   └── paymentHistory: Array of PaymentEntry
│   │       │       └── Each entry:
│   │       │           ├── id: string
│   │       │           ├── amount: number
│   │       │           ├── date: Timestamp
│   │       │           └── isAutoPayment: boolean
│   │       │
│   │       ├── settlementHistory: Array         # Past periods data (read-only archive)
│   │       │   └── Each entry:
│   │       │       ├── period: string (e.g., "Feb 2024")
│   │       │       ├── totalAmountDue: number
│   │       │       ├── totalPaid: number
│   │       │       ├── status: 'Pending' | 'Processing' | 'Paid'
│   │       │       ├── installments: number
│   │       │       ├── paymentHistory: Array of PaymentEntry
│   │       │       └── settledDate: Timestamp
│   │       │
│   │       ├── allPaymentsHistory: Array        # Complete payment history across all time
│   │       │   └── Each entry:
│   │       │       ├── id: string
│   │       │       ├── amount: number
│   │       │       ├── date: Timestamp
│   │       │       ├── period: string
│   │       │       └── isAutoPayment: boolean
│   │       │
│   │       └── pending: Array (For future pending entries if needed)
```

## Sample Data

### Restaurant Document
```json
{
  "Restaurant_name": "Paneer Place",
  "code": "PAN-001",
  "city": "Mumbai",
  "status": "Active",
  "email": "owner@paneerplace.com",
  "address": "123 Main St, Mumbai",
  "account": "1234567890",
  "IFSC": "HDFC0001234",
  "Owner": "John Doe",
  "Owner_Contact": "9876543210"
}
```

### Settlement Document (Single Document Per Restaurant)
```json
{
  "settlementId": "settlement_rest123",
  "restaurantId": "rest123",
  "restaurantName": "Paneer Place",
  "defaultSettlementAmount": 50000,
  "defaultSettlementStartDate": 1707158400000,
  "currentMonthlyAmount": 50000,
  "currentMonthlyPaid": 50900,
  "additionalPaid": 900,
  "daysRemaining": 15,
  "createdAt": "2024-01-15T10:00:00Z",
  "lastUpdated": "2024-03-08T14:30:00Z",
  
  "currentPeriod": {
    "period": "Mar 2024",
    "totalAmountDue": 50000,
    "totalPaid": 50900,
    "status": "Processing",
    "installments": 2,
    "cycleStartDate": 1707158400000,
    "paymentHistory": [
      {
        "id": "pay_001",
        "amount": 25000,
        "date": 1707244800000,
        "isAutoPayment": false
      },
      {
        "id": "pay_002",
        "amount": 25900,
        "date": 1707330900000,
        "isAutoPayment": false
      }
    ]
  },
  
  "settlementHistory": [
    {
      "period": "Feb 2024",
      "totalAmountDue": 50000,
      "totalPaid": 50000,
      "status": "Paid",
      "installments": 2,
      "settledDate": 1704566400000,
      "paymentHistory": [
        {
          "id": "pay_hist_001",
          "amount": 900,
          "date": 1704480000000,
          "isAutoPayment": true
        },
        {
          "id": "pay_hist_002",
          "amount": 49100,
          "date": 1704566400000,
          "isAutoPayment": false
        }
      ]
    },
    {
      "period": "Jan 2024",
      "totalAmountDue": 50000,
      "totalPaid": 50000,
      "status": "Paid",
      "installments": 1,
      "settledDate": 1702000800000,
      "paymentHistory": [
        {
          "id": "pay_hist_003",
          "amount": 50000,
          "date": 1702000800000,
          "isAutoPayment": false
        }
      ]
    }
  ],
  
  "allPaymentsHistory": [
    {
      "id": "pay_001",
      "amount": 25000,
      "date": 1707244800000,
      "period": "Mar 2024",
      "isAutoPayment": false
    },
    {
      "id": "pay_002",
      "amount": 25900,
      "date": 1707330900000,
      "period": "Mar 2024",
      "isAutoPayment": false
    },
    {
      "id": "pay_hist_001",
      "amount": 900,
      "date": 1704480000000,
      "period": "Feb 2024",
      "isAutoPayment": true
    },
    {
      "id": "pay_hist_002",
      "amount": 49100,
      "date": 1704566400000,
      "period": "Feb 2024",
      "isAutoPayment": false
    },
    {
      "id": "pay_hist_003",
      "amount": 50000,
      "date": 1702000800000,
      "period": "Jan 2024",
      "isAutoPayment": false
    }
  ],
  
  "pending": []
}
```

## How Data is Persisted

### 1. Default Settlement Amount
**Triggered by**: User clicks "Set" button to set monthly default amount  
**Location**: `Restaurant/{restaurantId}/Settlement`  
**Fields updated**:
- `defaultSettlementAmount`: The amount user sets
- `defaultSettlementStartDate`: Current timestamp (only on first set, NEVER changes)
- `lastUpdated`: Current timestamp (on every update)

```typescript
// Firebase update
await updateDoc(settRef, {
  defaultSettlementAmount: amount,
  defaultSettlementStartDate: startDate,  // Only set on first time
  lastUpdated: Date.now(),
});
```

### 2. Payment Application (Current Period)
**Triggered by**: User adds payment amount and clicks "Add"  
**Location**: `Restaurant/{restaurantId}/Settlement`  
**Fields updated**:
- `currentPeriod.paymentHistory`: New payment entry appended
- `currentMonthlyPaid`: Total paid in current cycle
- `currentPeriod.status`: Updated based on total paid vs due
- `currentPeriod.installments`: Incremented count
- `additionalPaid`: Recalculated as `totalPaid - totalDue`
- `allPaymentsHistory`: Payment appended to complete history
- `lastUpdated`: Current timestamp

```typescript
// Firebase update
await updateDoc(settRef, {
  'currentPeriod.paymentHistory': newPaymentHistory,
  'currentPeriod.status': newStatus,
  'currentPeriod.installments': newInstallments,
  currentMonthlyPaid: newTotalPaid,
  additionalPaid: newAdditionalPaid,
  allPaymentsHistory: updatedAllPayments,
  lastUpdated: Date.now(),
});
```

### 3. 30-Day Cycle Complete (Auto-create Next Period)
**Triggered by**: 30 days (or 1 minute in test) since `defaultSettlementStartDate`  
**Location**: `Restaurant/{restaurantId}/Settlement`  
**Action**:
1. Move `currentPeriod` data to `settlementHistory` array (append)
2. Create new `currentPeriod` with fresh data for new cycle
3. If overpaid: add auto-payment entry to new period's paymentHistory
4. Reset `additionalPaid` if it was carried forward

```typescript
// Firebase update
await updateDoc(settRef, {
  settlementHistory: arrayUnion(previousPeriod),
  currentPeriod: newPeriod,
  currentMonthlyAmount: defaultAmount,
  currentMonthlyPaid: carryForwardAmount,  // If overpaid
  additionalPaid: carryForwardAmount,      // If overpaid
  daysRemaining: 30,
  lastUpdated: Date.now(),
});
```

## API Endpoint Structure (Ready to Implement)

Once backend is created, these endpoints will query the single Settlement document:

```
GET /Restaurant/{id}/settlement
  ├── Returns: Single Settlement object (not array)
  ├── Contains: currentPeriod + settlementHistory + allPaymentsHistory
  ├── All fields populated: defaultAmount, additionalPaid, installments, daysRemaining
  └── Example: GET /Restaurant/rest123/settlement

POST /Restaurant/{id}/settlement/payment
  ├── Body: { amount: number }
  ├── Action: Appends payment to currentPeriod.paymentHistory
  ├── Updates: currentMonthlyPaid, status, installments, additionalPaid
  └── Returns: Updated Settlement object

PUT /Restaurant/{id}/settlement/defaultAmount
  ├── Body: { amount: number }
  ├── Action: Sets defaultSettlementAmount (ONLY if not set before)
  ├── Auto-creates: Settlement document if doesn't exist
  └── Returns: { success: boolean, startDate: number }

GET /Restaurant/{id}/settlement/history
  ├── Returns: Array of past settlements from settlementHistory
  ├── Useful for: Historical reports, past payment records
  └── Each item contains: period, payments, status, settled date

GET /Restaurant/{id}/settlement/allPayments
  ├── Returns: Array of ALL payments across all time
  ├── Includes: payment amount, date, period, isAutoPayment flag
  └── Useful for: Complete transaction ledger
```

## Key Features

✅ **Single Document Per Restaurant**: No collection explosion, clean structure  
✅ **Fixed Settlement ID**: Never changes, always `settlement_{restaurantId}`  
✅ **30-Day Cycle Tracking**: `defaultSettlementStartDate` never changes, cycles based on it  
✅ **Days Remaining Calculation**: Dynamically calculated as `30 - daysSinceStart`  
✅ **Current + Historical Data**: `currentPeriod` + `settlementHistory` array  
✅ **Complete Payment Ledger**: `allPaymentsHistory` maintains all transactions  
✅ **Overpayment Tracking**: `additionalPaid` field shows surplus amount  
✅ **Auto-Carry Forward**: Surplus becomes first payment of next period (marked as autoPayment)  
✅ **Payment Installments**: `installments` field tracks number of payment entries  
✅ **Automatic Cycle Management**: Auto-archives current period and starts new one at 30-day mark  

## Testing Checklist

- [ ] Set default amount → Check Firebase `Restaurant/{id}/Settlement` has `defaultSettlementAmount` and `defaultSettlementStartDate` (never changes)
- [ ] Add payment → Check `currentPeriod.paymentHistory` updated, `currentMonthlyPaid` updated, `installments` incremented
- [ ] Wait for 30 days (or 1 minute in test mode) → Check `currentPeriod` moved to `settlementHistory` array
- [ ] Check overpayment → Verify new `currentPeriod` starts with auto-payment of `additionalPaid` amount
- [ ] Load restaurant → Confirm single settlement document loaded with all periods visible
- [ ] Calculate `daysRemaining` → Verify correct days remaining from original start date

## Migration Notes

If migrating from old multiple-settlement structure:

```typescript
// Old: Multiple documents
Restaurant/
  └── rest123/
      └── Settlements/
          ├── sett_xxx_1707244800000/
          ├── sett_xxx_1707849600000/
          └── sett_xxx_1708454400000/

// New: Single document
Restaurant/
  └── rest123/
      └── Settlement/
          └── Unified document with all periods
```

The consolidation ensures:
- Faster queries (one document read instead of many)
- Cleaner data structure
- Easier to maintain settlement state
- No duplicate default amount data


