const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, ordersFromCustomer, payoutFromRestaurant } = require('./migrate-orders');

test('dry run is the default and the live project needs an extra flag', () => {
  assert.equal(parseArgs([]).commit, false);
  assert.equal(parseArgs(['--commit', '--i-understand-this-is-live']).live, true);
});

test('old customer arrays become order documents and bank fields move aside', () => {
  const orders = ordersFromCustomer('spice', '+9198', {
    pastOrders: [{ id: 'o1', total: 100, paymentStatus: 'paid' }],
  });
  assert.equal(orders[0].id, 'o1');
  assert.equal(orders[0].restaurantId, 'spice');
  assert.equal(orders[0].migratedFrom, 'customers.pastOrders');
  assert.deepEqual(payoutFromRestaurant({ account: '123', IFSC: 'HDFC0001', name: 'Spice' }), {
    account: '123',
    ifsc: 'HDFC0001',
  });
  assert.equal(payoutFromRestaurant({ name: 'Spice' }), null);
});
