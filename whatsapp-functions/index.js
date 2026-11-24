'use strict';

/**
 * sendWhatsAppBill: sends a paid order's bill to the customer's WhatsApp from
 * the restaurant's WhatsApp Business number (Meta WhatsApp Cloud API).
 *
 * ⚠️ NOT DEPLOYED. BILLING_GUARD.md only allows Razorpay functions, so this
 * needs an explicit billing review first. This folder is not referenced by
 * any firebase.json, so a plain `firebase deploy` from an app folder cannot
 * ship it by accident. Until it is deployed, the customer apps open WhatsApp
 * on the customer's phone with the bill already typed (no backend needed).
 *
 * Cost bounds: runs only when a customer taps "Yes, send" on the bill
 * (no schedules, no polling), capped at 3 instances, 3 sends per order.
 * Meta charges per business-initiated template message; check current
 * WhatsApp pricing for India before enabling.
 */

const functions = require('firebase-functions');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { handleSendBill } = require('./src/sendBill');

if (!admin.apps.length) admin.initializeApp();

// Secrets live in Google Secret Manager, never in code:
//   firebase functions:secrets:set WHATSAPP_TOKEN
//   firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');
const WHATSAPP_PHONE_NUMBER_ID = defineSecret('WHATSAPP_PHONE_NUMBER_ID');
const WHATSAPP_BILL_TEMPLATE = defineString('WHATSAPP_BILL_TEMPLATE', { default: 'order_bill' });
const WHATSAPP_TEMPLATE_LANG = defineString('WHATSAPP_TEMPLATE_LANG', { default: 'en' });
const GRAPH_VERSION = 'v21.0';

const REGION = 'asia-south1';

const setCors = (res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
};

const firestoreDeps = () => {
  const db = admin.firestore();
  const customerRef = (restaurantId, phone) => db.doc(`Restaurant/${restaurantId}/customers/${phone}`);
  return {
    getCustomer: async (restaurantId, phone) => {
      const snap = await customerRef(restaurantId, phone).get();
      return snap.exists ? snap.data() : null;
    },
    getRestaurantName: async (restaurantId) => {
      const snap = await db.doc(`Restaurant/${restaurantId}`).get();
      const d = snap.exists ? snap.data() : {};
      return d.name || d.restaurantName || d.displayName || '';
    },
    recordSend: async (restaurantId, phone, orderId, messageId) => {
      const ref = customerRef(restaurantId, phone);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const pastOrders = [...(snap.data().pastOrders || [])];
        const i = pastOrders.findIndex((o) => String(o?.id) === String(orderId));
        if (i === -1) return;
        const prev = pastOrders[i].whatsappBill || {};
        pastOrders[i] = {
          ...pastOrders[i],
          whatsappBill: { count: (prev.count || 0) + 1, lastSentAt: new Date().toISOString(), lastMessageId: messageId, phone },
        };
        tx.update(ref, { pastOrders });
      });
    },
    postMessage: async (body) => {
      const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID.value()}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN.value()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.error?.message || `WhatsApp API ${res.status}`);
        err.status = 502;
        throw err;
      }
      return { messageId: json?.messages?.[0]?.id };
    },
    config: { templateName: WHATSAPP_BILL_TEMPLATE.value(), languageCode: WHATSAPP_TEMPLATE_LANG.value() },
  };
};

exports.sendWhatsAppBill = functions
  .region(REGION)
  .runWith({ secrets: [WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID], maxInstances: 3, timeoutSeconds: 20, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    try {
      const { status, body } = await handleSendBill(req.body, firestoreDeps());
      return res.status(status).json(body);
    } catch (e) {
      console.error('sendWhatsAppBill failed:', e);
      return res.status(e.status || 500).json({ error: 'Could not send the bill' });
    }
  });
