# Orderin-Maroon-Theme — Bugs & Edge Cases Audit

Audited: 2026-08-05
Apps covered: `order_clients-Maroon` (staff/admin), `orderin_custmer-Maroon` (customer-facing)

Findings are grouped by severity. Each entry lists the file/line, the bug, a concrete
failure scenario, and a suggested fix. Issues already fixed earlier in this working
session (Large Orders threshold, All-Veg confirmation popup, Veg/Non-Veg filter swap,
public-menu page-count/rapid-click bugs) are not repeated here.

---

## 🔴 Critical — data loss / wrong-item bugs

### 1. `MenuPage.jsx` — Edit/Delete operate on the wrong item whenever a filter or search is active
**App:** order_clients-Maroon
**File:** `src/pages/MenuPage.jsx` (rows ~1470-1571, `handleEditRow` ~228, `handleDelete` ~825)

Row handlers are wired as `onClick={() => handleEditRow(index)}` / `onClick={() =>
handleDelete(index)}`, where `index` comes from `filteredItems.map((item, index) =>
...)`. But `handleEditRow`/`handleDelete` both index into the **unfiltered**
`menuItems` array (`menuItems[rowIndex]`), not `filteredItems`.

**Failure scenario:** Menu has items `[A,B,C,D,E]`. Staff searches/filters so only
`[C,E]` are visible (rendered at index 0/1). Clicking "Delete" on the row showing `C`
calls `handleDelete(0)`, which deletes `menuItems[0]` = `A` instead of `C`. Any time a
filter/search narrows the list, edit/delete acts on the wrong dish.

**Fix:** Look up/pass by `item.id` instead of the filtered-array index.

---

### 2. `tableService.js` — adding a table with an existing number silently wipes it out
**App:** order_clients-Maroon
**File:** `src/services/tableService.js` (`addTable` ~107-118), `AddTableModal` (~176-229)

`addTable` does an unconditional `setDoc` (full overwrite, not merge) keyed by table
number. `AddTableModal` only validates `Number(num) > 0`, never checking for a
collision with an existing table.

**Failure scenario:** Staff adds "Table 5" while table 5 is currently
occupied/reserved — the doc is fully replaced with `{status:"available",
reservedName:null, ...}`, instantly and silently clearing a live
reservation/occupancy.

**Fix:** Check `rawTables`/query the doc before `setDoc`; reject duplicates instead
of overwriting.

---

### 3. `tableService.js` — walk-in seating silently clobbers a pending reservation
**App:** order_clients-Maroon
**File:** `src/services/tableService.js` (`isReservationPending` ~282,
`reconcileOccupiedTables` ~226-245)

A "reserved" table displays as bookable up to 15 min before arrival, so staff can seat
a walk-in there. Once that order is live, `reconcileOccupiedTables` overwrites
`status` from `"reserved"` to `"occupied"` but never clears `reservedName`/
`reservedAt`.

**Failure scenario:** No check or warning fires when seating a walk-in at a
still-reserved table — the original reserving party's booking is silently lost with
no notification to staff, and once the table is freed later there's no trace a
reservation ever existed.

**Fix:** Warn/confirm before seating a walk-in at a table with an active reservation;
clear reservation fields explicitly (and log/notify) when this happens intentionally.

---

### 4. Billing total shown to the customer doesn't match what's actually saved/charged
**App:** orderin_custmer-Maroon
**File:** `src/cart/Cart.jsx:375` (`calculateOrderTotals`, `src/utils/pricing.js:70-78`)
vs. `src/payments/Payments.jsx:179,196-198,214-217` (`calculateBilling`,
`src/utils/billing.js:22-47`)

Cart/Awaiting-Confirmation screens compute the total via `calculateOrderTotals`
(subtotal + GST + ₹30 packing fee − up to ₹60 discount) and save that to Firestore.
`Payments.jsx` instead recomputes via `calculateBilling` (GST only — no packing fee,
no discount) and **overwrites** the already-confirmed order's `subtotal/taxes/total`.

**Failure scenario:** Customer sees Grand Total = subtotal + GST + packing − discount
on Cart, but the amount saved to Firestore and shown on the Payments screen a moment
later is subtotal + GST only — a real, silently-changing price for both customer and
restaurant.

**Fix:** Use one shared totals function for both order creation and the payments
recalculation step.

---

### 5. Quantity +/− and Remove are dead buttons on the Payments screen
**App:** orderin_custmer-Maroon
**File:** `src/payments/Payments.jsx:444,451,456` vs.
`src/context/CartContext.jsx:311-315,357-374` (`updateQuantity`/`removeFromCart`),
`src/utils/pricing.js:64-67` (`buildCartKey`)

`Payments.jsx` calls `updateQuantity(item.name, ...)` / `removeFromCart(item.name)`.
But `CartContext` matches strictly on `item.cartKey = buildCartKey(name,
selectedOptions)`, which only equals plain `name` when `selectedOptions` is empty.
Since `getDefaultsForCategory` always returns a non-empty default group (e.g.
"Portion: Regular") and `ItemDetails.jsx` always seeds a default selection, virtually
every cart item's `cartKey` looks like `"Pizza__Portion:Regular"`, not `"Pizza"`.

**Failure scenario:** On the Payments screen, tapping +/− or the trash icon on any
item with customization defaults silently no-ops — the buttons look interactive but
never match anything.

**Fix:** Use `item.cartKey || item.name` consistently, as `Cart.jsx:430` already does
correctly.

---

## 🟠 High — race conditions / silent corruption

### 6. `orderService.js` — lost updates when two staff act on the same customer's orders concurrently
**App:** order_clients-Maroon
**File:** `src/services/orderService.js` (`updateOrderStatus`, `acceptOrder`,
`rejectOrder`, ~883-1000)

Each function does read-`pastOrders`-array → mutate one element → `updateDoc`, with no
transaction.

**Failure scenario:** Staff A accepts order #1 while staff B rejects order #2 for the
same phone number at nearly the same time — both read the array before either write
lands, and whichever `updateDoc` finishes last silently overwrites the other's change,
reverting one order's status.

**Fix:** Use `runTransaction` for all `pastOrders` mutations, or move to per-order
subcollection docs instead of a single array.

---

### 7. `orderService.js` — silent no-op status update produces optimistic-UI vs. Firestore mismatch
**App:** order_clients-Maroon
**File:** `src/services/orderService.js` (~904-918); `src/pages/Orders.jsx`
(`handleStatusChange`/`handleAccept`, ~295-344)

These functions fall back to `foundIndex = Number(orderIdOrIndex)` when the id isn't
found in `pastOrders`. For a non-numeric id (e.g. a `"MANUAL-..."` order), `Number(...)`
is `NaN`, the guard fails, and the function returns **without throwing and without
writing anything**. Meanwhile `Orders.jsx` unconditionally updates local state after
the `await` resolves.

**Failure scenario:** Staff sees "Preparing"/"Delivered" applied in the UI, but
Firestore still has the old status — a page refresh reverts it, confusing kitchen
staff about the real order state.

**Fix:** Throw when `foundIndex` isn't a valid match instead of silently returning.

---

### 8. Orders.jsx — status can regress illegally via the manual dropdown
**App:** order_clients-Maroon
**File:** `src/pages/Orders.jsx` (`StatusPill` select ~80-96, `handleStatusChange`
~295)

The status `<select>` always offers all four statuses with no restriction based on
current status, and the write has no forward-only check.

**Failure scenario:** An order in "Ready" can be set back to "Pending" by mistake,
silently regressing an already-cooking order and potentially re-queuing it in the
kitchen board.

**Fix:** Restrict `<select>` options to the current status's forward-only successors.

---

### 9. `staffService.js` — duplicate PINs are never prevented
**App:** order_clients-Maroon
**File:** `src/services/staffService.js` (`addStaff` ~145-161, `resetStaffPin`
~191-195, `punchPin` ~443-496)

No uniqueness check against other active staff when setting a PIN. `punchPin` resolves
via `.find(s => s.pin === pin)` — the first Firestore-order match.

**Failure scenario:** Two staff end up with the same PIN (manual entry collision, or a
reset that reuses another employee's number) — punching that PIN always clocks in/out
the wrong (first-matched) staff member.

**Fix:** Enforce PIN uniqueness on add/reset.

---

### 10. `staffService.js` — a second clock-in/out cycle in one day overwrites the first
**App:** order_clients-Maroon
**File:** `src/services/staffService.js` (`punchPin` clock-in branch, ~460-479)

`setDoc(ref, {...fresh record...}, { merge: false })` runs whenever staff isn't
currently clocked in, including "already completed a shift today."

**Failure scenario:** Staff clocks in 9am, out 1pm (4h), back in 6pm, out 10pm (4h) —
the second clock-in fully replaces the day's attendance doc, so hours reports only
reflect the last session (4h) instead of the true total (8h).

**Fix:** Accumulate/append sessions for a day instead of overwriting the day's
attendance doc.

---

### 11. No double-submit guard on order creation (both apps)
**App:** both
**Files:**
- orderin_custmer-Maroon: `src/payments/Payments.jsx:509` (Place Order button has no
  `disabled` tied to `isSaving`); `src/cart/Cart.jsx:622-629` (Checkout button doesn't
  include `isSavingCart` in its `disabled` check); `src/payments/CounterCode.jsx:311`
  ("Verify Payment" has the same issue).
- order_clients-Maroon: `src/components/ManualOrderModal.jsx` (`handleSubmit`
  ~73-176) — `setIsSubmitting(true)` only takes effect after a React re-render, so two
  fast clicks before that re-render both invoke `handleSubmit`, each generating its own
  `id: MANUAL-${Date.now()}-...` and writing a separate order.

**Failure scenario:** A double-tap on a slow connection (customer) or a fast
double-click (staff) creates two near-identical Firestore orders.

**Fix:** Disable buttons whenever the save/submit flag is true, and add a
ref-based re-entrancy guard synchronously at the top of the async handler (state
alone lags behind rapid clicks).

---

### 12. Phone validation is dead code on customer login
**App:** orderin_custmer-Maroon
**File:** `src/utils/phoneValidation.js:30-33` (`isValidPhoneNumber`, unused
anywhere); `src/login/login.jsx:227-230` (only checks non-empty)

A 7–15 digit E.164 validator exists but is never called.

**Failure scenario:** A user types a single digit and successfully "logs in,"
creating a Firestore customer doc keyed by an invalid phone number — silently
corrupting customer/order records and breaking later phone-based lookups (favorites,
order history, cart persistence all key off `user.phone`).

**Fix:** Call `isValidPhoneNumber(phone)` in `handleDirectLogin` before proceeding.

---

## 🟡 Medium

### 13. `ManualOrderModal.jsx` — negative/zero item quantity accepted
**App:** order_clients-Maroon
**File:** `src/components/ManualOrderModal.jsx` (`updateItemQuantity` ~57-61)

`parseInt(quantity) || 0` lets `-2` through unchanged (truthy). The `<input
type="number" min="1">` is a UI hint only — nothing blocks submission.

**Failure scenario:** Staff enters `-2` for an item's quantity; the order's
`subtotal`/`totalCost` are silently reduced or negative with no validation error.

**Fix:** Clamp/validate quantity ≥ 1 before allowing submit.

---

### 14. `MenuPage.jsx` — "All Veg" bulk toggle updates local UI ahead of/independent of Firestore success
**App:** order_clients-Maroon
**File:** `src/pages/MenuPage.jsx` (`handleAllVegToggle` ~145-190)

Local `menuItems`/`editedItems` state is set to all-Veg *before* the `Promise.all` of
`updateDoc` calls starts, and `Promise.all` (not `allSettled`) means one rejected
write fails the whole batch with no reconciliation.

**Failure scenario:** The UI already shows "All Veg" applied whether or not any/all
Firestore writes actually succeeded — a partial-failure/optimistic-UI mismatch on a
destructive bulk mutation.

**Fix:** Use `Promise.allSettled`, only update local state for items that actually
succeeded, and surface a clear error for the rest.

---

### 15. `MenuPage.jsx` — empty item name is never validated
**App:** order_clients-Maroon
**File:** `src/pages/MenuPage.jsx` (`handleSave` validation loop ~306-362)

Only an image is required for new items; nothing checks that `item.name` is
non-empty.

**Failure scenario:** Saving a new/edited item with a blank name succeeds, producing
a blank row in the menu table and an unnamed dish on the customer-facing menu.

**Fix:** Require non-empty `name` (and reasonable `price`) in the same validation
pass.

---

### 16. Unguarded `JSON.parse(localStorage.getItem("user"))` throughout checkout/cart
**App:** orderin_custmer-Maroon
**Files:** `src/cart/Cart.jsx:86`; `src/payments/Payments.jsx:53,142,210`;
`src/payments/CounterCode.jsx:36,135,210`; `src/payments/AwaitingConfirmation.jsx:38,51,92`

None of these wrap the parse in try/catch.

**Failure scenario:** If `localStorage["user"]` ever contains a non-JSON string
(corrupted by a browser extension, manual edit, or a prior partial write), any of
these effects/handlers throws uncaught — inside a `useEffect` with no error boundary,
this breaks order-tracking/checkout entirely for that session.

**Fix:** Centralize a `safeGetUser()` helper that try/catches and returns `null` on
parse failure; use it everywhere instead of raw `JSON.parse`.

---

### 17. Deleting a menu item that's in a customer's unsubmitted cart has no coordination
**App:** order_clients-Maroon
**File:** `src/pages/MenuPage.jsx` (`handleDelete` ~825-895)

`handleDelete` unconditionally `deleteDoc`s the item with no check against
active/unsubmitted customer carts. (Already-placed orders are safe — they store
item name/price snapshots.)

**Failure scenario:** A customer with the item currently in an unsubmitted cart gets
no signal that it was removed/deleted mid-session.

**Fix:** Low priority — at minimum, re-validate cart items against live menu data at
checkout time and flag anything no longer available.

---

## 🟢 Low

### 18. `AwaitingConfirmation.jsx` — interval leak on the missing-user early-return path
**App:** orderin_custmer-Maroon
**File:** `src/payments/AwaitingConfirmation.jsx:71-132`

If `user`/`user.phone` is missing, the effect `return`s at line 93 without returning a
cleanup function — but the `setInterval` at line 79 was already started, so it never
gets cleared and keeps running for the life of that mounted instance.

**Fix:** Return `() => clearInterval(timer)` on every early-return path, not just the
success path.

---

### 19. Minus button at quantity 1 is a no-op
**App:** orderin_custmer-Maroon
**File:** `src/context/CartContext.jsx:311-315` (`Math.max(1, quantity)` clamp);
`src/cart/Cart.jsx:477`

Decrementing at quantity 1 does nothing instead of removing the item or being
disabled, so the button looks interactive but silently fails.

**Fix:** Either disable the minus button at quantity 1, or route it through
`removeFromCart` at that point.

---

## Suggested fix order

Given blast radius, fix in roughly this order regardless of what else gets tackled:

1. #1 (wrong-item edit/delete) — active data-loss risk, hit constantly since search/
   filter is a normal workflow.
2. #2 / #3 (table overwrite / reservation clobber) — silent data loss on a common
   staff action.
3. #4 (billing mismatch) — real financial/trust issue, customer-facing.
4. #5 (dead Payments quantity controls) — visible, confusing bug hit on nearly every
   order.
5. #6-#10 (race conditions / staff-management correctness) — lower frequency but
   compounding correctness issues.
6. #11-#17 — hardening/edge-case fixes, good cleanup pass.
7. #18-#19 — minor polish.
