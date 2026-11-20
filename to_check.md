# To check

Open items from the product manager's review (`Docs/ORDERIN_ Honest Review (WIP branch) - Grok Bot.pdf`, written against commit `28240d9`), each checked against the code, plus the product manager's follow-up requests of 19 Nov 2026. The working copy is on branch `NEWG` (same commit as `WIP`); nothing is committed.

Status: **nothing here has been changed yet** unless marked done.

## Decisions waiting on the team

- [x] **Razorpay live key rotated** (19 Nov 2026): the product manager stopped the old key and created a new one. The code no longer contains any secret (see P0 #1 and **Razorpay: set the new secret** below).
- [ ] **Razorpay: the new secret was pasted into a chat** while handing it over. Decide whether to rotate it once more before going live. If you do, only step 2 of **Razorpay: set the new secret** needs repeating.
- [ ] **Is the GitHub repo public?** If it is, make it private. This couldn't be checked from here.
- [x] **Are real restaurants or diners using the live apps?** **No** (decided 19 Nov 2026). Rules, login and data-shape changes can be made directly, without a staged rollout.
- [x] **Diner login:** **keep it as it is for now** (name + phone, no OTP) (decided 19 Nov 2026). Note: without a verified diner identity, the database rules can't limit a diner to only their own orders. Staff-side rules and server-side payment checks can still be done.
- [ ] **Git history purge** (`git filter-repo` plus a force-push). Only needed if the old secret must be removed from history; it is stopped, so this is no longer urgent. Everyone would have to re-clone.
- [x] **Price:** **will be decided later** (19 Nov 2026). Not needed for the current work.
- [x] **Target market:** **all markets**, not one wedge (decided 19 Nov 2026). Marketing goes broad.
- [x] **Support phone / WhatsApp line:** **on hold** (19 Nov 2026).

## Razorpay: set the new secret

Someone with owner access to the Firebase project `orderin-7f8bc` does this once. The secret is typed in when asked; it is never saved in a file.

1. **Install and log in** (skip if already done):
   ```
   npm install -g firebase-tools
   firebase login
   ```
2. **Store the secret**, from any one staff app folder (for example `Orderin-Black-Theme/order_client_11`):
   ```
   firebase use orderin-7f8bc
   firebase functions:secrets:set RAZORPAY_KEY_SECRET
   ```
   Paste the new live secret when asked and press Enter.
3. **Deploy only the two payment functions**, from the same folder (`BILLING_GUARD.md` allows only these):
   ```
   firebase deploy --only functions:createRazorpayOrder,functions:verifyRazorpayPayment
   ```
   All 7 staff apps share one Firebase project and the same function names, so deploy from **one** folder only; the last deploy replaces the functions for everyone.
4. **Optional clean-up** of the old config, which may still hold the leaked values (they are blocked anyway):
   ```
   firebase functions:config:unset razorpay
   ```
   If Razorpay webhooks are used, set a new webhook secret too.
5. **Test:** place one small online payment in a customer app. If it says "Online payment is not configured yet", step 2 was missed or the functions weren't redeployed.

## P0: before any paying client

| # | Item | Verified in code | Where |
|---|------|------------------|-------|
| 1 | Live Razorpay secret hard-coded | **Code fixed (19 Nov 2026), setup still to do.** The old key was stopped and a new one created. All 7 staff apps' `functions/index.js` now read the secret only from Secret Manager (`defineSecret('RAZORPAY_KEY_SECRET')`). The new public key ID `rzp_live_U0WlxgptPJmE9v` is the default in code and in the admin `PaymentHubPage.tsx`. The old secret is removed from every file (it was also in 2 root docs), and the old key ID and secret are blocked by fingerprint. Without the secret set, payments answer "not configured" instead of failing. The old secret remains in git history, but it is stopped, so it can't be used. **To do:** follow **Razorpay: set the new secret** above; make the repo private. | `functions/index.js` in all 7 staff apps |
| 2 | Database and storage open to everyone | Yes. 27 rules files use `if true`; only Olive's 2 are scoped. All 16 app configs use one Firebase project, `orderin-7f8bc`, although `Docs/ORDERIN_PRODUCT_DOCUMENT.md` says each theme has its own. Fix: rules per restaurant and per role (diners create and read only their own orders), tested with the emulator, building on `order_clients-Green/rules-tests/`. | `firestore.rules`, `storage.rules` |
| 3 | Fake logins | Yes. See the auth list below this table. | staff apps, admin, POS, customer apps |
| 4 | Diner can mark their own order paid | Yes, in **all 7** customer apps (the review says 6). The counter code comes from `Math.random()` in the browser and is saved in the diner's `localStorage`, and a wrong guess shows the right code in an alert. Fix: create the code on the server, show it only to staff, remove the alert. | `src/payments/CounterCode.jsx` |
| 5 | Payment amount trusted from the browser | Yes. `createRazorpayOrder` takes the amount and the restaurant split from the request, with no auth and CORS `*`, in 6 staff apps (Olive is fixed). `verifyRazorpayPayment` never checks the amount paid against the order total. Fix: a `placeOrder` function that prices the order from the menu; `createRazorpayOrder` takes only an `orderId`; check amount = total; add a Razorpay webhook. | `functions/index.js` |
| 6 | Billing guard ignored | Yes. `syncRazorpayPayment` and `scheduledRazorpaySettlementSync` (a scheduled job) are still exported in all 7 staff apps, although `BILLING_GUARD.md` says not to deploy them. Use only the targeted deploy in **Razorpay: set the new secret**. | `functions/index.js` |
| 7 | Fake numbers shown to diners | Yes: 4.6★, 15–20 min, ₹30 packing, an invented 8% "savings", Foodie's Paradise, 123 Main Street, +91 98765 43210, Our Restaurant, Member since 2024. The dine-in cart also shows "Delivery status: Preparing now" before anything is ordered (Black and Stadium). | customer apps |
| 8 | Total changes between cart and checkout | Yes. The cart computes 5% GST + ₹30 − 8%; checkout uses a different `calculateBilling()`. Fix: one billing function used by cart, checkout and bill. | `cart/Cart.jsx`, `payments/Payments.jsx` |
| 9 | Bank account and IFSC sent to the browser | **Confirmed.** `Payments.jsx` reads the restaurant's `IFSC` and `account` and passes them on, in Black, Dessert, Green, Maroon and Red; the restaurant document is readable by anyone. Also needs a phone-number consent notice for the DPDP Act 2023. | `src/payments/Payments.jsx`, `OnlinePayment.jsx` |
| 10 | Breaks on Linux; no CI | Yes. `Category.svg` is imported but the file is `category.svg`. There is no `.github/workflows`, and the admin console's `npm install` fails without `--legacy-peer-deps` (no `.npmrc` or `overrides`). Fix: case-correct imports, plus GitHub Actions that install, build and test every app on Linux. | `order_clients-Green/src/pages/MenuPage.jsx:17`, `orderin_admin/package.json` |
| 11 | Repo junk | Yes. 181 tracked files: a Vite cache (`C__/…`, about 15 MB) in the POS and `removed_backups/` in all 7 customer apps. | |

**Auth gaps (P0 #3):**

- [ ] Staff console only checks `localStorage.auth`.
- [ ] Section PINs only check `sessionStorage` flags: `menuAuth`, `financeAuth`, `inventoryAuth`, `staffAuth` and `payrollAuth`. The review opened Finance and Payroll just by setting them.
- [ ] Admin passcode falls back to `123456789` (`orderin_admin/src/pages/LoginPage.tsx`).
- [ ] POS seeds `admin` / `admin123` (`pos-system/src/lib/seed.js`).
- [ ] POS syncs every staff member's password hash to each device and checks it in the browser. They are unsalted SHA-256, not plaintext as the review says, but still easy to crack.
- [ ] Diners log in with any phone number and no OTP.
- [ ] Fix: phone OTP for diners; email/password with custom claims `role` and `restaurantId` for staff; remove the storage flags, `123456789` and `admin123`; no password data on devices.

## Diner experience (from "What a diner sees")

- [ ] Fake default options: every item without options gets "Spice Level" and "Portion Regular/Large" (Large costs the same as Regular, "Coke included"). Found in `itemDetails/ItemDetails.jsx` (Black, Dessert, Stadium).
- [ ] Options are saved only when the diner taps Save on the notes popup; Cancel silently drops them. The cart keys items by name, so two variants of one dish collide.
- [ ] The floating "Add to Cart" bar covers the item options, and the floating cart button covers the Grand total. Reported by the review; reproduce on a phone.
- [ ] GST is shown as "Additional Charges", a flat 5%, with no CGST/SGST split and no GSTIN (13 files).
- [ ] Ask for the phone number at order time, not to browse. Browsing without login is done; asking only at checkout is not.
- [ ] Missing: veg/non-veg dots on cards, call waiter, request bill, split bill, bill on WhatsApp, Telugu/Hindi.

## Owner experience (from "What an owner sees")

- [ ] Placeholder restaurant name: "XYZ Restaurant" on the staff login, menu, finance and inventory login screens (Black, Dessert and others), plus typos such as "recored" (Dessert `Dashboard.jsx`).
- [ ] Admin dashboard shows 0 transactions while the ledger shows ₹2,832.09. Check where each number comes from.
- [ ] Admin Restaurants list has 8 test-looking entries ("OrderIn_1", "4th one") with 0 orders. Clean up test data before demos.
- [ ] POS writes to production just by opening: `seedIfEmpty()` runs in `App.jsx` before anyone logs in.
- [ ] POS needs a customer phone for every sale (`repo.js` throws without one), and shows "Online" when offline.
- [ ] Payroll: the review saw ₹200 of deductions on ₹50 pay go through (net −₹150). **Partly handled now:** Green's `payrollService.js` refuses to finalise a row with negative net pay ("Deductions are more than the pay."). Re-test the review's case and add an explicit override.

## P1: to compete

- [ ] Orders as their own documents (`Restaurant/{id}/orders/{orderId}` with status, table and createdAt) instead of the `customers/{phone}.pastOrders` array (96 files depend on it). Staff query only today's open orders.
- [ ] Merge the 7 forks into one codebase, with the theme as configuration (colours, fonts, logo, feature flags) loaded by restaurant ID. Today:
  - Restaurant IDs are hard-coded (e.g. `orderin_restaurant_2` 20+ times in one app), with a misspelt family `orderin_restuarant_5/6/7`.
  - `Cart.jsx` exists in 7 different versions.
- [ ] GST bill: GSTIN, CGST + SGST, sequential invoice number, SAC 996331, FSSAI number, WhatsApp/SMS link. Confirm rates with a CA. Later: e-invoice and Tally export.
- [ ] Real variants and add-ons with price differences, keep selections on Cancel, and key cart lines by item + options.
- [ ] Add veg/non-veg dots on cards, call waiter, request bill and split bill.
- [ ] Thermal ESC/POS printing through a print bridge, with per-station KOT routing (KOT uses browser print today).
- [ ] **Swiggy/Zomato aggregator.** Built in all 7 staff apps (Orders → **Swiggy / Zomato** page, with Swiggy and Zomato side by side), plus a backend in `/aggregator-functions` (direct Swiggy + Zomato, not deployed). The review recommends going through a partner such as UrbanPiper instead of building it yourself; the team chose direct. To go live, follow **Swiggy / Zomato: how to connect** below.
- [ ] Self-serve onboarding: owner sign-up, menu CSV import, printable table-QR PDF.
- [ ] Payroll: net pay can't go below zero without an override (see the owner-experience note: partly handled).
- [ ] POS: optional customer phone, a true online/offline state, no seeding into production.
- [ ] Offline mode for the themed apps: only the POS works when the internet drops.

## Swiggy / Zomato: how to connect

Diners keep ordering inside the Swiggy and Zomato apps; the customer menu websites are not involved. Orders flow like this:

```
Swiggy / Zomato apps (diners order there)
        │  1. They send each order to our webhook URL
        ▼
aggregatorWebhook  ── Cloud Function in our Firebase project (orderin-7f8bc)
        │  3. Looks up which restaurant the outlet belongs to (aggregatorOutlets)
        ▼
Firestore: Restaurant/{restaurantId}/aggregatorOrders/...
        │  4. Staff website shows it live (Orders → Swiggy / Zomato)
        ▼
Staff accept / reject / ready / handed over
        │  2. aggregatorStatusPush sends that back to Swiggy / Zomato
        ▼
Swiggy / Zomato apps (diner sees "accepted", rider is sent)
```

**1. Swiggy's and Zomato's partner portals (only the team can do this).** Get approved as a POS integration partner with each platform.
- [ ] Register these webhook URLs with them:
  ```
  https://asia-south1-orderin-7f8bc.cloudfunctions.net/aggregatorWebhook/swiggy
  https://asia-south1-orderin-7f8bc.cloudfunctions.net/aggregatorWebhook/zomato
  ```
- [ ] Get from each platform:
  - a webhook secret (proves the orders really come from them);
  - an API key and API base URL (to send accept/ready back);
  - each restaurant's outlet ID;
  - their API spec.
- [ ] Update the placeholder field names in `aggregator-functions/src/adapters/swiggy.js` and `zomato.js` to match the spec, and the test fixtures in `aggregator-functions/test/helpers.js`.

**2. Our Firebase project (the backend).**
- [ ] Billing review, then move the 2 functions to the allowed list in `BILLING_GUARD.md` (they are listed there as pending).
- [ ] Store the keys in Secret Manager:
  ```
  firebase functions:secrets:set SWIGGY_WEBHOOK_SECRET
  firebase functions:secrets:set SWIGGY_API_KEY
  firebase functions:secrets:set ZOMATO_WEBHOOK_SECRET
  firebase functions:secrets:set ZOMATO_API_KEY
  ```
- [ ] Put `SWIGGY_API_BASE_URL` and `ZOMATO_API_BASE_URL` in `aggregator-functions/.env`.
- [ ] Add Firestore rules for `aggregatorOutlets`, `aggregatorConfig` and `aggregatorOrders` (part of P0 #2; details in `aggregator-functions/README.md`).
- [ ] Deploy only the aggregator: `firebase deploy --only functions:aggregator`. The webhook URLs above only work after this.

**3. Database: link each restaurant's outlet.**
- [ ] Create one document per outlet so orders reach the right restaurant (by hand in the Firebase console for now; the admin console has no screen for it yet):
  ```
  aggregatorOutlets/swiggy_<Swiggy outlet id>  →  { restaurantId: "orderin_restaurant_4", enabled: true }
  aggregatorOutlets/zomato_<Zomato res id>     →  { restaurantId: "orderin_restaurant_4", enabled: true }
  ```
- [ ] Optional: add an admin-console screen to link outlets instead of editing the database by hand.

**4. Each restaurant's staff website: already built.**
- [x] **Orders → Swiggy / Zomato** shows and handles the orders, with Swiggy and Zomato side by side.
- [ ] In **Settings** there, map each Swiggy/Zomato item ID to a menu item so stock and sales count.
- [x] **Send test order** works today (test orders are written to the live database, marked as tests, and never sent to Swiggy/Zomato).

**Later**
- [ ] Push the menu and in/out-of-stock changes to Swiggy/Zomato, switch the store online/offline, and deduct stock for mapped items.

Until step 1 is done, steps 2 and 3 can be prepared but no real orders will arrive.

## P2: nice to have

- [ ] Telugu/Hindi UI and a local support number.
- [ ] Loyalty across all themes, and a Google review prompt after payment.
- [ ] Tally export, reservations, an owner's phone dashboard.

## Already done (uncommitted)

- [x] Menu without login: all 7 customer apps open on the flipbook (the review says Black forces login). Staged on `NEWG`.
- [x] Green flipbook "blank circle": a broken cover image is now hidden.
- [x] Flipbook layout and animation fixed for phones, tablets and desktops (tested on 64 device/browser setups).
- [x] Swiggy/Zomato: Online orders page, inbox, settings and test orders in all 7 staff apps; backend written and tested (see P1). Unstaged.
- [x] **Razorpay key rotation, code side** (PM request, 19 Nov 2026): see P0 #1. Setup steps above.
- [x] **Promotion before categories** (PM request, 19 Nov 2026): on the menu, the promotion banner now shows above the category chips (search → promotion → categories → dishes) in Black, Dessert, Green, Maroon, Stadium and Olive. Red already shows promotions as a popup when the menu opens, so it is unchanged.
- [x] **Review before the bill, one per customer** (PM request, 19 Nov 2026), in all 7 customer apps:
  - After "Payment successful", **View Bill** opens a review step: 1–5 stars plus an optional comment, then **Submit & view bill** or **Skip & view bill**.
  - **One review per customer, ever** (by phone number), enforced in a database transaction. Customers who already reviewed, or who left feedback before this rule, go straight to the bill.
  - Skipping saves nothing, so they are asked again after their next order until they review once.
  - The old review popups on "Back to Home" and on leaving the bill are removed, so no second review is possible.
  - The review is stored as `review` on the customer and still added to `feedback`, so staff Notifications show it.
- [ ] Green, Dessert and Stadium menus are empty in the database. This is data, not code.

## Found while working (not caused by today's changes)

- [ ] Green staff app: 2 Dashboard tests already fail on the committed code (stale snapshot, and "navigates when a module card is clicked" times out). They fail the same way with the original `routes.jsx`.
- [ ] Windows/OneDrive: `npm run dev` can fail with `EPERM … rename … node_modules\.vite\deps_temp` while OneDrive syncs `node_modules`. Workaround: delete `node_modules\.vite` and run `npm run dev -- --force`. Better: keep the project outside OneDrive.
