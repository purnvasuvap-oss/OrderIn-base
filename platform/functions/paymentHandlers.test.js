const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const payments = require('./paymentHandlers');

test('a captured payment is accepted only when the paise match', () => {
  assert.equal(payments.assessCapturedPayment({
    expectedPaise: 15750,
    paidPaise: 15750,
    signatureOk: true,
    status: 'captured',
    orderMatches: true,
  }).ok, true);
  const short = payments.assessCapturedPayment({
    expectedPaise: 15750,
    paidPaise: 100,
    signatureOk: true,
    status: 'captured',
    orderMatches: true,
  });
  assert.equal(short.ok, false);
  assert.match(short.error, /does not match/);
  assert.equal(payments.assessCapturedPayment({
    expectedPaise: 100,
    paidPaise: 100,
    signatureOk: false,
    status: 'captured',
    orderMatches: true,
  }).ok, false);
});

test('part payment online cannot exceed what is still due', () => {
  assert.equal(payments.chooseChargePaise(5000, null), 5000);
  assert.equal(payments.chooseChargePaise(5000, 2000), 2000);
  assert.throws(() => payments.chooseChargePaise(5000, 9000), /higher than the amount still due/);
});

test('the charge comes from the order document, not the browser amount', async () => {
  const db = {
    collection() {
      return {
        doc() {
          return {
            collection() {
              return {
                doc() {
                  return {
                    async get() {
                      return {
                        exists: true,
                        data: () => ({ total: 157.5, subtotal: 150, payments: [{ amount: 50 }] }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const priced = await payments.expectedCharge(db, { restaurantId: 'spice', orderId: 'o1', amount: 1, amountPaise: 1000 });
  assert.equal(priced.source, 'orders');
  assert.equal(priced.paise, 1000);
});

test('webhook signatures use the configured secret', () => {
  const body = Buffer.from('{"ok":true}');
  const secret = 'whsec_test';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(payments.webhookSignatureOk(secret, body, signature), true);
  assert.equal(payments.webhookSignatureOk('placeholder', body, signature), false);
  assert.equal(payments.webhookSignatureOk('', body, signature), false);
});

test('route transfers use the restaurant payout doc, not a hard-coded id', () => {
  assert.equal(payments.routeTransfer(null, 1000, 10), null);
  const route = payments.routeTransfer({ routeAccountId: 'acc_real' }, 10000, 80);
  assert.equal(route.accountId, 'acc_real');
  assert.equal(route.transfers[0].amount, 8000);
});
