# Cleanup Settlements Script

This script helps normalize existing Settlement documents in Firestore so the UI behaves correctly.

Prerequisites
- Node.js installed
- A Firebase service account JSON for your project

Steps
1. Install dependency

```bash
npm install firebase-admin
```

2. Set service account env var (Linux/macOS)

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
```

Windows (PowerShell)

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"
```

3. Run the cleanup

```bash
node scripts/cleanupSettlements.js
```

What it does
- Removes zero/invalid payments
- Deduplicates `settlementHistory` by `period` (keeps the entry with most paid)
- Removes empty history entries
- Recomputes `currentPeriod.totalPaid`, `additionalPaid`, and `currentPeriod.status`
- Writes cleaned data back to `Restaurant/{restaurantId}/Settlement/settlement` (merge)

Important
- This is a destructive cleanup for historical duplication; keep backups if you need to preserve original data.
- Run in staging or test environment first.
