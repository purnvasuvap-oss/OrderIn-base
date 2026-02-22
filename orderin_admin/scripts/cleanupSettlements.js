/*
 One-time cleanup script for Settlement documents.
 Usage:
 1. Install dependencies: npm install firebase-admin
 2. Provide service account JSON path in env var: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json" (Windows: set ...)
 3. Run: node scripts/cleanupSettlements.js

This script will:
 - Iterate all Restaurant documents
 - For each Restaurant, load Settlement/settlement doc (if present)
 - Normalize payment arrays (remove zero/invalid payments)
 - Deduplicate settlementHistory by `period` (keep the one with highest totalPaid)
 - Remove empty settlementHistory entries (no payments and totalPaid == 0)
 - Recompute currentPeriod.totalPaid from its paymentHistory
 - Recompute additionalPaid as overflow beyond currentPeriod.totalAmountDue
 - Set currentPeriod.status appropriately
 - Write back cleaned document (merge)
*/

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Please set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  process.exit(1);
}

admin.initializeApp();
const db = getFirestore();

function normalizePayments(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((p) => p && typeof p.amount === 'number' && p.amount > 0)
    .map((p) => ({
      id: p.id || `pay_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      amount: p.amount,
      date: p.date ?? p.timestamp ?? Date.now(),
      timestamp: p.timestamp ?? (typeof p.date === 'number' ? p.date : (p.date && p.date._seconds ? p.date._seconds * 1000 : Date.now())),
      isAutoPayment: !!p.isAutoPayment,
    }));
}

function dedupeHistoryByPeriod(history) {
  if (!Array.isArray(history)) return [];
  const map = new Map();
  for (const item of history) {
    if (!item || !item.period) continue;
    const period = item.period;
    const totalPaid = item.totalPaid ?? (Array.isArray(item.paymentHistory) ? item.paymentHistory.reduce((s,p)=>s+(p.amount||0),0) : 0);
    if (!map.has(period)) {
      map.set(period, { ...item, totalPaid });
      continue;
    }
    const existing = map.get(period);
    const existingPaid = existing.totalPaid ?? 0;
    // prefer the one with higher paid amount and more payment entries
    if ((totalPaid || 0) > (existingPaid || 0) || ((item.paymentHistory||[]).length > (existing.paymentHistory||[]).length)) {
      map.set(period, { ...item, totalPaid });
    }
  }
  // return array ordered by insertion
  return Array.from(map.values());
}

(async () => {
  console.log('Starting settlement cleanup...');
  const restaurantsSnap = await db.collection('Restaurant').get();
  console.log(`Found ${restaurantsSnap.size} restaurants.`);
  let updatedCount = 0;

  for (const doc of restaurantsSnap.docs) {
    const restaurantId = doc.id;
    const settRef = db.collection('Restaurant').doc(restaurantId).collection('Settlement').doc('settlement');
    const snap = await settRef.get();
    if (!snap.exists) continue;
    const data = snap.data() || {};

    // normalize currentPeriod paymentHistory
    const currentPeriod = data.currentPeriod || {};
    const normalizedCurrentPayments = normalizePayments(currentPeriod.paymentHistory || []);
    const currentTotalPaid = normalizedCurrentPayments.reduce((s,p) => s + p.amount, 0);
    const totalAmountDue = currentPeriod.totalAmountDue ?? data.defaultSettlementAmount ?? 0;
    const newStatus = currentTotalPaid >= totalAmountDue ? 'Paid' : (currentTotalPaid > 0 ? 'Processing' : 'Pending');
    const newAdditionalPaid = Math.max(0, currentTotalPaid - totalAmountDue);

    // normalize settlementHistory
    const rawHistory = data.settlementHistory || [];
    const normalizedHistory = (rawHistory || []).map((h) => ({
      ...h,
      paymentHistory: normalizePayments(h.paymentHistory || []),
      totalPaid: h.totalPaid ?? (Array.isArray(h.paymentHistory) ? (h.paymentHistory.reduce((s,p)=>s+(p.amount||0),0)) : 0),
    })).filter(Boolean);

    // remove empty historical entries (no payments and zero paid)
    const nonEmptyHistory = normalizedHistory.filter((h) => (h.totalPaid || 0) > 0 || (h.paymentHistory && h.paymentHistory.length > 0));

    // dedupe by period keeping the one with highest totalPaid
    const dedupedHistory = dedupeHistoryByPeriod(nonEmptyHistory);

    // normalize allPaymentsHistory
    const allPayments = normalizePayments(data.allPaymentsHistory || []);

    // prepare payload
    const payload = {
      'currentPeriod.paymentHistory': normalizedCurrentPayments,
      'currentPeriod.totalPaid': currentTotalPaid,
      'currentPeriod.status': newStatus,
      currentMonthlyPaid: currentTotalPaid,
      additionalPaid: newAdditionalPaid,
      settlementHistory: dedupedHistory,
      allPaymentsHistory: allPayments,
      lastUpdated: Date.now(),
    };

    // write back
    await settRef.set(payload, { merge: true });
    updatedCount++;
    console.log(`Cleaned settlement for ${restaurantId}`);
  }

  console.log(`Done. Updated ${updatedCount} settlement documents.`);
  process.exit(0);
})();
