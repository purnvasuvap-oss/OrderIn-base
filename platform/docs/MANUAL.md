# What you do by hand

The code in this branch does not deploy itself, does not create your login, and does not edit the live database. Do the steps in this order.

## 1. Keys and the GitHub repo

1. In the Razorpay dashboard, roll the live API key. The old key id started with `rzp_live_Sj1ZPsCyB5iu3t`. Treat the old secret as public. It is still in old commits.
2. Make the GitHub repo private. Purging git history is a separate job (`git filter-repo`, then a force-push). Do that on a quiet day, after you have told anyone else who pushes. Do not do it as part of merging this branch.
3. Copy env files and fill them in. Do not commit the filled-in files.
   - `platform/functions/.env` from `platform/functions/.env.example`
     - `RAZORPAY_KEY_ID`
     - `RAZORPAY_KEY_SECRET`
     - `RAZORPAY_WEBHOOK_SECRET` (you invent this, then paste the same value in Razorpay)
     - `BOOTSTRAP_SECRET` (you invent this, long and random)
   - `platform/apps/customer/.env.local`
   - `platform/apps/staff/.env.local`
   - `orderin_admin/.env.local` — public Razorpay key id only, never the secret
   - `Orderin-Only-POS/pos-system/.env.local` — set `VITE_RESTAURANT_ID` for that terminal
4. Leave `VITE_SENTRY_DSN` empty until you create a Sentry project. Then set it only on the deployed site. The code does nothing when the DSN is empty or still says "placeholder".

## 2. Firebase Auth

In the Firebase console for `orderin-7f8bc`:

1. Authentication → Sign-in method → turn on **Email/Password**.
2. Turn on **Anonymous**. Diners use this for a table session. They do not get an OTP.
3. Do not turn on a default admin user. There is no `admin` / `admin123` and no `123456789` passcode.

## 3. Create the first owner

From the repo root, after `npm install --prefix platform/functions` and `firebase login`:

```bash
firebase deploy --only functions:bootstrapAccount
```

Then:

```bash
curl -X POST "https://us-central1-orderin-7f8bc.cloudfunctions.net/bootstrapAccount" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: YOUR_BOOTSTRAP_SECRET" \
  -d '{"email":"you@example.com","password":"at-least-8-characters","role":"owner","restaurantId":"your_restaurant_id","restaurantName":"Your Restaurant"}'
```

Create the company console login the same way with `"role":"platformAdmin"` and no restaurant id.

Sign in to the staff app with the owner email. Create captains, cashiers and kitchen logins on the Setup screen. The password is sent to Firebase Auth. It is not written into Firestore.

When those accounts exist, delete `BOOTSTRAP_SECRET` from the functions env and redeploy functions. The bootstrap URL then refuses everyone.

## 4. Deploy, in this order

Build the sites first:

```bash
npm run build --prefix platform/apps/customer
npm run build --prefix platform/apps/staff
npm run build --prefix orderin_admin
npm run build --prefix Orderin-Only-POS/pos-system
```

Create one Hosting site per app if they do not exist yet. The names in `.firebaserc` are `orderin-admin`, `orderin-customer`, `orderin-pos` and `orderin-staff`. If you pick different site ids, change `.firebaserc` or run:

```bash
firebase target:apply hosting admin YOUR_ADMIN_SITE_ID
firebase target:apply hosting customer YOUR_CUSTOMER_SITE_ID
firebase target:apply hosting pos YOUR_POS_SITE_ID
firebase target:apply hosting staff YOUR_STAFF_SITE_ID
```

Deploy rules and indexes before the apps, or the new apps cannot read the menu:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
```

Deploy only from this repo root. Do not deploy Cloud Functions from `archive/`. Those old functions would replace the new ones.

In Razorpay, set the webhook to:

`https://us-central1-orderin-7f8bc.cloudfunctions.net/razorpayWebhook`

Events: `payment.captured` and `order.paid`. The secret must match `RAZORPAY_WEBHOOK_SECRET`.

There is no scheduled settlement function in this build. Leave the old scheduled one off. See `BILLING_GUARD.md`.

## 5. Preview channels

A preview channel is a temporary URL. It does not replace the live site.

```bash
firebase hosting:channel:deploy preview --only hosting:customer --expires 7d
firebase hosting:channel:deploy preview --only hosting:staff --expires 7d
firebase hosting:channel:deploy preview --only hosting:admin --expires 7d
firebase hosting:channel:deploy preview --only hosting:pos --expires 7d
```

Run the matching `npm run build` first. The command prints a URL. Open that URL. For the diner app, add `?r=YOUR_RESTAURANT_ID&table=1` or the table QR from the staff Setup screen.

When you are happy, the live deploy is:

```bash
firebase deploy --only hosting:customer,hosting:staff,hosting:admin,hosting:pos
```

## 6. GST

Bills show CGST and SGST. The starting rates are 2.5% + 2.5% (5% together) and SAC `996331`. Change the rates on the staff Setup screen. **Confirm the rates, the SAC code and whether your restaurant is under the regular scheme with a chartered accountant before you give these bills to a customer.** This software does not decide your tax.

## 7. Printers

The staff app and the POS format a kitchen ticket (KOT) and a bill as ESC/POS bytes and POST them to `http://127.0.0.1:9101/print`. That address is the print bridge on the restaurant PC or an Android device on the same network. This repo does not include the bridge hardware app. Until the bridge is running, the POS falls back to the browser print dialog. See `platform/docs/PRINTING.md`.

## 8. Migrations and backups

See `platform/docs/MIGRATIONS.md` and `platform/docs/BACKUPS.md`. Do not run the migration against `orderin-7f8bc` until you have a backup and you have typed the extra flag on purpose.
