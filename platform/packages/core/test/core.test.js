const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/index.js');

const menu = [
  { id: 'dosa', name: 'Masala Dosa', price: 80, diet: 'veg', spice: 'medium', allergens: ['dairy'], station: 'tandoor', priceLarge: 120 },
  { id: 'chicken', name: 'Chicken Chilli', price: 150, diet: 'nonveg', station: 'chinese', addons: [{ name: 'Extra sauce', price: 20 }] },
  { id: 'omelette', name: 'Omelette', price: 70, diet: 'egg', station: 'kitchen' },
];

test('large is not billed as regular, and packing or savings are never added', () => {
  const quote = core.quoteCart(menu, [
    { menuItemId: 'dosa', qty: 1, size: 'large' },
    { menuItemId: 'chicken', qty: 2 },
  ]);
  assert.equal(quote.lines[0].unitPrice, 120);
  assert.equal(quote.subtotal, 420);
  assert.equal(quote.cgst, 10.5);
  assert.equal(quote.sgst, 10.5);
  assert.equal(quote.total, 441);
  assert.equal(quote.packing, 0);
  assert.equal(quote.savings, 0);
  assert.equal(quote.deliveryFee, 0);
  assert.equal(quote.sac, '996331');
});

test('explicit large price wins over the 1.5x fallback', () => {
  const quote = core.quoteCart([{ id: 'coke', name: 'Coke', price: 40 }], [{ menuItemId: 'coke', qty: 1, size: 'Large' }]);
  assert.equal(quote.lines[0].unitPrice, 60);
});

test('addons add their own price and spice does not invent one', () => {
  const quote = core.quoteCart(menu, [{ menuItemId: 'chicken', qty: 1, options: ['Extra sauce'], notes: 'spicy' }]);
  assert.equal(quote.lines[0].unitPrice, 170);
});

test('a coupon that needs a manager is refused until someone approves it', () => {
  const quote = core.quoteCart(menu, [{ menuItemId: 'omelette', qty: 1 }]);
  assert.throws(() => core.applyCoupon(quote, { code: 'STAFF', type: 'flat', value: 20, requiresManager: true }, false), /Manager approval/);
  const approved = core.applyCoupon(quote, { code: 'STAFF', type: 'flat', value: 20, requiresManager: true }, true);
  assert.equal(approved.discount, 20);
  assert.equal(approved.taxable, 50);
});

test('equal split parts add back to the bill total', () => {
  const quote = core.quoteCart(menu, [{ menuItemId: 'dosa', qty: 1 }]);
  const parts = core.splitBill(quote, { mode: 'equal', parts: 3 });
  const sum = core.roundRupees(parts.reduce((total, part) => total + part.total, 0));
  assert.equal(sum, quote.total);
  assert.equal(parts.length, 3);
});

test('item split keeps each dish with the person who ordered it', () => {
  const quote = core.quoteCart(menu, [
    { menuItemId: 'dosa', qty: 1 },
    { menuItemId: 'omelette', qty: 1 },
  ]);
  const parts = core.splitBill(quote, {
    mode: 'by-item',
    groups: [
      { label: 'A', keys: [quote.lines[0].key] },
      { label: 'B', keys: [quote.lines[1].key] },
    ],
  });
  assert.equal(core.roundRupees(parts[0].total + parts[1].total), quote.total);
});

test('running bill keeps a preparing item and adds the new one', () => {
  const first = core.quoteCart(menu, [{ menuItemId: 'dosa', qty: 1 }]);
  first.lines[0].status = 'preparing';
  const next = core.buildRunningBill(menu, first.lines, [{ menuItemId: 'omelette', qty: 1 }], { cgstRate: 2.5, sgstRate: 2.5 });
  assert.equal(next.lines.length, 2);
  assert.equal(next.lines[0].status, 'preparing');
  assert.equal(next.lines[1].status, 'placed');
  assert.equal(next.subtotal, 150);
});

test('legacy customer arrays can still be read as orders', () => {
  const orders = core.legacyOrdersFromCustomer('+9198', { pastOrders: [{ id: 'o1', total: 100, paymentStatus: 'paid' }] });
  assert.equal(orders[0].source, 'customers.pastOrders');
  assert.equal(orders[0].status, 'paid');
  assert.equal(orders[0].legacy, true);
});

test('void needs a reason and an actor, and paid orders stay paid', () => {
  assert.throws(() => core.voidOrder({ status: 'open' }, { reason: '', actor: { id: 'm1' } }), /reason/);
  assert.throws(() => core.voidOrder({ status: 'paid' }, { reason: 'mistake', actor: { id: 'm1' } }), /paid/);
  const next = core.voidOrder({ status: 'open', id: 'o1' }, { reason: 'Guest left', actor: { id: 'm1', role: 'manager' } });
  assert.equal(next.status, 'void');
  assert.equal(next.voidReason, 'Guest left');
});

test('kitchen can start an item and only a captain can mark it served', () => {
  assert.equal(core.canTransitionItem('placed', 'preparing', 'kitchen'), true);
  assert.equal(core.canTransitionItem('placed', 'served', 'kitchen'), false);
  assert.equal(core.canTransitionItem('preparing', 'served', 'captain'), true);
  assert.equal(core.can('kitchen', 'payroll'), false);
  assert.equal(core.can('cashier', 'counter.view'), true);
  assert.equal(core.managerMayCreate('manager', 'owner'), false);
  assert.equal(core.managerMayCreate('owner', 'manager'), true);
});

test('invoice numbers are sequential and include the financial year', () => {
  assert.equal(core.financialYear(new Date('2026-11-15')), '2026-27');
  assert.equal(core.financialYear(new Date('2026-02-01')), '2025-26');
  assert.equal(core.formatInvoiceNumber({ financialYear: '2026-27', seq: 12 }), 'INV/2026-27/000012');
});

test('loyalty, stamps and profiles use real visits only', () => {
  const points = core.awardPoints({ spend: 200, ratePerRupee: 1, birthday: '1990-11-15', today: '2026-11-15' });
  assert.equal(points.birthdayBonus, 200);
  assert.equal(points.points, 400);
  assert.equal(core.addStamps(9).reward, true);
  const profile = core.bumpProfile({ visitCount: 1, spend: 100, dishes: { Dosa: 1 }, optIn: true }, {
    total: 50,
    lines: [{ name: 'Dosa', qty: 2 }],
  });
  assert.equal(profile.visitCount, 2);
  assert.equal(profile.favouriteDish, 'Dosa');
  assert.equal(profile.spend, 150);
});

test('recipes reduce stock and raise a low-stock alert', () => {
  const result = core.deductStock(
    [{ id: 'rice', name: 'Rice', stock: 100, minStock: 80 }],
    { dosa: [{ inventoryId: 'rice', qty: 30 }] },
    [{ menuItemId: 'dosa', qty: 1 }]
  );
  assert.equal(result.inventory[0].stock, 70);
  assert.equal(result.alerts[0].name, 'Rice');
});

test('payroll refuses a negative net unless the owner overrides it', () => {
  assert.throws(() => core.netPay({ agreed: 50, tax: 200 }), /below zero/);
  const overridden = core.netPay({ agreed: 50, tax: 200, allowNegative: true });
  assert.equal(overridden.net, -150);
  assert.equal(overridden.override, true);
});

test('day close reconciles cash against what the drawer should hold', () => {
  const close = core.dayClose([
    { status: 'paid', total: 100, payments: [{ method: 'Cash', amount: 40 }, { method: 'UPI', amount: 60 }] },
    { status: 'paid', total: 50, payments: [{ method: 'Card', amount: 50 }] },
  ], { cashCounted: 30 });
  assert.equal(close.expectedCash, 40);
  assert.equal(close.byMethod.upi, 60);
  assert.equal(close.variance, -10);
});

test('two reservations cannot take the same table at the same time', () => {
  const existing = [{ tableId: 'T1', startAt: '2026-11-15T19:00:00', endAt: '2026-11-15T20:00:00', status: 'booked' }];
  assert.equal(core.reservationOverlaps(existing, { tableId: 'T1', startAt: '2026-11-15T19:30:00', endAt: '2026-11-15T20:30:00' }), true);
  assert.equal(core.reservationOverlaps(existing, { tableId: 'T2', startAt: '2026-11-15T19:30:00', endAt: '2026-11-15T20:30:00' }), false);
});

test('table status follows the order, and sync conflicts stay visible', () => {
  assert.equal(core.tableStatusFromOrder({ status: 'open', lines: [{ status: 'served' }] }), 'eating');
  assert.equal(core.tableStatusFromOrder({ status: 'bill_requested', lines: [] }), 'bill_requested');
  const clash = core.mergeRecords(
    { id: '1', status: 'open', updatedAt: '2026-11-15T10:00:00Z', note: 'a' },
    { id: '1', status: 'open', updatedAt: '2026-11-15T10:00:00Z', note: 'b' }
  );
  assert.equal(clash.conflict, true);
  const ahead = core.mergeRecords({ status: 'open', updatedAt: '2026-11-15T09:00:00Z' }, { status: 'paid', updatedAt: '2026-11-15T08:00:00Z' });
  assert.equal(ahead.merged.status, 'paid');
});

test('restaurant comes from the link or subdomain, never a built-in demo id', () => {
  const fromLink = core.resolveRestaurantRef({ host: 'menu.example.com', search: '?r=cafe_12&table=4' });
  assert.equal(fromLink.restaurantId, 'cafe_12');
  assert.equal(fromLink.tableId, '4');
  const fromHost = core.resolveRestaurantRef({ host: 'spice.orderin.app', search: '' });
  assert.equal(fromHost.restaurantId, '');
  assert.equal(fromHost.subdomain, 'spice');
  assert.equal(core.resolveRestaurantRef({ host: 'localhost:5173' }).restaurantId, '');
  assert.equal(core.tableQrUrl({ origin: 'https://menu.example.com', restaurantId: 'cafe_12', tableId: '4' }), 'https://menu.example.com/?r=cafe_12&table=4');
});

test('theme presets are config, and missing features stay available', () => {
  const vars = core.themeToCssVars({ preset: 'maroon', primary: '#123456' });
  assert.equal(vars['--oi-primary'], '#123456');
  assert.equal(vars['--oi-font'].includes('Georgia'), true);
  assert.equal(core.featureOn({ features: { loyalty: false } }, 'loyalty'), false);
  assert.equal(core.featureOn({}, 'splitBill'), true);
});

test('bills can be shared, and Google review waits for a good internal score', () => {
  const text = core.billText({ restaurant: { name: 'Spice' }, order: { id: 'o1', invoiceNumber: 'INV/2026-27/000001', subtotal: 100, cgst: 2.5, sgst: 2.5, total: 105, lines: [{ qty: 1, name: 'Dosa', lineTotal: 100 }] } });
  assert.match(text, /CGST/);
  assert.equal(core.whatsappLink('9876543210', text).startsWith('https://wa.me/919876543210?text='), true);
  assert.equal(core.reviewPrompt({ rating: 5, googleReviewUrl: 'https://g.page/spice' }).show, true);
  assert.equal(core.reviewPrompt({ rating: 2, googleReviewUrl: 'https://g.page/spice' }).show, false);
  assert.equal(core.reviewPrompt({ rating: 5, googleReviewUrl: '' }).show, false);
});

test('menu CSV import reads diet, station and a large price', () => {
  const items = core.parseMenuCsv('name,price,category,diet,station,allergens,spice,priceLarge\nDosa,80,Tiffin,veg,tandoor,dairy|nuts,medium,120\n');
  assert.equal(items[0].priceLarge, 120);
  assert.deepEqual(items[0].allergens, ['dairy', 'nuts']);
  assert.equal(items[0].station, 'tandoor');
});

test('error logging stays off unless a real DSN is configured', () => {
  assert.equal(core.loggingEnabled(''), false);
  assert.equal(core.loggingEnabled('https://placeholder@sentry.example/1'), false);
  assert.equal(core.loggingEnabled('https://abc123@o123.ingest.sentry.io/456'), true);
});

test('KOT is split by station and the bill shows CGST and SGST', () => {
  const quote = core.quoteCart(menu, [{ menuItemId: 'dosa', qty: 1 }, { menuItemId: 'chicken', qty: 1 }]);
  const tickets = core.kotByStation({ tableId: '4', lines: quote.lines }, { name: 'Spice' });
  assert.equal(tickets.length, 2);
  const kot = Buffer.from(tickets[0].bytes).toString('latin1');
  assert.match(kot, /Table 4/);
  const bill = Buffer.from(core.billBytes({
    restaurant: { name: 'Spice', gstin: '29ABCDE1234F1Z5', fssai: '12345678901234' },
    order: { ...quote, invoiceNumber: 'INV/2026-27/000008', tableId: '4' },
  })).toString('latin1');
  assert.match(bill, /CGST/);
  assert.match(bill, /SGST/);
  assert.match(bill, /996331/);
  assert.match(bill, /FSSAI/);
});

test('reports cover sales, GST and a Tally-style export', () => {
  const orders = [{
    status: 'paid',
    createdAt: '2026-11-15T13:00:00Z',
    invoiceNumber: 'INV/2026-27/000001',
    subtotal: 100,
    discount: 0,
    cgst: 2.5,
    sgst: 2.5,
    tax: 5,
    total: 105,
    sac: '996331',
    lines: [{ name: 'Dosa', qty: 2, lineTotal: 100 }],
    takenBy: { id: 'c1', name: 'Asha' },
  }];
  const summary = core.salesSummary(orders, { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(summary.sales, 105);
  assert.equal(core.itemWise(orders)[0].qty, 2);
  const gst = core.gstReport(orders);
  assert.equal(gst[0].cgst, 2.5);
  const csv = core.toCsv(core.tallyVoucherRows(orders));
  assert.match(csv, /Output CGST/);
  assert.equal(core.staffPerformance(orders)[0].name, 'Asha');
});
