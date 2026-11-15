# Moving old orders into their own collection

Older apps saved every order inside `Restaurant/{id}/customers/{phone}` in an array called `pastOrders`. New orders are their own documents at `Restaurant/{id}/orders/{orderId}`.

The new Cloud Functions write only the new shape. They can still price an old order from `pastOrders` if someone pays an order that was never copied.

The copy script is `platform/scripts/migrate-orders.js`.

- It does **not** delete `pastOrders`.
- It does **not** delete `account` or `IFSC` on the restaurant document. It copies them to `Restaurant/{id}/private/payout`, which browsers cannot read.
- Default is a dry run: it prints `DRY` lines and writes nothing.
- `--commit` writes.
- If the project id is `orderin-7f8bc`, the script exits unless you also pass `--i-understand-this-is-live`.

Do this on a copy or a dev project first.

```bash
npm install --prefix platform/functions
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/a-service-account.json
export GCLOUD_PROJECT=your-dev-project
node platform/scripts/migrate-orders.js
node platform/scripts/migrate-orders.js --commit
```

The service account JSON is a secret. Do not commit it.

After you have checked the new `orders` documents in the dev project, you can run the same two commands against production **only after a backup** (see BACKUPS.md):

```bash
export GCLOUD_PROJECT=orderin-7f8bc
node platform/scripts/migrate-orders.js --i-understand-this-is-live
node platform/scripts/migrate-orders.js --commit --i-understand-this-is-live
```

Nobody should delete the old arrays until a week of real service has read the new documents without trouble. Deleting is not part of this script.
