'use strict';

/**
 * Normalised Swiggy / Zomato order model shared by the webhook, the status
 * push and (mirrored in the staff apps) the Online orders inbox.
 *
 * Stored at: Restaurant/{restaurantId}/aggregatorOrders/{platform}_{externalOrderId}
 * — its own document per order (not the customers/{phone}.pastOrders array),
 * so concurrent orders can't overwrite each other and staff can query just
 * today's open orders.
 */

const PLATFORMS = Object.freeze(['swiggy', 'zomato']);

const STATUS = Object.freeze({
  PLACED: 'placed', // received, waiting for the restaurant to accept
  ACCEPTED: 'accepted', // restaurant accepted; kitchen is preparing
  READY: 'ready', // food ready, waiting for the rider
  PICKED_UP: 'picked_up', // handed to the rider
  DELIVERED: 'delivered', // platform reports delivered
  REJECTED: 'rejected', // restaurant rejected
  CANCELLED: 'cancelled', // cancelled by the platform / customer
});

const TERMINAL = new Set([STATUS.DELIVERED, STATUS.REJECTED, STATUS.CANCELLED]);

// Moves restaurant staff may make. Anything else is refused server-side.
const STAFF_TRANSITIONS = Object.freeze({
  [STATUS.PLACED]: [STATUS.ACCEPTED, STATUS.REJECTED],
  [STATUS.ACCEPTED]: [STATUS.READY],
  [STATUS.READY]: [STATUS.PICKED_UP],
});

// Staff moves that must be reported back to the platform.
const PUSHED_STATUSES = new Set([STATUS.ACCEPTED, STATUS.REJECTED, STATUS.READY, STATUS.PICKED_UP]);

const REJECT_REASONS = Object.freeze([
  'item_out_of_stock',
  'kitchen_busy',
  'store_closing',
  'cannot_fulfil_instructions',
  'other',
]);

const DEFAULT_ACCEPT_WINDOW_SECONDS = 180;

const canStaffMove = (from, to) => (STAFF_TRANSITIONS[from] || []).includes(to);

const orderDocId = (platform, externalOrderId) =>
  `${platform}_${String(externalOrderId).replace(/[^A-Za-z0-9_-]/g, '-')}`;

const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Keep only what the kitchen needs. Platforms already mask the customer's
// phone; we never store a full number or address (DPDP Act 2023: collect the
// minimum).
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Customer';

const maskPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `•••••${digits.slice(-4)}`;
};

/**
 * Validates and completes a normalised order produced by an adapter.
 * Throws on anything the kitchen could not act on.
 */
function finaliseOrder(order, { now = Date.now(), acceptWindowSeconds = DEFAULT_ACCEPT_WINDOW_SECONDS } = {}) {
  if (!order || typeof order !== 'object') throw new Error('order: missing');
  if (!PLATFORMS.includes(order.platform)) throw new Error(`order: unknown platform "${order.platform}"`);
  if (!order.externalOrderId) throw new Error('order: missing externalOrderId');
  if (!order.storeId) throw new Error('order: missing storeId');
  if (!Array.isArray(order.items) || order.items.length === 0) throw new Error('order: no items');

  const items = order.items.map((it, i) => {
    const quantity = Math.max(1, Math.round(toNumber(it.quantity) || 1));
    const unitPrice = round2(toNumber(it.unitPrice));
    const addons = (Array.isArray(it.addons) ? it.addons : []).map((a) => ({
      name: String(a.name || '').trim() || 'Add-on',
      price: round2(toNumber(a.price)),
    }));
    const name = String(it.name || '').trim();
    if (!name) throw new Error(`order: item ${i + 1} has no name`);
    return {
      externalId: it.externalId ? String(it.externalId) : null,
      name,
      quantity,
      unitPrice,
      addons,
      total: round2(it.total !== undefined ? toNumber(it.total) : (unitPrice + addons.reduce((s, a) => s + a.price, 0)) * quantity),
      instructions: String(it.instructions || '').trim(),
      menuItemId: it.menuItemId || null,
    };
  });

  const amounts = order.amounts || {};
  const subtotal = round2(amounts.subtotal !== undefined ? toNumber(amounts.subtotal) : items.reduce((s, it) => s + it.total, 0));
  const finalAmounts = {
    subtotal,
    taxes: round2(toNumber(amounts.taxes)),
    packaging: round2(toNumber(amounts.packaging)),
    discount: round2(toNumber(amounts.discount)),
    total: round2(
      amounts.total !== undefined
        ? toNumber(amounts.total)
        : subtotal + toNumber(amounts.taxes) + toNumber(amounts.packaging) - toNumber(amounts.discount)
    ),
  };

  const placedAt = toNumber(order.placedAt) || now;
  const acceptBy = toNumber(order.acceptBy) || now + acceptWindowSeconds * 1000;

  return {
    platform: order.platform,
    externalOrderId: String(order.externalOrderId),
    storeId: String(order.storeId),
    status: STATUS.PLACED,
    statusSource: 'platform',
    statusUpdatedAt: now,
    placedAt,
    receivedAt: now,
    acceptBy,
    prepMinutes: null,
    rejectReason: null,
    customer: {
      name: firstName(order.customer && order.customer.name),
      phoneMasked: maskPhone(order.customer && order.customer.phone),
    },
    items,
    unmappedItems: items.filter((it) => !it.menuItemId).length,
    instructions: String(order.instructions || '').trim(),
    amounts: finalAmounts,
    payment: {
      mode: order.payment && order.payment.mode === 'cod' ? 'cod' : 'prepaid',
      collectedBy: 'platform',
    },
    rider: null,
    sync: { state: 'idle', attempts: 0, lastError: null, lastSentStatus: null, at: null },
  };
}

module.exports = {
  PLATFORMS,
  STATUS,
  TERMINAL,
  STAFF_TRANSITIONS,
  PUSHED_STATUSES,
  REJECT_REASONS,
  DEFAULT_ACCEPT_WINDOW_SECONDS,
  canStaffMove,
  orderDocId,
  toNumber,
  round2,
  firstName,
  maskPhone,
  finaliseOrder,
};
