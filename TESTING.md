# OrderIn — Frontend Test Suite

Automated component & page tests for every OrderIn frontend, using **Vitest +
React Testing Library + jsdom**. ~**1,850 tests** across **16 apps**.

---

## 1. The apps

OrderIn ships as one restaurant platform in several colour **themes**. Each
theme folder contains **two Vite apps**:

| Piece | Folder pattern | What it is |
|---|---|---|
| **Client / staff app** | `order_client*` / `order_clients*` | Dashboard, Orders, Kitchen, Finance, Inventory, Menu management, Promotions, Staff/Table management, section logins |
| **Customer app** | `orderin_custmer*` | The diner-facing ordering flow: Menu → Item → Cart → Payments → Bill, Profile, Help, public flipbook menu |

Plus two standalone apps: the **admin console** and the **POS system**.

| # | App | Path | Tests | Notes |
|---|---|---|---:|---|
| 1 | Admin console | `orderin_admin` | 90 | TypeScript, Zustand store, Firebase. Only standalone TS app. |
| 2 | Black — client | `Orderin-Black-Theme/order_client_11` | 132 | Baseline the other themes were ported from. |
| 3 | Black — customer | `Orderin-Black-Theme/orderin_custmer_1` | 94 | |
| 4 | Dessert — client | `Orderin-Dessert-Theme/order_clients-Dessert` | 132 | |
| 5 | Dessert — customer | `Orderin-Dessert-Theme/orderin_custmer-Dessert` | 94 | |
| 6 | Olive‑green — client | `orderin-Client_Customer/order_clients-Olive_green-updated` | 129 | The "origin" iteration; Finance opens on **ACCOUNTS** (6 tabs, no *Daily Transit*). |
| 7 | Olive‑green — customer | `orderin-Client_Customer/orderin_custmer_1-Olive_green` | 121 | Adds the **`publicMenu/` flipbook** feature (14 components) + `AwaitingConfirmation`. |
| 8 | Green — client | `Orderin-Green-Theme/order_clients-Maroon` | 156 | Adds **KitchenDisplay, StaffLogin, StaffManagement, TableManagement** pages. |
| 9 | Green — customer | `Orderin-Green-Theme/orderin_custmer-Maroon` | 127 | Adds `AcceptingOrdersModal`. |
| 10 | Stadium — client | `Orderin-Stadium-Theme/order_clients-Stadium` | 132 | Black‑style Finance/Orders (7 tabs, *Daily Transit*, standalone `ManualOrderModal`). |
| 11 | Stadium — customer | `Orderin-Stadium-Theme/orderin_custmer-Stadium` | 94 | |
| 12 | RED — client | `Orderin-RED-Theme/order_clients` | 132 | ≈ Stadium client. |
| 13 | RED — customer | `Orderin-RED-Theme/orderin_custmer` | 95 | Menu / ItemDetails / Profile were **redesigned** — different markup from other customer apps. |
| 14 | Maroon — client | `Orderin-Maroon-Theme/order_clients-Maroon` | 151 | ≈ Green client but **no KitchenDisplay**; StaffManagement manages zones/teams dynamically. |
| 15 | Maroon — customer | `Orderin-Maroon-Theme/orderin_custmer-Maroon` | 127 | ≈ Green customer. |
| 16 | POS | `Orderin-Only-POS/pos-system` | 47 | Fully standalone: **IndexedDB + offline sync‑queue + Firebase accessControl**. Not a theme clone. |

> **Theme naming quirk:** the folders inside `Orderin-Green-Theme/` and
> `Orderin-Maroon-Theme/` are *both* named `*-Maroon`. They are **not**
> duplicates — different styling, and Green has the extra Kitchen/Staff/Table
> pages.

---

## 2. Prerequisites

- **Node 18+** and **npm**.
- Each app is an independent npm project. Run all commands **from inside that
  app's folder**, and `npm install` there first if `node_modules/` is missing.

```bash
cd Orderin-Black-Theme/order_client_11
npm install          # first time only
```

Test tooling already in each app's `devDependencies`:
`vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`, `@vitejs/plugin-react`, `@vitest/coverage-v8`.

---

## 3. Running the tests

From inside any app folder:

```bash
npm test                    # watch mode (re-runs on file change)
npm test -- --run           # single pass, exit when done
npx vitest run              # same as above, explicit
npx vitest run src/pages    # only the page tests
npx vitest run -t "Login"   # only tests whose name matches "Login"
npx vitest run Dashboard.test.jsx     # one file
```

- `npm test` maps to `vitest` (watch). Use `-- --run` in CI / one‑offs.
- The admin app runs on **Vitest 2**; every other app on **Vitest 3**. Output
  and flags are the same.

### Run every app in one go

```bash
# from the repo root
for d in $(find . -maxdepth 3 -name vitest.config.* ! -path '*/node_modules/*' -exec dirname {} \;); do
  echo "==== $d ===="
  ( cd "$d" && npx vitest run --reporter=dot ) || echo "FAILED: $d"
done
```

Expect a full run to take a few minutes per app (jsdom + ~130 tests).

---

## 4. Coverage report (the "HTML file" like Jest)

Vitest doesn't bundle coverage; the provider (`@vitest/coverage-v8`) is
installed and configured in every app.

```bash
npm run coverage            # = vitest run --coverage
```

This prints a text summary **and** writes:

```
coverage/
├── index.html      ← open this in a browser (same drill-down as Jest)
├── lcov.info       ← for CI badges / IDE gutter plugins
└── ...
```

```bash
start coverage/index.html   # Windows
open  coverage/index.html   # macOS
```

> **`coverage/` is generated output.** It does **not** exist in a fresh
> checkout and is **git‑ignored** in every app — the folder only appears
> *after* you run `npm run coverage` (or `npx vitest run --coverage`) inside
> that app. Nothing is wrong if a theme has no `coverage/` folder yet; run the
> command there and it will be created.

**Config** (in each `vitest.config.*`, under `test.coverage`):

```js
coverage: {
  provider: 'v8',
  reportOnFailure: true,   // still write the HTML report if some tests fail
  reporter: ['text', 'html', 'lcov'],
  reportsDirectory: './coverage',
  include: ['src/**/*.{js,jsx,ts,tsx}'],
  exclude: [
    'src/**/*.test.{js,jsx,ts,tsx}',
    'src/**/__tests__/**',
    'src/test/**',
    'src/main.{jsx,tsx}',
    'src/**/*.d.ts',
  ],
}
```

Current baseline (statements): admin ~52 %, theme clients ~38 %. Coverage is
concentrated on components, contexts, guards and page happy‑paths; the large
data‑heavy pages (Finance, Inventory, MenuPage, POS.jsx) are smoke‑tested
rather than exhaustively covered.

---

## 5. How the tests are wired

Every app has the same scaffold:

```
src/
├── test/
│   ├── setup.js            # global test setup — loaded before every file
│   └── test-utils.jsx      # renderWithRouter / renderWithCart helpers
├── <feature>/
│   └── __tests__/
│       └── Thing.test.jsx  # tests live next to the code
└── **/__snapshots__/*.snap # committed snapshots
vitest.config.{js,ts}       # globals:true, jsdom, setupFiles, coverage
```

### `src/test/setup.js` does three things

1. `import '@testing-library/jest-dom/vitest'` + auto‑`cleanup()` after each test.
2. **Stubs every `firebase/*` SDK entry point** (`app`, `firestore`, `auth`,
   `analytics`, `storage`) so any module that imports Firebase loads under
   jsdom without touching the network.
3. In a `beforeEach`, re‑installs jsdom gaps the apps read —
   `window.matchMedia`, `alert`/`confirm`/`prompt`, `ResizeObserver`,
   `scrollIntoView`, `history.pushState/replaceState`. (These are re‑installed
   every test because `restoreMocks: true` wipes `vi.fn()` implementations
   between tests.)

### Mocking conventions in the tests

| Dependency | How it's handled |
|---|---|
| `firebase/*` | Stubbed globally in `setup.js`; per‑test `vi.mock` when a specific document/value is needed. |
| `../services/orderService`, `../lib/repo`, etc. | `vi.mock`'d per file with `vi.fn()` returning fixtures. **Use plain `() => Promise.resolve(x)` inside `vi.mock` factories** — a `vi.fn().mockResolvedValue()` gets reset to `undefined` by `restoreMocks: true` between tests. |
| React Router | `vi.mock('react-router-dom', …)` overriding `useNavigate` / `useParams` / `useLocation` / `useSearchParams`; `<MemoryRouter>` for rendering. |
| Zustand store (admin) | `vi.mock('../store')` + `applyStoreMock` / `buildStoreState` from `src/test/mockStore.ts`. |
| Contexts (`CartContext`, `AuthContext`, `useNotification`, `ToastContext`) | `vi.mock` the hook module and return a fixture object. |
| Heavy child modals / panels | Mocked to a `<div data-testid>` stub so the page test stays focused. |
| `recharts` | `ResponsiveContainer` stubbed to a plain `<div>` (jsdom has no layout). |
| Async data (`useLiveQuery`, effect‑driven fetches) | Assert with `await screen.findBy…`, not `getBy…` — the data resolves on a microtask. |

### Each test file covers (per the brief)

- **Snapshot** — `expect(asFragment()).toMatchSnapshot()`.
- **Interaction** — `@testing-library/user-event` clicks / typing / submits.
- **Conditional rendering** — loading vs empty vs error vs populated states.
- **Mocking** — the table above.

Time/RNG‑dependent components (dashboards with a live clock, receipts, a menu
"good morning/evening" greeting, generated transaction IDs) freeze the clock
with `vi.useFakeTimers()` / `vi.spyOn(Math, 'random')` for their snapshot test.

---

## 6. What to check when running / changing tests

**A green run means:**
- `Test Files  N passed (N)` and `Tests  M passed (M)` — no `FAIL`.
- No `Unhandled Errors` section (async errors after a test finished still fail
  the run even if assertions passed).
- `Snapshots  X passed` — **no `written` or `obsolete`** on a normal run. A
  `written` line means a snapshot was missing and just got created; commit it
  and re‑run to confirm it's stable.

**When you change a component:**
1. Run its test file. If a snapshot now legitimately differs, update it:
   `npx vitest run <file> -u` (or press `u` in watch mode), then eyeball the
   `.snap` diff before committing.
2. If a label / role / placeholder the test queries by changed, update the
   query — don't loosen it to `getByText(/…/)` unless the text really is split
   across elements.

**When you add a component or page:** add a `__tests__/` file next to it. Copy
the closest existing test in the same app as a starting point — the mocking
boilerplate is the bulk of it.

**Porting a fix across themes:** the theme apps are near‑clones. `diff` the
source file against the Black baseline; if a test in Black covers the changed
behaviour, the same edit usually applies to every theme's copy of that test.

### Per‑app gotchas

| App | Watch out for |
|---|---|
| `orderin_admin` | Vitest **2** (not 3). `PaymentHubPage` has a `useEffect` keyed on the restaurant object — store mocks **must return a stable reference** or the component infinite‑loops and hangs the run. |
| Green / Maroon clients | `StaffManagement` needs a large `staffService` mock — every `subscribe*` must call its callback with `[]` (or a config object), and `datesForWeek` must return **7 real `Date`s** or the roster tab throws. Maroon additionally needs `subscribeStaffConfig` / `addZone` / `removeZone` / `addTeam` / `removeTeam`. |
| Green client | `KitchenDisplay` back button says **"← Dashboard"**, lanes only label New / Preparing / Ready. |
| Olive‑green customer | `Payments.jsx` has a **Rules‑of‑Hooks bug** (see §7); its test only covers the loading‑gate + redirect paths. |
| RED customer | `Menu` search is `placeholder="Search menu"`, veg filters are `aria-label` `Veg` / `All` / `Non-Veg`; `ItemDetails` loading text is `Loading item details...`; `Profile` sections are `Order History` / `Liked List`. `header.jsx` bug — see §7. |
| POS | `vitest.config.js` needs `esbuild: { jsx: 'automatic' }` (components don't `import React`). Pages driven by `useLiveQuery` resolve async → assert with `findBy`. |

---

## 7. Bugs the tests surfaced (documented, **not** fixed — out of scope)

1. **`orderin-Client_Customer/orderin_custmer_1-Olive_green/src/payments/Payments.jsx`**
   — violates the Rules of Hooks: an early `return <Loading/>` sits above later
   `useState` / `useEffect` calls, so when `initializing` flips to `false` React
   renders *more* hooks than before and throws
   *"Rendered more hooks than during the previous render."*

2. **`Orderin-RED-Theme/orderin_custmer/src/header/header.jsx`** — the
   always‑on `mousedown` handler references an **undeclared `menuWrapperRef`**
   (the ref is actually named `sideMenuRef`), so any click that bubbles to
   `document` throws a `ReferenceError`. The header test neutralises it with
   `globalThis.menuWrapperRef = { current: null }`.

---

## 8. CI suggestion

Run each app as its own job (they're independent installs):

```yaml
strategy:
  matrix:
    app:
      - orderin_admin
      - Orderin-Black-Theme/order_client_11
      - Orderin-Black-Theme/orderin_custmer_1
      # … all 16
steps:
  - run: npm ci
    working-directory: ${{ matrix.app }}
  - run: npx vitest run --coverage --reporter=dot
    working-directory: ${{ matrix.app }}
  - uses: actions/upload-artifact@v4
    with:
      name: coverage-${{ matrix.app }}
      path: ${{ matrix.app }}/coverage
```
