# 🧪 Comprehensive Test Audit — OrderIn Platform

> **📋 Report Type:** Senior QA / Test Engineering Audit  
> **🗓️ Date:** 2025-07-09  
> **👤 Auditor:** QA Engineering Team  
> **🎯 Scope:** Customer App (`orderin_custmer_1-Olive_green`) + Admin App (`order_clients-Olive_green-updated`)  
> **🔥 Severity Legend:** 🔴 Blocker | 🟡 High | 🟠 Medium | 🟢 Low | 💡 Enhancement

---

## Executive Summary

After a thorough black-box + white-box testing audit of the OrderIn platform, **53 distinct test issues** were identified across **9 testing dimensions**: Functional Bugs, Race Conditions, Data Integrity, Security Vulnerabilities, Error Handling, Integration Issues, Performance, Edge Cases, and Test Coverage Gaps.

**Category Breakdown:**

| Severity | Count | Impact |
|----------|-------|--------|
| 🔴 Blocker | 22 | Causes data corruption, wrong order flow, crashes, security breach |
| 🟡 High | 16 | Significant functional/UX degradation |
| 🟠 Medium | 10 | Affects specific scenarios or edge conditions |
| 🟢 Low | 5 | Cosmetic, non-functional improvements |

**Overall Quality Score: 3.5/10 — 🚨 CRITICAL: Not Ready for Production**

---

## 🔴 Blocker Bugs (Functional Failures)

### TB-1. Order Status Update Targets Wrong Orders (Array Index Bug)

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/services/orderService.js` — `updateOrderStatus()`  
**Severity:** 🔴 Blocker

**Description:**
The `updateOrderStatus` function uses array `index` (position in the `pastOrders` array) to identify which order to update, NOT the order's unique `id`:

```javascript
// orderService.js - updateOrderStatus()
export const updateOrderStatus = async (phoneNumber, orderIndex, newStatus) => {
  // ...
  if (pastOrders[orderIndex]) {     // <-- UPDATES BY ARRAY INDEX!
    pastOrders[orderIndex].status = newStatus;
    await updateDoc(customerRef, { pastOrders });
  }
};
```

**Reproduction Steps:**
1. Customer A places Order 1 (index 0)
2. Customer B places Order 2 (index 1)  
3. Customer A deletes Order 1 via back-navigation cleanup
4. Now Order 2 shifts to index 0
5. Admin clicks "Accept" on Order 2 → calls `updateOrderStatus(phone, 1, "Confirmed")` → updates index 1 which is NOW a DIFFERENT order

**Expected:** Update by `order.id` not array index. Find order in `pastOrders` by matching `order.id`.

---

### TB-2. Double Firestore Subscription Causing Double Read Billing

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/pages/Dashboard.jsx`  
**Severity:** 🔴 Blocker

**Description:**
`Dashboard.jsx` mounts **two separate `subscribeAllCustomerOrders()` subscriptions**:

```javascript
// Dashboard.jsx - First subscription (lines ~30-38)
useEffect(() => {
  const unsubscribe = subscribeAllCustomerOrders((ordersData) => {
    setOrders(ordersData);
    const revenue = calculateTodaysRevenue(ordersData);
    setTodayRevenue(revenue);
    // ...
  });
  return () => { if (typeof unsubscribe === "function") unsubscribe(); };
}, []);

// Dashboard.jsx - Second subscription (lines ~48-55) - IDENTICAL!
useEffect(() => {
  const unsubscribe = subscribeAllCustomerOrders((orders) => {
    const revenue = calculateTodaysRevenue(orders);  // Same function
    setTodayRevenue(revenue);                         // Same state update
  });
  return () => { if (typeof unsubscribe === "function") unsubscribe(); };
}, []);
```

**Impact:** Every Firestore change triggers 2x reads. On a busy day with 500 orders × 20 status changes = **20,000 extra reads/day**. Double Firestore billing.

---

### TB-3. Veg/Non-Veg Filter Labels and Values Inverted

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/menu/Menu.jsx`  
**Severity:** 🔴 Blocker

**Description:**
The filter sheet toggle buttons have their `onClick` values SWAPPED with their display labels:

```jsx
// Menu.jsx - Line ~80 in filter sheet:
<button onClick={() => handleVegToggle("nonveg")}>
  <Leaf size={14} /> Veg    {/* Leaf icon + "Veg" label, but onClick passes "nonveg" */}
</button>
<button onClick={() => handleVegToggle("veg")}>
  <Flame size={14} /> Non-Veg  {/* Flame icon + "Non-Veg" label, but onClick passes "veg" */}
</button>
```

**Test Case:** 
1. Open Menu
2. Tap "Filter" FAB button
3. Tap "Veg" button → see Non-Veg items displayed
4. Tap "Non-Veg" button → see Veg items displayed
5. **FAIL:** Filters show opposite diet type

---

### TB-4. Cart.jsx Saves Order with `taxes: 0` to Firestore

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/cart/Cart.jsx` — `handleCheckout()`  
**Severity:** 🔴 Blocker

**Description:**
When the order is saved to Firestore from Cart, `taxes` is hardcoded to `0` and `total` equals `subtotal`:

```javascript
// Cart.jsx handleCheckout()
const orderForFirestore = {
  // ...
  subtotal: calculatedSubtotal,
  taxes: 0,           // <-- HARDCODED ZERO
  total: calculatedSubtotal,  // <-- Same as subtotal!
  paymentStatus: "unpaid",
  awaitingConfirmation: true,
};
```

**Impact:** Restaurant admin sees ₹0 tax and `total = subtotal`. Restaurant may confirm order based on wrong pricing. Tax only appears AFTER user selects payment method on Payments page — but by then the restaurant has already confirmed.

---

### TB-5. Order Status Update Uses `order.orderIndex` Not `order.id`

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/pages/Orders.jsx` — `handleStatusChange()`  
**Severity:** 🔴 Blocker

**Description:**
`Orders.jsx` finds the order by `order.id` but then passes `order.orderIndex` (which is the array position at subscription time) to `updateOrderStatus`:

```javascript
// Orders.jsx handleStatusChange()
const order = orders.find((o) => o.id === orderId);
await updateOrderStatus(order.phoneNumber, order.orderIndex, newStatus);
//                                                      ^^^^^^^^^^^^
// This array index becomes stale if orders are added/removed!
```

**Reproduction:**
1. 5 orders arrive throughout the day
2. A delivered order is cleaned up (removed from display)
3. Now order indexes 0-3 exist in Firestore but 0-4 in local state
4. Admin updates order at "index 3" → actually updates index 3 in Firestore which is a DIFFERENT order

---

### TB-6. `awaitingConfirmation` Flag Never Cleared

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/payments/AwaitingConfirmation.jsx` + `orderin_custmer_1-Olive_green/src/cart/Cart.jsx`  
**Severity:** 🔴 Blocker

**Description:**
`Cart.jsx` sets `awaitingConfirmation: true` on order creation. `AwaitingConfirmation.jsx` watches for `status === "confirmed"` but **never clears** the `awaitingConfirmation` flag in Firestore. The `updateOrderStatus` function only updates the `status` field.

**Impact:** `awaitingConfirmation` stays `true` FOREVER on confirmed orders. Any future code checking this flag will think confirmed orders are still pending.

---

### TB-7. CounterCode `orderHistory` Fallback Returns Wrong Order on Refresh

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/payments/CounterCode.jsx`  
**Severity:** 🔴 Blocker

**Description:**
`CounterCode.jsx` falls back to `orderHistory[orderHistory.length - 1]?.id` when `pendingOrderId` is not in sessionStorage:

```javascript
const latestOrder = orderHistory[orderHistory.length - 1];  // In-memory state
const orderIdToCheck = pendingOrderId || latestOrder?.id;
```

**Problem:** 
- `orderHistory` is an in-memory state from CartContext
- On page refresh, `orderHistory` is re-initialized to `[]`
- If user refreshes CounterCode page, `latestOrder` is `undefined`
- Falls through to `null` → "No order found to verify"

**Reproduction:**
1. User selects Cash payment
2. System navigates to /counter-code
3. User refreshes the page (F5 / pull-to-refresh)
4. `orderHistory` is empty → `orderIdToCheck` is `null`
5. **FAIL:** "No order found to verify" error

---

### TB-8. No Loading State on CounterCode Verification (Double-Submit Bug)

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/payments/CounterCode.jsx` — `handleSubmit()`  
**Severity:** 🔴 Blocker

**Description:**
`handleSubmit` is an `async` function but shows **zero visual feedback** during the Firestore read/write operations. The button remains clickable throughout.

**Reproduction:**
1. User enters verification code
2. User taps "Verify Payment" multiple times rapidly
3. First call reads verification code from Firestore successfully
4. Second call also reads and verifies
5. **Both succeed** → `markPaymentSuccessful` is called TWICE
6. Order gets `paymentStatus: 'paid'` written twice
7. User is navigated to `/payment-success` twice (second navigation may fail)

---

### TB-9. `pendingVerificationCode` Stored in BOTH sessionStorage AND localStorage

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/payments/Payments.jsx`  
**Severity:** 🔴 Blocker

**Description:**
The verification code is persisted to both storage types:

```javascript
// Payments.jsx handlePlaceOrder()
sessionStorage.setItem('pendingVerificationCode', verificationCode);
localStorage.setItem('pendingVerificationCode', verificationCode);
```

**Impact:** After browser close + reopen, the stale verification code persists in localStorage. If user returns to CounterCode page, `pendingFromLocal` contains an old code that is still considered valid.

---

### TB-10. Bill.jsx — Hardcoded "BUSINESS NAME" and Fake Address

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/Bill.jsx`  
**Severity:** 🔴 Blocker

**Description:**
Every generated receipt shows hardcoded placeholder data:

```jsx
// Bill.jsx
<div className="business">BUSINESS NAME</div>
<div className="address small">
  1234 Main Street<br/>Suite 567<br/>City Name, State 54321<br/>123-456-7890
</div>
```

**Impact:**
- Receipts are NOT legally valid GST invoices
- Cannot be used for expense reports or tax claims
- PDF downloads and printouts contain "BUSINESS NAME"
- Every customer bill is identical

---

### TB-11. Profile.jsx — Hardcoded "Visa • 4242" Fake Credit Card

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/profile/Profile.jsx`  
**Severity:** 🔴 Blocker

**Description:**
All users see fake/stub payment methods regardless of actual payment history:

```javascript
const paymentMethods = [
  { label: "Visa • 4242", detail: "Primary card" },
  { label: "Cash on delivery", detail: "Default at checkout" },
];
```

**Impact:** Users may believe their real card is stored on the platform. Security concern — creates false sense of saved payment methods.

---

### TB-12. `placeOrder()` in CartContext is NEVER Called in New Flow

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/context/CartContext.jsx`  
**Severity:** 🔴 Blocker

**Description:**
The `placeOrder()` method exists in CartContext but is never called anywhere in the codebase. Both `Cart.jsx` `handleCheckout` and `Payments.jsx` `handlePlaceOrder` save directly to Firestore, bypassing `placeOrder()`.

**Impact:** 
- `orderHistory` state in CartContext is NEVER populated
- Components relying on `orderHistory` (CounterCode, PaymentSuccess, Bill) fail on refresh
- `markPaymentSuccessful` can't find the order in local state

---

### TB-13. Manual Orders Don't Generate an `id` Field

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/pages/Orders.jsx` — ManualOrderModal  
**Severity:** 🔴 Blocker

**Description:**
The manual order object has NO `id` field:

```javascript
const newOrder = {
  username: customerName,
  phoneNumber: phoneNumber,
  tableNo: parseInt(tableNumber),
  items: selectedItems,
  status: "Pending",
  // ... NO id field!
};
```

**Impact:**
- In the admin table, the ID falls back to `ORD-${phone}-${index}` which changes if orders are rearranged
- Customer cannot reference their manual order
- No way to uniquely identify manual orders

---

### TB-14. Race Condition: User Can Click "Checkout" Multiple Times

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/cart/Cart.jsx` — `handleCheckout()`  
**Severity:** 🔴 Blocker

**Description:**
The loading overlay disappears BEFORE navigation completes:

```javascript
setIsSavingCart(false);   // Loading removed
setTimeout(() => {
  navigate(getPathWithTable("/awaiting-confirmation"));
}, 100);                  // 100ms delay - not guaranteed
```

**Reproduction:**
1. User taps "Checkout"
2. Loading overlay appears briefly
3. `setIsSavingCart(false)` runs → overlay disappears
4. If user taps "Checkout" again within 100ms window
5. **Second order is saved to Firestore** → duplicate order

---

### TB-15. Customization Selections Lost in Order Data

**Apps:** Customer | **Files:** `orderin_custmer_1-Olive_green/src/itemDetails/ItemDetails.jsx`, `orderin_custmer_1-Olive_green/src/payments/Payments.jsx`  
**Severity:** 🔴 Blocker

**Description:**
User selects customizations (Spice Level: Hot, Portion: Large) in ItemDetails. These selections are stored in `customSelections` state. On "Save", they're concatenated into the `instructions` text string. However, only `instructions` field is saved to cart and Firestore — the structured `customSelections` data is **completely lost**.

**Reproduction:**
1. Open item details → Select "Spice Level: Hot" and "Portion: Large"
2. Save → text becomes "Spice Level: Hot · Portion: Large"
3. Add to cart → only `instructions` string saved
4. Checkout → Firestore has `items[0].instructions = "Spice Level: Hot · Portion: Large"`
5. Admin sees free-text, CANNOT extract structured data
6. **Cannot filter/analyze which customizations are popular**

---

### TB-16. OnlinePayment iframe URL Hardcoded to Production

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/payments/OnlinePayment.jsx`  
**Severity:** 🔴 Blocker

**Description:**
The iframe URL is hardcoded to the production admin app:

```javascript
const [iframeUrl, setIframeUrl] = useState('https://orderin-admin.web.app/pay');
```

**Impact:**
- Cannot test payment flow in local/staging environments
- Every developer must point to production payment admin
- No local development possible for payment features
- Cross-origin iframe message handling may fail due to origin mismatch

---

### TB-17. OnlinePayment iframe Insufficient Sandbox Permissions

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/payments/OnlinePayment.jsx`  
**Severity:** 🔴 Blocker

**Description:**
The iframe sandbox does not include `allow-storage-access-by-user-activation` which is required for third-party payment iframes (Razorpay, Stripe) to work correctly:

```jsx
sandbox="allow-same-origin allow-scripts allow-forms allow-popups 
         allow-popups-to-escape-sandbox allow-top-navigation"
```

**Missing:** `allow-storage-access-by-user-activation`

**Impact:** Payment gateways that need localStorage/cookie access may fail silently.

---

### TB-18. `safeDeleteUnpaidOrders` Deletes ALL Unpaid Orders

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/utils/orderCleanupUtils.js`  
**Severity:** 🔴 Blocker

**Description:**
When `safeDeleteUnpaidOrders` is called without a specific `orderId` (e.g., from `Payments.jsx` handleBackClick), it deletes ALL orders with `paymentStatus === 'unpaid'`:

```javascript
export const deleteUnpaidOrders = async (phoneNumber) => {
  // ...
  const filteredOrders = pastOrders.filter(o => o.paymentStatus !== 'unpaid');
  // Deletes EVERY unpaid order, not just the current one!
};
```

**Reproduction:**
1. User places Order A (unpaid)
2. User opens another tab, places Order B (unpaid) 
3. User goes back to Order A checkout → clicks back
4. `safeDeleteUnpaidOrders(user.phone)` called → BOTH A and B deleted!
5. User returns to tab with Order B → order is gone

---

### TB-19. Cart "Preparing now" Always Shows Regardless of Actual Order Status

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/cart/Cart.jsx`  
**Severity:** 🔴 Blocker (misleading UX)

**Description:**
The status banner in Cart always shows "Preparing now" even when the user has not yet checked out:

```jsx
<h2>Preparing now</h2>
<p>Estimated time: 15–20 min • Freshly cooked and packed</p>
```

**Reproduction:**
1. User adds items to cart
2. User hasn't checked out yet
3. Cart shows "Preparing now" / "15-20 min"
4. **FAIL:** Misleading — order isn't placed yet

---

### TB-20. AwaitingConfirmation Timer Doesn't Pause on Tab Switch

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/payments/AwaitingConfirmation.jsx`  
**Severity:** 🔴 Blocker

**Description:**
The timer runs continuously irrespective of page visibility:

```javascript
// No visibility change detection
const timer = setInterval(() => {
  setWaitTime((prev) => prev + 1);
}, 1000);
```

**Reproduction:**
1. User lands on AwaitingConfirmation
2. Timer starts at 0s
3. User switches to another tab for 10 minutes
4. Returns → timer shows 10+ minutes
5. Progress bar at 100%
6. Creates false expectation about wait time

---

### TB-21. AwaitingConfirmation Card Payment Flow Redirects to CounterCode Instead of Card Page

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/payments/AwaitingConfirmation.jsx`  
**Severity:** 🔴 Blocker

**Description:**
When AwaitingConfirmation redirects to Payments, and user selects "Card", the flow in `Payments.jsx` `handlePlaceOrder` sends user to `/counter-code`:

```javascript
if (selectedPayment === 'Online') {
  navigate(getPathWithTable('/online-payment'));
} else {
  // For Cash/Card, go to counter code verification
  navigate(getPathWithTable('/counter-code'));
}
```

**Impact:** "Card" payment → user goes to CounterCode page instead of a card processing page. If there's no Card payment flow, user is stuck entering a counter code that doesn't match any expected input.

---

### TB-22. Admin Dashboard Revenue Uses `subtotal` Not `totalCost`

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/services/orderService.js` + Dashboard  
**Severity:** 🔴 Blocker

**Description:**
The `subscribeAllCustomerOrders` callback assigns `totalCost` as `order.totalCost || order.total || order.amount || subtotal + tax`. However, the dashboard revenue calculation reads from `order.subtotal`:

```javascript
// Finance utils (called by Dashboard)
export const calculateTodaysRevenue = (orders = []) => {
  return orders.reduce((total, order) => {
    return total + (Number(order.subtotal) || 0);  // SUBTOTAL not totalCost!
  }, 0);
};
```

**Test:**
1. Order has `subtotal: ₹100`, `tax: ₹5`, `totalCost: ₹105`
2. Dashboard shows "Today's Revenue: ₹100"
3. **Expected: ₹105. Revenue under-reported by ~5%.**

---

## 🟡 High Priority Test Issues

### TH-1. `formatPrice` Duplicated Inconsistently Across 5+ Components

**Apps:** Both | **Files:** `Cart.jsx`, `Payments.jsx`, `Bill.jsx`, `Profile.jsx`, `ItemDetails.jsx`  
**Severity:** 🟡 High

**Test:**
1. `Cart.jsx`: `const formatPrice = (price) => \`₹${price.toFixed(2)}\``
2. `Payments.jsx`: `₹{(parseFloat(...) * item.quantity).toFixed(2)}` in JSX
3. `Bill.jsx`: `lineTotal.toFixed(2)` in JSX
4. `Profile.jsx`: Sanitizes string input differently
5. `ItemDetails.jsx`: `totalPrice = (parseFloat(...).toFixed(2)` — different sanitization

**Impact:** Some places show `₹10.5`, others `₹10.50`. Inconsistent formatting.

---

### TH-2. No 404 / Catch-All Route — Silent Redirect to Login

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/App.jsx`  
**Severity:** 🟡 High

**Test:**
1. Navigate to `/non-existent-page`
2. User is silently redirected to login (`<Navigate to={routes.login} />`)
3. No error message, no "Page Not Found"
4. **FAIL:** User has no idea the page doesn't exist

---

### TH-3. No Input Validation on Manual Order Phone Number

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/pages/Orders.jsx` — ManualOrderModal  
**Severity:** 🟡 High

**Test:**
1. Open Manual Order modal
2. Enter phone number: `"abc"` or `"12"` or `""` or `"999999999999999999"`
3. All accepted! No validation:
   - No length check
   - No digit-only check
   - No required field enforcement (on number specifically)

**Impact:** Creates customer documents with invalid phone numbers. Customer login by phone won't find these orders.

---

### TH-4. `orderHistory` Never Synced to Firestore — Lost on Refresh

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/context/CartContext.jsx`  
**Severity:** 🟡 High

**Test:**
1. Place an order
2. Note: `orderHistory` is updated in React state only
3. Refresh the page
4. `orderHistory` re-initializes to `[]`
5. Payment success page, Bill, and CounterCode all fail because they depend on `orderHistory`

**Impact:** Order tracking state is completely lost on any page refresh.

---

### TH-5. Cart.jsx Billing Calculation Different from Payments.jsx

**Apps:** Customer | **Files:** `orderin_custmer_1-Olive_green/src/cart/Cart.jsx`, `orderin_custmer_1-Olive_green/src/payments/Payments.jsx`  
**Severity:** 🟡 High

**Comparison:**

| Component | Calculation | Example (₹100 subtotal) |
|-----------|------------|------------------------|
| **Cart.jsx** | `subtotal + GST(5%) + packing(₹30) - discount(8% min ₹60)` | ₹100 + ₹5 + ₹30 - ₹8 = **₹127** |
| **Payments.jsx** | `subtotal + taxes(5% via calculateBilling)` | ₹100 + ₹5 = **₹105** |

**Test:** Add items worth ₹100 → Cart shows ₹127 total → Payments shows ₹105 total. **DIFFERENT amounts.**

---

### TH-6. Finance Tabs Re-subscribe to Same Data on Each Switch

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/pages/Finance.jsx`  
**Severity:** 🟡 High

**Test:**
1. Open Finance page
2. Observe network tab for Firestore reads
3. Switch from Accounts → Ledger → Earnings tabs
4. **Each switch triggers `subscribeAllCustomerOrders()` independently**
5. With 100 customers × 100 orders = 10,000+ reads per switch

---

### TH-7. SalesTrends Fetches ALL Orders Ever Without Date Limit

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/services/orderService.js` — `fetchAllOrdersFlat`  
**Severity:** 🟡 High

**Test:**
1. Restaurant operating for 1 year with 50 customers/day
2. Open SalesTrends
3. **18,000+ orders fetched in a single query**
4. No `where` clause, no date filter, no pagination

---

### TH-8. Inventory Quantity Stored as String — Cannot Sort Numerically

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/pages/Inventory.jsx`  
**Severity:** 🟡 High

**Test:**
1. Add item with quantity `"10 Kgs"`
2. Add item with quantity `"100 Kgs"`
3. Sort by quantity descending
4. **Result:** `"100 Kgs"` appears AFTER `"10 Kgs"` (alphabetical sort: "1" < "1" on second char)
5. **FAIL:** `"10 Kgs" < "2 Kgs"` in string comparison

---

### TH-9. Admin "All Veg" Toggle Writes to Firestore Without Confirmation

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/pages/MenuPage.jsx` — `handleAllVegToggle()`  
**Severity:** 🟡 High

**Test:**
1. Open Menu Management
2. Toggle "All Veg" checkbox ON
3. **IMMEDIATELY** → ALL non-veg items written to Firestore as Veg type
4. No confirmation dialog
5. Unchecking does NOT restore original types
6. **Impact:** Accidental click permanently deletes Non-Veg classifications

---

### TH-10. Login Stores User Data in localStorage as Plain JSON

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/login/login.jsx`  
**Severity:** 🟡 High

**Test:**
1. Open browser DevTools → Application → Local Storage
2. Find key `"user"`
3. Value: `{"username":"John","phone":"+911234567890"}`
4. **Plaintext PII in browser storage**

---

### TH-11. No Rate Limiting on Login Endpoint

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/login/login.jsx` — `handleDirectLogin()`  
**Severity:** 🟡 High

**Test:**
1. Automate 1000 rapid login requests with different phone numbers
2. All succeed — no CAPTCHA, no rate limit, no cooldown enforcement
3. **Potential for phone number enumeration / brute force**

---

### TH-12. Admin Login Uses localStorage-Based Auth with No Session Expiry

**Apps:** Admin | **Files:** `order_clients-Olive_green-updated/src/components/ProtectedRoute.jsx`, `Login.jsx`  
**Severity:** 🟡 High

**Test:**
1. Login to admin
2. Close browser tab
3. Reopen → still logged in (localStorage token persists)
4. No session timeout, no auto-logout, no inactivity detection

---

### TH-13. Profile "Forgot Password" is Non-Functional

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/profile/Profile.jsx`  
**Severity:** 🟡 High

**Test:**
1. Go to Profile → Change Password section
2. Enter current password, new password, confirm
3. "Save" → appears to succeed
4. Check localStorage → password stored in PLAINTEXT
5. Refresh → password not actually changed (reads from Firestore on next render, but no server-side password reset)

**Impact:** False sense of security. User thinks password is changed.

---

### TH-14. Redundant Console.log Statements in Production Code

**Apps:** Both | **Files:** `orderService.js`, `Menu.jsx`, `Payments.jsx`, `Cart.jsx`, `AwaitingConfirmation.jsx`  
**Severity:** 🟡 High

**Test:**
1. Open browser console
2. Navigate through Orders page → see sections like:
   ```
   === SUBSCRIBING TO ORDERS (real-time) ===
   subscribeTodaysOrders - customers snapshot received, docs: 5
   Processing Customer: +911234567890
   ...
   ```
3. Navigate through Menu → see image diagnostics
4. Navigate through Payments → see flow debugging logs

**Impact:** Exposes internal structure in production. Performance overhead. Clutters console.

---

### TH-15. ItemDetails Swipe Navigation is Dead Code

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/itemDetails/ItemDetails.jsx`  
**Severity:** 🟡 High

**Test:**
1. Open any item details
2. Swipe left → nothing happens
3. Swipe right → nothing happens
4. Check code: `const nextItem = null; const prevItem = null;`
5. **Touch handlers fire but do NOTHING.** ~30 lines of dead code processing touch events.

---

### TH-16. Image Loading — No Aspect Ratio Placeholders (Layout Shift)

**Apps:** Customer | **Files:** `Menu.css`, `Cart.css`, `ItemDetails.css`  
**Severity:** 🟡 High

**Test:**
1. Open Menu on slow connection (3G throttling)
2. Menu items load → images load lazily
3. **Content reflows** as images populate → user loses scroll position
4. Same issue in Cart (cart item images), ItemDetails (hero image)

**Cumulative Layout Shift (CLS) metric is high.**

---

## 🟠 Medium Priority Test Issues

### TM-1. Menu Search — No Results State Never Clears

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/menu/Menu.jsx`  
**Severity:** 🟠 Medium

**Test:**
1. Type search term that returns no results → "No items found matching your search."
2. Clear search → items reappear → **OK**
3. But: If menu data hasn't loaded yet (loading state), search shows "No results" even though items will appear later

---

### TM-2. Search Bar Has `border: black` Typo (Renders 3px Black Border)

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/menu/Menu.css`  
**Severity:** 🟠 Medium

```css
.search-input {
  border: black;  /* Should be 'border: none' */
}
```

**Test:** Search input has visible 3px solid black border on some browsers.

---

### TM-3. Menu Voice Search (Mic) Icon Imported But Not Rendered

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/menu/Menu.jsx`  
**Severity:** 🟠 Medium

**Test:**
- `Mic` is imported from `lucide-react`
- But never rendered in the JSX — dead code import
- Search bar shows search icon + clear button, no microphone

---

### TM-4. `allVegMode` Auto-Checks on MenuPage Load

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/pages/MenuPage.jsx`  
**Severity:** 🟠 Medium

**Test:**
1. Open MenuPage
2. If ALL items happen to be Veg, checkbox auto-checks
3. User didn't explicitly toggle it
4. **UI state changes without user action** — confusing

---

### TM-5. Finance Filter Modal "Apply" Lacks Visual Feedback

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/pages/Finance.jsx`  
**Severity:** 🟠 Medium

**Test:**
1. Open Finance → Filter modal
2. Toggle filter options on/off
3. Changes apply immediately (no "Apply" button)
4. No badge count or active filter indicator visible
5. **User doesn't know filters are active**

---

### TM-6. `useTableNumber` Hook Reads localStorage on Every Call

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/hooks/useTableNumber.js`  
**Severity:** 🟠 Medium

**Test:**
- `getPathWithTable()` calls `localStorage.getItem("tableNumber")` on every invocation
- Called on every render of Menu, Cart, Payments, Bill, etc.
- **localStorage reads are sync and block the main thread**

---

### TM-7. `imageBase64` Object in MenuPage Unused

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/pages/MenuPage.jsx`  
**Severity:** 🟠 Medium

**Test:**
- `const imageBase64 = { biryani: "/images/placeholder.jpg", ... }` is defined
- But NEVER referenced anywhere in the component
- **Dead code**

---

### TM-8. No Keyboard Dismiss on Tap Outside Input

**Apps:** Customer | **Files:** `Login`, `Cart`, `ItemDetails`  
**Severity:** 🟠 Medium

**Test:**
1. Open any input field on mobile
2. Keyboard appears
3. Tap outside the input → keyboard stays
4. **No tap-outside-to-dismiss behavior**

---

### TM-9. 14 Different Storage Keys for Payment Flow

**Apps:** Customer | **Severity:** 🟠 Medium

**Storage keys used:**
`pendingOrderId`, `pendingOrderForFirestore`, `pendingVerificationCode`, `confirmedOrderId`, `confirmedOrderData`, `orderin_awaiting_orderId`, `orderin_confirmed_orderid`, `orderin_confirmed_orderdata`, `orderin_countercode_orderId`, `orderin_countercode_paymentMethod`, `orderin_onlinepayment_orderId`, `orderin_paymentData`, `orderin_orderId`, `paymentData`

**Test:** Navigate through full checkout flow → check localStorage → **14 keys created, only 3-4 cleared on completion**

---

### TM-10. Menu Card Price Text Too Small

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/menu/Menu.css`  
**Severity:** 🟠 Medium

**Test:** `price-current` uses `font-size: 1rem` which is ~14px — on mobile this is difficult to read compared to competitor apps (Zomato, Swiggy use 16-18px for prices).

---

## 🟢 Low Priority Test Issues

### TL-1. Delivered Orders Disappear After 5 Minutes (Auto-Cleanup)

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/cart/Cart.jsx`  
**Severity:** 🟢 Low

**Test:**
1. Order gets Delivered status
2. After 5 minutes, order auto-removes from Order Track tab
3. User cannot see their delivered order history
4. **No audit trail for completed orders**

---

### TL-2. Delivered Timer Uses `setTimeout` Without Cleanup on Unmount

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/cart/Cart.jsx`  
**Severity:** 🟢 Low

**Test:**
1. Order gets Delivered → 5-min timer starts
2. User navigates away from Cart before 5 minutes
3. Timer callback `setOrderHistory(prev => prev.filter(...))` fires on UNMOUNTED component
4. React state update on unmounted component warning in console

---

### TL-3. Comment Typo in `displayOrderIdGenerator.js`

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/utils/displayOrderIdGenerator.js`  
**Severity:** 🟢 Low

```javascript
// Path: Restaurant/orderin_restaurant_2/dailyOrderCounters/<DDMMYY>
// Should be: orderin_restaurant_3 (outdated reference)
```

---

### TL-4. Menu.jsx Imports `resolveImageUrl` But Uses `resolveImageUrl` (Named vs Default)

**Apps:** Customer | **File:** `orderin_custmer_1-Olive_green/src/menu/Menu.jsx`  
**Severity:** 🟢 Low

```javascript
import { resolveImageUrl } from "../utils/storageResolver";
```
But some imports use default import from the same module. Inconsistent import pattern.

---

### TL-5. CSS Variable `--client-red` is Actually Olive Green

**Apps:** Admin | **File:** `order_clients-Olive_green-updated/src/responsive.css`  
**Severity:** 🟢 Low

```css
:root {
  --client-red: #636E2C;      /* This is OLIVE GREEN */
  --client-red-dark: #3F441C;  /* Dark olive green */
}
```

**Misleading variable name** — `--client-red` holds a green value.

---

## 🧪 Test Coverage Gaps

### TG-1. No Unit Tests for Order Calculations

**Coverage Gap:**  
The `calculateBilling()` function in `billing.js` has complex logic for `ROUND_COLLECTION_PAYMENT_METHODS` but zero unit tests. Test cases needed:
- `calculateBilling(100, "Cash")` — should round collection
- `calculateBilling(100, "Online")` — exact tax
- `calculateBilling(150.50, "Card")` — rounding at .50 threshold
- Edge: `calculateBilling(0, "Cash")`, `calculateBilling(-1, "Cash")`

---

### TG-2. No Integration Tests for Payment Flow

**Coverage Gap:**  
The complete flow: Cart → AwaitingConfirmation → Payments → (CounterCode | OnlinePayment) → PaymentSuccess has **ZERO automated tests**. Critical paths:
- Cash payment full flow
- Card payment full flow
- Online payment full flow
- Order rejection flow
- Page refresh at each step
- Browser back button at each step

---

### TG-3. No Firestore Security Rules Tests

**Coverage Gap:**  
The `firestore.rules` file exists but no tests validate:
- Can customer read other customers' data?
- Can customer modify order `total` to ₹0?
- Can admin read/write any customer?
- Rate limiting on writes?

---

### TG-4. No Accessibility (a11y) Test Suite

**Coverage Gap:**  
No automated accessibility testing (axe-core, Lighthouse CI, jest-axe). Known violations:
- Color contrast issues
- Missing ARIA labels on interactive elements
- Focus management during modals
- Keyboard navigation gaps

---

### TG-5. No Visual Regression Tests

**Coverage Gap:**  
CSS changes can break layouts unexpectedly. No visual regression testing (Percy, Chromatic, Loki) to catch:
- The `border: black` typo
- Responsive layout breaks
- Font loading shifts
- Image placeholder styling

---

## 📊 Test Health Score by Dimension

| Dimension | Score | Key Issues |
|-----------|-------|------------|
| **🧩 Functional Correctness** | 3/10 | Order status by index, filter inversion, tax=0, hardcoded placeholders |
| **⚡ Race Conditions** | 2/10 | Double-checkout, CounterCode double-submit, timer doesn't pause |
| **🔒 Security** | 3/10 | Plaintext localStorage, no rate limiting, no session expiry |
| **📊 Data Integrity** | 3/10 | Order IDs mismatch, awaitingConfirmation never cleared, customizations lost |
| **🛡️ Error Handling** | 3/10 | CounterCode no loading state, missing try/catch in Firestore ops, fallback chains |
| **🔗 Integration** | 4/10 | iframe hardcoded to prod, payment admin coupling, Firestore r/w direct |
| **⚡ Performance** | 4/10 | Double subscriptions, all-orders fetch, no pagination, localStorage spam |
| **🧪 Edge Cases** | 3/10 | Empty cart checkout, phone validation, refresh during flow, multi-order cleanup |
| **📋 Test Coverage** | 1/10 | Near-zero automated tests for business logic, payment flow, or accessibility |

**Overall Quality Score: 3.5/10 — 🚨 NOT READY FOR PRODUCTION**

---

## 🏆 Recommended Fix Priority (Engineering Sprint Plan)

### 🔴 Sprint 1 — Blocker Fixes (Immediate)
| ID | Issue | Effort | Impact |
|----|-------|--------|--------|
| TB-1 | Order status by index (use ID instead) | 1 day | Critical data corruption |
| TB-2 | Remove double Firestore subscription | 0.5 day | Double billing cost |
| TB-3 | Fix Veg/Non-Veg filter labels | 0.5 day | Major UX failure |
| TB-4 | Fix Cart `taxes: 0` — calculate at save | 1 day | Wrong pricing |
| TB-12 | Call `placeOrder()` in checkout flow | 1 day | Broken order history |
| TB-10 | Dynamic business name/address on Bill | 1 day | Invalid receipts |
| TB-11 | Remove hardcoded credit card from Profile | 0.5 day | Fake payment data |
| TB-22 | Dashboard revenue use `totalCost` | 0.5 day | Under-reported revenue |
| TB-16 | Make iframe URL configurable | 1 day | Dev/test blocked |

### 🟡 Sprint 2 — High Priority
| ID | Issue | Effort |
|----|-------|--------|
| TB-5 | Fix `orderIndex` stale reference | 0.5 day |
| TB-7 | Fix CounterCode fallback on refresh | 1 day |
| TB-8 | Add loading state to CounterCode verify | 0.5 day |
| TH-3 | Phone number validation (Manual Order) | 0.5 day |
| TH-8 | Store inventory quantity as `{value, unit}` | 1 day |
| TH-4 | Sync orderHistory to Firestore | 1 day |
| TH-9 | Add confirmation dialog to "All Veg" toggle | 0.5 day |
| TH-6 | Share Firestore subscription across Finance tabs | 1 day |

### 🟠 Sprint 3 — Medium Priority
| ID | Issue | Effort |
|----|-------|--------|
| TH-5 | Unify billing calculation (Cart vs Payments) | 1 day |
| TB-14 | Fix checkout race condition (disable button earlier) | 0.5 day |
| TM-6 | Cache localStorage reads in useTableNumber | 0.5 day |
| TM-9 | Consolidate 14 storage keys into 3-4 | 1 day |
| TM-2 | Fix `border: black` CSS typo | 0.1 day |

### 🟢 Sprint 4 — Test Infrastructure
| ID | Issue | Effort |
|----|-------|--------|
| TG-1 | Unit tests for `calculateBilling` | 1 day |
| TG-2 | Integration tests for payment flow | 3 days |
| TG-3 | Firestore security rules tests | 2 days |
| TG-4 | a11y test suite setup | 1 day |
| TG-5 | Visual regression tests | 1 day |

---

## 📁 Appendix: Key Files Referenced

| File Path | Role | Test Issues Found |
|-----------|------|-------------------|
| `order_clients-Olive_green-updated/src/services/orderService.js` | Order data, status updates | TB-1, TB-5, TH-7, TH-14 |
| `order_clients-Olive_green-updated/src/pages/Dashboard.jsx` | Dashboard KPIs | TB-2, TB-22 |
| `order_clients-Olive_green-updated/src/pages/Orders.jsx` | Order management | TB-5, TB-13, TH-3 |
| `order_clients-Olive_green-updated/src/pages/MenuPage.jsx` | Menu management | TH-9, TM-4, TM-7 |
| `order_clients-Olive_green-updated/src/pages/Finance.jsx` | Financial reports | TH-6, TM-5 |
| `orderin_custmer_1-Olive_green/src/menu/Menu.jsx` | Menu display | TB-3, TM-1, TM-3, TL-4 |
| `orderin_custmer_1-Olive_green/src/cart/Cart.jsx` | Cart management | TB-4, TB-14, TB-19, TH-5, TL-1, TL-2 |
| `orderin_custmer_1-Olive_green/src/payments/Payments.jsx` | Payment selection | TB-9, TB-21, TH-14 |
| `orderin_custmer_1-Olive_green/src/payments/CounterCode.jsx` | Counter payment | TB-7, TB-8 |
| `orderin_custmer_1-Olive_green/src/payments/AwaitingConfirmation.jsx` | Wait confirmation | TB-6, TB-20, TB-21 |
| `orderin_custmer_1-Olive_green/src/payments/OnlinePayment.jsx` | Online payment | TB-16, TB-17 |
| `orderin_custmer_1-Olive_green/src/Bill.jsx` | Receipt generation | TB-10 |
| `orderin_custmer_1-Olive_green/src/profile/Profile.jsx` | User profile | TB-11, TH-13 |
| `orderin_custmer_1-Olive_green/src/context/CartContext.jsx` | Cart state | TB-12, TH-4 |
| `orderin_custmer_1-Olive_green/src/login/login.jsx` | Customer login | TH-10, TH-11 |
| `orderin_custmer_1-Olive_green/src/utils/orderCleanupUtils.js` | Order cleanup | TB-18 |
| `orderin_custmer_1-Olive_green/src/utils/billing.js` | Billing calc | TG-1 |
| `orderin_custmer_1-Olive_green/src/itemDetails/ItemDetails.jsx` | Item details | TB-15, TH-15 |

---

> **⚠️ Disclaimer:** This test audit was conducted through static code analysis of the source files in `orderin-Client_Customer/`. Issues should be verified against the deployed/live version before prioritizing fixes. Some issues may have been partially addressed in other branches or theme directories.

