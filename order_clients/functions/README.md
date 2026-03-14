This folder contains Firebase Cloud Functions for OrderIn.

Functions included:

- `onPromotionDelete` (Firestore trigger): runs when a `promotions` document under `Restaurant/orderin_restaurant_1/promotions/{id}` is deleted; if the document has an `image_path` field this function deletes the corresponding Storage object.

- `getSignedPromotionUploadUrl` (Callable): returns a signed v4 write URL for uploading a promotion image. Caller must be authenticated and have an `admin` custom claim.

Deployment:
1. Install Firebase CLI and login: `npm i -g firebase-tools` and `firebase login`.
2. From the `functions/` folder run `npm install` to install dependencies.
3. Initialize functions in your project (if you haven't): `firebase init functions` (choose existing project).
4. Deploy: `firebase deploy --only functions`.

Notes and security:
- `getSignedPromotionUploadUrl` requires the caller to have `context.auth.token.admin === true`. Use Firebase Admin SDK to set `admin` custom claims on your admin user account(s).
- To set an admin claim on a user (server-side):
```js
const admin = require('firebase-admin');
admin.auth().setCustomUserClaims(uid, { admin: true });
```
- Consider enabling Firestore TTL on the `promotions` collection using the `expiryAt` timestamp field to ensure documents are removed automatically; the `onPromotionDelete` trigger handles deleting the storage object whenever a doc is removed (whether by TTL or manual deletion).
- Make sure your Storage CORS and rules support signed-URL PUTs if you use the signed upload URL flow.
