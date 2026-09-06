# OrderIn — Platform Frontend Monorepo

OrderIn is a QR-code restaurant ordering platform. A diner scans a table QR,
browses the menu, orders and pays from their phone; restaurant staff manage the
menu, orders, kitchen, inventory and finances from a separate dashboard; the
OrderIn team onboards restaurants and reconciles payments from an admin console;
and each outlet can run an offline-capable POS terminal.

This repository holds **all of the frontends** for that platform. The backend
(Firebase — Firestore, Auth, Storage, Cloud Functions) is **not** in this repo.

> **New here?** Jump to [Getting started](#5-getting-started) for setup, or
> [Docs folder](#11-docs-folder) for the guided reading path by role
> (engineer / QA / onboarding a restaurant).

---

## Table of contents

1. [The product in one picture](#1-the-product-in-one-picture)
2. [Repository layout](#2-repository-layout)
3. [The 16 apps](#3-the-16-apps)
4. [Themes explained](#4-themes-explained)
5. [Getting started](#5-getting-started)
6. [Command reference](#6-command-reference)
7. [How one app is structured](#7-how-one-app-is-structured)
8. [Pages & routes](#8-pages--routes)
9. [Tech stack](#9-tech-stack)
10. [Environment variables](#10-environment-variables)
11. [Docs folder](#11-docs-folder)
12. [Testing](#12-testing)
13. [Known bugs & the last audit](#13-known-bugs--the-last-audit)
14. [Deployment](#14-deployment)
15. [Conventions](#15-conventions)

---

## 1. The product in one picture

```
                    ┌─────────────────────────────┐
   Diner's phone →  │  CUSTOMER APP               │  order + pay
                    │  orderin_custmer*           │
                    └──────────────┬──────────────┘
                                   │  Firestore (orders, menu, payments)
                    ┌──────────────┴──────────────┐
  Restaurant     →  │  CLIENT / STAFF APP         │  manage menu, orders,
  staff tablet      │  order_client*              │  kitchen, inventory, finance
                    └──────────────┬──────────────┘
                                   │
        ┌──────────────────────────┼───────────────────────────┐
        │                          │                           │
┌───────┴────────┐        ┌────────┴─────────┐        ┌─────────┴──────────┐
│ ADMIN CONSOLE  │        │  POS TERMINAL    │        │  Firebase backend  │
│ orderin_admin  │        │  pos-system      │        │  (separate repo)   │
│ onboarding,    │        │  offline-first   │        │  Firestore / Auth  │
│ ledger,        │        │  order + pay     │        │  Storage /         │
│ settlements    │        │  at the counter  │        │  Cloud Functions   │
└────────────────┘        └──────────────────┘        └────────────────────┘
```

Payments run through **Razorpay**, initiated client-side and verified by two
Firebase Cloud Functions (`createRazorpayOrder`, `verifyRazorpayPayment`). See
[Deployment](#14-deployment) and `Docs/`-adjacent Razorpay guides.

---

## 2. Repository layout

```
OrderIn-base/
├── README.md                     ← you are here
├── Docs/                          ← all long-form documentation (see §11)
│   ├── TESTING.md
│   ├── THEME-TEST-GUIDE.md
│   ├── QA-INTERN-ONBOARDING.md
│   └── BUGFIXES.md
├── RAZORPAY_*.md  BILLING_GUARD.md   ← payment/backend notes (verify before trusting — see §11)
│
├── orderin_admin/                 ← admin console (TypeScript, standalone)
├── Orderin-Only-POS/pos-system/   ← POS terminal (standalone)
│
├── Orderin-Black-Theme/           ← the baseline theme
│   ├── order_client_11/           ← client/staff app
│   └── orderin_custmer_1/         ← customer app
├── Orderin-Dessert-Theme/
│   ├── order_clients-Dessert/
│   └── orderin_custmer-Dessert/
├── orderin-Client_Customer/       ← the "olive-green" / origin theme
│   ├── order_clients-Olive_green-updated/
│   └── orderin_custmer_1-Olive_green/
├── Orderin-Green-Theme/
│   ├── order_clients-Maroon/      ← (folder is named "-Maroon" — see note below)
│   └── orderin_custmer-Maroon/
├── Orderin-Maroon-Theme/
│   ├── order_clients-Maroon/
│   └── orderin_custmer-Maroon/
├── Orderin-Stadium-Theme/
│   ├── order_clients-Stadium/
│   └── orderin_custmer-Stadium/
└── Orderin-RED-Theme/
    ├── order_clients/
    └── orderin_custmer/
```

Each leaf folder (`order_client_11`, `orderin_custmer_1`, `orderin_admin`, …) is
an **independent npm project** with its own `package.json`, `node_modules/`,
Vite config, and `firebase.json`. There is **no workspace / root install** — you
install and run inside the app folder you're working on.

> **Folder-name trap:** the client folders inside `Orderin-Green-Theme/` **and**
> `Orderin-Maroon-Theme/` are *both* literally named `order_clients-Maroon`.
> They are **different apps** — different styling, and the Green one has extra
> Kitchen / Staff / Table pages that Maroon's does not.

---

## 3. The 16 apps

| # | App | Path | Kind | Lang | Tests |
|---|---|---|---|---|---:|
| 1 | Admin console | `orderin_admin` | standalone | **TS** | 90 |
| 2 | Black — client | `Orderin-Black-Theme/order_client_11` | client/staff | JS | 132 |
| 3 | Black — customer | `Orderin-Black-Theme/orderin_custmer_1` | customer | JS | 94 |
| 4 | Dessert — client | `Orderin-Dessert-Theme/order_clients-Dessert` | client/staff | JS | 132 |
| 5 | Dessert — customer | `Orderin-Dessert-Theme/orderin_custmer-Dessert` | customer | JS | 94 |
| 6 | Olive-green — client | `orderin-Client_Customer/order_clients-Olive_green-updated` | client/staff | JS | 129 |
| 7 | Olive-green — customer | `orderin-Client_Customer/orderin_custmer_1-Olive_green` | customer | JS | 121 |
| 8 | Green — client | `Orderin-Green-Theme/order_clients-Maroon` | client/staff | JS | 156 |
| 9 | Green — customer | `Orderin-Green-Theme/orderin_custmer-Maroon` | customer | JS | 127 |
| 10 | Maroon — client | `Orderin-Maroon-Theme/order_clients-Maroon` | client/staff | JS | 151 |
| 11 | Maroon — customer | `Orderin-Maroon-Theme/orderin_custmer-Maroon` | customer | JS | 127 |
| 12 | Stadium — client | `Orderin-Stadium-Theme/order_clients-Stadium` | client/staff | JS | 132 |
| 13 | Stadium — customer | `Orderin-Stadium-Theme/orderin_custmer-Stadium` | customer | JS | 94 |
| 14 | RED — client | `Orderin-RED-Theme/order_clients` | client/staff | JS | 132 |
| 15 | RED — customer | `Orderin-RED-Theme/orderin_custmer` | customer | JS | 95 |
| 16 | POS | `Orderin-Only-POS/pos-system` | standalone | JS | 47 |

~**1,850 automated tests** total. Counts and per-app notes: `Docs/TESTING.md`.

---

## 4. Themes explained

A **theme** is a full copy of the customer + client apps restyled for a
particular restaurant look (Black, Dessert, Green, Stadium, RED, Maroon,
Olive-green). They started as forks of one codebase — **Black is the baseline**
the others are compared against — so the screens, routes and logic are
~90% identical between themes. The differences are:

| Difference | Where it shows up |
|---|---|
| **Colour / styling / fonts / icons** | everywhere (cosmetic — not bugs) |
| **Button & heading copy** | Dessert especially ("CREATE POP AD", "Back", "Enter user ID"…) |
| **Extra pages — Kitchen Display** | Green client only |
| **Extra pages — Staff Login / Staff Management / Table Management** | Green + Maroon clients |
| **Public flipbook menu** (`src/publicMenu/`) | Olive-green, Green, Maroon **customer** apps |
| **Accepting-Orders modal** | Green, Maroon customer apps |
| **Awaiting-Confirmation screen + payment gate** | Olive-green customer app |
| **Redesigned Menu / Item Details / Profile** | RED customer app (different markup + labels) |
| **Finance tab set** | 6 tabs on Olive-green (opens on *Accounts*), 7 tabs elsewhere (incl. *Daily Transit*) |
| **Manual-order entry** | inline modal on Olive-green; standalone `ManualOrderModal` elsewhere |
| **Notification page** | Olive-green adds a "Queued Orders" tab + header badge; others are 2-tab |

A full theme-by-theme breakdown of what to check in each is in
**`Docs/THEME-TEST-GUIDE.md`**.

---

## 5. Getting started

### Prerequisites

- **Node 18+** and **npm** — `node -v`, `npm -v`.
- A modern browser with DevTools.
- (For deploys only) Firebase CLI — `npm i -g firebase-tools` — and access to the
  OrderIn Firebase project.

### Run any app

```bash
cd Orderin-Black-Theme/orderin_custmer_1     # pick an app folder
npm install                                  # first time in that folder only
npm run dev                                   # Vite dev server, prints a localhost URL
```

- **Customer apps** usually need a table number in the URL: `http://localhost:5173/?table=1`.
- **Client apps** open on a login screen; each section (Menu / Finance / Inventory /
  Staff) has its own passcode gate on top of the main login.
- **Admin** opens on `/login`; the passcode is `VITE_ADMIN_PASSCODE` (see §10).

---

## 6. Command reference

Run all of these **inside an app folder**.

| Command | What it does | Available in |
|---|---|---|
| `npm install` | Install that app's dependencies | all |
| `npm run dev` | Start the Vite dev server (hot reload) | all |
| `npm run build` | Production build → `dist/` | all |
| `npm run preview` | Serve the built `dist/` locally | all |
| `npm test` | Vitest in **watch** mode | all |
| `npm test -- --run` / `npm run test:run` | Vitest, single pass, exits | all |
| `npm run coverage` | Vitest + coverage → `coverage/index.html` | all |
| `npm run lint` | ESLint (`orderin_admin`) / oxlint (`pos-system`) | admin, POS |
| `npm run deploy:hosting` | `firebase deploy --only hosting` | client & customer apps |
| `npm run deploy:rules` | Deploy Firestore + Storage rules | client & customer apps |
| `npm run deploy:razorpay-functions` | Deploy the 3 Razorpay Cloud Functions | Black client (reference) |
| `npm run emu:auth` | Start the Firebase Auth emulator | customer apps |

### `npm run build` note

- **`orderin_admin`** builds with `tsc -b && vite build` — a **type error fails
  the build**. If `npm run build` exits non-zero, run `npx tsc -b` alone to see
  the TypeScript errors. (Test files are excluded from the build tsconfig; a
  regression here was fixed in the last audit — see `Docs/BUGFIXES.md` #3.)
- Every other app builds with plain `vite build`.
- All production builds **strip `console.*` and `debugger`** via
  `esbuild.drop` (dev builds keep them). Config is mode-aware in each
  `vite.config.*`.

### Run the whole suite (from the repo root)

```bash
for d in $(find . -maxdepth 3 -name vitest.config.* ! -path '*/node_modules/*' -exec dirname {} \;); do
  echo "==== $d ===="
  ( cd "$d" && npx vitest run --reporter=dot ) || echo "FAILED: $d"
done
```

---

## 7. How one app is structured

Client and customer apps share this shape (paths from `src/`):

```
src/
├── index.jsx / main.jsx        # entry
├── App.jsx                     # <BrowserRouter> + <Routes>
├── AppContent.jsx              # (customer) route table + auth wrapper
├── routes.jsx                  # (client) named-route constants
├── firebase.js / firebaseConfig.js   # Firebase init (OUT OF SCOPE for frontend QA)
├── components/                 # shared UI — ProtectedRoute, modals, cards…
├── contexts/  context/         # React context providers:
│   ├── CartContext             # (customer) the cart
│   └── NotificationContext     # live order/notification stream
├── hooks/                      # custom hooks
├── services/                   # data-access layer, one file per domain:
│   ├── orderService            # orders CRUD + live subscriptions
│   ├── storageService / imgbbService   # image uploads
│   ├── inventory*Service       # stock, batches, recipes, status
│   ├── salesTrendService / illusionPricingService
│   ├── staffService            # (Green/Maroon client) staff, zones, teams, roster
│   └── tableService            # (Green/Maroon client) tables
├── <feature>/                  # one folder per screen (menu/, cart/, payments/…)
│   └── __tests__/*.test.jsx    # tests live next to the code
├── test/                       # setup.js (global) + test-utils.jsx (render helpers)
└── **/__snapshots__/*.snap     # committed snapshots
```

`orderin_admin` differs: TypeScript, a **Zustand** store (`src/store/`) instead
of React context, `src/layouts/AppLayout.tsx`, and `recharts` dashboards.

`pos-system` differs: offline-first — **IndexedDB** (`idb`) with a sync queue
that flushes to Firestore on reconnect, plus a local access-control / passcode
layer.

---

## 8. Pages & routes

### Customer app (all themes — routes from `AppContent.jsx`)

| Route | Screen | Notes |
|---|---|---|
| `/` | Login | Olive-green/Green/Maroon: `/` is the **public flipbook menu**, login moves to `/login` |
| `/menu` | Menu | categories, search, veg/non-veg filter, time-of-day greeting (not in RED) |
| `/item/:slug` | Item details | description, price, quantity, add-to-cart |
| `/cart` | Cart | quantities, remove, subtotal/tax/total |
| `/payments` | Payments | Razorpay hand-off; Olive-green gates this behind a confirmed order |
| `/payment-success` | Payment success | |
| `/counter-code` | Counter code | pay-at-counter path |
| `/online-payment` | Online payment | |
| `/bill` | Bill / receipt | "Download" lazy-loads `html2pdf.js` |
| `/profile` | Profile | order history + liked list |
| `/help` | Help | |
| `/about` | About the restaurant | |
| `/about-orderin` | About OrderIn | |
| `*` | → redirect to `/menu` | |

### Client / staff app (all themes — named routes in `routes.jsx`)

Every protected route is wrapped in `ProtectedRoute` (main login) and most
section routes add a `SectionProtectedRoute` (per-section passcode, stored in
`sessionStorage` as `menuAuth` / `financeAuth` / `inventoryAuth` / …).

| Route | Screen | Gate |
|---|---|---|
| `/` | Login | — |
| `/dashboard` | Dashboard (KPIs, nav) | main |
| `/orders` | Orders — list, accept/reject, manual order | main |
| `/menu-login` → `/menu` | Menu management | main + `menuAuth` |
| `/promotions` | Promotions / ad builder | main + `menuAuth` |
| `/finance-login` → `/finance` | Finance (6–7 tabs) | main + `financeAuth` |
| `/inventory-login` → `/inventory` | Inventory | main + `inventoryAuth` |
| `/notification` | Notifications | main |
| **Green + Maroon only:** `/staff-login` → staff mgmt | Staff Management, Table Management | main + staff gate |
| **Green only:** Kitchen Display | order lanes New / Preparing / Ready | main |

### Admin console (`orderin_admin` — `src/App.tsx`)

| Route | Screen | Gate |
|---|---|---|
| `/login` | Login (passcode) | — |
| `/dashboard` | Dashboard (recharts) | `RequireAuth` |
| `/restaurants` | Restaurants list | `RequireAuth` |
| `/restaurants/:restaurantId` | Restaurant detail | `RequireAuth` |
| `/ledger` | Ledger | `RequireAuth` |
| `/settlements` | Settlements | `RequireAuth` |
| `/settings` | Settings | `RequireAuth` |
| `/pay`, `/pay/status` | Razorpay hand-off (customer-facing) | **none** (intentional) |
| `/`, `*` | → `/login` | — |

`RequireAuth` is a **client-side** `sessionStorage` gate set by `LoginPage` on a
correct passcode — it stops the console rendering for un-authed URLs but is not
server-side auth. (Added in the last audit — `Docs/BUGFIXES.md` #3.)

### POS (`pos-system` — `src/pages/`)

`Login`, `Dashboard`, `POS` (order entry), `Orders`, `Kitchen`, `Menu`,
`Inventory`, `Suppliers`, `Customers`, `Employees`, `Expenses`, `Invoices`,
`Reports`, `Analytics`, `Notifications`, `AuditLog`, `Settings`. Access per
screen is governed by the local access-control layer (`src/lib/`).

---

## 9. Tech stack

| Layer | Choice |
|---|---|
| Build | **Vite** (all apps) |
| UI | **React 18**, `react-router-dom` v6 |
| State | React Context (`Cart`, `Notification`) — client/customer apps; **Zustand** — admin |
| Icons | `lucide-react`, `react-icons` |
| Charts | `recharts` (admin, POS) |
| Dates | `react-datepicker` (client), `date-fns` (admin) |
| PDF | `html2pdf.js` (customer bill — lazy-loaded) |
| QR | `qrcode` (customer) |
| Hashing | `bcryptjs` (client section passcodes) |
| Offline store | `idb` (IndexedDB) — POS only |
| Backend SDK | `firebase` (v9 modular) — **out of scope for frontend QA** |
| Payments | Razorpay (client SDK + Firebase Functions) |
| Tests | **Vitest** (v2 for admin, v3 elsewhere) + React Testing Library + jsdom |
| Lint | ESLint (admin), oxlint (POS); other apps have no lint script |

---

## 10. Environment variables

Each app reads `import.meta.env.VITE_*` from a local `.env` (git-ignored). Ask a
lead for the real values — they are not in the repo.

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_FIREBASE_*` (apiKey, authDomain, projectId, …) | all | Firebase project config |
| `VITE_ADMIN_PASSCODE` | `orderin_admin` | Admin login passcode (falls back to a default if unset — set it for production) |
| `VITE_RAZORPAY_KEY_ID` | apps that take payment | Razorpay public key |
| `VITE_IMGBB_KEY` | client apps | image upload (imgbb) fallback |

`.gitignore` already covers `.env`, `.env.local`, `.env.*.local`, `rzp-key.csv`,
`coverage/`, `dist/`, `build/`, `.firebase/`.

---

## 11. Docs folder

Long-form documentation lives in **`Docs/`**. Read in this order for your role:

| Doc | For | Status |
|---|---|---|
| **`Docs/TESTING.md`** | Engineers, QA | ✅ current — the full spec of the test suite: per-app counts, the shared scaffold, mocking conventions, what a green run looks like, per-app gotchas, CI matrix |
| **`Docs/THEME-TEST-GUIDE.md`** | QA | ✅ current — every theme's screens and what to check that's specific to it; cross-theme regression checklist |
| **`Docs/QA-INTERN-ONBOARDING.md`** | New QA hires | ✅ current — how the QA role works day-to-day, bug-report format, severity guide, first-week plan. *(Fill in the bug-tracker location placeholder in §5.)* |
| **`Docs/BUGFIXES.md`** | Everyone | ✅ current — every bug found & fixed in the 2026-09 frontend audit, with severity, root cause, and the fix. This is also the **template for a good bug report**. |

### Payment / backend notes at the repo root — **verify before trusting**

These predate the current codebase and describe the Firebase/Razorpay backend,
which is **not in this repo**. Treat them as historical reference and confirm
against the live Firebase project + Functions before acting on them:

| File | Claims to cover | Verify |
|---|---|---|
| `RAZORPAY_INTEGRATION_GUIDE.md` | End-to-end Razorpay setup | Function names, env var names, dashboard steps |
| `RAZORPAY_SETUP_QUICK_START.md` | Short setup path | Key IDs, webhook URLs |
| `RAZORPAY_IMPLEMENTATION_SUMMARY.md` | What was built | Whether it matches `PaymentHubPage.tsx` today |
| `RAZORPAY_DEPLOYMENT_FIX.md` | A past deployment issue | Whether it still applies |
| `BILLING_GUARD.md` | Which Firebase Functions are allowed to stay deployed (cost control) | Still the policy? Only `createRazorpayOrder` + `verifyRazorpayPayment` should be live. |

> Suggested cleanup (not done): move the Razorpay/billing files into
> `Docs/backend/` and date-stamp each, or fold the still-accurate parts into a
> single `Docs/PAYMENTS.md`.

---

## 12. Testing

Every app has a Vitest + React Testing Library + jsdom suite. Tests sit in
`__tests__/` next to the code, with committed snapshots.

```bash
cd <app-folder>
npm test -- --run          # single pass
npm run coverage           # + open coverage/index.html
```

**A green run** = `Test Files N passed (N)`, `Tests M passed (M)`, no `FAIL`, no
`Unhandled Errors`, snapshots `passed` (not `written` / `obsolete`).

Full detail — scaffold, mocking rules (`restoreMocks` gotcha, `findBy` for async,
stable store refs for admin), per-app quirks, coverage config, CI matrix — is in
**`Docs/TESTING.md`**. What to manually click through per theme is in
**`Docs/THEME-TEST-GUIDE.md`**.

---

## 13. Known bugs & the last audit

A frontend-only QA audit (2026-09, Firebase explicitly out of scope) found and
**fixed**:

- **Critical** — RED customer header crashed on any click (undeclared ref);
  Olive-green customer payment screen crashed on every real order (Rules of
  Hooks); admin `npm run build` was silently broken (test files in the build
  tsconfig); admin passcode was hardcoded *and printed on the login page*, with
  no route guard at all.
- **High** — theme client apps looped the Back button on a bad URL (missing
  `replace`); customer apps eagerly bundled `html2pdf.js` into the main chunk.
- **Medium** — Stadium customer menu never closed on outside click; admin
  double-fetched transactions on mount.
- **Low / a11y** — `console.*` shipped in production builds; hamburger menu had
  no keyboard support.

Every entry with root cause, the exact fix, and verification: **`Docs/BUGFIXES.md`**.

**Not fixed** (need a browser, image tooling, or a product decision): a 4.5 MB
PNG in the Dessert customer app, a hot-linked stock image in three customer
apps, route-level code-splitting, and full responsive / contrast / Lighthouse
audits.

---

## 14. Deployment

Each client & customer app is deployed to **Firebase Hosting** as its own site,
from its own folder:

```bash
cd Orderin-Black-Theme/orderin_custmer_1
npm run build
npm run deploy:hosting          # firebase deploy --only hosting
npm run deploy:rules            # Firestore + Storage rules, when they change
```

**Cloud Functions** (payments) — deploy only the three allowed ones:

```bash
cd Orderin-Black-Theme/order_client_11
npm run deploy:razorpay-functions
# createRazorpayOrder, verifyRazorpayPayment, scheduledRazorpaySettlementSync
```

Per `BILLING_GUARD.md`, keep the function set minimal for cost —
`syncRazorpayPayment` / `razorpayWebhook` stay **deleted** unless settlement
reconciliation is explicitly needed and the billing impact is accepted. **Verify
this is still the policy** before deploying.

Pre-deploy checklist per app:
1. `npm run build` exits **0** (admin: watch the `tsc -b` step).
2. `npm test -- --run` is green.
3. `.env` has the production `VITE_*` values (esp. `VITE_ADMIN_PASSCODE`).
4. Manual smoke test per `Docs/THEME-TEST-GUIDE.md`.

---

## 15. Conventions

- **Work inside the app folder.** No root install; no cross-app imports.
- **Match the surrounding code** — the themes are forks; a fix in Black usually
  ports to the other themes' copy of the same file. `diff` to confirm.
- **Tests next to code**, in `__tests__/`. New screen → new test file; copy the
  nearest existing one for the mocking boilerplate.
- **Snapshots**: review the `.snap` diff before committing an update (`-u`).
- **No `console.*` reliance** in shipped behaviour — it's stripped from prod builds.
- **Firebase / Auth / Storage issues** are backend, not frontend — route them to
  the backend owner, don't log them as frontend bugs.
- Commit messages: short imperative subject; group related edits.
