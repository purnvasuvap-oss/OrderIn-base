const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const axios = require('axios');

if (!admin.apps.length) {
  admin.initializeApp();
}

const FALLBACK_RAZORPAY_KEY_ID = 'rzp_live_Sj1ZPsCyB5iu3t';
const FALLBACK_RAZORPAY_KEY_SECRET = 'dN2uwxFr0hIZkcV57RXdRXmt';
const REMOVED_RAZORPAY_VALUE_HASHES = new Set([
  '0931028ec556aa2d2e65c4c604da9200517b5718df04eedc1cb5b735422b7b44',
  '44f9000b54b1b661e4c2f7fa84aba1cd840827fe6731a99c17fb9a06ce00487b',
]);
const isRemovedRazorpayValue = (value) =>
  REMOVED_RAZORPAY_VALUE_HASHES.has(crypto.createHash('sha256').update(value).digest('hex'));
const resolveRazorpayCredential = (...values) =>
  values.find((value) => value && !isRemovedRazorpayValue(value));

const RAZORPAY_KEY_ID = resolveRazorpayCredential(
  functions.config().razorpay?.key_id,
  process.env.RAZORPAY_KEY_ID,
  FALLBACK_RAZORPAY_KEY_ID
);
const RAZORPAY_KEY_SECRET = resolveRazorpayCredential(
  functions.config().razorpay?.key_secret,
  process.env.RAZORPAY_KEY_SECRET,
  FALLBACK_RAZORPAY_KEY_SECRET
);

const ROUTE_LINKED_ACCOUNTS = {
  orderin_restaurant_1: {
    accountId: 'acc_SjLjWf24odYA9k',
    name: 'OrderIn-0',
  },
  orderin_restaurant_2: {
    accountId: 'acc_SjLoWPi1B6Ybxr',
    name: 'OrderIn-1',
  },
};

const setCorsHeaders = (res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const parseAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : NaN;
};

const parseRupeeAmountToPaise = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
};

const firstFiniteAmount = (...values) => {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return NaN;
};

const toRupees = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 100 : undefined;
};

const toIsoFromUnixSeconds = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Date(parsed * 1000).toISOString() : undefined;
};

const removeUndefined = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
};

const getOrderContext = (payload = {}) => {
  const notes = payload.notes || {};

  return {
    restaurantId: payload.restaurantId || notes.restaurantId || notes.restaurant_id,
    customerPhone: payload.customerPhone || notes.customerPhone || notes.customer_phone || payload.contact || notes.contact,
    orderId: payload.orderId || notes.orderId || notes.order_id || payload.receipt || notes.receipt,
  };
};

const getCustomerPhoneCandidates = (customerPhone) => {
  const raw = String(customerPhone || '').trim();
  if (!raw) {
    return [];
  }

  const digits = raw.replace(/\D/g, '');
  const candidates = [raw];

  if (raw.startsWith('+')) {
    candidates.push(raw.slice(1));
  } else {
    candidates.push(`+${raw}`);
  }

  if (digits.length === 10) {
    candidates.push(`+91${digits}`, `91${digits}`, digits);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    candidates.push(`+${digits}`, digits, digits.slice(2));
  }

  return [...new Set(candidates.filter(Boolean))];
};

const buildRouteSplit = ({
  amount,
  currency,
  restaurantId,
  customerPhone,
  orderId,
  subtotal,
  subtotalAmount,
  subtotalAmountPaise,
  restaurantAmount,
  restaurantAmountPaise,
}) => {
  const linkedAccount = ROUTE_LINKED_ACCOUNTS[restaurantId];
  if (!linkedAccount || String(currency || '').toUpperCase() !== 'INR') {
    return null;
  }

  const transferAmount = firstFiniteAmount(
    parseAmount(restaurantAmountPaise),
    parseAmount(subtotalAmountPaise),
    parseRupeeAmountToPaise(restaurantAmount),
    parseRupeeAmountToPaise(subtotalAmount),
    parseRupeeAmountToPaise(subtotal)
  );

  if (!Number.isFinite(transferAmount) || transferAmount < 100 || transferAmount > amount) {
    return null;
  }

  const platformGrossAmount = Math.max(amount - transferAmount, 0);
  const transfer = {
    account: linkedAccount.accountId,
    amount: transferAmount,
    currency: 'INR',
    notes: removeUndefined({
      restaurantId,
      orderId,
      customerPhone,
      routeAccountName: linkedAccount.name,
      splitType: 'restaurant_subtotal',
    }),
    linked_account_notes: ['restaurantId', 'orderId', 'routeAccountName'],
    on_hold: false,
  };

  return {
    linkedAccount,
    transferAmount,
    platformGrossAmount,
    transfers: [transfer],
  };
};

const getPrimaryTransfer = (transferCollection) => {
  const items = Array.isArray(transferCollection?.items)
    ? transferCollection.items
    : Array.isArray(transferCollection)
      ? transferCollection
      : [];

  return items.find((transfer) => transfer && typeof transfer === 'object') || null;
};

const buildRazorpayReconciliation = (paymentData, settlementData, source, transferCollection = null) => {
  const primaryTransfer = getPrimaryTransfer(transferCollection);
  const razorpayAmount = toRupees(paymentData.amount);
  const routeTransferAmount = toRupees(primaryTransfer?.amount);
  const routePlatformGrossAmount =
    razorpayAmount !== undefined && routeTransferAmount !== undefined
      ? Math.max(razorpayAmount - routeTransferAmount, 0)
      : undefined;
  const razorpayFeeAmount = toRupees(paymentData.fee);
  const routePlatformNetAmount =
    routePlatformGrossAmount !== undefined && razorpayFeeAmount !== undefined
      ? Math.max(routePlatformGrossAmount - razorpayFeeAmount, 0)
      : undefined;

  return removeUndefined({
    paymentTimestamp: new Date().toISOString(),
    razorpayOrderId: paymentData.order_id,
    razorpayPaymentId: paymentData.id,
    razorpaySignature: undefined,
    razorpayMethod: paymentData.method,
    razorpayStatus: paymentData.status,
    razorpayAmount,
    razorpayCurrency: paymentData.currency,
    razorpayCapturedAt: toIsoFromUnixSeconds(paymentData.created_at),
    razorpayFeeAmount,
    razorpayTaxAmount: toRupees(paymentData.tax),
    razorpaySettlementId: settlementData?.id || paymentData.settlement_id,
    razorpaySettlementStatus: settlementData?.status,
    razorpaySettlementAmount: toRupees(settlementData?.amount),
    razorpaySettlementUtr: settlementData?.utr,
    razorpaySettlementCreatedAt: toIsoFromUnixSeconds(settlementData?.created_at),
    razorpayTransferId: primaryTransfer?.id,
    razorpayTransferStatus: primaryTransfer?.status || primaryTransfer?.transfer_status,
    razorpayTransferSettlementStatus: primaryTransfer?.settlement_status,
    razorpayTransferRecipient: primaryTransfer?.recipient,
    razorpayTransferAmount: routeTransferAmount,
    razorpayTransferCurrency: primaryTransfer?.currency,
    routePlatformGrossAmount,
    routePlatformNetAmount,
    razorpayRouteTransfers: Array.isArray(transferCollection?.items) ? transferCollection.items : undefined,
    razorpaySyncSource: source,
    razorpaySyncedAt: new Date().toISOString(),
  });
};

const writeReconciliationToFirestore = async ({ restaurantId, customerPhone, orderId, reconciliation }) => {
  if (!restaurantId || !customerPhone || !orderId) {
    return { updated: false, reason: 'missing_order_context' };
  }

  let customerRef = null;
  let customerSnap = null;

  for (const phoneCandidate of getCustomerPhoneCandidates(customerPhone)) {
    const candidateRef = admin.firestore().doc(`Restaurant/${restaurantId}/customers/${phoneCandidate}`);
    const candidateSnap = await candidateRef.get();
    if (candidateSnap.exists) {
      customerRef = candidateRef;
      customerSnap = candidateSnap;
      break;
    }
  }

  if (!customerSnap?.exists || !customerRef) {
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

    return removeUndefined({
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
      razorpayTransferId: reconciliation.razorpayTransferId,
      razorpayTransferStatus: reconciliation.razorpayTransferStatus,
      razorpayTransferSettlementStatus: reconciliation.razorpayTransferSettlementStatus,
      razorpayTransferRecipient: reconciliation.razorpayTransferRecipient,
      razorpayTransferAmount: reconciliation.razorpayTransferAmount,
      razorpayTransferCurrency: reconciliation.razorpayTransferCurrency,
      routePlatformGrossAmount: reconciliation.routePlatformGrossAmount,
      routePlatformNetAmount: reconciliation.routePlatformNetAmount,
      razorpayRouteTransfers: reconciliation.razorpayRouteTransfers,
      razorpaySyncSource: reconciliation.razorpaySyncSource,
      razorpaySyncedAt: reconciliation.razorpaySyncedAt,
      paymentTimestamp: order.paymentTimestamp || reconciliation.paymentTimestamp,
    });
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

const fetchTransfersForPayment = async (paymentId) => {
  if (!paymentId) {
    return null;
  }

  try {
    const response = await axios.get(`https://api.razorpay.com/v1/payments/${paymentId}/transfers`, {
      auth: {
        username: RAZORPAY_KEY_ID,
        password: RAZORPAY_KEY_SECRET,
      },
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    console.warn('[Razorpay] Failed to fetch payment transfers:', paymentId, error.message);
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
      subtotal,
      subtotalAmount,
      subtotalAmountPaise,
      restaurantAmount,
      restaurantAmountPaise,
    } = req.body || {};

    const finalAmount = parseAmount(amount);
    const routeSplit = buildRouteSplit({
      amount: finalAmount,
      currency,
      restaurantId,
      customerPhone,
      orderId,
      subtotal,
      subtotalAmount,
      subtotalAmountPaise,
      restaurantAmount,
      restaurantAmountPaise,
    });

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
      removeUndefined({
        amount: finalAmount,
        currency,
        receipt,
        partial_payment: false,
        notes: {
          customerPhone,
          restaurantId,
          orderId,
          paymentMethod,
          routeAccountId: routeSplit?.linkedAccount.accountId,
          routeAccountName: routeSplit?.linkedAccount.name,
          routeRestaurantAmount: routeSplit ? toRupees(routeSplit.transferAmount) : undefined,
          routePlatformGrossAmount: routeSplit ? toRupees(routeSplit.platformGrossAmount) : undefined,
        },
        transfers: routeSplit?.transfers,
      }),
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
      routeSplit: routeSplit
        ? {
            accountId: routeSplit.linkedAccount.accountId,
            accountName: routeSplit.linkedAccount.name,
            restaurantAmount: toRupees(routeSplit.transferAmount),
            platformGrossAmount: toRupees(routeSplit.platformGrossAmount),
            transfers: orderData.transfers || [],
          }
        : null,
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
      const transferCollection = await fetchTransfersForPayment(paymentData.id);
      const primaryTransfer = getPrimaryTransfer(transferCollection);

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
        transfer_id: primaryTransfer?.id || null,
        transfer_status: primaryTransfer?.status || primaryTransfer?.transfer_status || null,
        transfer_recipient: primaryTransfer?.recipient || null,
        transfer_amount: primaryTransfer?.amount ?? null,
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
    const transferCollection = await fetchTransfersForPayment(paymentData.id);
    const reconciliation = buildRazorpayReconciliation(paymentData, settlementData, 'api', transferCollection);
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
    const transferCollection = await fetchTransfersForPayment(paymentData.id);
    const reconciliation = buildRazorpayReconciliation(paymentData, settlementData, 'webhook', transferCollection);
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
