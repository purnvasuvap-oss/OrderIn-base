const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const axios = require('axios');

// BILLING GUARD:
// Keep Cloud Functions limited to Razorpay/payment work only.
// Do not add App Engine, Cloud SQL, Data Connect, broad API wrappers, or
// non-payment background functions here without an explicit billing review.

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

const addBusinessDays = (date, days) => {
  const result = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }

  return result;
};

const getEstimatedSettlementIso = (paymentData = {}) => {
  const sourceTimestamp = Number(paymentData.captured_at || paymentData.created_at);
  if (!Number.isFinite(sourceTimestamp)) return undefined;
  return addBusinessDays(new Date(sourceTimestamp * 1000), 2).toISOString();
};

const getEstimatedReceivingIso = (paymentData = {}) => {
  const sourceTimestamp = Number(paymentData.captured_at || paymentData.created_at);
  const sourceDate = Number.isFinite(sourceTimestamp) ? new Date(sourceTimestamp * 1000) : new Date();
  const expected = new Date(sourceDate);
  expected.setDate(expected.getDate() + 7);
  expected.setHours(21, 0, 0, 0);
  return expected.toISOString();
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

const buildRazorpayReceipt = ({ receipt, restaurantId, orderId }) => {
  const rawReceipt = String(receipt || '').trim();
  if (rawReceipt && rawReceipt.length <= 40) {
    return rawReceipt;
  }

  const restaurantCode = restaurantId === 'orderin_restaurant_1'
    ? 'r1'
    : restaurantId === 'orderin_restaurant_2'
      ? 'r2'
      : String(restaurantId || 'rx').replace(/[^a-zA-Z0-9_-]/g, '').slice(-8);
  const orderCode = String(orderId || 'order').replace(/[^a-zA-Z0-9_-]/g, '').slice(-16);
  const timestamp = Date.now().toString(36).slice(-8);

  return `oi_${restaurantCode}_${orderCode}_${timestamp}`.slice(0, 40);
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
  const recipientSettlement = primaryTransfer?.recipient_settlement;
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
  const razorpaySettlementAmount = toRupees(settlementData?.amount);

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
    razorpaySettlementAmount,
    razorpaySettlementUtr: settlementData?.utr,
    razorpaySettlementCreatedAt: toIsoFromUnixSeconds(settlementData?.created_at),
    razorpaySettlementExpectedAt: toIsoFromUnixSeconds(settlementData?.created_at) || getEstimatedSettlementIso(paymentData),
    razorpayTransferId: primaryTransfer?.id,
    razorpayTransferStatus: primaryTransfer?.status || primaryTransfer?.transfer_status,
    razorpayTransferSettlementStatus: primaryTransfer?.settlement_status,
    razorpayTransferSettlementId: primaryTransfer?.recipient_settlement_id || recipientSettlement?.id,
    razorpayTransferSettlementCreatedAt: toIsoFromUnixSeconds(recipientSettlement?.created_at),
    razorpayTransferSettlementExpectedAt: toIsoFromUnixSeconds(recipientSettlement?.created_at) || getEstimatedSettlementIso(paymentData),
    razorpayTransferSettlementUtr: recipientSettlement?.utr,
    razorpayTransferRecipient: primaryTransfer?.recipient,
    razorpayTransferAmount: routeTransferAmount,
    razorpayTransferCurrency: primaryTransfer?.currency,
    routePlatformGrossAmount,
    routePlatformNetAmount,
    razorpayAdminSettlementAmount: routePlatformNetAmount ?? razorpaySettlementAmount,
    razorpayRouteTransfers: Array.isArray(transferCollection?.items) ? transferCollection.items : undefined,
    razorpaySyncSource: source,
    razorpaySyncedAt: new Date().toISOString(),
  });
};

const getSettlementQueueRef = (paymentId) =>
  admin.firestore().collection('razorpaySettlementQueue').doc(paymentId);

const getNextSettlementRunDate = (date = new Date()) => {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);
  let nextRunUtcMs = Date.UTC(
    istDate.getUTCFullYear(),
    istDate.getUTCMonth(),
    istDate.getUTCDate(),
    23,
    30,
    0,
    0
  ) - istOffsetMs;

  if (nextRunUtcMs <= date.getTime()) {
    nextRunUtcMs += 24 * 60 * 60 * 1000;
  }

  return new Date(nextRunUtcMs);
};

const queueSettlementCheck = async ({ paymentData, context, reconciliation = {}, nextAttemptAt }) => {
  if (!paymentData?.id || !context?.restaurantId || !context?.customerPhone || !context?.orderId) {
    return { queued: false, reason: 'missing_context' };
  }

  const now = new Date();
  const firstAttempt = nextAttemptAt || getNextSettlementRunDate(now);

  await getSettlementQueueRef(paymentData.id).set(removeUndefined({
    razorpayPaymentId: paymentData.id,
    razorpayOrderId: paymentData.order_id,
    restaurantId: context.restaurantId,
    customerPhone: context.customerPhone,
    orderId: context.orderId,
    status: 'pending',
    paymentStatus: paymentData.status,
    paymentAmount: toRupees(paymentData.amount),
    paymentCurrency: paymentData.currency,
    paymentCreatedAt: toIsoFromUnixSeconds(paymentData.created_at) || now.toISOString(),
    expectedReceivingAt: reconciliation.razorpayTransferSettlementExpectedAt ||
      reconciliation.razorpaySettlementExpectedAt ||
      getEstimatedReceivingIso(paymentData),
    attempts: 0,
    nextAttemptAt: admin.firestore.Timestamp.fromDate(firstAttempt),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }), { merge: true });

  return { queued: true };
};

const markQueueSettled = async (paymentId, reconciliation) => {
  await getSettlementQueueRef(paymentId).set(removeUndefined({
    status: 'settled',
    settledAt: reconciliation.razorpayTransferSettlementCreatedAt ||
      reconciliation.razorpaySettlementCreatedAt ||
      reconciliation.razorpaySyncedAt,
    adminReceivedAmount: reconciliation.razorpayAdminSettlementAmount,
    settlementUtr: reconciliation.razorpayTransferSettlementUtr || reconciliation.razorpaySettlementUtr,
    nextAttemptAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }), { merge: true });
};

const markQueueForRetry = async (queueDoc, reason) => {
  const data = queueDoc.data() || {};
  const attempts = Number(data.attempts || 0) + 1;
  const paymentCreatedAt = data.paymentCreatedAt ? new Date(data.paymentCreatedAt) : new Date();
  const ageMs = Date.now() - paymentCreatedAt.getTime();
  const isTooOld = Number.isFinite(ageMs) && ageMs > 10 * 24 * 60 * 60 * 1000;

  await queueDoc.ref.set(removeUndefined({
    status: isTooOld ? 'manual_review' : 'pending',
    attempts,
    lastReason: reason,
    lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
    nextAttemptAt: isTooOld
      ? admin.firestore.Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))
      : admin.firestore.Timestamp.fromDate(new Date(Date.now() + 12 * 60 * 60 * 1000)),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }), { merge: true });
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

    const matchesOrderId = String(order.id) === String(orderId);
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
      razorpayAdminSettlementAmount: reconciliation.razorpayAdminSettlementAmount,
      razorpaySettlementUtr: reconciliation.razorpaySettlementUtr,
      razorpaySettlementCreatedAt: reconciliation.razorpaySettlementCreatedAt,
      razorpaySettlementExpectedAt: reconciliation.razorpaySettlementExpectedAt,
      razorpayTransferId: reconciliation.razorpayTransferId,
      razorpayTransferStatus: reconciliation.razorpayTransferStatus,
      razorpayTransferSettlementStatus: reconciliation.razorpayTransferSettlementStatus,
      razorpayTransferSettlementId: reconciliation.razorpayTransferSettlementId,
      razorpayTransferSettlementCreatedAt: reconciliation.razorpayTransferSettlementCreatedAt,
      razorpayTransferSettlementExpectedAt: reconciliation.razorpayTransferSettlementExpectedAt,
      razorpayTransferSettlementUtr: reconciliation.razorpayTransferSettlementUtr,
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
      params: {
        'expand[]': 'recipient_settlement',
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

    const finalReceipt = buildRazorpayReceipt({ receipt, restaurantId, orderId });

    console.log('[createRazorpayOrder] Request body:', {
      ...req.body,
      amount: finalAmount,
      receipt: finalReceipt,
    });

    const razorpayResponse = await axios.post(
      'https://api.razorpay.com/v1/orders',
      removeUndefined({
        amount: finalAmount,
        currency,
        receipt: finalReceipt,
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
      const reconciliation = buildRazorpayReconciliation(paymentData, settlementData, 'verify', transferCollection);
      const context = {
        ...getOrderContext(paymentData),
        restaurantId: req.body?.restaurantId || getOrderContext(paymentData).restaurantId,
        customerPhone: req.body?.customerPhone || getOrderContext(paymentData).customerPhone,
        orderId: req.body?.orderId || getOrderContext(paymentData).orderId,
      };
      const queueResult = await queueSettlementCheck({ paymentData, context, reconciliation });

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
        settlement_expected_at: toIsoFromUnixSeconds(settlementData?.created_at) || getEstimatedSettlementIso(paymentData) || null,
        transfer_id: primaryTransfer?.id || null,
        transfer_status: primaryTransfer?.status || primaryTransfer?.transfer_status || null,
        transfer_settlement_expected_at: toIsoFromUnixSeconds(primaryTransfer?.recipient_settlement?.created_at) || getEstimatedSettlementIso(paymentData) || null,
        transfer_recipient: primaryTransfer?.recipient || null,
        transfer_amount: primaryTransfer?.amount ?? null,
        settlement_queue: queueResult,
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

const isSettlementComplete = (paymentData, settlementData, transferCollection) => {
  const primaryTransfer = getPrimaryTransfer(transferCollection);
  const recipientSettlement = primaryTransfer?.recipient_settlement;
  const settlementStatus = String(settlementData?.status || paymentData?.settlement_status || '').toLowerCase();
  const transferSettlementStatus = String(
    primaryTransfer?.settlement_status ||
      primaryTransfer?.transfer_status ||
      recipientSettlement?.status ||
      ''
  ).toLowerCase();

  return settlementStatus.includes('processed') ||
    settlementStatus.includes('settled') ||
    transferSettlementStatus.includes('processed') ||
    transferSettlementStatus.includes('settled');
};

const reconcileQueuedSettlement = async (queueDoc) => {
  const data = queueDoc.data() || {};
  const paymentId = data.razorpayPaymentId;

  if (!paymentId || !data.restaurantId || !data.customerPhone || !data.orderId) {
    await markQueueForRetry(queueDoc, 'missing_context');
    return { updated: false, reason: 'missing_context' };
  }

  const paymentResponse = await axios.get(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    auth: {
      username: RAZORPAY_KEY_ID,
      password: RAZORPAY_KEY_SECRET,
    },
    timeout: 10000,
  });

  const paymentData = paymentResponse.data;
  const settlementData = await fetchSettlementById(paymentData.settlement_id);
  const transferCollection = await fetchTransfersForPayment(paymentData.id);

  if (!isSettlementComplete(paymentData, settlementData, transferCollection)) {
    await markQueueForRetry(queueDoc, 'settlement_not_ready');
    return { updated: false, reason: 'settlement_not_ready' };
  }

  const reconciliation = buildRazorpayReconciliation(paymentData, settlementData, 'scheduled', transferCollection);
  const firestoreResult = await writeReconciliationToFirestore({
    restaurantId: data.restaurantId,
    customerPhone: data.customerPhone,
    orderId: data.orderId,
    reconciliation,
  });

  if (firestoreResult.updated) {
    await markQueueSettled(paymentId, reconciliation);
  } else {
    await markQueueForRetry(queueDoc, firestoreResult.reason || 'firestore_update_failed');
  }

  return firestoreResult;
};

const processDueQueueDocs = async (queueDocs, concurrency) => {
  let settled = 0;
  let pending = 0;
  let failed = 0;
  let nextIndex = 0;

  const workerCount = Math.min(Math.max(concurrency, 1), Math.max(queueDocs.length, 1));

  const runWorker = async () => {
    while (nextIndex < queueDocs.length) {
      const queueDoc = queueDocs[nextIndex];
      nextIndex += 1;

      const data = queueDoc.data() || {};
      if (data.status !== 'pending') {
        continue;
      }

      try {
        const result = await reconcileQueuedSettlement(queueDoc);
        if (result.updated) {
          settled += 1;
        } else {
          pending += 1;
        }
      } catch (error) {
        failed += 1;
        console.error('[scheduledRazorpaySettlementSync] item failed:', queueDoc.id, error.message || error);
        await markQueueForRetry(queueDoc, error.response?.data?.description || error.message || 'sync_failed');
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return { settled, pending, failed };
};

const handleScheduledSettlementReconciliation = async () => {
  const concurrency = Number(process.env.SETTLEMENT_SYNC_CONCURRENCY || 5);
  const now = admin.firestore.Timestamp.now();
  const dueSnap = await admin.firestore()
    .collection('razorpaySettlementQueue')
    .where('nextAttemptAt', '<=', now)
    .orderBy('nextAttemptAt', 'asc')
    .get();

  const { settled, pending, failed } = await processDueQueueDocs(dueSnap.docs, concurrency);

  console.log('[scheduledRazorpaySettlementSync] complete', {
    checked: dueSnap.size,
    concurrency,
    settled,
    pending,
    failed,
  });

  return null;
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

exports.createRazorpayOrder = functions.https.onRequest(onRequest(handleCreateRazorpayOrder));
exports.verifyRazorpayPayment = functions.https.onRequest(onRequest(handleVerifyRazorpayPayment));
exports.scheduledRazorpaySettlementSync = functions
  .runWith({ timeoutSeconds: 540, memory: '256MB' })
  .pubsub
  .schedule('30 23 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(handleScheduledSettlementReconciliation);
