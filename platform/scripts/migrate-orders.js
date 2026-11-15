#!/usr/bin/env node
/**
 * Copy old orders out of customers/{phone}.pastOrders into
 * Restaurant/{id}/orders/{orderId}.
 *
 * Also copy bank account / IFSC off the restaurant document into
 * Restaurant/{id}/private/payout so the diner app never needs to read them.
 *
 * This script does not delete the old fields. Read platform/docs/MIGRATIONS.md
 * before you run it. It refuses the live project orderin-7f8bc unless you pass
 * --i-understand-this-is-live, and even then it only writes when you pass --commit.
 *
 *   node platform/scripts/migrate-orders.js
 *   node platform/scripts/migrate-orders.js --commit
 */

const core = require('../packages/core/src/index.js');

function parseArgs(argv) {
  const args = { commit: false, live: false, project: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '' };
  argv.forEach((arg, index) => {
    if (arg === '--commit') args.commit = true;
    if (arg === '--i-understand-this-is-live') args.live = true;
    if (arg === '--project') args.project = argv[index + 1] || '';
  });
  return args;
}

function ordersFromCustomer(restaurantId, phone, data) {
  return core.legacyOrdersFromCustomer(phone, data).map((order) => ({
    ...order,
    restaurantId,
    migratedFrom: 'customers.pastOrders',
  })).filter((order) => order.id);
}

function payoutFromRestaurant(data) {
  if (!data || typeof data !== 'object') return null;
  const payout = {};
  if (data.account) payout.account = data.account;
  if (data.IFSC || data.ifsc) payout.ifsc = data.IFSC || data.ifsc;
  if (data.routeAccountId) payout.routeAccountId = data.routeAccountId;
  return Object.keys(payout).length ? payout : null;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error('Set GCLOUD_PROJECT or pass --project. Nothing was read.');
    process.exit(1);
  }
  if (args.project === 'orderin-7f8bc' && !args.live) {
    console.error('Refusing orderin-7f8bc. Take a backup first, then pass --i-understand-this-is-live. Nothing was read.');
    process.exit(1);
  }
  let admin;
  try {
    admin = require('firebase-admin');
  } catch (error) {
    console.error('Install firebase-admin in platform/functions first: npm install --prefix platform/functions');
    process.exit(1);
  }
  if (!admin.apps.length) admin.initializeApp({ projectId: args.project });
  const db = admin.firestore();
  const restaurants = await db.collection('Restaurant').get();
  let orderCount = 0;
  let payoutCount = 0;
  for (const restaurant of restaurants.docs) {
    const payout = payoutFromRestaurant(restaurant.data());
    if (payout) {
      payoutCount += 1;
      console.log(`${args.commit ? 'WRITE' : 'DRY'} payout ${restaurant.id}`);
      if (args.commit) {
        await restaurant.ref.collection('private').doc('payout').set(payout, { merge: true });
      }
    }
    const customers = await restaurant.ref.collection('customers').get();
    for (const customer of customers.docs) {
      const orders = ordersFromCustomer(restaurant.id, customer.id, customer.data());
      for (const order of orders) {
        orderCount += 1;
        console.log(`${args.commit ? 'WRITE' : 'DRY'} order ${restaurant.id}/${order.id}`);
        if (args.commit) {
          await restaurant.ref.collection('orders').doc(order.id).set(order, { merge: true });
        }
      }
    }
  }
  console.log(`${args.commit ? 'Wrote' : 'Would write'} ${orderCount} orders and ${payoutCount} payout docs. Old customer arrays were left in place.`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { parseArgs, ordersFromCustomer, payoutFromRestaurant };
