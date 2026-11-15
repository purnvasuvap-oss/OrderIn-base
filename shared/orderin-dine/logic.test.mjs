import assert from 'assert';
import {
  dietMark,
  allergenList,
  spiceLevel,
  mergeIntoOpenTableOrder,
  splitEqual,
  splitByItem,
  gstSplit,
  invoiceNumber,
  dayCloseTotals,
  applyRecipeDeduction,
  loyaltyStamp,
  toCsv,
  groupByStation,
  whatsAppLink,
} from './logic.js';

assert.strictEqual(dietMark({ diet: 'egg' }), 'egg');
assert.strictEqual(dietMark({ type: 'Non-Veg' }), 'nonveg');
assert.strictEqual(dietMark({ type: 'Veg' }), 'veg');
assert.strictEqual(dietMark({}), null);
assert.deepStrictEqual(allergenList({ allergens: 'nuts, milk' }), ['nuts', 'milk']);
assert.deepStrictEqual(allergenList({}), []);
assert.strictEqual(spiceLevel({}), null);
assert.strictEqual(spiceLevel({ spiceLevel: 2 }), 2);

const first = mergeIntoOpenTableOrder([], {
  id: 'A',
  tableNo: '4',
  items: [{ name: 'Tea', price: 20, quantity: 1 }],
  subtotal: 20,
  taxes: 1,
  total: 21,
  paymentStatus: 'unpaid',
  status: 'Pending',
});
assert.strictEqual(first.merged, false);
const second = mergeIntoOpenTableOrder(first.pastOrders, {
  id: 'B',
  tableNo: '4',
  items: [{ name: 'Cake', price: 40, quantity: 1 }],
  subtotal: 40,
  taxes: 2,
  total: 42,
  paymentStatus: 'unpaid',
  status: 'Pending',
});
assert.strictEqual(second.merged, true);
assert.strictEqual(second.orderId, 'A');
assert.strictEqual(second.order.items.length, 2);
assert.strictEqual(second.order.items[0].kitchenStatus, 'Placed');

assert.strictEqual(splitEqual(100, 3)[2].amount, 33.34);
assert.strictEqual(splitByItem(
  [{ price: 10, quantity: 2 }, { price: 5, quantity: 1 }],
  [{ label: 'A', itemIndexes: [0] }],
)[0].amount, 20);

const gst = gstSplit(200, 0.05);
assert.strictEqual(gst.cgst, 5);
assert.strictEqual(gst.sgst, 5);
assert.ok(invoiceNumber(3).startsWith('INV-'));

const close = dayCloseTotals([
  { paymentStatus: 'paid', total: 100, paymentMethod: 'Cash' },
  { paymentStatus: 'paid', total: 50, OnlinePayMethod: 'UPI' },
  { paymentStatus: 'unpaid', total: 80, paymentMethod: 'Cash' },
]);
assert.strictEqual(close.cash, 100);
assert.strictEqual(close.upi, 50);
assert.strictEqual(close.count, 2);

const stock = applyRecipeDeduction(
  [{ id: 'rice', stock: 100, minStock: 20 }],
  [{ inventoryId: 'rice', qty: 30 }],
  3,
);
assert.strictEqual(stock.inventory[0].stock, 10);
assert.strictEqual(stock.low.length, 1);
assert.strictEqual(loyaltyStamp(250, 1).points, 3);
assert.ok(toCsv([{ item: 'Tea', qty: 1 }]).includes('Tea'));
assert.strictEqual(groupByStation([{ name: 'Naan', station: 'Tandoor' }, { name: 'Tea' }]).length, 2);
assert.ok(whatsAppLink('9198', 'hi').includes('wa.me/9198'));

console.log('orderin-dine logic tests passed');
