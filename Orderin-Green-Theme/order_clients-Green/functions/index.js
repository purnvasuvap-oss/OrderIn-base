const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const axios = require('axios');
const bcrypt = require('bcryptjs');

// BILLING GUARD:
// Keep Cloud Functions limited to Razorpay/payment work only.
// Do not add App Engine, Cloud SQL, Data Connect, broad API wrappers, or
// non-payment background functions here without an explicit billing review.

if (!admin.apps.length) {
  admin.initializeApp();
}

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || functions.config().razorpay?.key_id || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || functions.config().razorpay?.key_secret || '';

const ROUTE_LINKED_ACCOUNTS = {
  orderin_restuarant_6: {
    accountId: 'acc_SjLjWf24odYA9k',
    name: 'OrderIn-0',
  },
  orderin_restuarant_6: {
    accountId: 'acc_SjLoWPi1B6Ybxr',
    name: 'OrderIn-1',
  },
  // orderin_restuarant_6:{

  // }
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

const valueOrExisting = (nextValue, existingValue) => {
  if (nextValue === undefined || nextValue === null || nextValue === '') {
    return existingValue;
  }

  return nextValue;
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

  const restaurantCode = restaurantId === 'orderin_restuarant_6'
    ? 'r1'
    : restaurantId === 'orderin_restuarant_6'
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

const getTransferSettlementId = (transfer) =>
  transfer?.recipient_settlement_id || transfer?.recipient_settlement?.id || null;

const resolveTransferSettlement = async (transfer) => {
  if (!transfer || typeof transfer !== 'object') {
    return null;
  }

  const embeddedSettlement = transfer.recipient_settlement;
  if (embeddedSettlement && typeof embeddedSettlement === 'object') {
    return embeddedSettlement;
  }

  return fetchSettlementById(getTransferSettlementId(transfer), transfer.recipient || transfer.account);
};

const buildRazorpayReconciliation = async (paymentData, settlementData, source, transferCollection = null) => {
  const primaryTransfer = getPrimaryTransfer(transferCollection);
  const recipientSettlement = await resolveTransferSettlement(primaryTransfer);
  const transferSettlementId = getTransferSettlementId(primaryTransfer) || recipientSettlement?.id;
  const transferSettlementCreatedAt = toIsoFromUnixSeconds(recipientSettlement?.created_at);
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
    razorpayTransferSettlementStatus: recipientSettlement?.status || primaryTransfer?.settlement_status,
    razorpayTransferSettlementId: transferSettlementId,
    razorpayTransferSettlementCreatedAt: transferSettlementCreatedAt,
    razorpayTransferSettlementExpectedAt: transferSettlementCreatedAt || getEstimatedSettlementIso(paymentData),
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
      razorpayOrderId: valueOrExisting(reconciliation.razorpayOrderId, order.razorpayOrderId),
      razorpayPaymentId: valueOrExisting(reconciliation.razorpayPaymentId, order.razorpayPaymentId),
      razorpayMethod: valueOrExisting(reconciliation.razorpayMethod, order.razorpayMethod),
      razorpayStatus: valueOrExisting(reconciliation.razorpayStatus, order.razorpayStatus),
      razorpayAmount: valueOrExisting(reconciliation.razorpayAmount, order.razorpayAmount),
      razorpayCurrency: valueOrExisting(reconciliation.razorpayCurrency, order.razorpayCurrency),
      razorpayCapturedAt: valueOrExisting(reconciliation.razorpayCapturedAt, order.razorpayCapturedAt),
      razorpayFeeAmount: valueOrExisting(reconciliation.razorpayFeeAmount, order.razorpayFeeAmount),
      razorpayTaxAmount: valueOrExisting(reconciliation.razorpayTaxAmount, order.razorpayTaxAmount),
      razorpaySettlementId: valueOrExisting(reconciliation.razorpaySettlementId, order.razorpaySettlementId),
      razorpaySettlementStatus: valueOrExisting(reconciliation.razorpaySettlementStatus, order.razorpaySettlementStatus),
      razorpaySettlementAmount: valueOrExisting(reconciliation.razorpaySettlementAmount, order.razorpaySettlementAmount),
      razorpayAdminSettlementAmount: valueOrExisting(reconciliation.razorpayAdminSettlementAmount, order.razorpayAdminSettlementAmount),
      razorpaySettlementUtr: valueOrExisting(reconciliation.razorpaySettlementUtr, order.razorpaySettlementUtr),
      razorpaySettlementCreatedAt: valueOrExisting(reconciliation.razorpaySettlementCreatedAt, order.razorpaySettlementCreatedAt),
      razorpaySettlementExpectedAt: valueOrExisting(reconciliation.razorpaySettlementExpectedAt, order.razorpaySettlementExpectedAt),
      razorpayTransferId: valueOrExisting(reconciliation.razorpayTransferId, order.razorpayTransferId),
      razorpayTransferStatus: valueOrExisting(reconciliation.razorpayTransferStatus, order.razorpayTransferStatus),
      razorpayTransferSettlementStatus: valueOrExisting(reconciliation.razorpayTransferSettlementStatus, order.razorpayTransferSettlementStatus),
      razorpayTransferSettlementId: valueOrExisting(reconciliation.razorpayTransferSettlementId, order.razorpayTransferSettlementId),
      razorpayTransferSettlementCreatedAt: valueOrExisting(reconciliation.razorpayTransferSettlementCreatedAt, order.razorpayTransferSettlementCreatedAt),
      razorpayTransferSettlementExpectedAt: valueOrExisting(reconciliation.razorpayTransferSettlementExpectedAt, order.razorpayTransferSettlementExpectedAt),
      razorpayTransferSettlementUtr: valueOrExisting(reconciliation.razorpayTransferSettlementUtr, order.razorpayTransferSettlementUtr),
      razorpayTransferRecipient: valueOrExisting(reconciliation.razorpayTransferRecipient, order.razorpayTransferRecipient),
      razorpayTransferAmount: valueOrExisting(reconciliation.razorpayTransferAmount, order.razorpayTransferAmount),
      razorpayTransferCurrency: valueOrExisting(reconciliation.razorpayTransferCurrency, order.razorpayTransferCurrency),
      routePlatformGrossAmount: valueOrExisting(reconciliation.routePlatformGrossAmount, order.routePlatformGrossAmount),
      routePlatformNetAmount: valueOrExisting(reconciliation.routePlatformNetAmount, order.routePlatformNetAmount),
      razorpayRouteTransfers: valueOrExisting(reconciliation.razorpayRouteTransfers, order.razorpayRouteTransfers),
      razorpaySyncSource: valueOrExisting(reconciliation.razorpaySyncSource, order.razorpaySyncSource),
      razorpaySyncedAt: valueOrExisting(reconciliation.razorpaySyncedAt, order.razorpaySyncedAt),
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

const fetchSettlementById = async (settlementId, accountId) => {
  if (!settlementId) {
    return null;
  }

  try {
    const response = await axios.get(`https://api.razorpay.com/v1/settlements/${settlementId}`, {
      auth: {
        username: RAZORPAY_KEY_ID,
        password: RAZORPAY_KEY_SECRET,
      },
      headers: accountId ? { 'X-Razorpay-Account': accountId } : undefined,
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
        'expand[]': 'items.recipient_settlement',
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
      const context = {
        ...getOrderContext(paymentData),
        restaurantId: req.body?.restaurantId || getOrderContext(paymentData).restaurantId,
        customerPhone: req.body?.customerPhone || getOrderContext(paymentData).customerPhone,
        orderId: req.body?.orderId || getOrderContext(paymentData).orderId,
      };
      const queueResult = await queueSettlementCheck({ paymentData, context });

      return res.status(200).json({
        success: true,
        status: 'verified',
        payment_id: paymentData.id,
        order_id: paymentData.order_id || razorpay_order_id,
        amount: paymentData.amount,
        currency: paymentData.currency,
        method: paymentData.method,
        payment_status: paymentData.status,
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
    const reconciliation = await buildRazorpayReconciliation(paymentData, settlementData, 'api', transferCollection);
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
    const reconciliation = await buildRazorpayReconciliation(paymentData, settlementData, 'webhook', transferCollection);
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

const isReconciliationSettlementComplete = (reconciliation) => {
  const settlementStatus = String(reconciliation?.razorpaySettlementStatus || '').toLowerCase();
  const transferSettlementStatus = String(reconciliation?.razorpayTransferSettlementStatus || '').toLowerCase();
  const hasExactSettlementTime = Boolean(
    reconciliation?.razorpayTransferSettlementCreatedAt ||
      reconciliation?.razorpaySettlementCreatedAt
  );

  return hasExactSettlementTime && (
    settlementStatus.includes('processed') ||
      settlementStatus.includes('settled') ||
      transferSettlementStatus.includes('processed') ||
      transferSettlementStatus.includes('settled') ||
      Boolean(reconciliation?.razorpayTransferSettlementUtr || reconciliation?.razorpaySettlementUtr)
  );
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
  const reconciliation = await buildRazorpayReconciliation(paymentData, settlementData, 'scheduled', transferCollection);

  if (!isReconciliationSettlementComplete(reconciliation)) {
    await markQueueForRetry(queueDoc, 'settlement_not_ready');
    return { updated: false, reason: 'settlement_not_ready' };
  }

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
exports.syncRazorpayPayment = functions.https.onRequest(onRequest(handleSyncRazorpayPayment));
exports.scheduledRazorpaySettlementSync = functions
  .runWith({ timeoutSeconds: 540, memory: '256MB' })
  .pubsub
  .schedule('30 23 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(handleScheduledSettlementReconciliation);

const GREEN_RESTAURANT_ID = 'orderin_restuarant_6';
const loginAttemptRef = (ip, purpose) => {
  const key = crypto.createHash('sha256').update(`${purpose}:${ip || 'unknown'}`).digest('hex');
  return admin.firestore()
    .collection('Restaurant')
    .doc(GREEN_RESTAURANT_ID)
    .collection('payrollConfig')
    .doc('_loginAttempts')
    .collection('byIp')
    .doc(key);
};

const enforceLoginRateLimit = async (ref) => {
  const now = Date.now();
  const snap = await ref.get();
  if (Number(snap.data()?.blockedUntil || 0) > now) {
    throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts. Try again later.');
  }
};

const recordFailedLogin = async (ref) => {
  const now = Date.now();
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : {};
    const withinWindow = now - Number(existing.windowStart || 0) < 15 * 60 * 1000;
    const attempts = withinWindow ? Number(existing.attempts || 0) + 1 : 1;
    tx.set(ref, {
      attempts,
      windowStart: withinWindow ? existing.windowStart : now,
      blockedUntil: attempts >= 5 ? now + 15 * 60 * 1000 : 0,
    });
  });
};

const verifyStoredPin = async (pin, staff) => {
  if (staff.pinHash) return bcrypt.compare(pin, staff.pinHash);
  return typeof staff.pin === 'string' && staff.pin === pin;
};

exports.payrollSignIn = functions.https.onCall(async (data, context) => {
  const purpose = data?.purpose === 'staff' ? 'staff' : 'admin';
  const pin = typeof data?.pin === 'string' ? data.pin.trim() : '';
  const ip = context.rawRequest?.ip || context.rawRequest?.headers?.['x-forwarded-for'] || 'unknown';
  const attemptRef = loginAttemptRef(String(ip).split(',')[0].trim(), purpose);
  await enforceLoginRateLimit(attemptRef);

  let matchedStaff = null;
  if (pin.length >= 4 && pin.length <= 64) {
    const snapshot = await admin.firestore()
      .collection('Restaurant')
      .doc(GREEN_RESTAURANT_ID)
      .collection('staff')
      .get();
    for (const item of snapshot.docs) {
      const staff = item.data();
      const active = !['inactive', 'archived', 'paused', 'on-leave', 'terminated'].includes(String(staff.status || 'active').toLowerCase());
      if (!active || (purpose === 'admin' && String(staff.role || '').toLowerCase() !== 'admin')) continue;
      if (await verifyStoredPin(pin, staff)) {
        matchedStaff = { id: item.id, ...staff };
        if (!staff.pinHash) {
          await item.ref.update({
            pinHash: await bcrypt.hash(pin, 10),
            pin: admin.firestore.FieldValue.delete(),
            pinLast4: pin.slice(-4),
          });
        }
        break;
      }
    }
  }

  let isAdmin = purpose === 'admin' && Boolean(matchedStaff);
  if (!matchedStaff && purpose === 'admin' && pin.length >= 4 && pin.length <= 64) {
    const passcodes = await admin.firestore()
      .collection('Restaurant')
      .doc(GREEN_RESTAURANT_ID)
      .collection('accessControl')
      .doc('roles')
      .collection('PayrollAccess')
      .get();
    for (const passcode of passcodes.docs) {
      const saved = String(passcode.data().passcodeHash || '');
      const valid = saved.startsWith('$2')
        ? await bcrypt.compare(pin, saved)
        : saved.length === pin.length && crypto.timingSafeEqual(Buffer.from(saved), Buffer.from(pin));
      if (valid) {
        isAdmin = true;
        break;
      }
    }
  }

  if (!matchedStaff && !isAdmin) {
    await recordFailedLogin(attemptRef);
    throw new functions.https.HttpsError('unauthenticated', 'PIN or payroll passcode was not accepted.');
  }

  await attemptRef.delete();
  const staffId = matchedStaff?.id || 'payroll-owner';
  const role = purpose === 'staff' ? 'staff' : 'admin';
  const customToken = await admin.auth().createCustomToken(`payroll_${staffId}`, {
    payrollAccess: true,
    payrollRole: role,
    staffId,
    restaurantId: GREEN_RESTAURANT_ID,
  });
  return {
    customToken,
    staffId,
    name: matchedStaff?.name || 'Admin',
    role: matchedStaff?.role || 'Admin',
  };
});

exports.migratePayrollData = functions.https.onCall(async (_data, context) => {
  const claims = context.auth?.token || {};
  if (claims.payrollAccess !== true || claims.payrollRole !== 'admin' || claims.restaurantId !== GREEN_RESTAURANT_ID) {
    throw new functions.https.HttpsError('permission-denied', 'Admin payroll access is required.');
  }

  const restaurant = admin.firestore().collection('Restaurant').doc(GREEN_RESTAURANT_ID);
  const markerRef = restaurant.collection('payrollConfig').doc('_migration');
  const marker = await markerRef.get();
  if (marker.data()?.complete === true) return { migratedProfiles: 0, migratedSalaryHistory: 0, alreadyMigrated: true };
  const staffSnapshot = await restaurant.collection('staff').get();
  let movedProfiles = 0;
  let movedHistory = 0;

  for (const staffDoc of staffSnapshot.docs) {
    const staff = staffDoc.data();
    const legacyProfile = staff.payrollProfile || {};
    const compensation = staff.compensation || {};
    const frequency = ['monthly', 'weekly', 'daily', 'contract'].includes(legacyProfile.frequency)
      ? legacyProfile.frequency
      : 'monthly';
    const legacyAmount = frequency === 'monthly'
      ? (compensation.monthlySalary ?? legacyProfile.periodAmount ?? compensation.amount ?? compensation.rate ?? 0)
      : (legacyProfile.periodAmount ?? 0);
    const profileRef = restaurant.collection('staffPayrollProfiles').doc(staffDoc.id);
    const existingProfile = await profileRef.get();
    if (!existingProfile.exists) {
      await profileRef.set({
        frequency,
        periodAmount: Number.isFinite(Number(legacyAmount)) ? Number(legacyAmount) : 0,
        pfEnabled: Boolean(legacyProfile.pfEnabled),
        insurance: Number(legacyProfile.insurance) || 0,
        upiId: legacyProfile.upiId || null,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    movedProfiles += 1;

    const history = await staffDoc.ref.collection('salaryHistory').get();
    for (let offset = 0; offset < history.docs.length; offset += 200) {
      const batch = admin.firestore().batch();
      history.docs.slice(offset, offset + 200).forEach((entry) => {
        batch.set(profileRef.collection('salaryHistory').doc(entry.id), entry.data(), { merge: true });
        batch.delete(entry.ref);
      });
      await batch.commit();
      movedHistory += Math.min(200, history.docs.length - offset);
    }

    if (staff.compensation || staff.payrollProfile) {
      await staffDoc.ref.update({
        compensation: admin.firestore.FieldValue.delete(),
        payrollProfile: admin.firestore.FieldValue.delete(),
      });
    }
  }

  const runs = await restaurant.collection('payrollRuns').get();
  for (const runDoc of runs.docs) {
    const run = runDoc.data();
    if (!['finalized', 'paid'].includes(run.status) || !Array.isArray(run.staffIds)) continue;
    for (let offset = 0; offset < run.staffIds.length; offset += 400) {
      const batch = admin.firestore().batch();
      run.staffIds.slice(offset, offset + 400).forEach((staffId) => batch.set(
        restaurant.collection('staffPayrollProfiles').doc(staffId).collection('runs').doc(runDoc.id),
        {
          runId: runDoc.id,
          frequency: ['monthly', 'weekly', 'daily', 'contract'].includes(run.frequency) ? run.frequency : 'monthly',
          periodKey: run.periodKey || runDoc.id,
          periodLabel: run.periodLabel || runDoc.id,
          status: run.status,
        },
        { merge: true }
      ));
      await batch.commit();
    }
  }

  await markerRef.set({ complete: true, completedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { migratedProfiles: movedProfiles, migratedSalaryHistory: movedHistory };
});
