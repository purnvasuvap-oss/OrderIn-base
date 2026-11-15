const assert = require('assert');
const {
  priceItems,
  portionMultiplier,
  unitRupees,
  amountsMatchPaise,
  signaturesMatch,
  isRevokedCredential,
  loadRazorpayCredentials,
} = require('./paymentGuard');

const menu = [
  { id: 'chilli', data: () => ({ name: 'Chicken Chilli', price: 150 }) },
  { id: 'coke', data: () => ({ name: 'Coke', price: '₹40' }) },
  { id: 'biryani', data: () => ({ name: 'Biryani', price: 200, priceLarge: 280 }) },
];

const chilli = priceItems(menu, [{ id: 'chilli', name: 'Chicken Chilli', quantity: 1 }]);
assert.strictEqual(chilli.subtotal, 150);
assert.strictEqual(chilli.tax, 7.5);
assert.strictEqual(chilli.total, 157.5);
assert.strictEqual(chilli.paise, 15750);

const large = priceItems(menu, [{ name: 'Chicken Chilli', quantity: 1, portion: 'Large' }]);
assert.strictEqual(large.subtotal, 225);
assert.strictEqual(large.paise, 23625);

const explicit = priceItems(menu, [{ name: 'Biryani', quantity: 2, instructions: 'Portion: Large' }]);
assert.strictEqual(explicit.subtotal, 560);

const pricedOption = unitRupees(
  { price: 100, priceLarge: 130 },
  { customizations: [{ label: 'Portion', option: 'Large' }] }
);
assert.strictEqual(pricedOption, 130);
assert.strictEqual(portionMultiplier({ portion: 'Extra Large' }), 2);

assert.strictEqual(amountsMatchPaise(15750, 15750), true);
assert.strictEqual(amountsMatchPaise(100, 15750), false);

assert.strictEqual(signaturesMatch('1234', '1234'), true);
assert.strictEqual(signaturesMatch('1234', '9999'), false);
assert.strictEqual(signaturesMatch('1234', '12345'), false);

assert.strictEqual(isRevokedCredential('rzp_test_not_leaked'), false);
assert.strictEqual(isRevokedCredential(''), false);

const creds = loadRazorpayCredentials('', 'rzp_test_fresh', '', 'fresh_secret');
assert.strictEqual(creds.keyId, 'rzp_test_fresh');
assert.strictEqual(creds.keySecret, 'fresh_secret');

const missing = loadRazorpayCredentials('', '', '', '');
assert.strictEqual(missing.keyId, '');
assert.strictEqual(missing.keySecret, '');

assert.throws(() => priceItems(menu, [{ name: 'Not on the menu', quantity: 1 }]), /Menu item not found/);
assert.throws(() => priceItems(menu, []), /no items/);

console.log('paymentGuard tests passed');
