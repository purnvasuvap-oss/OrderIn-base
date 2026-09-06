# Theme-by-Theme Test Guide

Companion to [`QA-INTERN-ONBOARDING.md`](./QA-INTERN-ONBOARDING.md). That doc
tells you *how* to test. This one tells you *what's in each theme* and *what to
check that's specific to it*.

**The big picture:** all themes started as copies of one app. The screens are the
same everywhere. The differences are (a) styling/colours, (b) some button and
heading text, (c) a few themes added extra pages. So your job per theme is:

1. Run the shared checklist (section 3) — it applies to every theme.
2. Then run the **theme-specific notes** for the theme you're on (section 4).
3. Log differences from the Black baseline as bugs **only if they look wrong** —
   different colour is fine, a broken button is not.

---

## 1. The 16 apps at a glance

| Theme | Customer app path | Client app path | Extra stuff vs baseline |
|---|---|---|---|
| **Black** | `Orderin-Black-Theme/orderin_custmer_1` | `Orderin-Black-Theme/order_client_11` | — this **is** the baseline |
| **Dessert** | `Orderin-Dessert-Theme/orderin_custmer-Dessert` | `Orderin-Dessert-Theme/order_clients-Dessert` | Different copy on Dashboard/Login/Promotions; **large unoptimised images** |
| **Olive-green** | `orderin-Client_Customer/orderin_custmer_1-Olive_green` | `orderin-Client_Customer/order_clients-Olive_green-updated` | The "origin" build. Customer has **public flipbook menu** + **Awaiting Confirmation** + payment gate. Client Finance opens on **ACCOUNTS** (6 tabs). |
| **Green** | `Orderin-Green-Theme/orderin_custmer-Maroon` | `Orderin-Green-Theme/order_clients-Maroon` | Client adds **Kitchen Display, Staff Login, Staff Management, Table Management**. Customer adds **Accepting-Orders modal** + public flipbook menu. |
| **Maroon** | `Orderin-Maroon-Theme/orderin_custmer-Maroon` | `Orderin-Maroon-Theme/order_clients-Maroon` | Like Green client but **NO Kitchen Display**; Staff Management manages **zones & teams** dynamically. Customer like Green customer. |
| **Stadium** | `Orderin-Stadium-Theme/orderin_custmer-Stadium` | `Orderin-Stadium-Theme/order_clients-Stadium` | Black-style Finance/Orders (7 tabs incl. *Daily Transit*, standalone Manual-Order modal). Custom stadium icons. |
| **RED** | `Orderin-RED-Theme/orderin_custmer` | `Orderin-RED-Theme/order_clients` | Customer **Menu / Item Details / Profile were redesigned** — different markup and labels. Client ≈ Stadium. |
| **Admin** | — | `orderin_admin` | Standalone TypeScript console. Restaurant onboarding, ledger, settlements. |
| **POS** | — | `Orderin-Only-POS/pos-system` | Standalone offline point-of-sale. IndexedDB + sync queue. |

> **Folder trap:** `Orderin-Green-Theme/` and `Orderin-Maroon-Theme/` both
> contain a folder literally named `*-Maroon`. Different themes. Green's has the
> Kitchen/Staff/Table pages; Maroon's does not.

---

## 2. What every CUSTOMER app contains

Screens (routes) — check each one loads and works:

| Area | Folder | What to check |
|---|---|---|
| **Menu** | `src/menu/` | Categories + items render, images load, search box filters, veg/non-veg filter works, "add to cart" works, greeting text (Good morning/afternoon/evening) matches the time |
| **Item details** | `src/itemDetails/` | Opens from a menu item, shows description/price/image, quantity selector, add-to-cart, loading state ("Loading item details…") |
| **Cart** | `src/cart/` | Line items, change quantity, remove item, subtotal / taxes / total add up correctly, empty-cart state, "proceed" button |
| **Payments** | `src/payments/` | Screen renders, payment method options show, shows the confirmed order. (You don't need to complete a real payment.) |
| **Bill / receipt** | `src/Bill.jsx` | Renders order summary, "Download" button produces a **PDF** (this lazy-loads a library — first click may take a second) |
| **Profile** | `src/profile/` | Order history list, liked/favourites list, both render without error |
| **Help / About** | `src/help/` | Help page, About-restaurant page, About-OrderIn page all render |
| **Header** | `src/header/` | Hamburger opens side menu; each menu item navigates; menu **closes when you click outside it**; works with **keyboard** (Tab to it, Enter/Space to open) |
| **Footer** | `src/Footer/` | Renders, links work |
| **Routing** | `src/AppContent.jsx` | Bad URL redirects to login and **doesn't loop on Back**; refresh on a deep screen recovers |

**Extra in Olive-green / Green / Maroon customer apps:**

| Area | Folder | What to check |
|---|---|---|
| **Public flipbook menu** | `src/publicMenu/` | This is the landing page at `/` (login moves to `/login`). Pages "flip", each page shows menu items, category navigation works, "back to top", the awaiting-confirmation screen after ordering |

---

## 3. What every CLIENT / STAFF app contains

Screens — check each one:

| Screen | File | What to check |
|---|---|---|
| **Section logins** | `Login.jsx`, `FinanceLogin.jsx`, `InventoryLogin.jsx`, `MenuLogin.jsx` (+ `StaffLogin.jsx` on Green/Maroon) | Correct passcode gets you in; **wrong passcode is rejected** with a message; empty field is handled |
| **Dashboard** | `Dashboard.jsx` | Cards / numbers render, **no `NaN` or blank**, nav links go to the right screen. Card wording differs by theme (see section 4). |
| **Orders** | `Orders.jsx` | Order list loads, open an order, accept / reject flow, reject-reason modal, status updates. Manual-order entry (inline modal or separate `ManualOrderModal` depending on theme). |
| **Finance** | `Finance.jsx` | Every tab switches without error, numbers/tables render, date filters work. **Tab set differs by theme** (see section 4). |
| **Inventory** | `Inventory.jsx` | Item list, open edit form, stock toggle, save |
| **Menu management** | `MenuPage.jsx` | Category & item list, add/edit item form, availability toggle, image upload field |
| **Promotions** | `Promotions.jsx` | Create-ad / create-pop-ad form opens, validates required fields, back button |
| **Notifications** | `NotificationPage.jsx` | Notification list renders, tabs (2-tab Black-style vs olive's "Queued Orders" tab), mark-as-read |
| **Landing page** | `landingpage/` | Renders (most themes have this; Black does not) |

**Extra on Green & Maroon clients only:**

| Screen | File | What to check |
|---|---|---|
| **Staff Management** | `StaffManagement.jsx` | Staff list, add/edit staff, roster / week view shows **7 days**, shift assignment. Maroon also: add/remove **zones** and **teams**. |
| **Table Management** | `TableManagement.jsx` | Table grid, add/edit table, status (free/occupied/reserved) |

**Green client only:**

| Screen | File | What to check |
|---|---|---|
| **Kitchen Display** | `KitchenDisplay.jsx` | Order lanes labelled **New / Preparing / Ready**, orders move between lanes, back button says **"← Dashboard"** |

---

## 4. Theme-specific notes (read the one for your theme)

### Black — the baseline
Nothing special. Everything else is compared against this. If you find a bug
here, it's probably in every theme.
- Finance: **7 tabs** including *Daily Transit*. Separate `ManualOrderModal`.
- Notifications: 2-tab layout.
- No landing page.

### Dessert
- **Copy differs a lot** — don't log these as bugs:
  - Dashboard cards are plain divs with "Open X →" text (not buttons).
  - Tables show "10 / 25" style paging.
  - Promotions heading is **"CREATE POP AD"**, back button just says **"Back"**.
  - Login placeholders: "Enter user ID" / "Enter password".
  - Customer nav-back uses replace (you won't see the previous screen in history).
- **DO check / flag:** the customer app ships a **~4.5 MB PNG** and an oversized
  "SVG" in `publicMenu` assets. Confirm pages still feel slow-loading on a
  throttled connection — this is a known perf issue, note it if it's visibly bad.

### Olive-green (`orderin-Client_Customer/`)
- This is the **original** the others were cloned from. Expect it to be closest
  to Black in behaviour but with its own Header and Notification.
- **Client:** Finance opens on the **ACCOUNTS** tab, only **6 tabs** (no *Daily
  Transit*). Orders has an **inline** manual-order modal (heading "Create Manual
  Order"), not a separate component.
- **Client:** Notification page has an extra **"Queued Orders"** tab; the header
  shows a queued-count badge.
- **Customer:** has the **public flipbook menu** at `/`. Also has an **Awaiting
  Confirmation** screen after placing an order.
- **Customer — known bug area:** `payments/Payments.jsx` had a Rules-of-Hooks
  crash (fixed — see [`BUGFIXES.md`](./BUGFIXES.md) #2). Re-test the payment
  screen hard: reach it **with a real confirmed order in the cart**, not just the
  empty/loading state. It must not white-screen.

### Green (`Orderin-Green-Theme/`)
- **Client has the most screens:** Kitchen Display, Staff Login, Staff
  Management, Table Management on top of everything else.
  - Kitchen Display: lanes are **New / Preparing / Ready** only; back button
    **"← Dashboard"**.
  - Staff Management: the week/roster view must show **7 real dates** — if it
    shows "Invalid Date" or throws, that's a bug.
- **Customer:** has an **Accepting-Orders modal** (shown when the restaurant
  toggles ordering on/off) + the public flipbook menu. Check the modal blocks
  ordering when "not accepting".
- Menu hero has a **time-of-day greeting** — check it says the right thing
  morning/afternoon/evening.

### Maroon (`Orderin-Maroon-Theme/`)
- **Client is like Green's but with NO Kitchen Display.** The Dashboard card that
  says "Open Kitchen…" in Green says **"Open Staff Management →"** here — that's
  correct, not a broken link.
- Staff Management here is **more dynamic**: you can add/remove **zones** and
  **teams**, not just staff. Check add and remove both work and the list updates.
- **Customer** ≈ Green customer (Accepting-Orders modal + flipbook menu).

### Stadium (`Orderin-Stadium-Theme/`)
- **Client** is Black-style: Finance has **7 tabs** incl. *Daily Transit*,
  separate `ManualOrderModal`, 2-tab Notifications.
- Uses custom **stadium icons** (`src/stadium-icons/`) — check icons actually
  render, no broken-image squares.
- **Customer — known bug area:** the header's outside-click-to-close was broken
  (fixed — [`BUGFIXES.md`](./BUGFIXES.md) #6). Specifically test: open the
  hamburger menu, click anywhere **outside** it → it must close.

### RED (`Orderin-RED-Theme/`)
- **Client** ≈ Stadium client — ported cleanly, treat like Stadium.
- **Customer — Menu / Item Details / Profile were REDESIGNED.** Different markup
  and different labels:
  - Menu search: `placeholder="Search menu"`.
  - Veg filters: labelled **Veg / All / Non-Veg**.
  - Item details loading text: **"Loading item details..."**.
  - Profile sections: **"Order History"** and **"Liked List"**.
  - RED customer Menu has **no** time-of-day greeting (the others do).
- **Customer — known bug area:** `header.jsx` referenced an undeclared variable
  and crashed on **any click anywhere** (fixed — [`BUGFIXES.md`](./BUGFIXES.md)
  #1). Test: click around the app freely, watch the console for a
  `ReferenceError`.

### Admin (`orderin_admin`)
- Only TypeScript app. Runs on **Vitest 2**, not 3.
- Screens: Login, Dashboard, Restaurants (list + detail), Ledger, Settlements,
  Settings, plus customer-facing `/pay` and `/pay/status`.
- **Check the auth gate** (recently added — [`BUGFIXES.md`](./BUGFIXES.md) #3):
  - Log out, then paste `/dashboard` (or `/ledger`, `/settlements`, `/settings`)
    straight into the URL bar → must bounce you to `/login`, **not** show the page.
  - A garbage URL like `/xyz` → redirects to `/login`, no white screen.
  - Wrong passcode on the login screen is rejected.
  - The passcode must **not** be printed anywhere on the login page.
- `npm run build` must exit **0** and produce `dist/` (this was silently broken
  before — always re-verify after any change here).

### POS (`Orderin-Only-POS/pos-system`)
- Fully standalone — not a theme clone. Offline-first.
- Screens: Login, Dashboard, plus order-taking / receipt flow.
- Check: login (passcode hash/verify), access-control (a role that shouldn't see
  a screen doesn't), receipt renders, and — if you can — that it still works with
  the network **offline** (the sync queue should hold orders and flush on
  reconnect). Flag anything sync-related to your lead; it's tricky.

---

## 5. Cross-theme regression checklist

When a developer changes a **shared** component (header, cart, footer, a modal),
the same change lands in every theme. Your job: verify the fix in **all** the
apps that have that component, because a copy-paste port can miss one.

| Changed thing | Re-test in |
|---|---|
| `header/` | All 7 customer apps |
| `Bill.jsx` | All 7 customer apps (check PDF download) |
| `cart/` | All 7 customer apps |
| `payments/` | All 7 customer apps — **and** olive-green/Green/Maroon with a real confirmed order |
| Client `Finance.jsx` | All 7 client apps — remember the tab count differs (6 for olive-green, 7 for the rest) |
| Client `StaffManagement.jsx` | Green + Maroon clients only |
| `App.jsx` routing | All 7 client apps — bad URL + Back button |
| `vite.config.*` | Run `npm run build` in the changed app, confirm exit 0 |

**How to spot a missed port:** `diff` the changed file in Black against the same
file in the other theme. If they differ in the part that was fixed, the port was
missed — log it.

---

## 6. Priorities for launch

If you're short on time, test in this order:

1. **Admin auth gate + build** — a broken admin build blocks launch entirely.
2. **Customer payment flow** in every theme — this is where money changes hands.
3. **RED customer + Olive-green customer** — the two most-different apps, most
   likely to hide a bug.
4. **Order accept/reject** in every client app — the core staff workflow.
5. **Routing / Back button** in every app — cheap to test, embarrassing to ship broken.
6. Everything else on the shared checklist.
