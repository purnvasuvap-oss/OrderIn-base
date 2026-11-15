const { roundRupees } = require('./billing');

const ROLES = ['platformAdmin', 'owner', 'manager', 'captain', 'cashier', 'kitchen', 'diner'];

const ACTIONS = {
  'orders.read': ['platformAdmin', 'owner', 'manager', 'captain', 'cashier', 'kitchen'],
  'orders.status.preparing': ['owner', 'manager', 'kitchen'],
  'orders.status.served': ['owner', 'manager', 'captain'],
  'tables.move': ['owner', 'manager', 'captain'],
  'tables.merge': ['owner', 'manager', 'captain'],
  'discount.approve': ['owner', 'manager'],
  'void': ['owner', 'manager'],
  'day.close': ['owner', 'manager', 'cashier'],
  'payroll': ['owner', 'manager'],
  'reports': ['owner', 'manager', 'platformAdmin'],
  'menu.write': ['owner', 'manager'],
  'staff.create': ['platformAdmin', 'owner', 'manager'],
  'counter.view': ['owner', 'manager', 'captain', 'cashier'],
  'crm': ['owner', 'manager'],
  'inventory': ['owner', 'manager', 'kitchen'],
  'reservations': ['owner', 'manager', 'captain'],
  'onboarding': ['owner', 'platformAdmin'],
  'outlets': ['owner', 'platformAdmin'],
};

function can(role, action) {
  return (ACTIONS[action] || []).includes(role);
}

function managerMayCreate(actorRole, newRole) {
  if (actorRole === 'platformAdmin') return ROLES.includes(newRole) && newRole !== 'diner';
  if (actorRole === 'owner') return ['owner', 'manager', 'captain', 'cashier', 'kitchen'].includes(newRole);
  if (actorRole === 'manager') return ['captain', 'cashier', 'kitchen'].includes(newRole);
  return false;
}

function sameMonthDay(birthday, today) {
  const birth = new Date(birthday);
  const now = new Date(today);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(now.getTime())) return false;
  return birth.getMonth() === now.getMonth() && birth.getDate() === now.getDate();
}

function awardPoints({ spend, ratePerRupee = 1, birthday, today }) {
  const base = Math.floor(Math.max(0, Number(spend) || 0) * Number(ratePerRupee || 0));
  const birthdayBonus = birthday && today && sameMonthDay(birthday, today) ? base : 0;
  return { points: base + birthdayBonus, birthdayBonus };
}

function addStamps(previous, qualifying = true) {
  const stamps = Math.max(0, Number(previous) || 0) + (qualifying ? 1 : 0);
  return { stamps, reward: stamps > 0 && stamps % 10 === 0 };
}

function bumpProfile(profile, order) {
  const current = profile || { visitCount: 0, spend: 0, dishes: {}, optIn: false };
  const dishes = { ...current.dishes };
  (order.items || order.lines || []).forEach((line) => {
    const name = line.name || 'Item';
    dishes[name] = (dishes[name] || 0) + Number(line.qty || line.quantity || 1);
  });
  const favourite = Object.entries(dishes).sort((a, b) => b[1] - a[1])[0];
  return {
    ...current,
    visitCount: Number(current.visitCount || 0) + 1,
    spend: roundRupees(Number(current.spend || 0) + Number(order.total || 0)),
    dishes,
    favouriteDish: favourite ? favourite[0] : null,
    lastVisitAt: order.paidAt || order.createdAt || new Date().toISOString(),
  };
}

function deductStock(inventory, recipes, lines) {
  const next = (inventory || []).map((item) => ({ ...item }));
  const byId = new Map(next.map((item) => [item.id, item]));
  const alerts = [];
  (lines || []).forEach((line) => {
    const recipe = (recipes && recipes[line.menuItemId]) || line.recipe || [];
    recipe.forEach((part) => {
      const item = byId.get(part.inventoryId);
      if (!item) return;
      item.stock = roundRupees(Number(item.stock || 0) - Number(part.qty || 0) * Number(line.qty || 1));
    });
  });
  next.forEach((item) => {
    if (Number(item.stock) <= Number(item.minStock || 0)) {
      alerts.push({ id: item.id, name: item.name, stock: item.stock, minStock: item.minStock || 0 });
    }
  });
  return { inventory: next, alerts };
}

function netPay({ agreed, tax = 0, deductions = 0, allowNegative = false }) {
  const gross = Number(agreed);
  if (!Number.isFinite(gross) || gross < 0) throw new Error('Agreed pay must be zero or more');
  const net = roundRupees(gross - Number(tax || 0) - Number(deductions || 0));
  if (net < 0 && !allowNegative) {
    const error = new Error('Net pay cannot go below zero without an explicit override.');
    error.code = 'NET_NEGATIVE';
    throw error;
  }
  return { agreed: roundRupees(gross), tax: roundRupees(tax), deductions: roundRupees(deductions), net, override: net < 0 };
}

function dayClose(orders, { cashCounted }) {
  const paid = (orders || []).filter((order) => order.status === 'paid' || order.paymentStatus === 'paid');
  const byMethod = {};
  paid.forEach((order) => {
    const payments = Array.isArray(order.payments) && order.payments.length
      ? order.payments
      : [{ method: order.paymentMethod || 'unknown', amount: order.total }];
    payments.forEach((payment) => {
      const key = String(payment.method || 'unknown').toLowerCase();
      byMethod[key] = roundRupees((byMethod[key] || 0) + Number(payment.amount || 0));
    });
  });
  const expectedCash = byMethod.cash || 0;
  const counted = roundRupees(Number(cashCounted || 0));
  return {
    byMethod,
    expectedCash,
    cashCounted: counted,
    variance: roundRupees(counted - expectedCash),
    orderCount: paid.length,
    sales: roundRupees(paid.reduce((sum, order) => sum + Number(order.total || 0), 0)),
  };
}

function reservationOverlaps(existing, candidate) {
  const start = new Date(candidate.startAt).getTime();
  const end = new Date(candidate.endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Reservation end must be after the start');
  }
  return (existing || []).some((row) => {
    if (row.tableId !== candidate.tableId) return false;
    if (row.status === 'cancelled') return false;
    const rowStart = new Date(row.startAt).getTime();
    const rowEnd = new Date(row.endAt).getTime();
    return start < rowEnd && end > rowStart;
  });
}

const TABLE_STATUSES = ['free', 'ordered', 'eating', 'bill_requested', 'paid'];

function tableStatusFromOrder(order) {
  if (!order) return 'free';
  if (order.status === 'void') return 'free';
  if (order.status === 'paid') return 'paid';
  if (order.status === 'bill_requested') return 'bill_requested';
  const items = order.lines || order.items || [];
  if (items.some((item) => item.status === 'served')) return 'eating';
  if (items.length) return 'ordered';
  return 'free';
}

function mergeRecords(local, remote) {
  if (!remote) return { merged: local, conflict: false, resolution: 'local-only' };
  if (!local) return { merged: remote, conflict: false, resolution: 'remote-only' };
  const statusRank = { placed: 1, open: 1, preparing: 2, served: 3, bill_requested: 4, paid: 5, void: 9, cancelled: 9 };
  if (local.status && remote.status && local.status !== remote.status) {
    const localRank = statusRank[local.status] || 0;
    const remoteRank = statusRank[remote.status] || 0;
    if (remoteRank > localRank) return { merged: { ...local, status: remote.status }, conflict: false, resolution: 'remote-status-ahead' };
    if (localRank > remoteRank) return { merged: local, conflict: false, resolution: 'local-status-ahead' };
  }
  const localUpdated = new Date(local.updatedAt || local.createdAt || 0).getTime();
  const remoteUpdated = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
  if (localUpdated === remoteUpdated) {
    const same = JSON.stringify(local) === JSON.stringify(remote);
    if (same) return { merged: local, conflict: false, resolution: 'same' };
    return { merged: null, conflict: true, local, remote, resolution: 'conflict' };
  }
  if (localUpdated > remoteUpdated) return { merged: local, conflict: false, resolution: 'local-newer' };
  return { merged: remote, conflict: false, resolution: 'remote-newer' };
}

module.exports = {
  ROLES,
  ACTIONS,
  can,
  managerMayCreate,
  awardPoints,
  addStamps,
  bumpProfile,
  deductStock,
  netPay,
  dayClose,
  reservationOverlaps,
  TABLE_STATUSES,
  tableStatusFromOrder,
  mergeRecords,
};
