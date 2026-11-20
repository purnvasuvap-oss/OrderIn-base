'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { finaliseOrder, canStaffMove, orderDocId, maskPhone } = require('../src/model');

const minimal = (extra = {}) => ({
  platform: 'swiggy',
  externalOrderId: 'A1',
  storeId: 'S1',
  items: [{ name: 'Idli', quantity: '2', unitPrice: '₹30.00', addons: [{ name: 'Ghee', price: 10 }] }],
  ...extra,
});

test('computes item and order totals when the platform omits them', () => {
  const o = finaliseOrder(minimal(), { now: 1000 });
  assert.equal(o.items[0].total, 80); // (30 + 10) * 2
  assert.equal(o.amounts.subtotal, 80);
  assert.equal(o.amounts.total, 80);
  assert.equal(o.status, 'placed');
  assert.equal(o.acceptBy, 1000 + 180000);
});

test('keeps the platform-provided deadline and totals', () => {
  const o = finaliseOrder(minimal({ acceptBy: 5000, amounts: { subtotal: 80, taxes: 4, total: 84 } }), { now: 1000 });
  assert.equal(o.acceptBy, 5000);
  assert.equal(o.amounts.total, 84);
});

test('refuses orders the kitchen cannot act on', () => {
  assert.throws(() => finaliseOrder(minimal({ platform: 'ubereats' })), /unknown platform/);
  assert.throws(() => finaliseOrder(minimal({ externalOrderId: '' })), /externalOrderId/);
  assert.throws(() => finaliseOrder(minimal({ items: [] })), /no items/);
  assert.throws(() => finaliseOrder(minimal({ items: [{ quantity: 1 }] })), /item 1 has no name/);
});

test('staff can only move orders forward along the allowed path', () => {
  assert.ok(canStaffMove('placed', 'accepted'));
  assert.ok(canStaffMove('placed', 'rejected'));
  assert.ok(canStaffMove('accepted', 'ready'));
  assert.ok(canStaffMove('ready', 'picked_up'));
  assert.ok(!canStaffMove('placed', 'ready'));
  assert.ok(!canStaffMove('accepted', 'rejected'));
  assert.ok(!canStaffMove('cancelled', 'accepted'));
});

test('document ids are safe and stable', () => {
  assert.equal(orderDocId('zomato', 778899), 'zomato_778899');
  assert.equal(orderDocId('swiggy', 'a/b c'), 'swiggy_a-b-c');
});

test('phone numbers are reduced to the last 4 digits', () => {
  assert.equal(maskPhone('+91 98480 12345'), '•••••2345');
  assert.equal(maskPhone('12'), '');
});
