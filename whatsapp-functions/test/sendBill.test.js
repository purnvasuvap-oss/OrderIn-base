'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { handleSendBill, buildTemplateMessage, validateRequest, MAX_SENDS_PER_ORDER } = require('../src/sendBill');

const paidOrder = {
  id: 'ORD-1',
  paymentStatus: 'paid',
  items: [{ name: 'Dosa', quantity: 2 }, { name: 'Lassi\nlarge', qty: 1 }],
  total: '252.00',
  paymentMethod: 'UPI',
};

const makeDeps = (customer, overrides = {}) => {
  const calls = { posted: [], recorded: [] };
  return {
    calls,
    deps: {
      getCustomer: async () => customer,
      getRestaurantName: async () => 'OrderIn Cafe',
      recordSend: async (...a) => calls.recorded.push(a),
      postMessage: async (body) => {
        calls.posted.push(body);
        return { messageId: 'wamid.1' };
      },
      config: { templateName: 'order_bill', languageCode: 'en' },
      ...overrides,
    },
  };
};

const req = { restaurantId: 'orderin_restaurant_2', phone: '+919876501234', orderId: 'ORD-1' };

test('rejects bad input', () => {
  assert.match(validateRequest({ ...req, restaurantId: '../x' }), /restaurantId/);
  assert.match(validateRequest({ ...req, phone: '98765' }), /phone/);
  assert.match(validateRequest({ ...req, orderId: '' }), /orderId/);
  assert.strictEqual(validateRequest(req), '');
  assert.strictEqual(validateRequest({ ...req, restaurantId: 'orderin_restuarant_5' }), '');
});

test('sends a paid order and records it', async () => {
  const { deps, calls } = makeDeps({ username: 'Asha', pastOrders: [paidOrder] });
  const res = await handleSendBill(req, deps);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(calls.posted.length, 1);
  assert.strictEqual(calls.posted[0].to, '919876501234');
  const params = calls.posted[0].template.components[0].parameters.map((p) => p.text);
  assert.deepStrictEqual(params, ['Asha', 'OrderIn Cafe', 'ORD-1', '2 x Dosa, 1 x Lassi | large', '252.00', 'UPI']);
  assert.deepStrictEqual(calls.recorded[0], ['orderin_restaurant_2', '+919876501234', 'ORD-1', 'wamid.1']);
});

test('refuses unpaid, unknown and over-sent orders', async () => {
  let r = await handleSendBill(req, makeDeps({ pastOrders: [{ ...paidOrder, paymentStatus: 'unpaid' }] }).deps);
  assert.strictEqual(r.status, 409);
  r = await handleSendBill(req, makeDeps({ pastOrders: [] }).deps);
  assert.strictEqual(r.status, 404);
  r = await handleSendBill(req, makeDeps(null).deps);
  assert.strictEqual(r.status, 404);
  r = await handleSendBill(req, makeDeps({ pastOrders: [{ ...paidOrder, whatsappBill: { count: MAX_SENDS_PER_ORDER } }] }).deps);
  assert.strictEqual(r.status, 429);
});

test('template params have no newlines', () => {
  const msg = buildTemplateMessage({ phone: '+91 98765 01234', order: { ...paidOrder, id: 'A\nB' } });
  for (const p of msg.template.components[0].parameters) assert.ok(!/[\n\r\t]/.test(p.text));
  assert.strictEqual(msg.to, '919876501234');
});
