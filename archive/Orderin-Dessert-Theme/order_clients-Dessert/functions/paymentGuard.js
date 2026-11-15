const crypto = require('crypto');

// sha256 of the live Razorpay key id and key secret that were committed to git.
// The plaintext is intentionally not in this file. If either value shows up in
// config or env, refuse it so a deploy cannot keep using the leaked key.
const REVOKED_CREDENTIAL_HASHES = new Set([
  'a443ef9fd2b910fe9144da97c207ace0e887f77c197899914559a721838cbe06',
  '5ca78057b244c038bb49153a4de84aac79111cf0002431180550d0d1688b877d',
]);

const TAX_RATE = 0.05;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const isRevokedCredential = (value) => REVOKED_CREDENTIAL_HASHES.has(sha256(value));

const firstAllowedCredential = (...values) => {
  for (const value of values) {
    if (!value) continue;
    if (isRevokedCredential(value)) {
      console.error('[Razorpay] Refusing a revoked credential that was committed to git. Rotate it in the Razorpay dashboard.');
      continue;
    }
    return value;
  }
  return '';
};

const loadRazorpayCredentials = (keyIdFromConfig, keyIdFromEnv, secretFromConfig, secretFromEnv) => ({
  keyId: firstAllowedCredential(keyIdFromEnv, keyIdFromConfig),
  keySecret: firstAllowedCredential(secretFromEnv, secretFromConfig),
});

const roundRupees = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parseRupees = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = parseFloat(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const optionText = (opt) => [opt && opt.label, opt && opt.option, opt && opt.name, opt && opt.value]
  .filter(Boolean)
  .join(' ');

// Large is never billed as Regular. A menu field priceLarge / prices.Large wins.
// Otherwise Large is 1.5x and Extra Large is 2x the regular menu price.
const portionMultiplier = (item = {}) => {
  const parts = [
    item.portion,
    item.size,
    item.instructions,
  ];
  const options = []
    .concat(Array.isArray(item.selectedOptions) ? item.selectedOptions : [])
    .concat(Array.isArray(item.customizations) ? item.customizations : [])
    .concat(Array.isArray(item.specifications) ? item.specifications : []);
  options.forEach((opt) => {
    if (opt && typeof opt === 'object') parts.push(optionText(opt));
    else if (opt) parts.push(String(opt));
  });
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  if (/extra\s*large/.test(text)) return 2;
  if (/\blarge\b/.test(text)) return 1.5;
  return 1;
};

const explicitSizedPrice = (menuItem, multiplier) => {
  if (multiplier === 2) {
    return parseRupees(menuItem.priceExtraLarge ?? menuItem.extraLargePrice ?? menuItem.prices?.['Extra Large'] ?? menuItem.prices?.extraLarge);
  }
  if (multiplier === 1.5) {
    return parseRupees(menuItem.priceLarge ?? menuItem.largePrice ?? menuItem.prices?.Large ?? menuItem.prices?.large);
  }
  return NaN;
};

const unitRupees = (menuItem, item) => {
  const regular = parseRupees(menuItem.price ?? menuItem.Price ?? menuItem.itemPrice);
  if (!Number.isFinite(regular) || regular < 0) return NaN;
  const multiplier = portionMultiplier(item);
  if (multiplier === 1) return regular;
  const explicit = explicitSizedPrice(menuItem, multiplier);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return roundRupees(regular * multiplier);
};

const priceItems = (menuDocs, items) => {
  const byId = new Map();
  const byName = new Map();
  (menuDocs || []).forEach((doc) => {
    const data = typeof doc.data === 'function' ? doc.data() : doc;
    if (!data || typeof data !== 'object') return;
    const id = doc.id || data.id;
    if (id) byId.set(String(id), data);
    if (data.id) byId.set(String(data.id), data);
    const name = String(data.name || data.Name || '').trim().toLowerCase();
    if (name) byName.set(name, data);
  });

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order has no items to price');
  }

  let subtotal = 0;
  items.forEach((item) => {
    const qty = Number(item.quantity ?? item.qty ?? 0);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new Error('Each item needs a whole quantity from 1 to 99');
    }
    const id = item.id || item.itemId || item.productId;
    const name = String(item.name || item.itemName || '').trim().toLowerCase().replace(/\s*\((large|extra large)\)\s*$/i, '');
    const menuItem = (id && byId.get(String(id))) || byName.get(name);
    if (!menuItem) throw new Error(`Menu item not found: ${item.name || id || 'unknown'}`);
    const unit = unitRupees(menuItem, item);
    if (!Number.isFinite(unit)) throw new Error(`Menu item has no price: ${item.name || id}`);
    subtotal += unit * qty;
  });

  subtotal = roundRupees(subtotal);
  const tax = roundRupees(subtotal * TAX_RATE);
  const total = roundRupees(subtotal + tax);
  const paise = Math.round(total * 100);
  if (!Number.isFinite(paise) || paise <= 0) {
    throw new Error('Order total must be greater than zero');
  }
  return { subtotal, tax, total, paise };
};

const phoneCandidates = (customerPhone) => {
  const raw = String(customerPhone || '').trim();
  if (!raw) return [];
  const digits = raw.replace(/\D/g, '');
  const candidates = [raw];
  if (raw.startsWith('+')) candidates.push(raw.slice(1));
  else candidates.push(`+${raw}`);
  if (digits.length === 10) candidates.push(`+91${digits}`, `91${digits}`, digits);
  else if (digits.length === 12 && digits.startsWith('91')) candidates.push(`+${digits}`, digits, digits.slice(2));
  return [...new Set(candidates.filter(Boolean))];
};

const loadOrder = async (db, restaurantId, customerPhone, orderId) => {
  if (!restaurantId || !customerPhone || !orderId) {
    throw new Error('restaurantId, customerPhone and orderId are required');
  }
  for (const phone of phoneCandidates(customerPhone)) {
    const ref = db.collection('Restaurant').doc(String(restaurantId)).collection('customers').doc(phone);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() || {};
    const pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
    const index = pastOrders.findIndex((order) => order && String(order.id) === String(orderId));
    if (index === -1) continue;
    return { phone, ref, pastOrders, index, order: pastOrders[index] };
  }
  return null;
};

const resolveCheckoutAmount = async (db, { restaurantId, customerPhone, orderId, items }) => {
  if (!restaurantId) throw new Error('restaurantId is required');
  let pricedItems = Array.isArray(items) && items.length ? items : null;
  if (!pricedItems) {
    const loaded = await loadOrder(db, restaurantId, customerPhone, orderId);
    if (!loaded) throw new Error('Order not found');
    pricedItems = loaded.order.items;
  }
  const menuSnap = await db.collection('Restaurant').doc(String(restaurantId)).collection('menu').get();
  return priceItems(menuSnap.docs, pricedItems);
};

const amountsMatchPaise = (paidPaise, expectedPaise) => {
  const paid = Number(paidPaise);
  const expected = Number(expectedPaise);
  return Number.isFinite(paid) && Number.isFinite(expected) && Math.abs(Math.round(paid) - Math.round(expected)) <= 1;
};

const signaturesMatch = (expected, actual) => {
  const left = Buffer.from(String(expected || ''));
  const right = Buffer.from(String(actual || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const isHostingOrigin = (origin) => {
  try {
    const url = new URL(origin);
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true;
    if (url.protocol !== 'https:') return false;
    return url.hostname.endsWith('.web.app') || url.hostname.endsWith('.firebaseapp.com');
  } catch (error) {
    return false;
  }
};

const applyCors = (req, res) => {
  const origin = req.get ? req.get('Origin') : '';
  const extra = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origin && (extra.includes(origin) || isHostingOrigin(origin))) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const replaceOrder = (pastOrders, index, next) => pastOrders.map((order, orderIndex) => (
  orderIndex === index ? next : order
));

const issueCounterCode = async (db, { restaurantId, customerPhone, orderId }) => {
  const loaded = await loadOrder(db, restaurantId, customerPhone, orderId);
  if (!loaded) throw new Error('Order not found');
  const existing = String(loaded.order.verificationCode || '');
  const code = /^\d{4}$/.test(existing)
    ? existing
    : String(crypto.randomInt(0, 10000)).padStart(4, '0');
  const nextOrder = {
    ...loaded.order,
    verificationCode: code,
    counterAttempts: loaded.order.counterAttempts || 0,
  };
  await loaded.ref.update({ pastOrders: replaceOrder(loaded.pastOrders, loaded.index, nextOrder) });
  await db.collection('Restaurant').doc(String(restaurantId)).collection('counterCodes').doc(String(orderId)).set({
    code,
    customerPhone: loaded.phone,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  // The code is for the staff screen (it is stored on the order the staff app
  // already reads). Never return it to the diner.
  return { ok: true };
};

const confirmCounterPayment = async (db, { restaurantId, customerPhone, orderId, code }) => {
  const loaded = await loadOrder(db, restaurantId, customerPhone, orderId);
  if (!loaded) throw new Error('Order not found');
  if (loaded.order.paymentStatus === 'paid') {
    return { ok: true, alreadyPaid: true };
  }
  const attempts = Number(loaded.order.counterAttempts || 0);
  if (attempts >= 8) {
    return { ok: false, error: 'Too many attempts. Ask the counter for a new code.' };
  }
  const expected = String(loaded.order.verificationCode || '');
  const given = String(code || '').replace(/\D/g, '');
  if (!/^\d{4}$/.test(given) || !signaturesMatch(expected, given)) {
    const nextOrder = { ...loaded.order, counterAttempts: attempts + 1 };
    await loaded.ref.update({ pastOrders: replaceOrder(loaded.pastOrders, loaded.index, nextOrder) });
    return { ok: false, error: 'Invalid counter code' };
  }
  const nextOrder = {
    ...loaded.order,
    paymentStatus: 'paid',
    paidAt: new Date().toISOString(),
    paymentMethod: loaded.order.paymentMethod || 'Cash',
    counterConfirmedAt: new Date().toISOString(),
  };
  await loaded.ref.update({ pastOrders: replaceOrder(loaded.pastOrders, loaded.index, nextOrder) });
  return { ok: true };
};

module.exports = {
  TAX_RATE,
  loadRazorpayCredentials,
  isRevokedCredential,
  portionMultiplier,
  unitRupees,
  priceItems,
  resolveCheckoutAmount,
  amountsMatchPaise,
  signaturesMatch,
  applyCors,
  issueCounterCode,
  confirmCounterPayment,
  phoneCandidates,
};
