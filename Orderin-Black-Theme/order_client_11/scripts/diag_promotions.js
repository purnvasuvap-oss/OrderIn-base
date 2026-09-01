/**
 * Diagnostic script for promotions and storage objects
 * Usage:
 *   node scripts/diag_promotions.js --dry-run
 *   node scripts/diag_promotions.js --clean-files (will delete storage objects)
 *
 * Requirements:
 * - Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON with Firestore and Storage permissions
 * - Run from project root
 */

const admin = require('firebase-admin');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv)).option('clean-files', { type: 'boolean', default: false }).option('delete-docs', { type: 'boolean', default: false }).argv;

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON before running this script.');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

async function run() {
  const now = admin.firestore.Timestamp.now();
  console.log('Diagnostic run at', new Date().toISOString());

  const ref = db.collection('Restaurant').doc('orderin_restaurant_2').collection('promotions');
  const snap = await ref.get();
  let total = 0;
  let expiredCount = 0;
  let havePath = 0;
  let missingPath = 0;
  const expiredDocs = [];

  for (const doc of snap.docs) {
    total++;
    const data = doc.data();
    const expiry = data.expiryAt;
    const isExpired = expiry && expiry.toMillis && expiry.toMillis() <= Date.now();
    if (isExpired) {
      expiredCount++;
      const item = { id: doc.id, image_path: data.image_path || null, image_url: data.image_url || null };
      if (data.image_path) havePath++; else missingPath++;
      expiredDocs.push(item);
    }
  }

  console.log('Total promotions:', total);
  console.log('Expired promotions:', expiredCount);
  console.log('Expired with image_path:', havePath);
  console.log('Expired without image_path:', missingPath);

  if (expiredDocs.length > 0) {
    console.log('\nSample expired docs:');
    console.table(expiredDocs.slice(0, 50));
  }

  if (argv['clean-files']) {
    console.log('\n--clean-files provided: attempting to delete storage objects for expired promotions with image_path');
    for (const item of expiredDocs) {
      if (!item.image_path) continue;
      try {
        const file = bucket.file(item.image_path);
        const [exists] = await file.exists();
        if (!exists) {
          console.warn('File not found:', item.image_path);
          continue;
        }
        console.log('Deleting file:', item.image_path);
        await file.delete();
        console.log('Deleted:', item.image_path);
        if (argv['delete-docs']) {
          await ref.doc(item.id).delete();
          console.log('Deleted doc:', item.id);
        }
      } catch (err) {
        console.error('Failed to delete file:', item.image_path, err.message || err);
      }
    }
  } else {
    console.log('\nRun with --clean-files to attempt deletion of storage objects for expired promotions.');
  }
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
