# Frontend Bug Fixes — 2026-09-03

Fixes applied from the frontend-only QA audit (Firebase/Firestore/Auth/Storage
explicitly out of scope). Every fix below was verified against the existing
Vitest suite (targeted rerun + a full 16-app sweep — 1,858 tests green) and,
where the change could affect the production bundle, a fresh `npm run build`.

See [`TESTING.md`](./TESTING.md) for how to run the tests and coverage in any
app. Nothing in this round has been committed.

---

## CRITICAL

### 1. RED customer app — click anywhere threw a `ReferenceError`

**File:** `Orderin-RED-Theme/orderin_custmer/src/header/header.jsx`

The outside-click handler on the hamburger menu referenced an undeclared
`menuWrapperRef` — the ref actually attached to the menu panel was named
`sideMenuRef`. The listener was registered on `document` at mount with `[]`
deps, so it fired on **every click anywhere in the app**, throwing every
time.

**Fix:** `menuWrapperRef.current` → `sideMenuRef.current` (2 lines).

Also removed the test's `globalThis.menuWrapperRef = { current: null }`
workaround in `header.test.jsx`, since the handler no longer needs it.

---

### 2. Olive-green customer app — payment screen crashed for every real order

**File:** `orderin-Client_Customer/orderin_custmer_1-Olive_green/src/payments/Payments.jsx`

`if (initializing) return <Loading/>;` sat *above* two `useState` calls and a
`useEffect`. First render (`initializing=true`) ran 5 hooks and returned
early; once the mount effect flipped `initializing=false`, the next render
ran 7 hooks — React throws **"Rendered more hooks than during the previous
render"**. Any customer who reached `/payments` with a confirmed order saw
the whole page crash.

**Fix:** moved the `isSaving`/`resolvedImages` state and the image-resolving
`useEffect` above the `initializing` guard, so every hook runs on every
render (Rules of Hooks).

**Test:** `payments/__tests__/Payments.test.jsx` rewritten — it previously
only covered the loading-gate/redirect path (the only path that didn't
crash); it now also seeds a confirmed order and asserts the checkout screen
actually renders + a snapshot of it.

---

### 3. Admin console — build was broken, and the app was unguarded

**Files:**
- `orderin_admin/tsconfig.app.json`
- `orderin_admin/src/App.tsx`
- `orderin_admin/src/pages/LoginPage.tsx`
- `orderin_admin/src/components/Sidebar.tsx`
- `orderin_admin/src/pages/__tests__/__snapshots__/LoginPage.test.tsx.snap`

Three separate problems bundled into one app:

**3a. `npm run build` (`tsc -b && vite build`) silently failed.**
`tsconfig.app.json` had `"include": ["src"]` with no test exclusion, so
`tsc -b` tried to type-check `src/**/__tests__/*.test.tsx` with no vitest
types in scope — ~60 `TS2304`/`TS2593` errors (`Cannot find name 'expect'`,
`'it'`, `'vi'`, `'describe'`). `tsc -b` failing means `&& vite build` never
runs — **there was no way to produce a `dist/` for this app.**
Fix: added an `"exclude"` for `*.test.ts(x)`, `__tests__/**`, and `src/test/**`.

**3b. The admin passcode was hardcoded and displayed on the login screen.**
`LoginPage.tsx` checked `password !== '123456789'` and had a "✨ Demo
Credentials" card that printed `123456789` in plain text on the page.
Fix: removed the on-page credentials card entirely; the passcode now reads
from `import.meta.env.VITE_ADMIN_PASSCODE` (falling back to the same value
when the env var isn't set, so nothing breaks before it's configured).

**3c. Every route was reachable with no auth check.**
`/dashboard`, `/restaurants`, `/ledger`, `/settlements`, `/settings` rendered
regardless of login state — navigating straight to a URL bypassed
`LoginPage`. There was also no catch-all `*` route, so a typo'd/stale URL
rendered a blank white screen.
Fix: added a `RequireAuth` wrapper that checks a `sessionStorage` flag set by
`LoginPage` on successful login, wrapped every protected route in it, added
`sessionStorage.removeItem('orderin_admin_auth')` to the Sidebar's logout
handler, and added `<Route path="*" element={<Navigate to="/login" replace />} />`.

> Caveat carried into the audit report: this is a client-side gate, not real
> authentication — it stops the console from *rendering* for an unauthed
> visitor but doesn't stop a determined user from setting the flag
> themselves via devtools. Real admin auth is a backend decision outside a
> frontend-only fix.

---

## HIGH

### 4. Theme client apps — Back button looped on a bad URL

**Files (7):** `src/App.jsx` in —
`Orderin-Black-Theme/order_client_11`,
`Orderin-Dessert-Theme/order_clients-Dessert`,
`Orderin-Green-Theme/order_clients-Maroon`,
`Orderin-Maroon-Theme/order_clients-Maroon`,
`Orderin-RED-Theme/order_clients`,
`Orderin-Stadium-Theme/order_clients-Stadium`,
`orderin-Client_Customer/order_clients-Olive_green-updated`

The catch-all route (`<Route path="*" element={<Navigate to={routes.login} />} />`)
was missing `replace`, so a bad URL redirected to login but stayed in
browser history — Back bounced straight to the bad URL, which redirected
again, forever.

**Fix:** added `replace` to all 7.

---

### 5. All 7 customer apps — PDF library loaded on every page view

**Files:** `src/Bill.jsx` in every `orderin_custmer*` app (Black, Dessert,
Green, Maroon, RED, Stadium, olive-green).

`import html2pdf from "html2pdf.js"` was a static top-level import — a
~250 KB+ gzipped PDF/canvas library got bundled into the **main** chunk and
downloaded by every visitor, even though it's only used if the customer taps
"Download" on their receipt.

**Fix:** converted to `const { default: html2pdf } = await import("html2pdf.js");`
inside `downloadBill()`. Verified in a real production build (Black customer
app): `dist/index.html` no longer references the `pdf-*.js` chunk at all —
it's only reachable via the dynamic-import call site, so it's fetched on
demand.

(Client apps' `BillModal.jsx` already lazy-loads html2pdf via CDN script
injection — no change needed there.)

---

## MEDIUM

### 6. Stadium customer app — side menu never closed on outside click

**File:** `Orderin-Stadium-Theme/orderin_custmer-Stadium/src/header/header.jsx`

`wrapperRef` was declared (`useRef(null)`) and read in the outside-click
handler, but **never attached to any element** — so `wrapperRef.current` was
always `null` and the click-outside condition was permanently false.

**Fix:** the handler now checks `sideMenuRef` (the ref actually attached to
the `side-menu` div); removed the dead `wrapperRef` declaration.

---

### 7. Admin console — duplicate data fetch on every mount

**File:** `orderin_admin/src/App.tsx`

`loadCustomerTransactions()` was called twice on mount: once nested inside
`loadPrimaryRestaurants().then()`, once again standalone right after,
unconditionally — duplicating the fetch/store work every load.

**Fix:** removed the redundant standalone call; kept the sequenced one
(transactions are joined against restaurant data, so loading restaurants
first is the correct order).

---

### 8. All 7 customer apps — menu icon and menu items had no keyboard access (a11y)

**Files (7):** `src/header/header.jsx` in every `orderin_custmer*` app
(same list as #5).

The hamburger icon was a bare `<svg onClick>` and each side-menu entry was a
`<div onClick>` — neither focusable nor operable from a keyboard, and
announced as nothing useful to a screen reader.

**Fix:** added, without touching any CSS class or visual structure:
- `role="button"`, `tabIndex={0}`, `aria-label="Open menu"`,
  `aria-haspopup="true"`, `aria-expanded={isMenuOpen}`, and an
  Enter/Space `onKeyDown` on the `<svg>`.
- `role="menu"` on the side-menu panel; `role="menuitem"`, `tabIndex={0}`,
  and the same Enter/Space `onKeyDown` on each `<div className="menu-item">`.
- Click handlers were extracted into named functions (`goAboutOrderIn`,
  `goAboutRestaurant`, `goHelp`) shared between `onClick` and `onKeyDown` so
  the logic isn't duplicated.

Snapshots for these headers were regenerated (the DOM legitimately changed);
all interaction/render tests were unaffected (4–5 passing per app before and
after — only the snapshot needed a refresh).

---

## LOW (build-wide)

### 9. `console.*` stripped from every production build

**Files (16):** `vite.config.{js,ts}` in every app.

The codebase has ~1,325 `console.log` calls left in from development. Rather
than edit every call site, every `vite.config` now sets:

```js
esbuild: {
  drop: mode === 'production' ? ['console', 'debugger'] : [],
},
```

`npm run dev` still logs normally (`mode` is `'development'` there);
`npm run build` strips all `console.*`/`debugger` calls from the output.
Verified on a real build: 0 occurrences of `console.log` left in the built
`dist/*.js` for `Orderin-Black-Theme/order_client_11`.

This required converting each `export default defineConfig({...})` to the
mode-aware function form `export default defineConfig(({ mode }) => ({...}))`;
existing `esbuild`/`build.rollupOptions`/`cacheDir` options in each config
were preserved as-is.

---

## Not fixed (needs a browser, an asset tool, or a product decision)

- **`Orderin-Dessert-Theme/orderin_custmer-Dessert`** — a 4.5 MB PNG and a
  700 KB "SVG" (likely an embedded raster) ship in `dist/assets/`. Needs
  actual image compression/resizing, not a safe blind edit.
- **`*/publicMenu/components/RestaurantCover.jsx`** (olive-green, Green,
  Maroon customer apps) — hot-links a third-party Vecteezy stock image.
  Needs a licence check before downloading it as a local asset.
- **Full route-level code-splitting** (`React.lazy` per page) — every client
  app still ships one 0.9–1.1 MB JS chunk. Valuable, but touches every route
  in every app and is hard to verify without a browser to click through the
  result.
- **Responsive layout (375/768/1440), colour contrast, Lighthouse metrics,
  CLS** — none of these were audited; they need a real Chrome session, which
  wasn't available in this environment.

---

## File index (everything touched this round)

| Bug # | Files |
|---|---|
| 1 | `Orderin-RED-Theme/orderin_custmer/src/header/header.jsx`, `.../header/__tests__/header.test.jsx` |
| 2 | `orderin-Client_Customer/orderin_custmer_1-Olive_green/src/payments/Payments.jsx`, `.../payments/__tests__/Payments.test.jsx` (+ new snapshot) |
| 3 | `orderin_admin/tsconfig.app.json`, `src/App.tsx`, `src/pages/LoginPage.tsx`, `src/components/Sidebar.tsx`, `src/pages/__tests__/__snapshots__/LoginPage.test.tsx.snap` |
| 4 | `src/App.jsx` in all 7 theme client apps |
| 5 | `src/Bill.jsx` in all 7 customer apps |
| 6 | `Orderin-Stadium-Theme/orderin_custmer-Stadium/src/header/header.jsx` |
| 7 | `orderin_admin/src/App.tsx` (same file as #3) |
| 8 | `src/header/header.jsx` in all 7 customer apps (same files as #1/#5/#6 where they overlap) + regenerated `header/__tests__/__snapshots__/header.test.jsx.snap` in all 7 |
| 9 | `vite.config.{js,ts}` in all 16 apps |
