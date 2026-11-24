# Razorpay keys: where they live

All Razorpay keys sit in one place, outside the code, and git never sees them.

| What | Where | In git? |
|---|---|---|
| Key ID (`rzp_live_…`) | `razorpay-config/razorpay.env` | No (gitignored) |
| Key secret, for deploys | Google Secret Manager (`RAZORPAY_KEY_SECRET`) | No |
| Key secret, for the local emulator only | `razorpay-config/razorpay.env` | No (gitignored) |
| Template with placeholders | `razorpay-config/razorpay.env.example` | Yes |

The code reads keys only through these variable names:

- Cloud Functions (`functions/index.js` in each staff app): `process.env.RAZORPAY_KEY_ID`, `process.env.RAZORPAY_KEY_SECRET`
- Admin checkout page (`orderin_admin/src/pages/PaymentHubPage.tsx`): `import.meta.env.VITE_RAZORPAY_KEY_ID`

No key value is written in any source file. If a key is missing, the app says "Online payment is not configured" instead of failing silently.

## Set up or change the key

```sh
cp razorpay-config/razorpay.env.example razorpay-config/razorpay.env
# edit razorpay.env
node razorpay-config/sync.js          # writes functions/.env and orderin_admin/.env.local
firebase functions:secrets:set RAZORPAY_KEY_SECRET   # once per Firebase project
```

Then rebuild `orderin_admin` and redeploy the Razorpay functions (`npm run deploy:razorpay-functions` in a staff app).

`node razorpay-config/sync.js --check` reports any file that is missing or out of date. Neither command ever writes a file that git would track.

## Stopping leaks before they're pushed

`.githooks/pre-commit` runs `scripts/check-secrets.js` on every commit. It blocks the commit if the staged changes contain:

- a Razorpay key ID or secret,
- a `.env`, `razorpay.env` or `.secret.local` file,
- any other assignment that looks like a hard-coded secret.

Turn the hook on once per clone:

```sh
git config core.hooksPath .githooks
```

To scan the whole repo, not just what's staged:

```sh
node scripts/check-secrets.js --all
```

If a real key is ever committed, rotate it in the Razorpay Dashboard right away. Removing it from the code does not remove it from git history.
