# Swiggy / Zomato aggregator

Receives Swiggy and Zomato orders, puts them in the restaurant's staff app (Orders page → **Online orders**), and tells the platform when staff accept, reject, mark ready or hand over an order.

> **Status: written and tested, not deployed.** `BILLING_GUARD.md` allows only Razorpay functions, so these two functions need a billing review first. No `firebase.json` points at this folder, so nothing deploys it by accident.

## How it works

```
Swiggy / Zomato ──webhook──▶ aggregatorWebhook ──▶ Restaurant/{rid}/aggregatorOrders/{platform}_{id}
                                                          │  (staff app shows it live; staff accept/reject/ready/handover)
Swiggy / Zomato ◀──status── aggregatorStatusPush ◀────────┘  (on every staff status change; result saved in `sync`)
```

- **One backend for every restaurant.** All apps share one Firebase project. `aggregatorOutlets/{platform}_{outletId}` says which restaurant each Swiggy/Zomato outlet belongs to.
- **Each order is its own document** (not the `customers/{phone}.pastOrders` array), so two orders arriving together can't overwrite each other.
- **Safe to retry.** Platforms re-send webhooks until they get a 2xx. A re-delivered order is acknowledged, not duplicated.
- **Signed webhooks only.** Each request's HMAC-SHA256 signature is checked against the raw body, in constant time.
- **Minimal personal data.** Only the customer's first name and the last 4 digits of the phone are stored; never an address (DPDP Act 2023).
- **Test orders** from the staff app's "Send test order" button are marked `simulated` and never sent to the real platform.

| Function | Trigger | Runs when | Limits |
|---|---|---|---|
| `aggregatorWebhook` | HTTPS `POST /swiggy` or `/zomato` | an order arrives or changes on the platform | 5 instances, 30 s, 256 MB |
| `aggregatorStatusPush` | Firestore update on `aggregatorOrders` | staff change a status, or press Retry | 5 instances, 30 s, 256 MB |

No schedules and no polling: both run only per order event.

## Before going live

1. **Get partner approval and the API spec** from Swiggy and from Zomato. Their restaurant POS APIs are private, so field names, event names, signature headers and endpoints in `src/adapters/swiggy.js` and `src/adapters/zomato.js` are **placeholders**. Each platform's details are in one config object; update it to match the spec and adjust the fixtures in `test/helpers.js`. No other code should need to change.
2. **Billing review.** Then add `aggregatorWebhook` and `aggregatorStatusPush` to the allowed list in `BILLING_GUARD.md`.
3. **Secrets** (Google Secret Manager, never in code):
   ```sh
   firebase functions:secrets:set SWIGGY_WEBHOOK_SECRET
   firebase functions:secrets:set SWIGGY_API_KEY
   firebase functions:secrets:set ZOMATO_WEBHOOK_SECRET
   firebase functions:secrets:set ZOMATO_API_KEY
   ```
   Base URLs go in `aggregator-functions/.env`:
   ```
   SWIGGY_API_BASE_URL=https://…
   ZOMATO_API_BASE_URL=https://…
   ```
4. **Firestore rules.** Add these before going live. They are part of the P0 rules work in `to_check.md`.
   - `aggregatorOutlets/*`: written only by the server (Admin SDK); readable by that restaurant's staff.
   - `Restaurant/{rid}/aggregatorConfig/*`: written by that restaurant's managers.
   - `Restaurant/{rid}/aggregatorOrders/*`: created only by the server. Staff may change only `status`, `statusSource`, `statusUpdatedAt`, `prepMinutes`, `acceptedAt`, `rejectReason` and `sync.retryRequestedAt`, and only forward along `placed → accepted|rejected`, `accepted → ready`, `ready → picked_up`. The server re-checks this too.
5. **Link each outlet** (one document per outlet):
   ```
   aggregatorOutlets/swiggy_<swiggyOutletId>  { restaurantId: "orderin_restaurant_4", enabled: true }
   ```
6. **Register the webhook URLs** with each platform:
   `https://asia-south1-<project>.cloudfunctions.net/aggregatorWebhook/swiggy` (and `/zomato`).

## Deploy (only after approval)

This folder has no `firebase.json` on purpose. To deploy, add a separate codebase to the deploying app's `firebase.json`:

```json
"functions": [
  { "source": "functions", "codebase": "default", "runtime": "nodejs20" },
  { "source": "../../aggregator-functions", "codebase": "aggregator", "runtime": "nodejs20" }
]
```

Then deploy only this codebase:

```sh
npm install --prefix aggregator-functions
firebase deploy --only functions:aggregator
```

## Tests

```sh
cd aggregator-functions
npm test        # node --test; no install needed
```

The tests cover:
- Signature checks, including a body changed after signing.
- Duplicate deliveries.
- Unlinked or disabled outlets.
- Cancellation, delivery and rider updates.
- Item mapping and phone masking.
- Every status-push path: sent, HTTP error, network error, missing config, invalid jump, already cancelled, retry, simulated, and "no loop".

## Files

| File | What it does |
|---|---|
| `index.js` | Cloud Functions entry points, secrets and limits |
| `src/model.js` | Order shape, statuses, allowed staff moves, totals |
| `src/webhook.js` | Webhook handling (pure; storage passed in) |
| `src/statusPush.js` | Status push to the platform (pure; `fetch` passed in) |
| `src/store.js` | Firestore storage for the webhook |
| `src/adapters/*.js` | Swiggy / Zomato field mapping (**placeholders until the specs arrive**) |

The staff-app side lives in each staff app:
- `src/services/aggregatorService.js`
- `src/components/AggregatorInbox/`
- `src/pages/OnlineOrdersSettings.jsx`

`aggregatorService.js` mirrors the status rules in `src/model.js`, so keep the two in sync.
