# Proposed Firestore rules (not wired up)

The live `firestore.rules` files still allow the current apps to read and write, because those apps do not use Firebase Auth yet. Do not deploy this file until staff and diners sign in with Firebase Auth. The apps do not read this file.

When you are ready, replace the open `allow read, write: if true` with rules that:

- Let a diner read and create only `Restaurant/{id}/orders` where `request.auth.token.phone` matches `customerPhone`.
- Let a diner create `serviceRequests` for their table, not delete other people's orders.
- Let staff with `request.auth.token.restaurantId` read and update that restaurant only.
- Keep `paymentIntents` and `counterCodes` server-only (Cloud Functions).
- Keep payroll and attendance locked to the restaurant that owns them.

Until then, the open rules are the reason a diner can still change data directly. Deploying a half-finished rules file would lock the live restaurants out.
