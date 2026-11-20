'use strict';

const crypto = require('crypto');

const SECRETS = { SWIGGY_WEBHOOK_SECRET: 'swiggy-test-secret', ZOMATO_WEBHOOK_SECRET: 'zomato-test-secret' };

const sign = (raw, secret) => crypto.createHmac('sha256', secret).update(raw).digest('hex');

/** Builds a signed webhook call for handleWebhook. */
function signedCall(platform, payload, { secret, header } = {}) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const s = secret || SECRETS[`${platform.toUpperCase()}_WEBHOOK_SECRET`];
  const h = header || `x-${platform}-signature`;
  return { platform, rawBody, headers: { [h]: sign(rawBody, s) }, secrets: SECRETS };
}

/** In-memory version of store.js with the same behaviour. */
function memoryStore({ outlets = {}, configs = {} } = {}) {
  const orders = new Map(); // `${rid}/${docId}` -> data
  return {
    orders,
    order: (rid, docId) => orders.get(`${rid}/${docId}`),
    async getOutlet(platform, storeId) {
      return outlets[`${platform}_${storeId}`] || null;
    },
    async getConfig(rid, platform) {
      return configs[`${rid}/${platform}`] || null;
    },
    async createOrderIfAbsent(rid, docId, order) {
      const key = `${rid}/${docId}`;
      if (orders.has(key)) return { created: false };
      orders.set(key, JSON.parse(JSON.stringify(order)));
      return { created: true };
    },
    async updateOrder(rid, docId, mutate) {
      const key = `${rid}/${docId}`;
      if (!orders.has(key)) return { found: false, updated: false };
      const patch = mutate(orders.get(key));
      if (!patch) return { found: true, updated: false };
      orders.set(key, { ...orders.get(key), ...patch });
      return { found: true, updated: true };
    },
  };
}

const swiggyOrder = (overrides = {}) => ({
  event: 'ORDER_PLACED',
  order: {
    order_id: 'SW-1001',
    outlet_id: 'OUT-7',
    placed_at: '2026-11-17T12:00:00.000Z',
    instructions: 'Ring the bell',
    payment_mode: 'PREPAID',
    customer: { name: 'Ravi Kumar', phone: '+91 98480 12345' },
    items: [
      { item_id: 'sw-dosa', name: 'Masala Dosa', quantity: 2, price: 90, total: 180, instructions: 'Extra crispy', addons: [] },
      { item_id: 'sw-coffee', name: 'Filter Coffee', quantity: 1, price: 40, total: 55, addons: [{ name: 'Extra decoction', price: 15 }] },
    ],
    bill: { item_total: 235, taxes: 11.75, packaging_charges: 10, restaurant_discount: 0, restaurant_payable: 256.75 },
    ...overrides,
  },
});

const zomatoOrder = (overrides = {}) => ({
  event_type: 'ORDER.CREATED',
  data: {
    order_id: 778899,
    res_id: 'RES-42',
    created_at: 1763380800, // seconds
    special_instructions: '',
    payment: { method: 'CASH_ON_DELIVERY' },
    customer: { first_name: 'Anitha', masked_phone: 'XXXXXX4321' },
    dishes: [{ dish_id: 'z-biryani', dish_name: 'Veg Biryani', quantity: 1, unit_cost: 220, total_cost: 220, customisations: [] }],
    charges: { subtotal: 220, tax: 11, packaging: 15, merchant_discount: 20, merchant_total: 226 },
    ...overrides,
  },
});

module.exports = { SECRETS, sign, signedCall, memoryStore, swiggyOrder, zomatoOrder };
