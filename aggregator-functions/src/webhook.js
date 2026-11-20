'use strict';

const { getAdapter } = require('./adapters');
const { STATUS, TERMINAL, finaliseOrder, orderDocId } = require('./model');

const reply = (status, json) => ({ status, json });

/**
 * Handles one webhook call from Swiggy or Zomato.
 *
 * Platforms retry until they get a 2xx, so:
 *  - every event is idempotent (a re-delivered order is acknowledged, not duplicated);
 *  - only genuinely bad requests (bad signature / unparseable body) get 4xx.
 *
 * @param {object} p
 * @param {string} p.platform   "swiggy" | "zomato" (from the URL path)
 * @param {object} p.headers    lower-cased request headers
 * @param {Buffer|string} p.rawBody  exact bytes that were signed
 * @param {object} p.secrets    { SWIGGY_WEBHOOK_SECRET, ZOMATO_WEBHOOK_SECRET }
 * @param {object} p.store      storage functions (see store.js)
 * @param {number} [p.now]
 */
async function handleWebhook({ platform, headers = {}, rawBody, secrets = {}, store, now = Date.now() }) {
  const adapter = getAdapter(platform);
  if (!adapter) return reply(404, { ok: false, error: 'unknown platform' });

  const verified = adapter.verifyRequest({ headers, rawBody, secret: secrets[adapter.secretEnv] });
  if (!verified.ok) return reply(401, { ok: false, error: verified.reason });

  let body;
  try {
    body = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  } catch (e) {
    return reply(400, { ok: false, error: 'body is not valid JSON' });
  }

  const type = adapter.eventTypeOf(body);
  if (type === 'unknown') return reply(200, { ok: true, ignored: true });

  if (type === 'order.placed') {
    let parsed;
    try {
      parsed = adapter.parseOrder(body);
    } catch (e) {
      return reply(400, { ok: false, error: e.message });
    }
    const outlet = parsed.storeId ? await store.getOutlet(platform, String(parsed.storeId)) : null;
    if (!outlet || outlet.enabled === false) {
      return reply(404, { ok: false, error: `outlet ${parsed.storeId} is not linked to a restaurant` });
    }
    const config = (await store.getConfig(outlet.restaurantId, platform)) || {};
    const itemMap = config.itemMap || {};
    parsed.items = parsed.items.map((it) => ({
      ...it,
      menuItemId: it.externalId !== undefined && it.externalId !== null ? itemMap[String(it.externalId)] || null : null,
    }));

    let order;
    try {
      order = finaliseOrder(parsed, { now, acceptWindowSeconds: config.acceptWindowSeconds });
    } catch (e) {
      return reply(400, { ok: false, error: e.message });
    }
    order.restaurantId = outlet.restaurantId;
    const docId = orderDocId(platform, order.externalOrderId);
    const { created } = await store.createOrderIfAbsent(outlet.restaurantId, docId, order);
    return reply(200, { ok: true, orderId: docId, duplicate: !created });
  }

  // Follow-up events only need to find the existing order.
  const ref = adapter.parseRef(body);
  if (!ref.externalOrderId || !ref.storeId) return reply(400, { ok: false, error: 'missing order or outlet id' });
  const outlet = await store.getOutlet(platform, String(ref.storeId));
  if (!outlet) return reply(404, { ok: false, error: `outlet ${ref.storeId} is not linked to a restaurant` });
  const docId = orderDocId(platform, ref.externalOrderId);

  const result = await store.updateOrder(outlet.restaurantId, docId, (current) => {
    if (type === 'order.cancelled') {
      if (TERMINAL.has(current.status)) return null; // already finished; nothing to do
      return {
        status: STATUS.CANCELLED,
        statusSource: 'platform',
        statusUpdatedAt: now,
        cancelReason: ref.reason ? String(ref.reason) : null,
      };
    }
    if (type === 'order.delivered') {
      if (current.status === STATUS.CANCELLED || current.status === STATUS.REJECTED) return null;
      return { status: STATUS.DELIVERED, statusSource: 'platform', statusUpdatedAt: now };
    }
    if (type === 'rider.update') {
      return { rider: { ...(current.rider || {}), ...ref.rider, updatedAt: now } };
    }
    return null;
  });

  // An update for an order we never received (e.g. it arrived before this
  // integration was switched on) is acknowledged so the platform stops retrying.
  return reply(200, { ok: true, orderId: docId, found: result.found, updated: result.updated });
}

module.exports = { handleWebhook };
