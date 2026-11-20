'use strict';

/**
 * Swiggy / Zomato aggregator Cloud Functions.
 *
 * ⚠️ NOT DEPLOYED. BILLING_GUARD.md only allows Razorpay functions; these two
 * need an explicit billing review first. This folder is deliberately not
 * referenced by any firebase.json, so a plain `firebase deploy` from an app
 * folder cannot ship it by accident. See README.md for how to deploy it once
 * approved.
 *
 * Cost bounds: both functions run only when an order arrives or changes
 * (no schedules, no polling), and are capped at 5 instances each.
 */

const functions = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { handleWebhook } = require('./src/webhook');
const { handleStatusChange } = require('./src/statusPush');
const { createFirestoreStore } = require('./src/store');

if (!admin.apps.length) admin.initializeApp();

// Secrets live in Google Secret Manager — never in code (see to_check.md P0 #1).
const SWIGGY_WEBHOOK_SECRET = defineSecret('SWIGGY_WEBHOOK_SECRET');
const ZOMATO_WEBHOOK_SECRET = defineSecret('ZOMATO_WEBHOOK_SECRET');
const SWIGGY_API_KEY = defineSecret('SWIGGY_API_KEY');
const ZOMATO_API_KEY = defineSecret('ZOMATO_API_KEY');

const REGION = 'asia-south1'; // same as Firestore (firebase.json)

/**
 * Receives order events. Register these URLs with each platform:
 *   https://<region>-<project>.cloudfunctions.net/aggregatorWebhook/swiggy
 *   https://<region>-<project>.cloudfunctions.net/aggregatorWebhook/zomato
 */
exports.aggregatorWebhook = functions
  .region(REGION)
  .runWith({ secrets: [SWIGGY_WEBHOOK_SECRET, ZOMATO_WEBHOOK_SECRET], maxInstances: 5, timeoutSeconds: 30, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'POST only' });
      return;
    }
    const platform = String(req.path || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    try {
      const result = await handleWebhook({
        platform,
        headers: req.headers,
        rawBody: req.rawBody,
        secrets: {
          SWIGGY_WEBHOOK_SECRET: SWIGGY_WEBHOOK_SECRET.value(),
          ZOMATO_WEBHOOK_SECRET: ZOMATO_WEBHOOK_SECRET.value(),
        },
        store: createFirestoreStore(admin.firestore()),
      });
      res.status(result.status).json(result.json);
    } catch (e) {
      functions.logger.error('aggregatorWebhook failed', { platform, error: e.message });
      // 500 makes the platform retry, which is what we want for a transient failure.
      res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

/**
 * Tells Swiggy / Zomato when staff accept, reject, mark ready or hand over an
 * order, and records the result on the order (`sync`) so the staff app can
 * show "not sent — retry".
 */
exports.aggregatorStatusPush = functions
  .region(REGION)
  .runWith({ secrets: [SWIGGY_API_KEY, ZOMATO_API_KEY], maxInstances: 5, timeoutSeconds: 30, memory: '256MB' })
  .firestore.document('Restaurant/{restaurantId}/aggregatorOrders/{orderId}')
  .onUpdate(async (change) => {
    const syncPatch = await handleStatusChange({
      before: change.before.data(),
      after: change.after.data(),
      env: {
        SWIGGY_API_BASE_URL: process.env.SWIGGY_API_BASE_URL,
        ZOMATO_API_BASE_URL: process.env.ZOMATO_API_BASE_URL,
        SWIGGY_API_KEY: SWIGGY_API_KEY.value(),
        ZOMATO_API_KEY: ZOMATO_API_KEY.value(),
      },
      fetchImpl: fetch,
    });
    if (syncPatch) await change.after.ref.update({ sync: syncPatch });
  });
