# OrderIn

## Smart Restaurant Ordering and Operations Platform

**Client Product Document**
**Document version:** 2.0
**Prepared:** September 2026
**Product status:** Current product capabilities and implementation roadmap

---

## 1. Executive Summary

OrderIn is a restaurant ordering and operations platform built as a family of branded storefronts sitting on one common operational core. Each restaurant gets a customer-facing ordering site and a matching operations console; a separate platform console sits above all of them for the team running OrderIn itself.

In practice this means a restaurant owner gets:

- A branded, mobile-friendly ordering experience for their customers.
- A day-to-day operations console covering orders, menu, kitchen, tables, inventory, finance, and staff.
- Nothing to install — both sides run in the browser.

And the OrderIn team gets a platform console for onboarding restaurants, provisioning their staff logins, and tracking revenue and settlements across the whole portfolio.

Eight visually distinct storefront themes are live today — Red, Green, Maroon, Black, Dessert, Stadium, and an Olive Green variant, plus a ninth, architecturally different product: a consolidated point-of-sale build with no separate customer site. All of them share the same underlying data model and workflow logic; what changes between them is branding, and in a couple of cases, an extra feature built for that restaurant's needs.

> **A note on how to read this document.** Everything described as "current" or "implemented" exists in the codebase today and has been exercised in at least one theme. Where a capability is theme-specific rather than platform-wide — the dedicated payroll workflow, for instance, or the customer loyalty panel — that is called out explicitly rather than implied to be universal. Sections describing payment payouts, geolocation attendance, and production-grade backend security are marked as planned work; they should not be presented to a restaurant as available today.

---

## 2. Product Vision

OrderIn exists to take the operational chaos out of running a restaurant's front and back of house from one connected system, rather than a pile of disconnected tools, notebooks, and phone calls between the counter and the kitchen.

Concretely, the goal is to help a restaurant:

1. Take orders digitally instead of relying on verbal handoffs.
2. Cut the manual back-and-forth between customers, floor staff, and kitchen staff.
3. Give managers one place to see orders, tables, inventory, finance, and staffing as they happen.
4. Replace ad hoc decisions with structured workflows and status tracking, so fewer orders get lost or double-handled.
5. Build up the operational data a restaurant will eventually want for real decisions — busiest hours, slow-moving menu items, labour cost against revenue.

### Core value proposition

**One connected system, from the customer's order to the kitchen's ticket to the restaurant's books.**

---

## 3. The OrderIn Product Family

OrderIn isn't a single app — it's a set of near-identical product pairs, one per restaurant brand, plus a platform layer that manages all of them. Understanding that shape matters for setting client expectations correctly: a feature built for one restaurant's storefront doesn't automatically exist in another's until it's rolled out there.

### 3.1 The restaurant pair (customer app + operations console)

Every restaurant runs two connected web applications:

- **A customer ordering site** — menu browsing, cart, checkout, order tracking.
- **A restaurant operations console** — dashboard, orders, menu, kitchen, tables, inventory, finance, staff.

Both sides read and write the same restaurant data in Firestore, so a menu change or an order status update shows up on both sides immediately.

### 3.2 The eight storefront themes

| Theme | Vertical / positioning | Status |
|---|---|---|
| Red | Original/baseline theme | Live |
| Green | Live — first theme with the dedicated payroll module (Section 22) | Live |
| Maroon | Live | Live |
| Black | Live | Live |
| Dessert | Dessert/bakery-style ordering | Live |
| Stadium | Venue/stadium-style ordering | Live |
| Olive Green | Live — currently the only theme with a customer loyalty panel (Section 15) | Live |

Each theme is a full fork of the customer app and the operations console, restyled and reconfigured for that restaurant's brand. The underlying feature set is the same across all of them unless a section of this document says otherwise.

### 3.3 Orderin-Only-POS — the consolidated point-of-sale build

One product line breaks the customer-app-plus-console pattern entirely: **Orderin-Only-POS**, built for restaurants that want a counter/back-of-house system without a public ordering website. It's a single application (`pos-system`) that folds order entry, kitchen routing, and reporting into one console, and it ships a few modules the storefront themes don't have yet — expense tracking, supplier records, invoices, a dedicated customer list, and a reporting/analytics view. It's also the only place in the product today with real-time desktop notifications: order, low-stock, kitchen-delay, and print-failure alerts fire through the browser's Notification API with sound, on any device running the console with the tab open (there's no push service behind it yet, so it won't wake a closed browser or a phone that isn't actively looking at the screen).

### 3.4 The platform console

Above every restaurant sits **orderin_admin**, the console the OrderIn team itself uses to run the business — not something a restaurant owner logs into. It covers:

- **Restaurants** — the full list of onboarded restaurants and a detail view per restaurant.
- **Per-restaurant credential provisioning** — from a restaurant's detail page, a platform admin can create and manage that restaurant's staff login credentials (a main login role plus other role-based access codes), edit or revoke them, and see a history of changes. This is how a new restaurant's first logins actually get created.
- **Ledger** — a transaction-level record across all restaurants, broken down by payment method, GST, and platform fee.
- **Settlements** — tracking of what's owed to each restaurant on a monthly cycle, including payment history and auto-payment status.
- **Payment Hub** — the platform's own Razorpay-integrated payment flow for moving money in the settlement process.
- **Dashboard** — portfolio-level analytics across every onboarded restaurant.

This is franchise-level infrastructure, and it's worth being explicit with clients about the distinction: a restaurant owner's world is their operations console; the platform console is how OrderIn manages the network of restaurants running on it.

### 3.5 Shared technical foundation

A few things sit underneath every theme and are worth stating plainly, because they shape what "production-ready" actually means for a given restaurant:

- Each theme has its own Firebase project (its own `.firebaserc` and hosting site), so restaurants are logically isolated from each other rather than sharing one database.
- Uploaded images (menu photos, etc.) go through Firebase Storage. An earlier version of the product used a third-party image host (ImgBB); that has been fully retired in favour of Storage.
- Every restaurant's customer app ships pre-generated QR codes per table, linking a physical table directly to that table's ordering session.
- Customer checkout ends in a "Counter Code" step before order confirmation — a pickup/verification code shown after payment, present across every theme's checkout flow.

---

## 4. Users and Roles

### 4.1 Platform administrator

Operates `orderin_admin`, not a restaurant's own console. Responsible for onboarding new restaurants, provisioning their initial staff logins, and monitoring the ledger and settlements across the portfolio.

### 4.2 Restaurant owner

- Overall business visibility
- Financial review
- Menu and pricing oversight
- Staff and access management
- Operational configuration

### 4.3 General manager

- Daily restaurant operations
- Order and table supervision
- Roster and attendance review
- Staff coordination
- Operational reporting

### 4.4 Kitchen staff

- Viewing incoming orders
- Updating preparation status
- Coordinating kitchen workflow
- Viewing relevant staff schedule and attendance features

### 4.5 Floor staff

- Taking or entering manual orders
- Managing tables
- Supporting customers
- Viewing personal schedule and attendance

### 4.6 Customer

- Browse the menu
- Place orders
- Pay online where enabled
- Track order progress
- Review order history and profile information

---

## 5. Access and Security Model

### Current access surfaces (per restaurant)

| Area | Route |
|---|---|
| Main restaurant login | `/` |
| Restaurant dashboard | `/dashboard` |
| Staff login | `/staff-login` |
| Staff management | `/staff-management` |
| Staff self-service | `/staff-self-service` |

### Current staff access levels

- Admin
- General Manager
- Kitchen
- Floor

### Current security features

- Protected restaurant routes
- Protected sensitive sections
- Staff PIN login, with hashed PIN storage, PIN reset, and PIN collision checking
- Inactive staff rejection at login
- Basic role-aware routing
- Basic client-side permission controls
- Audit-log records for important staff actions
- Platform-level credential provisioning through the `orderin_admin` console (see Section 3.4)

### Where the current security model falls short of production-ready

This section needs to be direct rather than diplomatic, because it affects what can safely be told to a client about a live restaurant's data.

Client-side permission checks control what the interface shows a user — they do not stop a determined user from reading or writing data they shouldn't. Right now, every theme's Firestore rules are deployed as an open placeholder (`allow read, write: if true`) rather than restaurant-scoped rules. That's a normal state for a project mid-build, but it means **no restaurant on this platform should be treated as production-secure until its rules are hardened**, regardless of how complete its features look.

Before any restaurant goes live with real customer or payment data, the following needs to be in place:

- Firebase Authentication identities backing every login, not just PIN checks against Firestore
- Custom claims for staff roles, enforced server-side
- Firestore and Storage security rules scoped per restaurant, replacing the current open rule
- Server-side validation for payroll and payment actions — nothing that moves money or changes pay should be trusted from the client alone
- Server-side Razorpay webhook signature validation
- An audit of Cloud Function configuration for hardcoded credentials, and a standing practice of storing secrets in Firebase config or environment variables — never in source
- Rate limiting
- Secure session expiration

This is a pre-launch checklist, not a someday-nice-to-have — see Section 28 for how it fits into onboarding a specific restaurant.

---

## 6. Restaurant Dashboard

The dashboard is the restaurant's operational command centre — the first thing a manager sees, and the fastest way to tell if the day is going fine.

### Live dashboard indicators

- Today's revenue
- Orders today
- Customers today
- Tables occupied
- Total table capacity
- Occupancy percentage
- Current date and time
- Accepting-orders status

### Restaurant control cards

The dashboard provides direct access to:

- Orders
- Tables
- Menu
- Financial management
- Inventory
- Kitchen display
- Staff management
- Staff self-service portal

### Accepting-orders control

Managers can switch off online ordering with a single control — useful at close, during a kitchen slowdown, or when the restaurant is simply full. Existing orders continue through to completion; only new customer orders are blocked, and the dashboard makes the current state obvious at a glance.

---

## 7. Order Management

Order Management gives restaurant teams a single view of every order, whatever its source.

### Order sources

- Customer web ordering
- Manual staff entry — a searchable menu modal that captures the customer's name, phone number, and table, and feeds the same order pipeline as a web order. Because it's keyed to the customer's phone number, repeat manual customers build up the same order history a web customer would.

### Order lifecycle

1. Pending
2. Preparing
3. Ready
4. Delivered

Depending on the configured workflow, additional payment or cancellation states may also appear.

### Operational benefits

- Kitchen receives a clear preparation queue
- Floor staff can identify ready orders
- Managers can monitor order progress
- Customers receive clearer status visibility
- Manual orders remain part of the same operational flow, not a side channel

---

## 8. Menu Management

Menu Management lets a restaurant keep its digital menu current without waiting on a developer.

### Menu item information

- Item name
- Description
- Category
- Price
- Image
- Vegetarian/non-vegetarian classification
- Availability state
- Promotion state

### Availability control

An item can stay visible on the menu while marked unavailable — handy when an ingredient runs out, the kitchen is slammed, or a seasonal item is on pause, without deleting and later recreating the item and losing its history.

### Promotional pricing

Selected items can carry promotional display treatment, including an original-price-versus-promo-price comparison where configured.

### Restaurant-wide vegetarian setting

A single control lets a fully vegetarian restaurant apply that classification across the whole menu at once, rather than item by item.

---

## 9. Promotions

Promotions give the restaurant a way to put special offers directly in front of customers ordering through the app.

- Promotional banners
- Promotional messages
- Display duration
- Customer-facing campaign presentation
- Campaign replacement or removal

Typical use: daily specials, festival campaigns, new-item launches, limited-time offers, seasonal menus.

---

## 10. Kitchen Display

The Kitchen Display is a focused screen for the kitchen, not a scaled-down version of the manager's dashboard.

- Presents active orders clearly
- Groups orders by preparation stage
- Reduces dependency on printed tickets
- Helps kitchen staff prioritise work
- Supports a dedicated kitchen-screen setup

It's kept deliberately simple so it stays legible from across a working kitchen, not just up close.

---

## 11. Table Management

Table Management gives a live view of the floor.

- Table creation and capacity
- Table status: occupied, available, reserved, cleaning
- Seating and freeing actions
- Reservation handling and cancellation
- Occupancy reconciliation against the dashboard's live counts

Every table also gets a pre-generated QR code in the customer app, so seating a customer and handing them the ordering link can be as simple as pointing at the table.

---

## 12. Inventory Management

Inventory Management gives restaurant teams visibility into stock and supply levels.

### Current inventory capabilities

- Inventory item management
- Stock quantity updates
- Batch-aware inventory support where configured
- Low-stock monitoring and alert configuration
- Recent inventory activity
- Inventory manager views

### Already built in the POS product line, not yet rolled out to the storefront themes

Orderin-Only-POS already ships supplier records and expense tracking as part of its consolidated console. These aren't experimental — they're working modules — but they haven't been ported into the storefront themes' inventory section yet. That's a rollout decision, not a build-from-scratch one.

### Recommended future inventory improvements (storefront themes)

- Purchase orders
- Recipe-based ingredient deduction
- Waste tracking
- Stock valuation
- Expiry alerts
- Multi-location inventory

---

## 13. Finance and Restaurant Reporting

Finance is a protected area for reviewing a restaurant's financial activity, kept separate from day-to-day operations so access can be limited to people who should actually see the numbers.

### Current finance capabilities

- Daily operational financial views
- Order and payment review
- Payment-type analysis
- Billing views, with bill viewing and printing
- Financial filters and reporting tabs

### Already built in the POS product line, not yet rolled out to the storefront themes

Orderin-Only-POS already has invoicing, a dedicated customer list, and a reporting/analytics view built into its console. As with inventory above, the work exists; extending it to the storefront themes is a scoping and rollout question rather than new development.

### Recommended future finance improvements (storefront themes)

- Tax reporting
- Profit and loss reporting
- Settlement reconciliation (the platform console already does this at the portfolio level — see Section 3.4 — but a restaurant doesn't yet see its own settlement history inside its own console)
- Refund management
- Financial exports

---

## 14. Customer Ordering Experience

The customer application is built for mobile and QR-driven ordering — a customer scans the table's code or opens the restaurant's link, and everything from there happens in the browser.

### Customer journey

1. Customer opens the restaurant's ordering link or scans the table QR code.
2. Customer browses the digital menu.
3. Customer opens item details.
4. Customer adds items to the cart.
5. Customer reviews the order and bill.
6. Customer provides required order information.
7. Customer pays where online payment is enabled.
8. Customer receives a Counter Code — a short pickup/verification code shown after payment.
9. Customer receives order confirmation and tracks status through to delivery.

### Customer-facing features

- Digital menu with categories, item images, and descriptions
- Cart
- Customer profile and order history
- Table context via QR code
- Payment screens, including waiting and success states
- Counter Code pickup step
- Order status tracking
- Help and informational content

---

## 15. Customer Loyalty (Olive Green theme only)

One theme — Olive Green — currently ships a customer loyalty panel in its operations console: a ranking of top customers by spend, grouped into gold/silver/bronze tiers based on order history. It isn't in any other theme yet. It's flagged here on its own because it's the kind of feature a client might reasonably assume is standard once they've seen it in a demo, and it currently isn't.

---

## 16. Customer Payments and Razorpay

The customer application's payment flow is built on Razorpay, with a Firebase Cloud Function per theme handling order creation server-side rather than trusting amounts from the browser.

### Customer payment purpose

Customer payments collect money for restaurant orders — this is the checkout flow every diner goes through, not the mechanism restaurants use to pay their own staff.

The customer payment flow supports:

- Order amount presentation
- Payment initiation
- Payment completion, waiting, and failure states
- Failed or incomplete payment handling

### Important distinction for staff payments

Customer collection and staff payouts are different Razorpay products, and the customer-payment integration cannot simply be pointed at staff payroll:

| Operation | Razorpay product |
|---|---|
| Collect customer order payment | Razorpay Payment Gateway / Checkout — in use today |
| Pay staff or suppliers | RazorpayX Payouts — not yet integrated, see Section 23 |

The platform console's own Payment Hub (Section 3.4) is a third, separate use of Razorpay again — settling money between OrderIn and its restaurants, not between a restaurant and its customers or staff.

---

## 17. Staff Management

Staff Management is available at:

```text
/staff-management
```

### Staff directory

- Name, Employee ID, phone, email
- Role, zone, team, job role
- Hire date, employment type
- Emergency contact and relationship
- Address
- Skills, certifications metadata
- Assigned location
- Notes
- Leave balances
- Availability, preferred shift, minimum/maximum weekly hours
- Compensation metadata
- Lifecycle status

### Staff lifecycle statuses

Active, Inactive, On leave, Terminated, Archived.

### Staff actions

Add staff, edit staff, deactivate staff, restore staff, reset PIN, view status.

---

## 18. Staff Scheduling and Roster

### Current capabilities

- Week navigation and a staff-by-day roster grid
- Morning, evening, and night shifts, plus custom start/end times
- Off-day assignment
- Roster publishing
- Shift editing and shift templates
- Bulk roster assignment support

### Scheduling validation

The service layer checks for invalid or zero-length shift times, availability conflicts, time-off conflicts, overlapping shifts, minimum rest periods, maximum weekly hours, and minimum staffing coverage — so a roster that violates one of these gets caught before it's published, not after.

### Recommended future enhancements

- Drag-and-drop scheduling
- Shift swap automation
- Employee schedule acknowledgement
- Branch/location scheduling
- Demand-based staffing suggestions
- Labour-cost forecasting

---

## 19. Staff Self-Service

Available at:

```text
/staff-self-service
```

Built for servers, hosts, chefs, floor staff, and other hourly employees.

### Current self-service capabilities

- View and edit limited personal profile information
- View and navigate current and past schedule weeks
- View attendance history, worked hours, and break hours
- Submit time-off and shift-swap requests, and track their status
- View announcements
- View payroll/payslip history where records exist
- Change PIN

### Recommended self-service navigation

The self-service portal is currently one combined page. Splitting it into dedicated routes would make it easier to deep-link and to keep loading fast on a phone on the restaurant Wi-Fi:

```text
/staff-self-service/profile
/staff-self-service/schedule
/staff-self-service/attendance
/staff-self-service/pay
/staff-self-service/requests
/staff-self-service/notifications
```

---

## 20. Attendance and Timecards

### Current attendance capabilities

- Staff PIN clock-in and clock-out
- Break start/end
- Current-day attendance list
- Worked-hours and break-minute calculation
- Monthly attendance calendar and date-range lookup
- Attendance correction with a required reason
- CSV export
- Attendance audit records

### Attendance statuses

Not in, On shift, On break, Clocked out.

---

## 21. Planned Geolocation Attendance

Geolocation attendance does not exist in the product yet. It's documented here as a designed-but-unbuilt feature so a client sees the intended shape before deciding whether to prioritise it.

### Proposed workflow

1. Staff selects Clock In or Clock Out.
2. Browser requests location permission.
3. The system compares the device location with the restaurant's configured location.
4. If the device is inside the allowed radius, the PIN prompt appears.
5. The staff member enters the PIN.
6. The attendance record is stored with the location-verification details attached.

### Proposed location data

Restaurant latitude/longitude and allowed radius; staff latitude/longitude and accuracy; distance from restaurant; location-verification status; manager-override status.

### Recommended fallback

If GPS is unavailable or too inaccurate to trust, the system should not silently accept a normal verified punch — it should require a manager override with a captured reason and a written audit record. Geolocation on its own, without a trusted backend check, is not a complete anti-fraud mechanism; a phone's reported location can be wrong or spoofed, and the validation needs to happen server-side.

---

## 22. Payroll

Where most of this document describes one shared feature set, payroll is the clearest exception, so it's worth being precise about what exists and where.

Every theme has the payroll *foundation*: hourly and salaried compensation, pay-period calculation, regular and overtime hours, break-hour tracking, tips and deductions, gross and net pay, payroll run creation with draft/approved/reopened states, run history, CSV export, and payroll audit records.

**The Green theme** has gone a step further and shipped a full dedicated payroll workflow, live today at:

```text
/staff-management/payroll
/staff-management/payroll/:runId
```

That workflow includes:

- Pay-period presets (weekly, biweekly, monthly) alongside a custom date range
- A summary panel — total staff, regular and overtime hours, break hours, tips, bonuses, deductions, gross and net payroll, and paid/failed amounts for the period
- A per-staff table (employee, employee ID, role, hours, hourly and overtime rate, tips, bonuses, deductions, gross, net, payment status, and per-row actions)
- A five-stage approval workflow — **Draft → Under review → Approved → Processing → Paid**, with a **Failed** state that can be retried or resolved manually, and a **Reopened** state for sending an approved run back for correction
- A run detail page showing attendance, hours, and pay per staff member, the full approval history with who changed what and when, and per-row payslip export
- Manual payment-status reconciliation (mark a row paid or failed, with a reference or failure reason) — a placeholder for the real payout rail described in Section 23, so the workflow is fully usable today even before RazorpayX is connected

This has not yet been rolled out to Red, Maroon, Black, Dessert, Stadium, Olive Green, or the POS product. Those themes still use the earlier inline payroll tab inside Staff Management. Porting the Green implementation to the rest of the family is the natural next step and is reflected in the roadmap (Section 27).

---

## 23. Planned Staff Payments

Actually paying staff — as opposed to calculating what they're owed — is not a generally available capability yet in any theme.

### Recommended architecture

```text
Attendance
    ↓
Payroll calculation
    ↓
Manager review
    ↓
Payroll approval
    ↓
RazorpayX payout batch
    ↓
Webhook status updates
    ↓
Staff payment history
```

### Razorpay recommendation

Keep using Razorpay Checkout/Payment Gateway for customer collections (Section 16). Use RazorpayX Payouts separately for staff payments — they are different products with different onboarding requirements.

### Bulk payment requirements

A production bulk-payment flow should let a manager select a pay period and approved staff, preview the total, approve the batch, and submit it — then show which payments succeeded, which are still processing, and which failed, with retries limited to the failed ones only. It needs to prevent duplicate payouts, store payment references, and keep a full approval and payment audit trail.

### Data that may be stored

Staff ID, payroll run ID, amount, currency, payment status, payment date, RazorpayX payout ID, failure reason, retry count, provider recipient ID, bank account last four digits.

### Data that must never be stored in the client or in source control

Razorpay secret keys, full bank account numbers, card numbers, CVVs, UPI PINs, net banking passwords, or any raw banking credential. Payout creation must happen through a trusted backend or serverless function, and Razorpay webhook signatures must be verified before any payment status is trusted and written back.

---

## 24. Notifications

### Shipped today (POS product line)

Orderin-Only-POS already delivers real notifications through the browser's Notification API — new order, kitchen delay, low stock, and print failure, each with sound, on any device with the console open. It's desktop/tab-scoped rather than a true push service: it won't reach a closed browser tab or wake a phone that isn't actively looking at the screen.

### Foundation in the storefront themes

The staff-management data layer in the storefront themes supports staff-related notifications (creation, read state), but the delivery mechanism is the in-app list rather than the POS product's live alerts.

### Recommended notification events (storefront themes)

Roster published, shift changed, time-off approved or denied, shift swap approved or denied, PIN reset, account deactivated, payroll approved, payment completed, payment failed, certification expiring, missed clock-in.

### Future delivery channels (storefront themes)

In-app notifications (present), email, SMS, and a proper push-notification service — bringing the storefront themes up to what the POS product already does, and beyond it to mobile.

---

## 25. Audit and Accountability

The platform includes staff audit-log support today, recording actions as they happen rather than reconstructing them after the fact.

### Recommended audit events

Staff created, staff profile changed, role changed, PIN reset, staff deactivated, staff restored, attendance corrected, manager override used, roster published, time-off approved or denied, payroll approved, payroll reopened, payment submitted, payment retried.

### Each audit record should contain

Actor, actor role, action, affected record, timestamp, previous value where relevant, new value where relevant, and reason where required.

---

## 26. Current Feature Status

| Capability | Current status |
|---|---|
| Restaurant dashboard | Implemented |
| Customer web ordering | Implemented |
| Digital menu | Implemented |
| Promotions | Implemented |
| Order management | Implemented |
| Kitchen display | Implemented |
| Table management (incl. per-table QR codes) | Implemented |
| Inventory management | Implemented (storefront themes); expanded with suppliers/expenses in POS |
| Finance views | Implemented (storefront themes); expanded with invoicing/reporting in POS |
| Platform console (`orderin_admin`) — restaurants, ledger, settlements, Payment Hub | Implemented |
| Per-restaurant credential provisioning | Implemented |
| Customer loyalty panel | Implemented — Olive Green theme only |
| Staff directory | Implemented |
| Staff PIN login | Implemented |
| Staff self-service | Implemented foundation |
| Weekly roster | Implemented |
| PIN attendance | Implemented |
| Attendance calendar and date-range lookup | Implemented |
| Payroll calculation and approval states | Implemented foundation (all themes) |
| Dedicated payroll workflow with run detail and manual reconciliation | Implemented — Green theme only |
| Payroll export | Implemented |
| Staff audit records | Implemented foundation |
| Staff notifications (in-app) | Implemented foundation |
| Live desktop order/stock notifications | Implemented — POS product only |
| Geolocation attendance | Planned |
| Manager GPS override | Planned |
| Dedicated payroll page — remaining themes | Rollout of the Green implementation |
| RazorpayX staff payouts | Planned integration |
| Bulk staff payments | Planned integration |
| Payslip PDF generation | Planned |
| Full HR document management | Planned |
| Full performance management | Planned |
| Firestore/Storage security rules hardening | Required before any restaurant goes live on real data |
| Production backend authorization hardening | Required before production scale |

---

## 27. Recommended Release Roadmap

### Release 1: Current operational platform

Customer ordering, restaurant dashboard, menu, orders, kitchen display, tables, inventory, finance, staff directory, scheduling, basic attendance — this is where every theme stands today.

### Release 2: Staff operations

Dedicated profile pages, improved self-service navigation, attendance reports, roster notifications, complete leave balances, payslip presentation, PDF exports.

### Release 3: Payroll operations

Dedicated payroll page, pay-period approval, payroll locking, tips and deductions, payment status tracking, payment reconciliation — **already delivered in the Green theme**; the remaining work in this release is porting it to Red, Maroon, Black, Dessert, Stadium, Olive Green, and the POS product.

### Release 4: Secure payouts

RazorpayX recipient onboarding, a secure backend payout service, bulk payout batches, webhook status updates, failed-payout retry, duplicate-payment protection.

### Release 5: Workforce intelligence

Geolocation attendance, manager overrides, late/early/absence analytics, scheduled-versus-actual labour reporting, performance metrics, compliance reminders.

### Release 6: Feature parity across the family

Bringing the POS product's supplier, expense, invoicing, and reporting modules into the storefront themes, and the Olive Green loyalty panel into the rest of the family, where a restaurant wants them.

---

## 28. Client Onboarding Checklist

Before a restaurant goes live, confirm:

- Restaurant profile is configured.
- Menu categories, items, and prices are reviewed, and item availability is correct.
- Tables and capacities are configured, and per-table QR codes are printed and placed.
- Restaurant operating hours are confirmed.
- Payment provider configuration is complete.
- Staff accounts and roles are created through the platform console, and PINs are distributed privately.
- Kitchen display devices are tested.
- Order status workflow is tested end to end, including a manual order.
- Finance access is limited to authorised users.
- Inventory starting quantities are entered.
- Notification contacts are confirmed.
- Backup and recovery procedures are documented.
- **Firestore and Storage security rules for this restaurant have been reviewed and hardened** — do not launch on the default open rule.
- Any Cloud Function credentials touching this restaurant have been checked for hardcoded secrets and rotated if needed.

### For a future payroll and payout release

- Compensation records are verified.
- Pay period is configured.
- Payroll approval roles are assigned.
- RazorpayX account is activated.
- Staff payout recipients are verified.
- Webhook endpoint is configured.
- Test payout is completed in a non-production environment.

---

## 29. Client Presentation Summary

### One-sentence description

**OrderIn is a connected restaurant platform that brings digital ordering, kitchen operations, table management, inventory, finance, and workforce management into one system — available as a family of branded storefronts on a shared operational core.**

### Three key benefits

1. **Operational clarity.** Managers see orders, tables, kitchen work, inventory, finance, and staffing in one place instead of stitching it together from separate tools.
2. **A better customer experience.** Customers browse, order, pay, and track progress through a mobile-friendly web experience — no app download, no waiting to flag down a server.
3. **A workforce system that scales with the restaurant.** Staff profiles, rosters, attendance, and payroll are built around how the restaurant actually runs, with a proven path (already live in one theme) to a fully worked payroll approval and payment workflow.

### Suggested closing statement

OrderIn starts with the restaurant's daily operational needs and builds toward deeper automation from there: secure staff access, verified attendance, approved payroll, and — once the backend work in this document is complete — integrated staff payouts.

---

## Appendix A: Suggested Presentation Slide Structure

**Slide 1 — Title.** OrderIn: Smart Restaurant Ordering and Operations Platform.

**Slide 2 — The restaurant problem.** Disconnected tools, manual order communication, limited visibility, scheduling complexity, reporting effort.

**Slide 3 — The OrderIn solution.** One connected platform; customer and restaurant experiences; real-time operational visibility.

**Slide 4 — Product architecture.** Customer web application, restaurant operations console, shared data and workflow, one Firebase project per theme.

**Slide 5 — A family of storefronts.** Eight branded themes, one consolidated POS build, one platform console managing all of them.

**Slide 6 — Restaurant dashboard.** KPIs, accepting-orders control, module cards.

**Slide 7 — Customer ordering journey.** Browse, cart, payment, Counter Code, confirmation, tracking.

**Slide 8 — Orders and kitchen.** Order lifecycle, kitchen display, manual order entry.

**Slide 9 — Menu and promotions.** Menu control, availability, pricing, promotions.

**Slide 10 — Tables, inventory, and finance.** Floor visibility with per-table QR codes, stock monitoring, financial review.

**Slide 11 — Staff management.** Profiles, roles, roster, attendance, self-service.

**Slide 12 — Payroll, live today.** The Green theme's dedicated payroll workflow, and the plan to bring it to every theme.

**Slide 13 — The platform console.** Restaurant onboarding, credential provisioning, ledger, settlements.

**Slide 14 — Security and governance.** Protected routes, roles, PINs, audit history, and the backend-hardening work required before go-live.

**Slide 15 — Business value.** Faster operations, fewer errors, better customer communication, better manager visibility.

**Slide 16 — Roadmap.** Payroll rollout across themes, secure payouts, geolocation attendance, feature parity, analytics.

**Slide 17 — Closing.** OrderIn: one connected operating system for the modern restaurant.
