'use strict';

const crypto = require('crypto');

/**
 * Generic adapter engine. Each platform file (swiggy.js, zomato.js) is just a
 * config object: where each field lives in that platform's payload, how its
 * webhook is signed, and which endpoint receives each status. Keeping every
 * platform-specific detail in data means that when the partner API spec
 * arrives, adapting is an edit to one object — no logic changes.
 */

/** Reads "a.b.0.c" style paths. Returns undefined when any step is missing. */
function get(obj, path) {
  if (!path) return undefined;
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), obj);
}

/** Constant-time HMAC check of the raw request body. */
function verifyHmac({ rawBody, signature, secret, algorithm = 'sha256', encoding = 'hex' }) {
  if (!secret) return { ok: false, reason: 'webhook secret not configured' };
  if (!signature) return { ok: false, reason: 'missing signature header' };
  if (rawBody === undefined || rawBody === null) return { ok: false, reason: 'missing raw body' };
  const expected = crypto.createHmac(algorithm, secret).update(rawBody).digest(encoding);
  const a = Buffer.from(String(signature).trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}

const toEpochMs = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value; // seconds or ms
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

function createAdapter(config) {
  const { platform, signature, events, order: map, statusApi } = config;

  const eventTypeOf = (body) => {
    const raw = String(get(body, events.typePath) || '').toUpperCase();
    if (events.placed.includes(raw)) return 'order.placed';
    if (events.cancelled.includes(raw)) return 'order.cancelled';
    if (events.delivered.includes(raw)) return 'order.delivered';
    if (events.rider.includes(raw)) return 'rider.update';
    return 'unknown';
  };

  /** Payload -> unfinalised normalised order (see model.finaliseOrder). */
  const parseOrder = (body) => {
    const root = map.root ? get(body, map.root) : body;
    if (!root) throw new Error(`${platform}: order body not found at "${map.root}"`);
    const itemsRaw = get(root, map.items.path);
    const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((it) => {
      const addonsRaw = get(it, map.items.addons.path);
      return {
        externalId: get(it, map.items.externalId),
        name: get(it, map.items.name),
        quantity: get(it, map.items.quantity),
        unitPrice: get(it, map.items.unitPrice),
        total: get(it, map.items.total),
        instructions: get(it, map.items.instructions),
        addons: (Array.isArray(addonsRaw) ? addonsRaw : []).map((a) => ({
          name: get(a, map.items.addons.name),
          price: get(a, map.items.addons.price),
        })),
      };
    });
    const paymentRaw = String(get(root, map.paymentMode) || '').toUpperCase();
    const amount = (key) => get(root, map.amounts[key]);
    return {
      platform,
      externalOrderId: get(root, map.externalOrderId),
      storeId: get(root, map.storeId),
      placedAt: toEpochMs(get(root, map.placedAt)),
      acceptBy: toEpochMs(get(root, map.acceptBy)),
      instructions: get(root, map.instructions),
      customer: { name: get(root, map.customer.name), phone: get(root, map.customer.phone) },
      items,
      amounts: {
        subtotal: amount('subtotal'),
        taxes: amount('taxes'),
        packaging: amount('packaging'),
        discount: amount('discount'),
        total: amount('total'),
      },
      payment: { mode: map.codValues.includes(paymentRaw) ? 'cod' : 'prepaid' },
    };
  };

  /** Rider / cancellation payloads only need the ids plus a few fields. */
  const parseRef = (body) => {
    const root = map.root ? get(body, map.root) || body : body;
    return {
      externalOrderId: get(root, map.externalOrderId),
      storeId: get(root, map.storeId),
      reason: get(root, map.cancelReason),
      rider: map.rider
        ? {
            name: get(root, map.rider.name) || null,
            status: get(root, map.rider.status) || null,
            etaMinutes: get(root, map.rider.etaMinutes) ?? null,
          }
        : null,
    };
  };

  const verifyRequest = ({ headers, rawBody, secret }) =>
    verifyHmac({
      rawBody,
      signature: headers[signature.header.toLowerCase()],
      secret,
      algorithm: signature.algorithm,
      encoding: signature.encoding,
    });

  /** Builds the outbound HTTP call that tells the platform about a staff action. */
  const buildStatusRequest = ({ order, status, baseUrl, apiKey }) => {
    const path = statusApi.paths[status];
    if (!path) throw new Error(`${platform}: no endpoint configured for status "${status}"`);
    if (!baseUrl) throw new Error(`${platform}: API base URL not configured (${statusApi.baseUrlEnv})`);
    if (!apiKey) throw new Error(`${platform}: API key not configured (${statusApi.apiKeyEnv})`);
    return {
      url: baseUrl.replace(/\/+$/, '') + path.replace('{id}', encodeURIComponent(order.externalOrderId)),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [statusApi.apiKeyHeader]: `${statusApi.apiKeyPrefix || ''}${apiKey}`,
      },
      body: JSON.stringify(statusApi.body(order, status)),
    };
  };

  return {
    platform,
    secretEnv: config.secretEnv,
    statusApi,
    eventTypeOf,
    parseOrder,
    parseRef,
    verifyRequest,
    buildStatusRequest,
  };
}

module.exports = { get, verifyHmac, toEpochMs, createAdapter };
