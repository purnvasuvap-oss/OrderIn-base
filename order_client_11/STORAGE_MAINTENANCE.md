Storage and Promotions maintenance

Recommended production setup:

1) Firestore TTL
- In the Firestore console go to "Indexes & TTL" and enable TTL on the `promotions` collection using the `expiryAt` timestamp field. Firestore will remove expired documents automatically.

2) Cloud Function to clean Storage on delete
- Deploy the provided Cloud Function `onPromotionDelete` (in `functions/index.js`). When a promotion doc is removed (either manually or via TTL), the function deletes the Storage object referenced by `image_path`.

3) Storage Rules
- Use restrictive rules that only allow admin users to write to protected folders. Example rule snippet:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /menu/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    match /promotions/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    match /{allPaths=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

4) Uploads
- For admin uploads, use the `getSignedPromotionUploadUrl` callable function to get a signed PUT URL (or implement a server-side upload endpoint). This avoids giving the client broad write rules.

5) Custom claims
- Use the Admin SDK to add `admin: true` custom claims to admin user accounts. Example:

```js
admin.auth().setCustomUserClaims(uid, { admin: true });
```

6) Diagnostics
- Use `scripts/diag_promotions.js` to inspect expired promotions and optionally clean storage objects. It requires `GOOGLE_APPLICATION_CREDENTIALS` to be set and will run with the admin identity.

If you'd like, I can:
- Deploy the Cloud Functions for you (if you provide deployment access or run the commands locally),
- Add a small client helper to request a signed URL and upload the file using a PUT request, and
- Update `MenuPage` / `Promotions` to call the callable to get a signed URL for secure uploads instead of direct client writes.
