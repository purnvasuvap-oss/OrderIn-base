'use strict';

/**
 * Core of sendWhatsAppBill, kept free of Firebase so it can be unit tested.
 *
 * The client only sends { restaurantId, phone, orderId }. The bill itself is
 * read from Firestore (customers/{phone}.pastOrders), so the endpoint can only
 * ever send a real, paid order to the number that placed it. It cannot be
 * used to send arbitrary text to arbitrary numbers.
 */

const RESTAURANT_ID_RE = /^orderin_rest(?:au|ua)rant_\d{1,3}$/;
const PHONE_RE = /^\+\d{8,15}$/;
const MAX_SENDS_PER_ORDER = 3;
const MAX_PARAM_LEN = 900;

const money = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const isPaid = (order) => {
  const s = String(order?.paymentStatus || order?.payment_status || '').toLowerCase();
  return s === 'paid' || s === 'success' || s === 'captured' || s === 'completed';
};

/** WhatsApp template parameters may not contain newlines or tabs. */
const flat = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' | ').replace(/ {4,}/g, '   ').trim();

const summariseItems = (items) => {
  const text = (Array.isArray(items) ? items : [])
    .map((it) => `${Number(it.quantity ?? it.qty ?? 1) || 1} x ${it.name}`)
    .join(', ');
  return text.length > MAX_PARAM_LEN ? `${text.slice(0, MAX_PARAM_LEN - 1)}…` : text || '-';
};

const validateRequest = (body) => {
  const { restaurantId, phone, orderId } = body || {};
  if (!RESTAURANT_ID_RE.test(String(restaurantId || ''))) return 'Invalid restaurantId';
  if (!PHONE_RE.test(String(phone || ''))) return 'Invalid phone';
  if (!orderId || String(orderId).length > 64) return 'Invalid orderId';
  return '';
};

/**
 * Body for POST https://graph.facebook.com/<v>/<PHONE_NUMBER_ID>/messages
 * using an approved template. Default template "order_bill" (en) with body:
 *   Hi {{1}}, thanks for dining at {{2}}. Order {{3}}: {{4}}. Total ₹{{5}}, paid by {{6}}.
 */
const buildTemplateMessage = ({ phone, order, customerName, restaurantName, templateName, languageCode }) => ({
  messaging_product: 'whatsapp',
  to: String(phone).replace(/\D/g, ''),
  type: 'template',
  template: {
    name: templateName || 'order_bill',
    language: { code: languageCode || 'en' },
    components: [
      {
        type: 'body',
        parameters: [
          flat(customerName || 'there'),
          flat(restaurantName || 'our restaurant'),
          flat(order.id),
          flat(summariseItems(order.items)),
          money(order.total ?? order.amount ?? order.totalAmount).toFixed(2),
          flat(order.paymentMethod || order.payment || 'online'),
        ].map((text) => ({ type: 'text', text })),
      },
    ],
  },
});

/**
 * deps = {
 *   getCustomer(restaurantId, phone) -> data | null,
 *   getRestaurantName(restaurantId) -> string,
 *   recordSend(restaurantId, phone, orderId, messageId) -> void,
 *   postMessage(body) -> { messageId },
 *   config: { templateName, languageCode },
 * }
 * Returns { status, body } for the HTTP response.
 */
const handleSendBill = async (reqBody, deps) => {
  const problem = validateRequest(reqBody);
  if (problem) return { status: 400, body: { error: problem } };
  const { restaurantId, phone, orderId } = reqBody;

  const customer = await deps.getCustomer(restaurantId, phone);
  if (!customer) return { status: 404, body: { error: 'Customer not found' } };

  const order = (customer.pastOrders || []).find((o) => String(o?.id) === String(orderId));
  if (!order) return { status: 404, body: { error: 'Order not found' } };
  if (!isPaid(order)) return { status: 409, body: { error: 'Order is not paid yet' } };
  if ((order.whatsappBill?.count || 0) >= MAX_SENDS_PER_ORDER) {
    return { status: 429, body: { error: 'Bill already sent the maximum number of times' } };
  }

  const restaurantName = await deps.getRestaurantName(restaurantId).catch(() => '');
  const message = buildTemplateMessage({
    phone,
    order,
    customerName: customer.username || customer.name,
    restaurantName,
    templateName: deps.config?.templateName,
    languageCode: deps.config?.languageCode,
  });

  const { messageId } = await deps.postMessage(message);
  await deps.recordSend(restaurantId, phone, orderId, messageId || null);
  return { status: 200, body: { ok: true, messageId: messageId || null } };
};

module.exports = {
  handleSendBill,
  buildTemplateMessage,
  validateRequest,
  summariseItems,
  isPaid,
  MAX_SENDS_PER_ORDER,
};
