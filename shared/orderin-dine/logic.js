// Shared dine-in helpers. Themes keep their own screens and import this.
// New Firestore fields are optional. Missing fields mean "show nothing".

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const text = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function dietMark(item) {
  if (!item) return null;
  const explicit = text(item.diet || item.foodType || item.type);
  if (explicit === 'egg' || explicit === 'eggetarian') return 'egg';
  if (explicit.includes('nonveg') || explicit.includes('nonvegetarian')) return 'nonveg';
  if (explicit === 'veg' || explicit === 'vegetarian') return 'veg';
  const tags = text(item.tags) + text(item.category);
  if (tags.includes('egg')) return 'egg';
  if (tags.includes('nonveg')) return 'nonveg';
  if (tags.includes('veg')) return 'veg';
  return null;
}

export function dietLabel(mark) {
  if (mark === 'veg') return 'Veg';
  if (mark === 'nonveg') return 'Non-veg';
  if (mark === 'egg') return 'Egg';
  return '';
}

export function allergenList(item) {
  if (!item) return [];
  const raw = item.allergens || item.allergen;
  if (Array.isArray(raw)) return raw.map((part) => String(part).trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map((part) => part.trim()).filter(Boolean);
  return [];
}

export function spiceLevel(item) {
  if (!item || item.spiceLevel == null || item.spiceLevel === '') return null;
  const level = Number(item.spiceLevel);
  if (!Number.isFinite(level) || level <= 0) return null;
  return Math.min(3, Math.round(level));
}

export function tableSessionId(table) {
  const id = String(table || '').trim();
  return id || '1';
}

export function serviceRequest(table, kind, note) {
  const allowed = ['waiter', 'water', 'bill'];
  return {
    table: tableSessionId(table),
    kind: allowed.includes(kind) ? kind : 'waiter',
    note: String(note || '').slice(0, 200),
    status: 'open',
    createdAt: new Date().toISOString(),
  };
}

const OPEN_STATUSES = new Set(['pending', 'placed', 'preparing', 'accepted', 'queued', 'ready', 'unpaid', '']);

export function isOpenTableOrder(order, table) {
  if (!order) return false;
  if (String(order.tableNo || order.table || '') !== String(tableSessionId(table))) return false;
  if (String(order.paymentStatus || '').toLowerCase() === 'paid') return false;
  const status = String(order.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'void' || status === 'delivered' || status === 'served') return false;
  return OPEN_STATUSES.has(status) || status === 'pending';
}

export function withPlacedStatus(items) {
  return (items || []).map((item) => ({
    ...item,
    kitchenStatus: item.kitchenStatus || 'Placed',
  }));
}

// Adds items onto the unpaid order for this table. One bill per table.
export function mergeIntoOpenTableOrder(pastOrders, nextOrder) {
  const orders = Array.isArray(pastOrders) ? pastOrders.slice() : [];
  const table = nextOrder && (nextOrder.tableNo || nextOrder.table);
  const index = orders.findIndex((order) => isOpenTableOrder(order, table));
  const items = withPlacedStatus(nextOrder.items);
  if (index === -1) {
    const created = { ...nextOrder, items };
    orders.push(created);
    return { pastOrders: orders, merged: false, orderId: created.id, order: created };
  }
  const open = orders[index];
  const merged = {
    ...open,
    items: [...withPlacedStatus(open.items), ...items],
    subtotal: round2(Number(open.subtotal || 0) + Number(nextOrder.subtotal || 0)),
    taxes: round2(Number(open.taxes || 0) + Number(nextOrder.taxes || 0)),
    total: round2(Number(open.total || 0) + Number(nextOrder.total || 0)),
    updatedAt: new Date().toISOString(),
  };
  orders[index] = merged;
  return { pastOrders: orders, merged: true, orderId: open.id, order: merged };
}

export function itemStatusLabel(status) {
  const value = String(status || 'Placed');
  if (value === 'Preparing' || value === 'Served' || value === 'Placed') return value;
  if (value === 'Ready' || value === 'Delivered') return 'Served';
  if (value === 'Pending' || value === 'Accepted' || value === 'Queued') return 'Placed';
  return 'Placed';
}

export function splitEqual(total, parts) {
  const count = Math.max(1, Math.floor(Number(parts) || 1));
  const amount = round2(Number(total) || 0);
  const share = round2(amount / count);
  const rows = Array.from({ length: count }, (_, index) => ({
    label: `Person ${index + 1}`,
    amount: index === count - 1 ? round2(amount - share * (count - 1)) : share,
  }));
  return rows;
}

export function splitByItem(items, groups) {
  const chosen = Array.isArray(groups) ? groups : [];
  return chosen.map((group, index) => ({
    label: group.label || `Share ${index + 1}`,
    amount: round2((group.itemIndexes || []).reduce((sum, itemIndex) => {
      const item = items[itemIndex];
      if (!item) return sum;
      const price = Number(item.effectivePrice ?? item.price) || 0;
      return sum + price * (Number(item.quantity) || 1);
    }, 0)),
  }));
}

export function splitByPerson(items) {
  const people = new Map();
  (items || []).forEach((item) => {
    const name = String(item.person || item.for || 'Table').trim() || 'Table';
    const price = (Number(item.effectivePrice ?? item.price) || 0) * (Number(item.quantity) || 1);
    people.set(name, round2((people.get(name) || 0) + price));
  });
  return [...people.entries()].map(([label, amount]) => ({ label, amount }));
}

export function gstSplit(taxable, rate = 0.05) {
  const base = round2(Number(taxable) || 0);
  const tax = round2(base * rate);
  const half = round2(tax / 2);
  return {
    taxable: base,
    rate,
    cgst: half,
    sgst: round2(tax - half),
    total: round2(base + tax),
  };
}

export function invoiceNumber(sequence, date = new Date()) {
  const seq = String(Math.max(1, Number(sequence) || 1)).padStart(4, '0');
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `INV-${y}${m}${d}-${seq}`;
}

export function whatsAppLink(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  const textValue = encodeURIComponent(message || '');
  return digits ? `https://wa.me/${digits}?text=${textValue}` : `https://wa.me/?text=${textValue}`;
}

export function smsLink(phone, message) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return `sms:${digits}?body=${encodeURIComponent(message || '')}`;
}

export function billMessage({ restaurantName, table, total, link }) {
  const name = restaurantName || 'your restaurant';
  const lines = [
    `Bill from ${name}`,
    table ? `Table ${table}` : '',
    total != null ? `Total ₹${round2(total)}` : '',
    link || '',
  ].filter(Boolean);
  return lines.join('\n');
}

export function stationOf(item) {
  const station = String(item?.station || item?.kitchenStation || '').trim();
  return station || 'Kitchen';
}

export function groupByStation(items) {
  const groups = new Map();
  (items || []).forEach((item) => {
    const station = stationOf(item);
    if (!groups.has(station)) groups.set(station, []);
    groups.get(station).push(item);
  });
  return [...groups.entries()].map(([station, rows]) => ({ station, items: rows }));
}

export function tableTimerLabel(sinceIso, now = Date.now()) {
  const start = Date.parse(sinceIso || '');
  if (!Number.isFinite(start)) return '';
  const minutes = Math.max(0, Math.floor((now - start) / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function dayCloseTotals(orders) {
  const buckets = { cash: 0, upi: 0, card: 0, other: 0, count: 0 };
  (orders || []).forEach((order) => {
    if (String(order.paymentStatus || '').toLowerCase() !== 'paid') return;
    const amount = Number(order.total) || 0;
    const method = String(order.paymentMethod || order.OnlinePayMethod || '').toLowerCase();
    buckets.count += 1;
    if (method.includes('cash')) buckets.cash = round2(buckets.cash + amount);
    else if (method.includes('upi')) buckets.upi = round2(buckets.upi + amount);
    else if (method.includes('card')) buckets.card = round2(buckets.card + amount);
    else buckets.other = round2(buckets.other + amount);
  });
  buckets.total = round2(buckets.cash + buckets.upi + buckets.card + buckets.other);
  return buckets;
}

export function applyRecipeDeduction(inventory, recipe, quantity) {
  const qty = Number(quantity) || 0;
  const stock = new Map((inventory || []).map((row) => [String(row.id), { ...row }]));
  const low = [];
  (recipe || []).forEach((line) => {
    const row = stock.get(String(line.inventoryId || line.id));
    if (!row) return;
    const used = (Number(line.qty) || 0) * qty;
    row.stock = round2((Number(row.stock) || 0) - used);
    if (row.minStock != null && row.stock <= Number(row.minStock)) low.push(row);
  });
  return { inventory: [...stock.values()], low };
}

export function loyaltyStamp(spend, current = 0) {
  const points = Math.floor((Number(spend) || 0) / 100);
  return { points: (Number(current) || 0) + points, added: points };
}

export function toCsv(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '';
  const headers = Object.keys(list[0]);
  const escape = (value) => {
    const cell = value == null ? '' : String(value);
    return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  };
  return [headers.join(','), ...list.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\n');
}

export function escPosTicket({ title, table, lines }) {
  const body = [
    title || 'ORDERIN',
    table ? `TABLE ${table}` : '',
    '----------------',
    ...(lines || []).map((line) => `${line.qty || 1} x ${line.name}`),
    '----------------',
  ].filter(Boolean).join('\n');
  return body;
}

export { round2 };
