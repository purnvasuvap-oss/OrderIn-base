'use strict';

const { createAdapter } = require('./common');

/**
 * Zomato adapter configuration.
 *
 * ⚠️ VERIFY AGAINST ZOMATO'S PARTNER API SPEC BEFORE GOING LIVE.
 * Zomato's restaurant POS integration API is only shared with approved
 * partners. Every field path, event name, header and endpoint below is a
 * placeholder in a sensible shape, kept in this one object so that switching
 * to the real spec is a data edit. The tests use fixtures in this same shape,
 * so they prove the engine, not Zomato's real wire format.
 */
module.exports = createAdapter({
  platform: 'zomato',
  secretEnv: 'ZOMATO_WEBHOOK_SECRET',

  signature: { header: 'x-zomato-signature', algorithm: 'sha256', encoding: 'hex' },

  events: {
    typePath: 'event_type',
    placed: ['ORDER.CREATED', 'NEW_ORDER'],
    cancelled: ['ORDER.CANCELLED'],
    delivered: ['ORDER.DELIVERED'],
    rider: ['RIDER.ASSIGNED', 'RIDER.ARRIVED', 'RIDER.UPDATED'],
  },

  order: {
    root: 'data',
    externalOrderId: 'order_id',
    storeId: 'res_id',
    placedAt: 'created_at',
    acceptBy: 'accept_before',
    instructions: 'special_instructions',
    cancelReason: 'cancellation_reason',
    customer: { name: 'customer.first_name', phone: 'customer.masked_phone' },
    items: {
      path: 'dishes',
      externalId: 'dish_id',
      name: 'dish_name',
      quantity: 'quantity',
      unitPrice: 'unit_cost',
      total: 'total_cost',
      instructions: 'comment',
      addons: { path: 'customisations', name: 'name', price: 'cost' },
    },
    amounts: {
      subtotal: 'charges.subtotal',
      taxes: 'charges.tax',
      packaging: 'charges.packaging',
      discount: 'charges.merchant_discount',
      total: 'charges.merchant_total',
    },
    paymentMode: 'payment.method',
    codValues: ['COD', 'CASH_ON_DELIVERY'],
    rider: { name: 'rider.name', status: 'rider.state', etaMinutes: 'rider.eta' },
  },

  statusApi: {
    baseUrlEnv: 'ZOMATO_API_BASE_URL',
    apiKeyEnv: 'ZOMATO_API_KEY',
    apiKeyHeader: 'X-Zomato-Api-Key',
    apiKeyPrefix: '',
    paths: {
      accepted: '/order/{id}/confirm',
      rejected: '/order/{id}/reject',
      ready: '/order/{id}/ready',
      picked_up: '/order/{id}/handed-over',
    },
    body: (order, status) => ({
      order_id: order.externalOrderId,
      res_id: order.storeId,
      state: status,
      ...(status === 'accepted' ? { delivery_time: order.prepMinutes } : {}),
      ...(status === 'rejected' ? { rejection_reason: order.rejectReason } : {}),
    }),
  },
});
