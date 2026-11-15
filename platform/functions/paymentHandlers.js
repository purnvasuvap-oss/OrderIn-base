const crypto = require('crypto');
const {
  loadRazorpayCredentials,
  resolveCheckoutAmount,
  amountsMatchPaise,
  signaturesMatch,
  applyCors,
} = require('./paymentGuard');
const core = require('../packages/core/src/index.js');

function assessCapturedPayment({ expectedPaise, paidPaise, signatureOk, status, orderMatches }) {
  if (!signatureOk) return { ok: false, status: 400, error: 'Signature verification failed' };
  if (!orderMatches) return { ok: false, status: 400, error: 'Payment does not belong to this order' };
  if (!['captured', 'authorized'].includes(String(status || '').toLowerCase())) {
    return { ok: false, status: 400, error: 'Payment is not captured' };
  }
  if (!amountsMatchPaise(paidPaise, expectedPaise)) {
    return { ok: false, status: 400, error: 'Paid amount does not match the order' };
  }
  return { ok: true };
}

function chooseChargePaise(remainingPaise, requestedPaise) {
  const remaining = Math.round(Number(remainingPaise));
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new Error('Nothing left to pay on this order');
  }
  if (requestedPaise == null || requestedPaise === '') return remaining;
  const requested = Math.round(Number(requestedPaise));
  if (!Number.isFinite(requested) || requested < 100) {
    throw new Error('Online payment must be at least Rs 1');
  }
  if (requested > remaining + 1) {
    throw new Error('Online amount is higher than the amount still due');
  }
  return requested;
}

async function expectedCharge(db, body) {
  const restaurantId = body.restaurantId;
  const orderId = body.orderId;
  if (restaurantId && orderId) {
    const ref = db.collection('Restaurant').doc(String(restaurantId)).collection('orders').doc(String(orderId));
    const snap = await ref.get();
    if (snap.exists) {
      const order = snap.data();
      const paid = core.roundRupees((order.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
      const remaining = core.roundRupees(Number(order.total || 0) - paid);
      const paise = chooseChargePaise(Math.round(remaining * 100), body.amountPaise);
      return { paise, subtotal: order.subtotal, source: 'orders', order, ref };
    }
  }
  const priced = await resolveCheckoutAmount(db, {
    restaurantId,
    customerPhone: body.customerPhone,
    orderId,
    items: body.items,
  });
  return { paise: priced.paise, subtotal: priced.subtotal, source: 'legacy' };
}

function routeTransfer(payout, amountPaise, subtotal) {
  if (!payout || !payout.routeAccountId) return null;
  const transfer = Math.min(amountPaise, Math.round(Number(subtotal || 0) * 100));
  if (transfer <= 0) return null;
  return {
    accountId: payout.routeAccountId,
    transfers: [{
      account: payout.routeAccountId,
      amount: transfer,
      currency: 'INR',
      on_hold: false,
    }],
  };
}

function webhookSignatureOk(secret, rawBody, signature) {
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signaturesMatch(expected, signature);
}

module.exports = {
  assessCapturedPayment,
  chooseChargePaise,
  expectedCharge,
  routeTransfer,
  webhookSignatureOk,
  loadRazorpayCredentials,
  applyCors,
  amountsMatchPaise,
};
