# Billing Guard

This project should stay on the low-cost Firebase stack:

- Firebase Hosting for static web apps.
- Cloud Firestore for app data.
- Firebase Storage for menu/promotion images.
- Firebase Auth where login/phone auth is required.
- Firebase/Cloud Functions only for Razorpay checkout work.

Allowed deployed functions:

- `createRazorpayOrder`
- `verifyRazorpayPayment`
- `syncRazorpayPayment` and `razorpayWebhook` are optional reconciliation helpers. Keep them deleted unless exact Razorpay settlement reconciliation is explicitly needed and the billing impact is accepted.

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

1. Cloud Run Functions: keep only `createRazorpayOrder` and `verifyRazorpayPayment`. Delete `syncRazorpayPayment`, `razorpayWebhook`, `api`, `getSignedPromotionUploadUrl`, and `onPromotionDelete` if they exist and automatic reconciliation is not explicitly needed.
2. App Engine: open App Engine > Versions. Stop or delete any running versions after confirming they are not serving a live URL.
3. Cloud SQL: open SQL. If any instance exists and Data Connect is not used, export/backup it, then stop or delete it.
4. Billing: set budget alerts at low thresholds before deploying new backend services.
