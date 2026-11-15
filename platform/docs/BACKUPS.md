# Daily Firestore backups

The apps do not back up Firestore by themselves. Turn on a daily export in Google Cloud. This writes a copy of the database into a storage bucket. It does not delete live data.

1. In Google Cloud, for project `orderin-7f8bc`, create a bucket, for example `gs://orderin-7f8bc-backups`. Do not make the bucket public.
2. Grant the Firestore service agent permission to write to that bucket (`roles/datastore.importExportAdmin` on the Firestore service account, and `roles/storage.admin` on the bucket is the usual pair). Confirm the current role names in the Google Cloud docs the day you set this up.
3. Create a daily Cloud Scheduler job that calls the Firestore export API:

```bash
gcloud firestore export gs://orderin-7f8bc-backups/daily/$(date -u +%F) --project=orderin-7f8bc
```

Schedule that command for a quiet hour (for example 03:00 Asia/Kolkata). Keep at least 30 days of exports, then delete older folders with a bucket lifecycle rule.

4. Once, restore an export into a **different** project (not `orderin-7f8bc`) so you know the files are usable. Do not import an export back over the live database unless you mean to replace it.

Error logging is separate. Set `VITE_SENTRY_DSN` on the customer and staff builds when you have a Sentry project. Until then the apps only log in the browser console. Do not commit a real DSN.
