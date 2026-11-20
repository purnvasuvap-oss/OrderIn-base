'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { handleWebhook } = require('../src/webhook');
const { signedCall, memoryStore, swiggyOrder, zomatoOrder, SECRETS } = require('./helpers');

const NOW = Date.parse('2026-11-17T12:00:05.000Z');
const RID = 'orderin_restaurant_4';

const setup = () =>
  memoryStore({
    outlets: { swiggy_OUT_7: null, 'swiggy_OUT-7': { restaurantId: RID, enabled: true }, 'zomato_RES-42': { restaurantId: RID, enabled: true } },
    configs: { [`${RID}/swiggy`]: { itemMap: { 'sw-dosa': 'menu_dosa' }, acceptWindowSeconds: 240 } },
  });

test('places a signed Swiggy order, mapped and normalised', async () => {
  const store = setup();
  const res = await handleWebhook({ ...signedCall('swiggy', swiggyOrder()), store, now: NOW });
  assert.equal(res.status, 200);
  assert.equal(res.json.orderId, 'swiggy_SW-1001');
  const o = store.order(RID, 'swiggy_SW-1001');
  assert.equal(o.status, 'placed');
  assert.equal(o.restaurantId, RID);
  assert.equal(o.items[0].menuItemId, 'menu_dosa');
  assert.equal(o.items[1].menuItemId, null);
  assert.equal(o.unmappedItems, 1);
  assert.equal(o.items[1].addons[0].name, 'Extra decoction');
  assert.deepEqual(o.amounts, { subtotal: 235, taxes: 11.75, packaging: 10, discount: 0, total: 256.75 });
  assert.equal(o.customer.name, 'Ravi');
  assert.equal(o.customer.phoneMasked, '•••••2345');
  assert.equal(o.payment.mode, 'prepaid');
  assert.equal(o.acceptBy, NOW + 240 * 1000, 'uses the restaurant accept window when the platform gives none');
  assert.ok(!JSON.stringify(o).includes('98480'), 'never stores the full phone number');
});

test('places a Zomato COD order (seconds timestamps, cash payment)', async () => {
  const store = setup();
  const res = await handleWebhook({ ...signedCall('zomato', zomatoOrder()), store, now: NOW });
  assert.equal(res.status, 200);
  const o = store.order(RID, 'zomato_778899');
  assert.equal(o.payment.mode, 'cod');
  assert.equal(o.placedAt, 1763380800 * 1000);
  assert.equal(o.amounts.total, 226);
  assert.equal(o.acceptBy, NOW + 180 * 1000, 'default 3-minute accept window');
});

test('a re-delivered order is acknowledged, not duplicated or overwritten', async () => {
  const store = setup();
  await handleWebhook({ ...signedCall('swiggy', swiggyOrder()), store, now: NOW });
  await store.updateOrder(RID, 'swiggy_SW-1001', () => ({ status: 'accepted' }));
  const res = await handleWebhook({ ...signedCall('swiggy', swiggyOrder()), store, now: NOW + 1000 });
  assert.equal(res.status, 200);
  assert.equal(res.json.duplicate, true);
  assert.equal(store.order(RID, 'swiggy_SW-1001').status, 'accepted');
  assert.equal(store.orders.size, 1);
});

test('rejects a bad, missing or wrong-secret signature with 401', async () => {
  const store = setup();
  const call = signedCall('swiggy', swiggyOrder());
  for (const headers of [{}, { 'x-swiggy-signature': 'deadbeef' }, signedCall('swiggy', swiggyOrder(), { secret: 'nope' }).headers]) {
    const res = await handleWebhook({ ...call, headers, store, now: NOW });
    assert.equal(res.status, 401);
  }
  const noSecret = await handleWebhook({ ...call, secrets: {}, store, now: NOW });
  assert.equal(noSecret.status, 401);
  assert.equal(noSecret.json.error, 'webhook secret not configured');
  assert.equal(store.orders.size, 0);
});

test('a body changed after signing is refused', async () => {
  const store = setup();
  const call = signedCall('swiggy', swiggyOrder());
  const tampered = Buffer.from(call.rawBody.toString().replace('"total":180', '"total":1'));
  const res = await handleWebhook({ ...call, rawBody: tampered, store, now: NOW });
  assert.equal(res.status, 401);
});

test('unknown platform -> 404; invalid JSON -> 400; unknown event -> 200 ignored', async () => {
  const store = setup();
  assert.equal((await handleWebhook({ ...signedCall('swiggy', {}), platform: 'ubereats', store })).status, 404);
  const raw = Buffer.from('{not json');
  const bad = await handleWebhook({
    platform: 'swiggy', rawBody: raw, headers: { 'x-swiggy-signature': require('./helpers').sign(raw, SECRETS.SWIGGY_WEBHOOK_SECRET) }, secrets: SECRETS, store,
  });
  assert.equal(bad.status, 400);
  const ignored = await handleWebhook({ ...signedCall('swiggy', { event: 'MENU_SYNCED' }), store });
  assert.deepEqual(ignored, { status: 200, json: { ok: true, ignored: true } });
});

test('an outlet that is not linked (or is disabled) is refused', async () => {
  const store = memoryStore({ outlets: { 'swiggy_OUT-7': { restaurantId: RID, enabled: false } } });
  const res = await handleWebhook({ ...signedCall('swiggy', swiggyOrder()), store, now: NOW });
  assert.equal(res.status, 404);
  const other = await handleWebhook({ ...signedCall('swiggy', swiggyOrder({ outlet_id: 'OUT-999' })), store: setup(), now: NOW });
  assert.equal(other.status, 404);
});

test('an order with no items is refused with 400', async () => {
  const res = await handleWebhook({ ...signedCall('swiggy', swiggyOrder({ items: [] })), store: setup(), now: NOW });
  assert.equal(res.status, 400);
  assert.match(res.json.error, /no items/);
});

test('cancellation, delivery and rider updates follow the order lifecycle', async () => {
  const store = setup();
  await handleWebhook({ ...signedCall('swiggy', swiggyOrder()), store, now: NOW });
  const ref = { order_id: 'SW-1001', outlet_id: 'OUT-7' };

  await handleWebhook({ ...signedCall('swiggy', { event: 'RIDER_ASSIGNED', order: { ...ref, rider: { name: 'Suresh', status: 'assigned', eta_minutes: 12 } } }), store, now: NOW + 5 });
  assert.deepEqual(store.order(RID, 'swiggy_SW-1001').rider, { name: 'Suresh', status: 'assigned', etaMinutes: 12, updatedAt: NOW + 5 });

  await handleWebhook({ ...signedCall('swiggy', { event: 'ORDER_CANCELLED', order: { ...ref, cancel_reason: 'customer_request' } }), store, now: NOW + 9 });
  let o = store.order(RID, 'swiggy_SW-1001');
  assert.equal(o.status, 'cancelled');
  assert.equal(o.statusSource, 'platform');
  assert.equal(o.cancelReason, 'customer_request');

  // delivered after cancelled is ignored
  await handleWebhook({ ...signedCall('swiggy', { event: 'ORDER_DELIVERED', order: ref }), store, now: NOW + 20 });
  o = store.order(RID, 'swiggy_SW-1001');
  assert.equal(o.status, 'cancelled');
});

test('a cancellation after delivery does not reopen the order', async () => {
  const store = setup();
  await handleWebhook({ ...signedCall('zomato', zomatoOrder()), store, now: NOW });
  const ref = { order_id: 778899, res_id: 'RES-42' };
  await handleWebhook({ ...signedCall('zomato', { event_type: 'ORDER.DELIVERED', data: ref }), store, now: NOW + 1 });
  const res = await handleWebhook({ ...signedCall('zomato', { event_type: 'ORDER.CANCELLED', data: ref }), store, now: NOW + 2 });
  assert.equal(res.json.updated, false);
  assert.equal(store.order(RID, 'zomato_778899').status, 'delivered');
});

test('an update for an order we never received is acknowledged (stops platform retries)', async () => {
  const res = await handleWebhook({ ...signedCall('swiggy', { event: 'ORDER_CANCELLED', order: { order_id: 'NOPE', outlet_id: 'OUT-7' } }), store: setup() });
  assert.equal(res.status, 200);
  assert.equal(res.json.found, false);
});
