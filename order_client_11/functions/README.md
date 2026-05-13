# OrderIn Functions

Billing guard: this functions package must stay limited to Razorpay/payment
functions only. Do not add App Engine, Cloud SQL, Data Connect, generic API
wrappers, scheduled functions, or non-payment background functions here without
an explicit billing review. See `../../BILLING_GUARD.md`.

Allowed functions:

- `createRazorpayOrder`: creates a Razorpay order and optional Route transfer split.
- `verifyRazorpayPayment`: verifies Razorpay payment signatures and returns payment details.
- `syncRazorpayPayment`: fetches Razorpay payment/settlement/transfer data and reconciles Firestore.
- `razorpayWebhook`: handles signed Razorpay webhooks.

Deploy only these functions:

```sh
cd order_client_11
npm run deploy:razorpay-functions
```

Avoid plain `firebase deploy` because it deploys every configured product in
`firebase.json`.
