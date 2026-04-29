const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const axios = require('axios');

if (!admin.apps.length) {
  admin.initializeApp();
}

const RAZORPAY_KEY_ID =
  functions.config().razorpay?.key_id ||
  process.env.RAZORPAY_KEY_ID ||
  'rzp_live_Sj1ZPsCyB5iu3t';
const RAZORPAY_KEY_SECRET =
  functions.config().razorpay?.key_secret ||
  process.env.RAZORPAY_KEY_SECRET ||
  'dN2uwxFr0hIZkcV57RXdRXmt';

const setCorsHeaders = (res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const parseAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : NaN;
};

const toRupees = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 100 : undefined;
};

const toIsoFromUnixSeconds = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Date(parsed * 1000).toISOString() : undefined;
};

const getOrderContext = (payload = {}) => {
  const notes = payload.notes || {};

  return {
    restaurantId: payload.restaurantId || notes.restaurantId || notes.restaurant_id,
    customerPhone: payload.customerPhone || notes.customerPhone || notes.customer_phone || payload.contact || notes.contact,
    orderId: payload.orderId || notes.orderId || notes.order_id || payload.receipt || notes.receipt,
  };
};

const buildRazorpayReconciliation = (paymentData, settlementData, source) => ({
  paymentTimestamp: new Date().toISOString(),
  razorpayOrderId: paymentData.order_id,
  razorpayPaymentId: paymentData.id,
  razorpaySignature: undefined,
  razorpayMethod: paymentData.method,
  razorpayStatus: paymentData.status,
  razorpayAmount: toRupees(paymentData.amount),
  razorpayCurrency: paymentData.currency,
  razorpayCapturedAt: toIsoFromUnixSeconds(paymentData.created_at),
  razorpayFeeAmount: toRupees(paymentData.fee),
  razorpayTaxAmount: toRupees(paymentData.tax),
  razorpaySettlementId: settlementData?.id || paymentData.settlement_id,
  razorpaySettlementStatus: settlementData?.status,
  razorpaySettlementAmount: toRupees(settlementData?.amount),
  razorpaySettlementUtr: settlementData?.utr,
  razorpaySettlementCreatedAt: toIsoFromUnixSeconds(settlementData?.created_at),
  razorpaySyncSource: source,
  razorpaySyncedAt: new Date().toISOString(),
});

const writeReconciliationToFirestore = async ({ restaurantId, customerPhone, orderId, reconciliation }) => {
  if (!restaurantId || !customerPhone || !orderId) {
    return { updated: false, reason: 'missing_order_context' };
  }

  const customerRef = admin.firestore().doc(`Restaurant/${restaurantId}/customers/${customerPhone}`);
  const customerSnap = await customerRef.get();

  if (!customerSnap.exists) {
    return { updated: false, reason: 'customer_not_found' };
  }

  const customerData = customerSnap.data() || {};
  const pastOrders = Array.isArray(customerData.pastOrders) ? customerData.pastOrders : [];
  let didUpdate = false;

  const updatedPastOrders = pastOrders.map((order) => {
    if (!order || typeof order !== 'object') {
      return order;
    }

    const matchesOrderId = order.id === orderId;
    const matchesRazorpayIds =
      order.razorpayPaymentId === reconciliation.razorpayPaymentId ||
      order.razorpayOrderId === reconciliation.razorpayOrderId;

    if (!matchesOrderId && !matchesRazorpayIds) {
      return order;
    }

    didUpdate = true;

    return {
      ...order,
      paymentStatus: reconciliation.razorpayStatus === 'captured' ? 'paid' : order.paymentStatus || 'pending',
      razorpayOrderId: reconciliation.razorpayOrderId,
      razorpayPaymentId: reconciliation.razorpayPaymentId,
      razorpayMethod: reconciliation.razorpayMethod,
      razorpayStatus: reconciliation.razorpayStatus,
      razorpayAmount: reconciliation.razorpayAmount,
      razorpayCurrency: reconciliation.razorpayCurrency,
      razorpayCapturedAt: reconciliation.razorpayCapturedAt,
      razorpayFeeAmount: reconciliation.razorpayFeeAmount,
      razorpayTaxAmount: reconciliation.razorpayTaxAmount,
      razorpaySettlementId: reconciliation.razorpaySettlementId,
      razorpaySettlementStatus: reconciliation.razorpaySettlementStatus,
      razorpaySettlementAmount: reconciliation.razorpaySettlementAmount,
      razorpaySettlementUtr: reconciliation.razorpaySettlementUtr,
      razorpaySettlementCreatedAt: reconciliation.razorpaySettlementCreatedAt,
      razorpaySyncSource: reconciliation.razorpaySyncSource,
      razorpaySyncedAt: reconciliation.razorpaySyncedAt,
      paymentTimestamp: order.paymentTimestamp || reconciliation.paymentTimestamp,
    };
  });

  if (!didUpdate) {
    return { updated: false, reason: 'order_not_found' };
  }

  await customerRef.update({
    pastOrders: updatedPastOrders,
  });

  return { updated: true };
};

const fetchSettlementById = async (settlementId) => {
  if (!settlementId) {
    return null;
  }

  try {
    const response = await axios.get(`https://api.razorpay.com/v1/settlements/${settlementId}`, {
      auth: {
        username: RAZORPAY_KEY_ID,
        password: RAZORPAY_KEY_SECRET,
      },
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    console.warn('[Razorpay] Failed to fetch settlement:', settlementId, error.message);
    return null;
  }
};

const handleCreateRazorpayOrder = async (req, res) => {
  try {
    const {
      amount,
      currency = 'INR',
      receipt,
      customerPhone,
      restaurantId,
      orderId,
      paymentMethod,
    } = req.body || {};

    const finalAmount = parseAmount(amount);

    if (!finalAmount || finalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!receipt) {
      return res.status(400).json({ error: 'Receipt is required' });
    }

    console.log('[createRazorpayOrder] Request body:', {
      ...req.body,
      amount: finalAmount,
    });

    const razorpayResponse = await axios.post(
      'https://api.razorpay.com/v1/orders',
      {
        amount: finalAmount,
        currency,
        receipt,
        notes: {
          customerPhone,
          restaurantId,
          orderId,
          paymentMethod,
        },
      },
      {
        auth: {
          username: RAZORPAY_KEY_ID,
          password: RAZORPAY_KEY_SECRET,
        },
        timeout: 10000,
      }
    );

    const orderData = razorpayResponse.data;

    console.log('[createRazorpayOrder] SUCCESS - Order created:', {
      order_id: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      status: orderData.status,
    });

    return res.status(201).json({
      order_id: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      status: orderData.status,
    });
  } catch (error) {
    console.error('[createRazorpayOrder] FULL ERROR:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      code: error.code,
    });

    let errorMessage = 'Failed to create Razorpay order';
    if (error.response?.status === 401) {
      errorMessage = 'Razorpay authentication failed - check API keys';
    } else if (error.response?.status === 400) {
      errorMessage = `Razorpay validation error: ${error.response?.data?.description || error.message}`;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - Razorpay API slow';
    }

    return res.status(500).json({
      error: 'Failed to create order',
      message: errorMessage,
    });
  }
};

const handleVerifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body || {};

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'Missing required payment details',
        message: 'razorpay_payment_id, razorpay_order_id, and razorpay_signature are required',
      });
    }

    const signatureString = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(signatureString)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        error: 'Signature verification failed',
        message: 'Payment signature mismatch',
      });
    }

    try {
      const paymentResponse = await axios.get(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
        auth: {
          username: RAZORPAY_KEY_ID,
          password: RAZORPAY_KEY_SECRET,
        },
        timeout: 10000,
      });

      const paymentData = paymentResponse.data;
      const settlementData = await fetchSettlementById(paymentData.settlement_id);

      return res.status(200).json({
        success: true,
        status: 'verified',
        payment_id: paymentData.id,
        order_id: paymentData.order_id || razorpay_order_id,
        amount: paymentData.amount,
        currency: paymentData.currency,
        method: paymentData.method,
        payment_status: paymentData.status,
        settlement_id: settlementData?.id || paymentData.settlement_id || null,
        settlement_status: settlementData?.status || null,
      });
    } catch (apiError) {
      console.warn('[verifyRazorpayPayment] Could not fetch payment details from API:', apiError.message);
      return res.status(200).json({
        success: true,
        status: 'verified',
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
      });
    }
  } catch (error) {
    console.error('[verifyRazorpayPayment] Error:', error.message || error);
    return res.status(500).json({
      error: 'Verification failed',
      message: error.message || 'Internal error',
    });
  }
};

const handleSyncRazorpayPayment = async (req, res) => {
  try {
    const razorpayPaymentId = req.body?.razorpayPaymentId || req.body?.paymentId;

    if (!razorpayPaymentId) {
      return res.status(400).json({
        error: 'Missing razorpayPaymentId',
      });
    }

    const paymentResponse = await axios.get(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}`, {
      auth: {
        username: RAZORPAY_KEY_ID,
        password: RAZORPAY_KEY_SECRET,
      },
      timeout: 10000,
    });

    const paymentData = paymentResponse.data;
    const settlementData = await fetchSettlementById(paymentData.settlement_id);
    const reconciliation = buildRazorpayReconciliation(paymentData, settlementData, 'api');
    const context = {
      ...getOrderContext(paymentData),
      restaurantId: req.body?.restaurantId || getOrderContext(paymentData).restaurantId,
      customerPhone: req.body?.customerPhone || getOrderContext(paymentData).customerPhone,
      orderId: req.body?.orderId || getOrderContext(paymentData).orderId,
    };
    const firestoreResult = await writeReconciliationToFirestore({
      ...context,
      reconciliation,
    });

    return res.status(200).json({
      success: true,
      context,
      payment: reconciliation,
      firestore: firestoreResult,
    });
  } catch (error) {
    console.error('[syncRazorpayPayment] Error:', error.message || error);
    return res.status(500).json({
      error: 'Failed to sync Razorpay payment',
      message: error.response?.data?.description || error.message || 'Internal error',
    });
  }
};

const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSecret =
      functions.config().razorpay?.webhook_secret ||
      process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return res.status(500).json({
        error: 'Webhook secret not configured',
      });
    }

    const signature = req.header('x-razorpay-signature');

    if (!signature) {
      return res.status(400).json({
        error: 'Missing webhook signature',
      });
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({
        error: 'Invalid webhook signature',
      });
    }

    const event = req.body?.event;

    if (!['payment.captured', 'order.paid'].includes(event)) {
      return res.status(200).json({
        success: true,
        ignored: true,
        event,
      });
    }

    const paymentData = req.body?.payload?.payment?.entity;

    if (!paymentData?.id) {
      return res.status(400).json({
        error: 'Payment entity missing in webhook payload',
      });
    }

    const settlementData = await fetchSettlementById(paymentData.settlement_id);
    const reconciliation = buildRazorpayReconciliation(paymentData, settlementData, 'webhook');
    const firestoreResult = await writeReconciliationToFirestore({
      ...getOrderContext(paymentData),
      reconciliation,
    });

    return res.status(200).json({
      success: true,
      event,
      paymentId: paymentData.id,
      firestore: firestoreResult,
    });
  } catch (error) {
    console.error('[razorpayWebhook] Error:', error.message || error);
    return res.status(500).json({
      error: 'Webhook handling failed',
      message: error.message || 'Internal error',
    });
  }
};

const onRequest = (handler) => async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  await handler(req, res);
};

exports.onPromotionDelete = functions.firestore
  .document('Restaurant/orderin_restaurant_1/promotions/{promotionId}')
  .onDelete(async (snap, context) => {
    const data = snap.data();
    if (!data) return null;

    const imagePath = data.image_path || null;
    if (!imagePath) {
      console.log('onPromotionDelete: no image_path to delete for', context.params.promotionId);
      return null;
    }

    try {
      const bucket = admin.storage().bucket();
      const file = bucket.file(imagePath);
      const [exists] = await file.exists();
      if (!exists) {
        console.warn('onPromotionDelete: file does not exist:', imagePath);
        return null;
      }
      await file.delete();
      console.log('onPromotionDelete: deleted storage file', imagePath);
    } catch (err) {
      console.error('onPromotionDelete: failed to delete storage file', imagePath, err.message || err);
    }
    return null;
  });

exports.getSignedPromotionUploadUrl = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const isAdmin = context.auth.token && context.auth.token.admin;
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }

  const { filename, folder = 'promotions' } = data;
  if (!filename || typeof filename !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'filename is required');
  }

  const bucket = admin.storage().bucket();
  const filePath = `${folder}/${filename}`;
  const file = bucket.file(filePath);

  try {
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: 'image/*',
    });
    return { uploadUrl: url, path: filePath };
  } catch (err) {
    console.error('getSignedPromotionUploadUrl failed:', err.message || err);
    throw new functions.https.HttpsError('internal', 'Failed to create signed upload URL');
  }
});

exports.createRazorpayOrder = functions.https.onRequest(onRequest(handleCreateRazorpayOrder));
exports.verifyRazorpayPayment = functions.https.onRequest(onRequest(handleVerifyRazorpayPayment));
exports.syncRazorpayPayment = functions.https.onRequest(onRequest(handleSyncRazorpayPayment));
exports.razorpayWebhook = functions.https.onRequest(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  await handleRazorpayWebhook(req, res);
});

exports.api = functions.https.onRequest(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (req.path === '/createRazorpayOrder') {
    await handleCreateRazorpayOrder(req, res);
    return;
  }

  if (req.path === '/verifyRazorpayPayment') {
    await handleVerifyRazorpayPayment(req, res);
    return;
  }

  if (req.path === '/syncRazorpayPayment') {
    await handleSyncRazorpayPayment(req, res);
    return;
  }

  if (req.path === '/razorpayWebhook') {
    await handleRazorpayWebhook(req, res);
    return;
  }

  res.status(404).json({ error: 'Route not found' });
});
