# OrderIn Functions

Billing guard: this functions package must stay limited to Razorpay/payment
functions only. Do not add App Engine, Cloud SQL, Data Connect, generic API
wrappers, or non-payment background functions here without an explicit billing
review. See `../../BILLING_GUARD.md`.

Allowed functions:

- `createRazorpayOrder`: creates a Razorpay order and optional Route transfer split.
- `verifyRazorpayPayment`: verifies Razorpay payment signatures, returns payment details, and queues one settlement check.
- `scheduledRazorpaySettlementSync`: runs daily at 11:30 PM Asia/Kolkata, checks up to 50 queued unsettled payments by default, and writes actual settlement details only after settlement is confirmed.

Keep `syncRazorpayPayment` and `razorpayWebhook` undeployed unless a separate
billing review accepts live reconciliation.

Deploy only these functions:

```sh
cd order_client_11
npm run deploy:razorpay-functions
```

Avoid plain `firebase deploy` because it deploys every configured product in
`firebase.json`.
