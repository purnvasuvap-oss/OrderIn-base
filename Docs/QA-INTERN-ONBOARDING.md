# QA Intern — Onboarding 

Welcome to the OrderIn QA team. This is your starting guide: what the product
is, how to set up, what your day-to-day looks like, how we run and write tests,
and how to report what you find. Read it once end to end, then keep it open as a
reference.

Related docs in this repo:
- [`THEME-TEST-GUIDE.md`](./THEME-TEST-GUIDE.md) — what's inside each theme and what to check per theme (read alongside section 6 here).
- [`TESTING.md`](./TESTING.md) — the full technical spec of the automated test suite (deep detail).
- [`BUGFIXES.md`](./BUGFIXES.md) — every bug found and fixed in the last audit round, with reasoning. This is the bar for a good bug report.
- [`README.md`](./README.md) — one-paragraph overview + the app/theme table.

---

## 1. What OrderIn is

OrderIn is a restaurant ordering platform shipped in several colour **themes**
(Black, Dessert, Green, Stadium, RED, Maroon, Olive-green). Each theme is a
near-clone of the others — same screens, different styling and some copy.

Every theme folder contains **two apps**:

| App | Folder looks like | Who uses it | Key screens |
|---|---|---|---|
| **Customer app** | `orderin_custmer*` | The diner at the table | Menu → Item details → Cart → Payments → Bill; Profile; Help; public flipbook menu |
| **Client / staff app** | `order_client*` / `order_clients*` | Restaurant staff | Dashboard, Orders, Kitchen display, Finance, Inventory, Menu management, Promotions, Staff & Table management |

Plus two standalone apps:
- **`orderin_admin`** — the platform admin console (TypeScript). Onboards restaurants, ledgers, settlements.
- **`Orderin-Only-POS/pos-system`** — an offline-capable point-of-sale terminal.

Full list of all 16 apps with paths and test counts is in
[`TESTING.md` §1](./TESTING.md). Per-theme detail is in
[`THEME-TEST-GUIDE.md`](./THEME-TEST-GUIDE.md).

> **Naming quirk:** the folders inside `Orderin-Green-Theme/` and
> `Orderin-Maroon-Theme/` are *both* literally named `*-Maroon`. They are not
> duplicates — different theme, and Green has extra Kitchen/Staff/Table screens.

### What is **out of scope** for us right now

Anything **Firebase** — Firestore, Auth, Storage, Firebase config, SDK errors,
`.env` Firebase keys. The backend team owns that. If a bug is clearly "Firebase
didn't respond" / "auth token expired", note it and move on — don't log it as a
frontend bug.

Everything else on the frontend **is** in scope: broken UI, wrong logic, crashes,
bad navigation, console errors, accessibility, slow pages.

---

## 2. Environment setup (one time)

You need **Node 18 or newer** and **npm** (`node -v`, `npm -v` to check).

Each app is a **separate npm project**. There is no root install. You install and
run commands **inside the app folder** you're working on.

```bash
# example: set up the Black customer app
cd Orderin-Black-Theme/orderin_custmer_1
npm install
```

To run the app in a browser for manual testing:

```bash
npm run dev
# open the localhost URL it prints (usually http://localhost:5173)
```

If a customer page looks empty, it probably needs a table number in the URL —
try `?table=1`. Ask if unsure.

---

## 3. Your day-to-day

Your job has three parts. On any given day you'll do a mix.

### A. Run the automated tests and keep them green

We have ~1,850 automated tests (Vitest + React Testing Library). Before and after
any code change, they must all pass.

```bash
cd <app-folder>
npm test -- --run        # one pass, then exits
```

A green run = `Test Files N passed (N)`, `Tests M passed (M)`, **no `FAIL`**, **no
`Unhandled Errors`**, and snapshots show `passed` (not `written` or `obsolete`).

If something fails:
1. Read the failure message — it names the file, the test, and the assertion.
2. Decide: is it a **real bug in the app**, or did a test need updating because
   the UI legitimately changed?
3. Real bug → log it (section 5). Test out of date → fix the test (section 4).
4. Never "fix" a failing test by deleting it or loosening it until it passes
   without checking why it broke.

### B. Manual / exploratory testing

Run the app with `npm run dev` and actually click through it as a user would.
Use the checklist in section 6, plus the per-theme notes in
[`THEME-TEST-GUIDE.md`](./THEME-TEST-GUIDE.md). Keep the browser **DevTools
console open** — red errors there are bugs even if the screen looks fine.

### C. Write new tests

When a developer adds a screen or component, or when you find a bug, add a test
that covers it. Section 4 shows how.

---

## 4. How the automated tests work (and how to write one)

### Layout

Every app has the same shape:

```
src/
├── test/
│   ├── setup.js         # runs before every test file — stubs Firebase, browser APIs
│   └── test-utils.jsx   # renderWithRouter / renderWithCart helpers
├── <feature>/
│   └── __tests__/
│       └── Thing.test.jsx      # test sits next to the code it tests
└── **/__snapshots__/*.snap     # committed snapshot files
vitest.config.{js,ts}
```

### Useful commands (run inside an app folder)

```bash
npm test                         # watch mode — re-runs on save
npm test -- --run                # single pass
npx vitest run src/pages         # only tests under src/pages
npx vitest run -t "Login"        # only tests whose name contains "Login"
npx vitest run Cart.test.jsx     # one file
npx vitest run Cart.test.jsx -u  # update that file's snapshot (see below)
```

### Snapshots

A snapshot test records the rendered HTML of a component and fails if it changes.

- If the change is **intentional** (dev redesigned the button): run with `-u` to
  update the `.snap` file, then **look at the diff** before committing it.
- If the change is **not** intentional: that's a bug — the component is rendering
  differently than it should.

### What each test file should cover

Four things, per our standard:
1. **Snapshot** — `expect(asFragment()).toMatchSnapshot()`.
2. **Interaction** — click / type / submit with `@testing-library/user-event`, assert what happens.
3. **Conditional rendering** — loading vs empty vs error vs "has data" states.
4. **Mocking** — external stuff (Firebase, services, router, contexts) is faked so the test is fast and predictable.

### Writing a new test — the shortcut

**Copy the closest existing test in the same app** and adapt it. The mocking
boilerplate at the top of the file is 70% of the work, and it's already written
somewhere nearby.

### Mocking gotchas you *will* hit

| Situation | What to do |
|---|---|
| Need a fake service that returns a promise | Write `someMethod: () => Promise.resolve(fakeData)` — **not** `vi.fn().mockResolvedValue(...)`. Our config has `restoreMocks: true` which wipes `mockResolvedValue` between tests and you'll get `undefined`. |
| Data loads in a `useEffect` / async | Assert with `await screen.findByText(...)`, not `getByText(...)`. The data isn't there on the first render. |
| Component uses `useNavigate` / `useParams` | Mock `react-router-dom` and override those hooks, or render inside `<MemoryRouter>`. |
| A page pulls in a big child modal | Mock the child to a `<div data-testid="...">` stub so your test stays focused on the page. |
| Component shows the current time / a random ID | Freeze it: `vi.useFakeTimers()` + `vi.setSystemTime(...)`, and `vi.spyOn(Math, 'random')`. Otherwise the snapshot changes every run. |
| `orderin_admin` `PaymentHubPage` hangs the run | Its `useEffect` is keyed on an object — the store mock must return the **same object reference** every call, or it infinite-loops. |

More per-app gotchas: [`TESTING.md` §6](./TESTING.md).

### Coverage report (like Jest's HTML report)

```bash
npm run coverage
start coverage/index.html      # Windows  (open on Mac)
```

`coverage/` is generated on demand and git-ignored — it's normal for it not to
exist until you run the command.

---

## 5. How to report a bug

We use this exact format. One bug per entry.

```
[SEVERITY] | File:Line (or Screen) | What is broken | Why it matters in production | Suggested fix
```

**Severity guide:**

| Severity | Means | Examples |
|---|---|---|
| **Critical** | App crashes, blocks launch, data loss, security hole | White screen, "Rendered more hooks" crash, password visible on screen, build won't compile |
| **High** | Major feature broken or badly wrong, no workaround | Can't submit an order, totals calculated wrong, back button loops forever |
| **Medium** | Feature works but is wrong/annoying; workaround exists | Menu doesn't close on outside click, duplicate network request, wrong label |
| **Low** | Cosmetic, minor, cleanup | Console noise in prod build, spacing off, non-blocking a11y gap |

**A good bug report:**
- Says **exactly which app/theme** (there are 16 — "the header is broken" isn't enough).
- Has **steps to reproduce**, 1-2-3.
- Says what you **expected** vs what **happened**.
- Includes the **console error text** (copy it, don't screenshot only) if there is one.
- Notes whether it happens in **all themes** or just one.

**Where it goes:** [ask your lead — issue tracker / shared sheet / etc.]. For a
worked example of the format and the level of detail we want, read
[`BUGFIXES.md`](./BUGFIXES.md) — every entry there was a real bug written up this
way.

### Before you log it — quick self-check

- Does it reproduce on a **fresh reload**? (Clear the console, try again.)
- Is it actually **Firebase** (out of scope)? Network tab shows a failed
  `firestore.googleapis.com` call → not ours.
- Is it **already listed** in `BUGFIXES.md` as fixed, or in `TESTING.md §7` as known?

---

## 6. Manual test checklist (applies to every app)

Run through this in the browser for each app/theme you're assigned. Then do the
theme-specific notes in [`THEME-TEST-GUIDE.md`](./THEME-TEST-GUIDE.md). Tick
every line.

### Build & console
- [ ] `npm run build` completes with **exit code 0** and produces a `dist/` folder.
- [ ] `npm run dev` starts with no errors in the terminal.
- [ ] Load every main screen — **zero red errors** in the DevTools console.
- [ ] No `Warning: ...` React warnings about keys, hooks, or `act()`.

### Customer app flow
- [ ] Menu loads, categories and items show, images load.
- [ ] Search filters the menu; veg / non-veg filter works.
- [ ] Open an item → add to cart → cart count updates.
- [ ] Cart: change quantity, remove item, totals recalculate correctly.
- [ ] Proceed to Payments — the screen renders (don't need a real payment).
- [ ] Bill / receipt screen renders; "Download" produces a PDF.
- [ ] Profile: order history and liked list render.
- [ ] Hamburger menu opens, each item navigates, menu closes on outside click.
- [ ] Hamburger menu and menu items are reachable with **Tab** and open with **Enter/Space**.

### Client / staff app flow
- [ ] Each section login works and rejects a wrong passcode.
- [ ] Dashboard cards / numbers render (not `NaN`, not blank).
- [ ] Orders list loads; open an order; accept / reject flow renders.
- [ ] Kitchen display (Green) shows lanes.
- [ ] Finance tabs all switch without error.
- [ ] Inventory / Menu management pages load and let you open an edit form.
- [ ] Promotions: create-ad form opens and validates.

### Routing & navigation
- [ ] Typing a **bad URL** (e.g. `/asdf`) redirects sensibly, doesn't white-screen.
- [ ] After a bad-URL redirect, the **Back button doesn't loop**.
- [ ] Refreshing (F5) on a deep screen doesn't break the app.
- [ ] Protected screens can't be reached by URL without logging in (admin app especially).

### Performance
- [ ] Initial JS download isn't absurd (DevTools Network — flag any single chunk > ~1.5 MB).
- [ ] No obviously huge images (flag anything > ~1 MB).
- [ ] Pages don't visibly "jump" as they load (layout shift).

### Accessibility (quick pass)
- [ ] Every clickable thing is reachable by **Tab** and shows a focus outline.
- [ ] Buttons and icons have a label a screen reader could read (`aria-label` or text).
- [ ] Text is readable — no light-grey-on-white.
- [ ] Images have `alt` text.

> Deep responsive / contrast / Lighthouse audits need dedicated tooling — flag
> to your lead when you're ready for that, don't guess.

---

## 7. Definition of done

A task is done when:
- The automated suite for that app is **fully green** (`--run`, no fails, no unhandled errors).
- Any snapshot changes have been **eyeballed** and are intentional.
- New/changed behaviour has a **test** covering it.
- `npm run build` still exits 0.
- Bugs found are **logged in the standard format**, not just mentioned in chat.
- You've said plainly what you tested and what you *didn't* get to.

Never report something as "working" that you didn't actually run.

---

## 8. Common mistakes to avoid

- Running tests / `npm install` from the **repo root** — always `cd` into the app first.
- Assuming all themes behave the same — they're clones but **RED customer** and
  **olive-green customer** have real differences; **Green/Maroon clients** have
  extra pages. See [`THEME-TEST-GUIDE.md`](./THEME-TEST-GUIDE.md).
- "Fixing" a red test by updating its snapshot with `-u` without looking at the
  diff — you might be baking in a bug.
- Logging Firebase/network errors as frontend bugs.
- Filing a bug without saying **which app/theme** and **repro steps**.
- Closing the DevTools console during manual testing.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| **Theme** | One colour variant of the whole platform (Black, RED, …). A near-clone of the others. |
| **Customer app** | `orderin_custmer*` — what the diner uses. |
| **Client / staff app** | `order_client*` — what restaurant staff use. |
| **Vitest** | Our test runner (like Jest). |
| **RTL** | React Testing Library — renders components in tests and queries them like a user would. |
| **jsdom** | A fake browser the tests run inside (no real window). |
| **Snapshot** | A saved copy of a component's rendered HTML; the test fails if it changes. |
| **Mock / stub** | A fake stand-in for a real dependency (Firebase, a service) so tests are fast and predictable. |
| **Rules of Hooks** | React rule: hooks (`useState`, `useEffect`…) must run in the same order every render — no hooks after an early `return`. Breaking it crashes the component. |
| **Coverage** | % of code lines the tests actually execute. |

---
