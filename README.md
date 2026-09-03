# OrderIn-base

Monorepo of all OrderIn restaurant-platform frontends.

Each **theme** folder holds two independent Vite apps — a **client/staff app**
(`order_client*`) and a **customer app** (`orderin_custmer*`) — plus two
standalone apps: the **admin console** (`orderin_admin`) and the **POS system**
(`Orderin-Only-POS/pos-system`).

| Theme folder | Client app | Customer app |
|---|---|---|
| `Orderin-Black-Theme` | `order_client_11` | `orderin_custmer_1` |
| `Orderin-Dessert-Theme` | `order_clients-Dessert` | `orderin_custmer-Dessert` |
| `orderin-Client_Customer` (olive‑green) | `order_clients-Olive_green-updated` | `orderin_custmer_1-Olive_green` |
| `Orderin-Green-Theme` | `order_clients-Maroon` | `orderin_custmer-Maroon` |
| `Orderin-Stadium-Theme` | `order_clients-Stadium` | `orderin_custmer-Stadium` |
| `Orderin-RED-Theme` | `order_clients` | `orderin_custmer` |
| `Orderin-Maroon-Theme` | `order_clients-Maroon` | `orderin_custmer-Maroon` |

> The folders in `Orderin-Green-Theme/` and `Orderin-Maroon-Theme/` are both
> named `*-Maroon` — they are different apps, not duplicates.

## Running an app

Every app is its own npm project. From inside its folder:

```bash
npm install
npm run dev        # start the dev server
npm run build      # production build
```

## Tests

All 16 apps have a Vitest + React Testing Library suite (~1,850 tests).

```bash
cd <app-folder>
npm test -- --run          # run once
npm run coverage           # + HTML coverage report at coverage/index.html
```

**See [`TESTING.md`](./TESTING.md)** for the full guide: per‑app test counts,
the shared test scaffold, mocking conventions, what a green run looks like,
per‑app gotchas, known bugs the tests surfaced, and a CI matrix example.
