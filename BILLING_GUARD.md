# Billing Guard

This project should stay on the low-cost Firebase stack:

- Firebase Hosting for static web apps.
- Cloud Firestore for app data.
- Firebase Storage for menu/promotion images.
- Firebase Auth where login/phone auth is required.
- Firebase/Cloud Functions only for Razorpay checkout work.

Allowed deployed functions:

- `createRazorpayOrder` — prices the order from the menu. Do not trust the browser amount.
- `verifyRazorpayPayment` — checks the signature, the captured status, and that the paid amount matches the menu total, then marks the order paid.
- `razorpayWebhook` — same paid check when Razorpay calls us. Set `RAZORPAY_WEBHOOK_SECRET` and the webhook URL in the Razorpay dashboard.
- `issueCounterCode` and `confirmCounterPayment` — the 4-digit counter code is created here and checked here. The diner's phone never receives the code.
- `syncRazorpayPayment` and `scheduledRazorpaySettlementSync` are optional reconciliation helpers. Keep them deleted unless exact Razorpay settlement reconciliation is explicitly needed and the billing impact is accepted. `syncRazorpayPayment` now refuses to mark an order paid when the Razorpay amount does not match the menu total.

Do not add or deploy these without an explicit billing review:

- App Engine services or versions.
- Cloud SQL instances.
- Firebase Data Connect.
- App Hosting backends.
- Generic Cloud Functions wrappers such as `api`.
- Non-payment background functions.
- Scheduled functions.

Use targeted deploys only:

```sh
cd orderin_custmer_1
npm run build
npm run deploy:hosting
```

```sh
cd order_client_11
npm run build
npm run deploy:hosting
npm run deploy:razorpay-functions
```

Avoid plain `firebase deploy` because it deploys every configured product in `firebase.json`.

To stop existing billing sources in Google Cloud Console:

1. Cloud Run Functions: keep `createRazorpayOrder`, `verifyRazorpayPayment`, `razorpayWebhook`, `issueCounterCode`, and `confirmCounterPayment`. Those have to be deployed before the new customer apps take payment. `syncRazorpayPayment` and `scheduledRazorpaySettlementSync` stay optional. Delete `api`, `getSignedPromotionUploadUrl`, and `onPromotionDelete` if they exist and are not needed.
2. App Engine: open App Engine > Versions. Stop or delete any running versions after confirming they are not serving a live URL.
3. Cloud SQL: open SQL. If any instance exists and Data Connect is not used, export/backup it, then stop or delete it.
4. Billing: set budget alerts at low thresholds before deploying new backend services.
