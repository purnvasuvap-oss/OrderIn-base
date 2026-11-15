const crypto = require('crypto');
const core = require('../packages/core/src/index.js');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function owns(actor, restaurantId) {
  if (!actor) return false;
  if (actor.role === 'platformAdmin') return true;
  if (actor.restaurantId === restaurantId) return true;
  return Array.isArray(actor.restaurantIds) && actor.restaurantIds.includes(restaurantId);
}

function assertStaff(actor, restaurantId, action) {
  if (!actor || !core.can(actor.role, action) || !owns(actor, restaurantId)) {
    throw httpError(403, 'You do not have access to that.');
  }
}

function assertDiner(actor, restaurantId, sessionId, tableId) {
  if (!actor || actor.role !== 'diner' || actor.restaurantId !== restaurantId || actor.sessionId !== sessionId) {
    throw httpError(403, 'This table session is not yours.');
  }
  if (tableId && actor.tableId !== tableId) {
    throw httpError(403, 'That table does not match this session.');
  }
}

function restaurant(db, restaurantId) {
  if (!restaurantId) throw httpError(400, 'restaurantId is required');
  return db.collection('Restaurant').doc(String(restaurantId));
}

async function loadMenu(db, restaurantId) {
  const snap = await restaurant(db, restaurantId).collection('menu').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadTax(db, restaurantId) {
  const snap = await restaurant(db, restaurantId).collection('profile').doc('public').get();
  const data = snap.exists ? snap.data() : {};
  const tax = data.tax || {};
  return {
    cgstRate: data.cgstRate ?? tax.cgstRate,
    sgstRate: data.sgstRate ?? tax.sgstRate,
    sac: data.sac || tax.sac,
  };
}

async function findOpenOrder(db, restaurantId, sessionId) {
  const snap = await restaurant(db, restaurantId).collection('orders')
    .where('sessionId', '==', sessionId)
    .get();
  const doc = snap.docs.find((row) => ['open', 'bill_requested'].includes(row.data().status));
  if (!doc) return null;
  return { id: doc.id, ref: doc.ref, data: doc.data() };
}

async function readOrder(db, restaurantId, orderId) {
  const ref = restaurant(db, restaurantId).collection('orders').doc(String(orderId));
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, 'Order not found');
  return { id: snap.id, ref, data: snap.data() };
}

function publicOrder(order) {
  const copy = { ...order };
  delete copy.verificationCode;
  return copy;
}

async function writeAudit(db, restaurantId, entry) {
  const id = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await restaurant(db, restaurantId).collection('audit').doc(id).set(entry);
}

async function deductNewLines(db, restaurantId, lines) {
  const inventorySnap = await restaurant(db, restaurantId).collection('inventory').get();
  const recipeSnap = await restaurant(db, restaurantId).collection('recipes').get();
  if (!inventorySnap.docs.length || !recipeSnap.docs.length) return [];
  const inventory = inventorySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const recipes = {};
  recipeSnap.docs.forEach((doc) => {
    recipes[doc.id] = doc.data().items || doc.data().recipe || [];
  });
  const result = core.deductStock(inventory, recipes, lines);
  await Promise.all(result.inventory.map((item) => (
    restaurant(db, restaurantId).collection('inventory').doc(item.id).set(item)
  )));
  return result.alerts;
}

async function placeOrder(db, _authAdmin, actor, data) {
  assertDiner(actor, data.restaurantId, data.sessionId, data.tableId);
  const items = data.items || data.lines;
  const menu = await loadMenu(db, data.restaurantId);
  const tax = await loadTax(db, data.restaurantId);
  const open = await findOpenOrder(db, data.restaurantId, data.sessionId);
  const quote = open
    ? core.buildRunningBill(menu, open.data.lines || [], items, tax)
    : core.quoteCart(menu, items, tax);
  const orderId = open ? open.id : `ord_${crypto.randomBytes(8).toString('hex')}`;
  const added = open ? quote.lines.filter((line) => !(open.data.lines || []).some((existing) => existing.key === line.key && existing.qty === line.qty)) : quote.lines;
  const order = {
    id: orderId,
    restaurantId: data.restaurantId,
    tableId: data.tableId,
    sessionId: data.sessionId,
    status: open ? open.data.status : 'open',
    lines: quote.lines,
    subtotal: quote.subtotal,
    discount: quote.discount,
    taxable: quote.taxable,
    cgst: quote.cgst,
    sgst: quote.sgst,
    cgstRate: quote.cgstRate,
    sgstRate: quote.sgstRate,
    tax: quote.tax,
    total: quote.total,
    paise: quote.paise,
    sac: quote.sac,
    packing: 0,
    savings: 0,
    deliveryFee: 0,
    payments: open?.data.payments || [],
    customerPhone: open?.data.customerPhone || data.customerPhone || null,
    customerName: open?.data.customerName || data.customerName || null,
    loyaltyOptIn: Boolean(data.loyaltyOptIn || open?.data.loyaltyOptIn),
    createdAt: open?.data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    businessDate: open?.data.businessDate || core.businessDate(),
    version: (open?.data.version || 0) + 1,
  };
  await restaurant(db, data.restaurantId).collection('orders').doc(orderId).set(order);
  await restaurant(db, data.restaurantId).collection('tables').doc(String(data.tableId)).set({
    status: core.tableStatusFromOrder(order),
    orderId,
    updatedAt: order.updatedAt,
  }, { merge: true });
  const alerts = await deductNewLines(db, data.restaurantId, items);
  return { order: publicOrder(order), lowStock: alerts, added: added.length };
}

async function updateItemStatus(db, _authAdmin, actor, data) {
  const action = data.status === 'preparing' ? 'orders.status.preparing' : 'orders.status.served';
  assertStaff(actor, data.restaurantId, action);
  if (!core.canTransitionItem(data.from, data.status, actor.role) && data.from) {
    if (!core.canTransitionItem(data.from, data.status, actor.role)) {
      throw httpError(403, 'That status change is not allowed for your role.');
    }
  }
  const loaded = await readOrder(db, data.restaurantId, data.orderId);
  const lines = (loaded.data.lines || []).map((line) => {
    if (line.key !== data.lineKey) return line;
    if (!core.canTransitionItem(line.status, data.status, actor.role)) {
      throw httpError(403, 'That status change is not allowed for your role.');
    }
    return { ...line, status: data.status };
  });
  if (!lines.some((line) => line.key === data.lineKey)) throw httpError(404, 'Item not found on this order');
  const next = {
    ...loaded.data,
    lines,
    updatedAt: new Date().toISOString(),
    version: (loaded.data.version || 1) + 1,
  };
  await loaded.ref.set(next);
  await restaurant(db, data.restaurantId).collection('tables').doc(String(next.tableId)).set({
    status: core.tableStatusFromOrder(next),
    updatedAt: next.updatedAt,
  }, { merge: true });
  return { order: publicOrder(next) };
}

async function serviceRequest(db, _authAdmin, actor, data) {
  assertDiner(actor, data.restaurantId, data.sessionId, data.tableId);
  if (!['call_waiter', 'water', 'bill'].includes(data.type)) throw httpError(400, 'Unknown request');
  const id = `req_${crypto.randomBytes(6).toString('hex')}`;
  const request = {
    id,
    type: data.type,
    tableId: data.tableId,
    sessionId: data.sessionId,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  await restaurant(db, data.restaurantId).collection('serviceRequests').doc(id).set(request);
  if (data.type === 'bill') {
    const open = await findOpenOrder(db, data.restaurantId, data.sessionId);
    if (open) {
      const next = { ...open.data, status: 'bill_requested', updatedAt: request.createdAt };
      await open.ref.set(next);
      await restaurant(db, data.restaurantId).collection('tables').doc(String(data.tableId)).set({
        status: 'bill_requested',
        updatedAt: request.createdAt,
      }, { merge: true });
    }
  }
  return { request };
}

async function acknowledgeServiceRequest(db, _authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'orders.read');
  if (actor.role === 'kitchen') throw httpError(403, 'Kitchen does not clear table requests.');
  const ref = restaurant(db, data.restaurantId).collection('serviceRequests').doc(String(data.requestId));
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, 'Request not found');
  const next = { ...snap.data(), status: 'done', doneBy: actor.uid, doneAt: new Date().toISOString() };
  await ref.set(next);
  return { request: next };
}

async function moveTable(db, _authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'tables.move');
  const loaded = await readOrder(db, data.restaurantId, data.orderId);
  const from = loaded.data.tableId;
  const next = { ...loaded.data, tableId: String(data.toTableId), updatedAt: new Date().toISOString() };
  await loaded.ref.set(next);
  await restaurant(db, data.restaurantId).collection('tables').doc(String(from)).set({ status: 'free', orderId: null }, { merge: true });
  await restaurant(db, data.restaurantId).collection('tables').doc(String(data.toTableId)).set({
    status: core.tableStatusFromOrder(next),
    orderId: loaded.id,
  }, { merge: true });
  await writeAudit(db, data.restaurantId, core.auditEntry({
    action: 'table.move',
    actor: { id: actor.uid, role: actor.role },
    reason: `Moved ${from} to ${data.toTableId}`,
    entityId: loaded.id,
  }));
  return { order: publicOrder(next) };
}

async function mergeTables(db, _authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'tables.merge');
  const target = await readOrder(db, data.restaurantId, data.targetOrderId);
  const source = await readOrder(db, data.restaurantId, data.sourceOrderId);
  const menu = await loadMenu(db, data.restaurantId);
  const tax = await loadTax(db, data.restaurantId);
  const quote = core.buildRunningBill(menu, target.data.lines || [], (source.data.lines || []).map((line) => ({
    menuItemId: line.menuItemId,
    qty: line.qty,
    size: line.size,
    notes: line.notes,
    options: line.options,
  })), tax);
  const merged = {
    ...target.data,
    lines: quote.lines,
    subtotal: quote.subtotal,
    discount: quote.discount,
    taxable: quote.taxable,
    cgst: quote.cgst,
    sgst: quote.sgst,
    tax: quote.tax,
    total: quote.total,
    paise: quote.paise,
    updatedAt: new Date().toISOString(),
  };
  await target.ref.set(merged);
  const voided = core.voidOrder(source.data, {
    reason: `Merged into ${target.id}`,
    actor: { id: actor.uid, role: actor.role },
  });
  await source.ref.set(voided);
  await writeAudit(db, data.restaurantId, core.auditEntry({
    action: 'table.merge',
    actor: { id: actor.uid, role: actor.role },
    reason: voided.voidReason,
    entityId: target.id,
  }));
  return { order: publicOrder(merged) };
}

async function splitBill(db, _authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'orders.read');
  const loaded = await readOrder(db, data.restaurantId, data.orderId);
  const shares = core.splitBill(loaded.data, data.split);
  const next = { ...loaded.data, shares, updatedAt: new Date().toISOString() };
  await loaded.ref.set(next);
  return { order: publicOrder(next), shares };
}

async function nextInvoiceNumber(db, restaurantId) {
  const ref = restaurant(db, restaurantId).collection('counters').doc('invoice');
  let seq;
  if (typeof db.runTransaction === 'function') {
    seq = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const next = ((snap.exists && snap.data().seq) || 0) + 1;
      tx.set(ref, { seq: next });
      return next;
    });
  } else {
    const snap = await ref.get();
    seq = ((snap.exists && snap.data().seq) || 0) + 1;
    await ref.set({ seq });
  }
  return core.formatInvoiceNumber({ financialYear: core.financialYear(new Date()), seq });
}

async function recordPayment(db, _authAdmin, actor, data) {
  const loaded = await readOrder(db, data.restaurantId, data.orderId);
  assertStaff(actor, data.restaurantId, 'day.close');
  const amount = core.roundRupees(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, 'Payment amount must be greater than zero');
  const payments = [...(loaded.data.payments || []), {
    method: data.method || 'cash',
    amount,
    at: new Date().toISOString(),
    by: actor.uid || null,
    shareLabel: data.shareLabel || null,
  }];
  const paid = core.roundRupees(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const next = { ...loaded.data, payments, updatedAt: new Date().toISOString() };
  if (data.customerPhone) next.customerPhone = data.customerPhone;
  if (data.customerName) next.customerName = data.customerName;
  if (data.loyaltyOptIn) next.loyaltyOptIn = true;
  let profile = null;
  if (paid + 0.009 >= Number(loaded.data.total || 0)) {
    next.status = 'paid';
    next.paymentStatus = 'paid';
    next.paidAt = next.updatedAt;
    if (!next.invoiceNumber) next.invoiceNumber = await nextInvoiceNumber(db, data.restaurantId);
    if (next.loyaltyOptIn && next.customerPhone) {
      profile = await awardLoyalty(db, data.restaurantId, next);
    }
  }
  await loaded.ref.set(next);
  if (next.status === 'paid') {
    await restaurant(db, data.restaurantId).collection('tables').doc(String(next.tableId)).set({
      status: 'paid',
      updatedAt: next.updatedAt,
    }, { merge: true });
  }
  const profileSnap = await restaurant(db, data.restaurantId).collection('profile').doc('public').get();
  const restaurantProfile = profileSnap.exists ? profileSnap.data() : {};
  const text = core.billText({ restaurant: restaurantProfile, order: next });
  return {
    order: publicOrder(next),
    paid,
    remaining: core.roundRupees(Math.max(0, Number(next.total || 0) - paid)),
    whatsapp: next.customerPhone && next.status === 'paid' ? core.whatsappLink(next.customerPhone, text) : null,
    sms: next.customerPhone && next.status === 'paid' ? core.smsLink(next.customerPhone, text) : null,
    loyalty: profile,
  };
}

async function awardLoyalty(db, restaurantId, order) {
  const ref = restaurant(db, restaurantId).collection('customers').doc(String(order.customerPhone));
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : { optIn: true, points: 0, stamps: 0, visitCount: 0, spend: 0, dishes: {} };
  const earned = core.awardPoints({
    spend: order.total,
    birthday: current.birthday,
    today: new Date().toISOString(),
  });
  const stamps = core.addStamps(current.stamps || 0, true);
  const bumped = core.bumpProfile(current, order);
  const next = {
    ...bumped,
    optIn: true,
    phone: order.customerPhone,
    name: order.customerName || current.name || '',
    birthday: current.birthday || null,
    points: (current.points || 0) + earned.points,
    stamps: stamps.stamps,
    rewardReady: stamps.reward,
  };
  await ref.set(next);
  return { points: next.points, earned: earned.points, birthdayBonus: earned.birthdayBonus, stamps: next.stamps, rewardReady: stamps.reward };
}

async function applyManagerDiscount(db, _authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'discount.approve');
  const loaded = await readOrder(db, data.restaurantId, data.orderId);
  const coupon = data.coupon || { type: 'flat', value: data.amount, requiresManager: true, code: data.code || 'MANUAL' };
  const quote = core.applyCoupon({ ...loaded.data, lines: loaded.data.lines }, coupon, true);
  const next = {
    ...loaded.data,
    ...quote,
    lines: loaded.data.lines,
    discountApprovedBy: { id: actor.uid, role: actor.role },
    updatedAt: new Date().toISOString(),
  };
  await loaded.ref.set(next);
  await writeAudit(db, data.restaurantId, core.auditEntry({
    action: 'discount.approve',
    actor: { id: actor.uid, role: actor.role },
    reason: data.reason || coupon.code,
    entityId: loaded.id,
  }));
  return { order: publicOrder(next) };
}

async function voidOrder(db, _authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'void');
  const loaded = await readOrder(db, data.restaurantId, data.orderId);
  const next = core.voidOrder(loaded.data, { reason: data.reason, actor: { id: actor.uid, role: actor.role } });
  await loaded.ref.set(next);
  await writeAudit(db, data.restaurantId, core.auditEntry({
    action: 'order.void',
    actor: { id: actor.uid, role: actor.role },
    reason: data.reason,
    entityId: loaded.id,
  }));
  await restaurant(db, data.restaurantId).collection('tables').doc(String(next.tableId)).set({ status: 'free' }, { merge: true });
  return { order: publicOrder(next) };
}

async function closeDay(db, _authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'day.close');
  const snap = await restaurant(db, data.restaurantId).collection('orders').where('businessDate', '==', data.businessDate).get();
  const orders = snap.docs.map((doc) => doc.data());
  const summary = core.dayClose(orders, { cashCounted: data.cashCounted });
  const id = data.businessDate || core.businessDate();
  const doc = { id, ...summary, closedBy: actor.uid, closedAt: new Date().toISOString() };
  await restaurant(db, data.restaurantId).collection('dayCloses').doc(id).set(doc);
  return { dayClose: doc };
}

async function saveFeedback(db, _authAdmin, actor, data) {
  assertDiner(actor, data.restaurantId, data.sessionId);
  const rating = Number(data.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, 'Rating must be from 1 to 5');
  await restaurant(db, data.restaurantId).collection('feedback').doc(String(data.orderId)).set({
    orderId: data.orderId,
    sessionId: data.sessionId,
    rating,
    comment: String(data.comment || '').slice(0, 1000),
    at: new Date().toISOString(),
  });
  const profile = await restaurant(db, data.restaurantId).collection('profile').doc('public').get();
  const url = profile.exists ? profile.data().googleReviewUrl : '';
  return { saved: true, review: core.reviewPrompt({ rating, googleReviewUrl: url || '' }) };
}

function codesMatch(expected, given) {
  const left = Buffer.from(String(expected || ''));
  const right = Buffer.from(String(given || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function issueCounterCode(db, _authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'counter.view');
  await readOrder(db, data.restaurantId, data.orderId);
  const ref = restaurant(db, data.restaurantId).collection('counterCodes').doc(String(data.orderId));
  const existing = await ref.get();
  const code = existing.exists && /^\d{4}$/.test(String(existing.data().code || ''))
    ? String(existing.data().code)
    : String(crypto.randomInt(0, 10000)).padStart(4, '0');
  await ref.set({
    code,
    attempts: existing.exists ? Number(existing.data().attempts || 0) : 0,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, code };
}

async function confirmCounterPayment(db, authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'counter.view');
  const ref = restaurant(db, data.restaurantId).collection('counterCodes').doc(String(data.orderId));
  const snap = await ref.get();
  if (!snap.exists) throw httpError(400, 'Ask the counter to issue a code first.');
  const attempts = Number(snap.data().attempts || 0);
  if (attempts >= 8) return { ok: false, error: 'Too many attempts. Ask the counter for a new code.' };
  const given = String(data.code || '').replace(/\D/g, '');
  if (!codesMatch(snap.data().code, given)) {
    await ref.set({ ...snap.data(), attempts: attempts + 1 });
    return { ok: false, error: 'Invalid counter code' };
  }
  return recordPayment(db, authAdmin, actor, {
    restaurantId: data.restaurantId,
    orderId: data.orderId,
    amount: data.amount,
    method: data.method || 'cash',
  });
}

async function bootstrapAccount(db, authAdmin, data) {
  if (!data.configuredSecret || data.secret !== data.configuredSecret) {
    throw httpError(403, 'Bootstrap secret does not match.');
  }
  if (!['owner', 'platformAdmin'].includes(data.role)) {
    throw httpError(400, 'Bootstrap can create an owner or a platform admin.');
  }
  if (!data.email || !data.password || String(data.password).length < 8) {
    throw httpError(400, 'Email and a password of at least 8 characters are required.');
  }
  if (data.role === 'owner' && !data.restaurantId) throw httpError(400, 'An owner needs a restaurant id.');
  const user = await authAdmin.createUser({ email: data.email, password: data.password, displayName: data.restaurantName || data.email });
  const claims = data.role === 'platformAdmin'
    ? { role: 'platformAdmin' }
    : { role: 'owner', restaurantId: data.restaurantId, restaurantIds: [data.restaurantId] };
  await authAdmin.setCustomUserClaims(user.uid, claims);
  if (data.role === 'owner') {
    await restaurant(db, data.restaurantId).collection('profile').doc('public').set({
      name: data.restaurantName || 'Restaurant',
      restaurantId: data.restaurantId,
      cgstRate: 2.5,
      sgstRate: 2.5,
      sac: '996331',
      theme: { preset: 'olive' },
      features: { loyalty: true, splitBill: true, callWaiter: true, whatsappBill: true },
    }, { merge: true });
    await restaurant(db, data.restaurantId).collection('staff').doc(user.uid).set({
      uid: user.uid,
      email: data.email,
      name: data.restaurantName || data.email,
      role: 'owner',
      restaurantId: data.restaurantId,
      active: true,
    });
  }
  return { uid: user.uid, role: data.role };
}

async function createStaffUser(db, authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'staff.create');
  if (!core.managerMayCreate(actor.role, data.role)) {
    throw httpError(403, 'You cannot create that role.');
  }
  if (!data.email || !data.password || String(data.password).length < 8) {
    throw httpError(400, 'Email and a password of at least 8 characters are required.');
  }
  const user = await authAdmin.createUser({ email: data.email, password: data.password, displayName: data.name || data.email });
  await authAdmin.setCustomUserClaims(user.uid, {
    role: data.role,
    restaurantId: data.restaurantId,
    restaurantIds: [data.restaurantId],
  });
  await restaurant(db, data.restaurantId).collection('staff').doc(user.uid).set({
    uid: user.uid,
    email: data.email,
    name: data.name || '',
    role: data.role,
    restaurantId: data.restaurantId,
    active: true,
  });
  return { uid: user.uid, email: data.email, role: data.role };
}

async function openTableSession(db, authAdmin, actor, data) {
  if (!actor || !actor.uid) throw httpError(401, 'Sign in anonymously before opening a table.');
  const table = await restaurant(db, data.restaurantId).collection('tables').doc(String(data.tableId)).get();
  if (!table.exists) throw httpError(404, 'That table is not set up.');
  const sessionId = crypto.randomBytes(16).toString('hex');
  await restaurant(db, data.restaurantId).collection('sessions').doc(sessionId).set({
    sessionId,
    tableId: String(data.tableId),
    restaurantId: data.restaurantId,
    uid: actor.uid,
    status: 'open',
    openedAt: new Date().toISOString(),
  });
  await authAdmin.setCustomUserClaims(actor.uid, {
    role: 'diner',
    restaurantId: data.restaurantId,
    tableId: String(data.tableId),
    sessionId,
  });
  return { sessionId, tableId: String(data.tableId), restaurantId: data.restaurantId };
}

async function addOutlet(db, authAdmin, actor, data) {
  if (!actor || !['owner', 'platformAdmin'].includes(actor.role)) throw httpError(403, 'Only an owner can add an outlet.');
  if (!data.restaurantId || !data.name) throw httpError(400, 'Outlet needs an id and a name.');
  const ids = new Set([...(actor.restaurantIds || []), actor.restaurantId, data.restaurantId].filter(Boolean));
  await authAdmin.setCustomUserClaims(actor.uid, {
    role: actor.role,
    restaurantId: actor.restaurantId || data.restaurantId,
    restaurantIds: [...ids],
  });
  await restaurant(db, data.restaurantId).collection('profile').doc('public').set({
    name: data.name,
    restaurantId: data.restaurantId,
    ownerUid: actor.uid,
    cgstRate: 2.5,
    sgstRate: 2.5,
    sac: '996331',
    theme: { preset: data.preset || 'olive' },
  }, { merge: true });
  return { restaurantIds: [...ids] };
}

async function clock(db, _authAdmin, actor, data) {
  if (!actor || !core.ROLES.includes(actor.role) || actor.role === 'diner') throw httpError(403, 'Staff only.');
  if (!owns(actor, data.restaurantId)) throw httpError(403, 'That restaurant is not on this login.');
  const day = data.businessDate || core.businessDate();
  const ref = restaurant(db, data.restaurantId).collection('attendance').doc(`${actor.uid}_${day}`);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : { uid: actor.uid, businessDate: day, punches: [] };
  current.punches = [...(current.punches || []), { type: data.punch, at: new Date().toISOString() }];
  await ref.set(current);
  return { attendance: current };
}

async function finalisePayroll(db, _authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'payroll');
  const rows = (data.rows || []).map((row) => core.netPay({
    agreed: row.agreed,
    tax: row.tax,
    deductions: row.deductions,
    allowNegative: Boolean(data.allowNegative && actor.role === 'owner'),
  }));
  const id = data.runId || `pay_${core.businessDate()}`;
  const run = { id, rows, finalisedBy: actor.uid, finalisedAt: new Date().toISOString() };
  await restaurant(db, data.restaurantId).collection('payrollRuns').doc(id).set(run);
  return { payroll: run };
}

async function saveReservation(db, _authAdmin, actor, data) {
  assertStaff(actor, data.restaurantId, 'reservations');
  const snap = await restaurant(db, data.restaurantId).collection('reservations').get();
  const existing = snap.docs.map((doc) => doc.data());
  const candidate = {
    tableId: String(data.tableId),
    startAt: data.startAt,
    endAt: data.endAt,
    name: data.name || '',
    phone: data.phone || '',
    status: 'booked',
  };
  if (core.reservationOverlaps(existing, candidate)) throw httpError(400, 'That table is already reserved then.');
  const id = `rsv_${crypto.randomBytes(6).toString('hex')}`;
  await restaurant(db, data.restaurantId).collection('reservations').doc(id).set({ id, ...candidate });
  return { reservation: { id, ...candidate } };
}

module.exports = {
  placeOrder,
  updateItemStatus,
  serviceRequest,
  acknowledgeServiceRequest,
  moveTable,
  mergeTables,
  splitBill,
  recordPayment,
  applyManagerDiscount,
  voidOrder,
  closeDay,
  saveFeedback,
  issueCounterCode,
  confirmCounterPayment,
  bootstrapAccount,
  createStaffUser,
  openTableSession,
  addOutlet,
  clock,
  finalisePayroll,
  saveReservation,
};
