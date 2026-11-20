'use strict';

const { createAdapter } = require('./common');

/**
 * Swiggy adapter configuration.
 *
 * ⚠️ VERIFY AGAINST SWIGGY'S PARTNER API SPEC BEFORE GOING LIVE.
 * Swiggy's restaurant POS integration API is only shared with approved
 * partners. Every field path, event name, header and endpoint below is a
 * placeholder in a sensible shape, kept in this one object so that switching
 * to the real spec is a data edit. The tests use fixtures in this same shape,
 * so they prove the engine (signature check, normalising, idempotent storage,
 * status push), not Swiggy's real wire format.
 */
module.exports = createAdapter({
  platform: 'swiggy',
  secretEnv: 'SWIGGY_WEBHOOK_SECRET',

  signature: { header: 'x-swiggy-signature', algorithm: 'sha256', encoding: 'hex' },

  events: {
    typePath: 'event',
    placed: ['ORDER_PLACED', 'NEW_ORDER'],
    cancelled: ['ORDER_CANCELLED'],
    delivered: ['ORDER_DELIVERED'],
    rider: ['RIDER_ASSIGNED', 'RIDER_ARRIVED', 'RIDER_UPDATE'],
  },

  order: {
    root: 'order',
    externalOrderId: 'order_id',
    storeId: 'outlet_id',
    placedAt: 'placed_at',
    acceptBy: 'accept_by',
    instructions: 'instructions',
    cancelReason: 'cancel_reason',
    customer: { name: 'customer.name', phone: 'customer.phone' },
    items: {
      path: 'items',
      externalId: 'item_id',
      name: 'name',
      quantity: 'quantity',
      unitPrice: 'price',
      total: 'total',
      instructions: 'instructions',
      addons: { path: 'addons', name: 'name', price: 'price' },
    },
    amounts: {
      subtotal: 'bill.item_total',
      taxes: 'bill.taxes',
      packaging: 'bill.packaging_charges',
      discount: 'bill.restaurant_discount',
      total: 'bill.restaurant_payable',
    },
    paymentMode: 'payment_mode',
    codValues: ['COD', 'CASH'],
    rider: { name: 'rider.name', status: 'rider.status', etaMinutes: 'rider.eta_minutes' },
  },

  statusApi: {
    baseUrlEnv: 'SWIGGY_API_BASE_URL',
    apiKeyEnv: 'SWIGGY_API_KEY',
    apiKeyHeader: 'Authorization',
    apiKeyPrefix: 'Bearer ',
    paths: {
      accepted: '/orders/{id}/accept',
      rejected: '/orders/{id}/reject',
      ready: '/orders/{id}/food-ready',
      picked_up: '/orders/{id}/handover',
    },
    body: (order, status) => ({
      order_id: order.externalOrderId,
      outlet_id: order.storeId,
      status,
      ...(status === 'accepted' ? { prep_time_minutes: order.prepMinutes } : {}),
      ...(status === 'rejected' ? { reason: order.rejectReason } : {}),
    }),
  },
});
