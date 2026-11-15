const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');
const handlers = require('./orderHandlers');
const payments = require('./paymentHandlers');

if (!admin.apps.length) {
  admin.initializeApp();
}

const regional = functions.region('us-central1');

function callable(fn) {
  return regional.https.onCall(async (data, context) => {
    const actor = context.auth ? { uid: context.auth.uid, ...context.auth.token } : null;
    try {
      return await fn(admin.firestore(), admin.auth(), actor, data || {});
    } catch (error) {
      const code = error.status === 403 || error.status === 401
        ? 'permission-denied'
        : error.status === 404
          ? 'not-found'
          : 'failed-precondition';
      throw new functions.https.HttpsError(code, error.message || 'Request failed');
    }
  });
}

function readRazorpay() {
  let config = {};
  try {
    config = functions.config().razorpay || {};
  } catch (error) {
    config = {};
  }
  return payments.loadRazorpayCredentials(
    config.key_id,
    process.env.RAZORPAY_KEY_ID,
    config.key_secret,
    process.env.RAZORPAY_KEY_SECRET
  );
}

async function actorFromRequest(req) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const decoded = await admin.auth().verifyIdToken(match[1]);
  return { uid: decoded.uid, ...decoded };
}

function actorCanPay(actor, order) {
  if (!actor) return false;
  if (actor.role === 'diner') return actor.sessionId && actor.sessionId === order.sessionId;
  return ['owner', 'manager', 'captain', 'cashier', 'platformAdmin'].includes(actor.role);
}

async function markOnlinePayment(db, priced, payment) {
  if (!priced.ref) return { stored: false, source: priced.source };
  const order = priced.order;
  const amount = Math.round(payment.amount) / 100;
  const paymentsList = [...(order.payments || []), {
    method: 'online',
    amount,
    at: new Date().toISOString(),
    razorpayPaymentId: payment.id,
    razorpayOrderId: payment.order_id,
  }];
  const paid = paymentsList.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const next = { ...order, payments: paymentsList, updatedAt: new Date().toISOString() };
  if (paid + 0.05 >= Number(order.total || 0)) {
    next.status = 'paid';
    next.paymentStatus = 'paid';
    next.paidAt = next.updatedAt;
    if (!next.invoiceNumber) {
      const ref = db.collection('Restaurant').doc(order.restaurantId).collection('counters').doc('invoice');
      const seq = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const value = ((snap.exists && snap.data().seq) || 0) + 1;
        tx.set(ref, { seq: value });
        return value;
      });
      const core = require('../packages/core/src/index.js');
      next.invoiceNumber = core.formatInvoiceNumber({ financialYear: core.financialYear(new Date()), seq });
    }
  }
  await priced.ref.set(next);
  return { stored: true, status: next.status, invoiceNumber: next.invoiceNumber || null };
}

const onRequest = (handler) => async (req, res) => {
  payments.applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  return handler(req, res);
};

exports.bootstrapAccount = regional.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const result = await handlers.bootstrapAccount(admin.firestore(), admin.auth(), {
      ...req.body,
      secret: req.get('x-bootstrap-secret') || '',
      configuredSecret: process.env.BOOTSTRAP_SECRET || '',
    });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

exports.createStaffUser = callable(handlers.createStaffUser);
exports.openTableSession = callable(handlers.openTableSession);
exports.placeOrder = callable(handlers.placeOrder);
exports.updateItemStatus = callable(handlers.updateItemStatus);
exports.serviceRequest = callable(handlers.serviceRequest);
exports.acknowledgeServiceRequest = callable(handlers.acknowledgeServiceRequest);
exports.moveTable = callable(handlers.moveTable);
exports.mergeTables = callable(handlers.mergeTables);
exports.splitBill = callable(handlers.splitBill);
exports.recordPayment = callable(handlers.recordPayment);
exports.applyManagerDiscount = callable(handlers.applyManagerDiscount);
exports.voidOrder = callable(handlers.voidOrder);
exports.closeDay = callable(handlers.closeDay);
exports.saveFeedback = callable(handlers.saveFeedback);
exports.issueCounterCode = callable(handlers.issueCounterCode);
exports.confirmCounterPayment = callable(handlers.confirmCounterPayment);
exports.addOutlet = callable(handlers.addOutlet);
exports.clock = callable(handlers.clock);
exports.finalisePayroll = callable(handlers.finalisePayroll);
exports.saveReservation = callable(handlers.saveReservation);

exports.createRazorpayOrder = regional.https.onRequest(onRequest(async (req, res) => {
  try {
    const creds = readRazorpay();
    if (!creds.keyId || !creds.keySecret) {
      return res.status(500).json({ error: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the rotated keys.' });
    }
    const actor = await actorFromRequest(req);
    const priced = await payments.expectedCharge(admin.firestore(), req.body || {});
    if (priced.order && !actorCanPay(actor, priced.order)) {
      return res.status(403).json({ error: 'You cannot pay this order.' });
    }
    const payoutSnap = priced.order
      ? await admin.firestore().collection('Restaurant').doc(priced.order.restaurantId).collection('private').doc('payout').get()
      : null;
    const route = payments.routeTransfer(payoutSnap && payoutSnap.exists ? payoutSnap.data() : null, priced.paise, priced.subtotal);
    const receipt = `oi_${Date.now()}`.slice(0, 40);
    const response = await axios.post('https://api.razorpay.com/v1/orders', {
      amount: priced.paise,
      currency: 'INR',
      receipt,
      payment_capture: 1,
      notes: {
        restaurantId: (req.body || {}).restaurantId || '',
        orderId: (req.body || {}).orderId || '',
      },
      ...(route ? { transfers: route.transfers } : {}),
    }, {
      auth: { username: creds.keyId, password: creds.keySecret },
      timeout: 10000,
    });
    return res.status(201).json({
      keyId: creds.keyId,
      order_id: response.data.id,
      amount: response.data.amount,
      currency: response.data.currency,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not create the payment' });
  }
}));

exports.verifyRazorpayPayment = regional.https.onRequest(onRequest(async (req, res) => {
  try {
    const creds = readRazorpay();
    const { razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: razorpaySignature } = req.body || {};
    const expected = crypto.createHmac('sha256', creds.keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    const { signaturesMatch } = require('./paymentGuard');
    const signatureOk = signaturesMatch(expected, razorpaySignature);
    const paymentResponse = await axios.get(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}`, {
      auth: { username: creds.keyId, password: creds.keySecret },
      timeout: 10000,
    });
    const payment = paymentResponse.data;
    const priced = await payments.expectedCharge(admin.firestore(), {
      restaurantId: (req.body || {}).restaurantId || payment.notes?.restaurantId,
      orderId: (req.body || {}).orderId || payment.notes?.orderId,
      customerPhone: (req.body || {}).customerPhone,
    });
    const decision = payments.assessCapturedPayment({
      expectedPaise: priced.paise,
      paidPaise: payment.amount,
      signatureOk,
      status: payment.status,
      orderMatches: !payment.order_id || payment.order_id === razorpayOrderId,
    });
    if (!decision.ok) return res.status(decision.status).json({ success: false, error: decision.error });
    const stored = await markOnlinePayment(admin.firestore(), priced, payment);
    return res.json({ success: true, ...stored });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'Verification failed' });
  }
}));

exports.razorpayWebhook = regional.https.onRequest(async (req, res) => {
  try {
    let secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    try {
      secret = secret || functions.config().razorpay?.webhook_secret || '';
    } catch (error) {
      secret = secret || '';
    }
    if (!payments.webhookSignatureOk(secret, req.rawBody, req.get('x-razorpay-signature'))) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    const event = req.body?.event;
    if (!['payment.captured', 'order.paid'].includes(event)) return res.json({ ok: true, ignored: true });
    const payment = req.body?.payload?.payment?.entity;
    if (!payment?.id) return res.status(400).json({ error: 'Payment missing' });
    const priced = await payments.expectedCharge(admin.firestore(), {
      restaurantId: payment.notes?.restaurantId,
      orderId: payment.notes?.orderId,
    });
    const decision = payments.assessCapturedPayment({
      expectedPaise: priced.paise,
      paidPaise: payment.amount,
      signatureOk: true,
      status: payment.status,
      orderMatches: true,
    });
    if (!decision.ok) return res.status(400).json(decision);
    const stored = await markOnlinePayment(admin.firestore(), priced, payment);
    return res.json({ ok: true, ...stored });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Webhook failed' });
  }
});
