# Settlement Refactoring Summary - Single Document Per Restaurant

## ✅ Completed Changes

### 1. Type Definitions Updated (`src/types/index.ts`)
- **Old Model**: Multiple settlement documents (one per month/period)
- **New Model**: Single settlement document per restaurant with internal period tracking

**New Types**:
```typescript
interface SettlementPeriod {
  period: string;
  totalAmountDue: number;
  totalPaid: number;
  status: SettlementStatus;
  installments: number;
  cycleStartDate?: number;
  paymentHistory: PaymentEntry[];
  settledDate?: number;
}

interface Settlement {
  settlementId: string;           // Fixed: "settlement_{restaurantId}"
  restaurantId: string;
  restaurantName: string;
  
  // Default amount settings
  defaultSettlementAmount: number;      // Current default
  defaultSettlementStartDate: number;   // NEVER CHANGES after first set
  
  // Current cycle
  currentMonthlyAmount: number;
  currentMonthlyPaid: number;
  additionalPaid: number;
  daysRemaining: number;
  
  // Data structure
  currentPeriod: SettlementPeriod;
  settlementHistory: SettlementPeriod[];
  allPaymentsHistory: PaymentEntry[];
  
  createdAt?: number;
  lastUpdated?: number;
}
```

### 2. Mock Data Updated (`src/mock/index.ts`)
- Converted all mock settlements to new single-document structure
- Each mock settlement now has:
  - Fixed `settlementId`
  - `currentPeriod` with payment history
  - `settlementHistory` array for past periods
  - `allPaymentsHistory` array for complete ledger

### 3. Store Functions Updated (`src/store/index.ts`)

#### `getSettlementsByRestaurant()`
- Now returns array with single settlement per restaurant (for UI compatibility)
- Previously: Multiple documents per restaurant
- Now: One document containing all period data

#### `setDefaultSettlementAmount()`
- Updates settlement document directly instead of separate tracking
- `defaultSettlementStartDate` NEVER changes after first set (immutable)
- Saves to Firebase: `Restaurant/{restaurantId}/Settlement`

#### `addPaymentToSettlementById()`
- Takes restaurantId (not settlement document ID)
- Updates `currentPeriod.paymentHistory`
- Recalculates `currentMonthlyPaid`, `additionalPaid`, `installments`
- Appends to `allPaymentsHistory` for complete ledger
- Saves to Firebase with dot notation: `currentPeriod.paymentHistory`, etc.

#### `ensureMonthlySettlement()`
- Creates single settlement document if missing
- No longer creates multiple documents
- Creates minimal settlement with empty current period

#### `createNextSettlementIfNeeded()`
- Archives `currentPeriod` to `settlementHistory`
- Creates new `currentPeriod` for next cycle
- If overpaid: adds auto-payment entry (marked with `isAutoPayment: true`)
- Resets `daysRemaining` to 30
- Saves entire settlement document to Firebase

## 📝 Remaining Work

### 1. Update RestaurantDetailsPage (`src/pages/RestaurantDetailsPage.tsx`)
**Changes needed**:
- Remove usage of `getDefaultSettlementAmount()` - now use `settlement.defaultSettlementAmount`
- Update `addPaymentToSettlementById()` calls to pass `restaurantId` instead of settlement ID
- Update settlement rendering to show `currentPeriod` + `settlementHistory`
- Remove logic that handles multiple settlement documents
- Update payment history rendering to check `allPaymentsHistory`
- Simplify to show ONE settlement per restaurant

**Key changes**:
```typescript
// OLD
const settlements = getSettlementsByRestaurant(restaurantId);
settlements.map((s) => /* render each as separate document */)

// NEW
const settlements = getSettlementsByRestaurant(restaurantId);
const settlement = settlements[0]; // Only one per restaurant
// Render settlement.currentPeriod as main
// Show settlement.settlementHistory in archived section
```

### 2. Update SettlementsPage (`src/pages/SettlementsPage.tsx`)
**Changes needed**:
- Update to show only one settlement per restaurant (not multiple)
- Display `currentPeriod` data in main table
- Option to expand and view `settlementHistory`
- Update columns to match new structure

### 3. Firebase Collection Structure
**Update**: `Restaurant/{restaurantId}/Settlement` (singular)
- NOT: `Restaurant/{restaurantId}/Settlements/` (plural with subcollection)
- Single document contains ALL period data
- Cleaner structure, faster reads

### 4. Payment Entry Updates
**Changes**:
- Add `isAutoPayment` flag to identify auto-carried-forward payments
- Update rendering to highlight auto-payments in UI

## Firebase Path Reference

### Old Structure
```
Restaurant/
└── {restaurantId}/
    ├── defaultSettlementAmount (on restaurant doc)
    ├── defaultSettlementStartDate (on restaurant doc)
    └── Settlements/ (collection)
        ├── sett_xxx_timestamp1/
        ├── sett_xxx_timestamp2/
        └── sett_xxx_timestamp3/
```

### New Structure
```
Restaurant/
└── {restaurantId}/
    └── Settlement/ (single document)
        ├── settlementId: "settlement_rest123"
        ├── defaultSettlementAmount: 5000
        ├── defaultSettlementStartDate: 1707158400000
        ├── currentPeriod: { period, payments, etc }
        ├── settlementHistory: [{ period1 }, { period2 }]
        └── allPaymentsHistory: [all payments ever]
```

## Testing Checklist

### Current Status
- ✅ Type system updated
- ✅ Mock data converted
- ✅ Store functions refactored
- ⏳ UI components need updates
- ⏳ Firebase paths need verification

### Next Steps
1. [ ] Update RestaurantDetailsPage to render single settlement per restaurant
2. [ ] Update SettlementsPage table structure
3. [ ] Test payment addition with new structure
4. [ ] Test 30-day cycle completion and auto-archive
5. [ ] Verify Firebase paths and persistence
6. [ ] Test loading existing settlements from Firebase

## Key Benefits of New Structure

✅ **No Document Explosion**: One document per restaurant instead of many  
✅ **Fixed ID**: `settlementId` never changes - easier to reference  
✅ **Complete History**: All periods stored in one document  
✅ **Faster Queries**: One read instead of multiple documents  
✅ **Cleaner Code**: Single settlement object to manage  
✅ **Better Organization**: Related data grouped together  

## Code Examples

### Setting Default Amount
```typescript
// Store handles the update
setDefaultSettlementAmount(restaurantId, 5000);

// Internally:
// 1. Finds settlement for restaurantId
// 2. Sets defaultSettlementAmount: 5000
// 3. Sets defaultSettlementStartDate: Date.now() (only if first time)
// 4. Saves to Firebase: Restaurant/{restaurantId}/Settlement
```

### Adding Payment
```typescript
// Note: Pass restaurantId not settlementId
addPaymentToSettlementById(restaurantId, 5000);

// Internally:
// 1. Finds settlement by restaurantId
// 2. Adds payment to currentPeriod.paymentHistory
// 3. Updates currentMonthlyPaid = totalPaid
// 4. Recalculates additionalPaid
// 5. Appends to allPaymentsHistory
// 6. Saves to Firebase with dot notation
```

### Auto-cycle to Next Period
```typescript
// Called periodically
createNextSettlementIfNeeded(restaurantId, SETTLEMENT_INTERVAL_MS);

// Internally:
// 1. Checks if defaultSettlementStartDate + intervalMs has passed
// 2. Moves currentPeriod to settlementHistory
// 3. Creates new currentPeriod with fresh data
// 4. If additionalPaid > 0: creates auto-payment entry
// 5. Saves entire settlement document to Firebase
```
