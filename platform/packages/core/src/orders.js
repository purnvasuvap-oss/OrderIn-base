const { quoteCart, lineKey, roundRupees } = require('./billing');

const ITEM_STATUSES = ['placed', 'preparing', 'served'];
const ORDER_STATUSES = ['open', 'bill_requested', 'paid', 'void'];

const ITEM_TRANSITIONS = {
  placed: { preparing: ['kitchen', 'manager', 'owner', 'captain'] },
  preparing: { served: ['captain', 'manager', 'owner'] },
};

function canTransitionItem(from, to, role) {
  const allowed = ITEM_TRANSITIONS[from] && ITEM_TRANSITIONS[from][to];
  return Array.isArray(allowed) && allowed.includes(role);
}

function financialYear(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new Error('Invoice date is not valid');
  const start = value.getMonth() >= 3 ? value.getFullYear() : value.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function formatInvoiceNumber({ prefix = 'INV', financialYear: year, seq }) {
  const n = Number(seq);
  if (!Number.isInteger(n) || n < 1) throw new Error('Invoice sequence must be a positive whole number');
  const body = String(n).padStart(6, '0');
  return year ? `${prefix}/${year}/${body}` : `${prefix}-${body}`;
}

function businessDate(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function mergeLines(existing, additions) {
  const map = new Map();
  (existing || []).forEach((line) => map.set(line.key, { ...line }));
  (additions || []).forEach((line) => {
    const current = map.get(line.key);
    if (current && current.status === 'placed') {
      current.qty += line.qty;
      current.lineTotal = roundRupees(current.unitPrice * current.qty);
      return;
    }
    if (current) {
      const extraKey = `${line.key}::extra::${map.size + 1}`;
      map.set(extraKey, { ...line, key: extraKey, status: 'placed' });
      return;
    }
    map.set(line.key, { ...line, status: line.status || 'placed' });
  });
  return [...map.values()];
}

function buildRunningBill(menuItems, existingLines, additionRequests, tax) {
  const additionQuote = quoteCart(menuItems, additionRequests, tax);
  const merged = mergeLines(existingLines, additionQuote.lines);
  const request = merged.map((line) => ({
    menuItemId: line.menuItemId,
    qty: line.qty,
    size: line.size,
    notes: line.notes,
    options: line.options,
    status: line.status,
    key: line.key,
  }));
  return quoteCart(menuItems, request, tax);
}

function legacyOrdersFromCustomer(customerPhone, customerDoc) {
  const past = Array.isArray(customerDoc && customerDoc.pastOrders) ? customerDoc.pastOrders : [];
  return past.filter(Boolean).map((order) => ({
    id: String(order.id || order.orderId || ''),
    restaurantId: order.restaurantId || null,
    customerPhone: customerPhone || order.customerPhone || null,
    tableId: order.tableId || order.table || null,
    status: order.status || (order.paymentStatus === 'paid' ? 'paid' : 'open'),
    items: order.items || [],
    subtotal: order.subtotal ?? null,
    tax: order.tax ?? null,
    total: order.total ?? order.grandTotal ?? null,
    createdAt: order.createdAt || order.timestamp || null,
    source: 'customers.pastOrders',
    legacy: true,
  }));
}

function voidOrder(order, { reason, actor, at = new Date().toISOString() }) {
  if (!order) throw new Error('Order is missing');
  if (order.status === 'paid') throw new Error('A paid order cannot be voided. Refund it instead.');
  if (!reason || !String(reason).trim()) throw new Error('A void needs a reason.');
  if (!actor || !actor.id) throw new Error('A void needs the staff member who approved it.');
  return {
    ...order,
    status: 'void',
    voidReason: String(reason).trim(),
    voidedBy: { id: actor.id, name: actor.name || '', role: actor.role || '' },
    voidedAt: at,
  };
}

function auditEntry({ action, actor, reason, entityId, at = new Date().toISOString(), extra }) {
  if (!action) throw new Error('Audit entry needs an action');
  if (!actor || !actor.id) throw new Error('Audit entry needs an actor');
  return {
    action,
    actorId: actor.id,
    actorRole: actor.role || '',
    reason: reason ? String(reason).trim() : '',
    entityId: entityId || null,
    at,
    extra: extra || null,
  };
}

module.exports = {
  ITEM_STATUSES,
  ORDER_STATUSES,
  canTransitionItem,
  financialYear,
  formatInvoiceNumber,
  businessDate,
  lineKey,
  mergeLines,
  buildRunningBill,
  legacyOrdersFromCustomer,
  voidOrder,
  auditEntry,
};
