const test = require('node:test');
const assert = require('node:assert/strict');
const handlers = require('./orderHandlers');

function memoryDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  function docApi(path) {
    return {
      id: path.split('/').pop(),
      async get() {
        const data = docs.get(path);
        return {
          exists: data !== undefined,
          id: path.split('/').pop(),
          data: () => data,
        };
      },
      async set(value, options) {
        const prev = docs.get(path);
        const next = options && options.merge && prev ? { ...prev, ...value } : value;
        docs.set(path, JSON.parse(JSON.stringify(next)));
      },
      collection(name) {
        return colApi(`${path}/${name}`);
      },
    };
  }
  function colApi(path) {
    const filters = [];
    const api = {
      doc(id) {
        return docApi(`${path}/${id}`);
      },
      where(field, op, value) {
        if (op !== '==') throw new Error(`unsupported ${op}`);
        filters.push({ field, value });
        return api;
      },
      async get() {
        const prefix = `${path}/`;
        const rows = [...docs.entries()].filter(([key, data]) => {
          if (!key.startsWith(prefix) || key.slice(prefix.length).includes('/')) return false;
          return filters.every((filter) => data[filter.field] === filter.value);
        });
        return {
          empty: rows.length === 0,
          docs: rows.map(([key, data]) => ({
            id: key.slice(prefix.length),
            data: () => data,
            ref: docApi(key),
          })),
        };
      },
    };
    return api;
  }
  return {
    collection(name) {
      return colApi(name);
    },
    dump() {
      return Object.fromEntries(docs.entries());
    },
  };
}

function memoryAuth() {
  const users = [];
  return {
    async createUser({ email, password, displayName }) {
      const user = { uid: `uid_${users.length + 1}`, email, displayName };
      users.push({ ...user, claims: null, password });
      return user;
    },
    async setCustomUserClaims(uid, claims) {
      let user = users.find((row) => row.uid === uid);
      if (!user) {
        user = { uid, email: null, claims: null };
        users.push(user);
      }
      user.claims = claims;
    },
    users() {
      return users;
    },
  };
}

const diner = { uid: 'diner1', role: 'diner', restaurantId: 'spice', tableId: 'T1', sessionId: 'sess1' };
const cashier = { uid: 'cash1', role: 'cashier', restaurantId: 'spice', restaurantIds: ['spice'] };
const manager = { uid: 'mgr1', role: 'manager', restaurantId: 'spice', restaurantIds: ['spice'] };
const kitchen = { uid: 'kit1', role: 'kitchen', restaurantId: 'spice', restaurantIds: ['spice'] };

function seeded() {
  return memoryDb({
    'Restaurant/spice/profile/public': { name: 'Spice Room', cgstRate: 2.5, sgstRate: 2.5, googleReviewUrl: 'https://g.page/spice' },
    'Restaurant/spice/menu/dosa': { name: 'Masala Dosa', price: 100, diet: 'veg', station: 'tandoor' },
    'Restaurant/spice/menu/omelette': { name: 'Omelette', price: 70, diet: 'egg', station: 'kitchen' },
    'Restaurant/spice/tables/T1': { label: 'T1' },
    'Restaurant/spice/tables/T2': { label: 'T2' },
    'Restaurant/spice/inventory/rice': { name: 'Rice', stock: 100, minStock: 90 },
    'Restaurant/spice/recipes/dosa': { items: [{ inventoryId: 'rice', qty: 20 }] },
  });
}

test('bootstrap creates an owner and does not store the password', async () => {
  const db = memoryDb();
  const auth = memoryAuth();
  const result = await handlers.bootstrapAccount(db, auth, {
    secret: 'one-time',
    configuredSecret: 'one-time',
    email: 'owner@spice.example',
    password: 'correct-horse',
    role: 'owner',
    restaurantId: 'spice',
    restaurantName: 'Spice Room',
  });
  assert.equal(result.role, 'owner');
  const dumped = JSON.stringify(db.dump());
  assert.equal(dumped.includes('correct-horse'), false);
  assert.equal(db.dump()['Restaurant/spice/profile/public'].name, 'Spice Room');
  assert.equal(auth.users()[0].claims.role, 'owner');
  await assert.rejects(
    () => handlers.bootstrapAccount(db, auth, { secret: 'nope', configuredSecret: 'one-time', role: 'owner', email: 'a@b.co', password: '12345678', restaurantId: 'x' }),
    /does not match/
  );
});

test('a manager cannot create an owner, and the new login is not a plaintext password', async () => {
  const db = seeded();
  const auth = memoryAuth();
  await assert.rejects(
    () => handlers.createStaffUser(db, auth, manager, {
      restaurantId: 'spice', email: 'o@spice.example', password: '12345678', role: 'owner', name: 'Nope',
    }),
    /cannot create/
  );
  const created = await handlers.createStaffUser(db, auth, manager, {
    restaurantId: 'spice', email: 'cap@spice.example', password: '12345678', role: 'captain', name: 'Captain',
  });
  assert.equal(created.role, 'captain');
  assert.equal('password' in created, false);
  const staff = db.dump()[`Restaurant/spice/staff/${created.uid}`];
  assert.equal(staff.password, undefined);
  assert.equal(JSON.stringify(staff).includes('12345678'), false);
});

test('the server prices the order from the menu and ignores a client total', async () => {
  const db = seeded();
  const first = await handlers.placeOrder(db, null, diner, {
    restaurantId: 'spice',
    sessionId: 'sess1',
    tableId: 'T1',
    amount: 1,
    total: 1,
    items: [{ menuItemId: 'dosa', qty: 1, size: 'large' }],
  });
  assert.equal(first.order.lines[0].unitPrice, 150);
  assert.equal(first.order.total, 157.5);
  assert.equal(first.order.cgst, 3.75);
  assert.equal(first.order.verificationCode, undefined);
  assert.equal(db.dump()['Restaurant/spice/inventory/rice'].stock, 80);
  const second = await handlers.placeOrder(db, null, diner, {
    restaurantId: 'spice',
    sessionId: 'sess1',
    tableId: 'T1',
    items: [{ menuItemId: 'omelette', qty: 1 }],
  });
  assert.equal(second.order.id, first.order.id);
  assert.equal(second.order.lines.length, 2);
  assert.equal(second.order.subtotal, 220);
});

test('counter code is only for staff and a wrong guess does not reveal it', async () => {
  const db = seeded();
  const placed = await handlers.placeOrder(db, null, diner, {
    restaurantId: 'spice', sessionId: 'sess1', tableId: 'T1', items: [{ menuItemId: 'omelette', qty: 1 }],
  });
  await assert.rejects(
    () => handlers.issueCounterCode(db, null, diner, { restaurantId: 'spice', orderId: placed.order.id }),
    /do not have access/
  );
  const issued = await handlers.issueCounterCode(db, null, cashier, { restaurantId: 'spice', orderId: placed.order.id });
  assert.match(issued.code, /^\d{4}$/);
  const wrong = await handlers.confirmCounterPayment(db, null, cashier, {
    restaurantId: 'spice', orderId: placed.order.id, code: issued.code === '0000' ? '0001' : '0000', amount: placed.order.total,
  });
  assert.equal(wrong.ok, false);
  assert.equal(String(wrong.error).includes(issued.code), false);
  const paid = await handlers.confirmCounterPayment(db, null, cashier, {
    restaurantId: 'spice', orderId: placed.order.id, code: issued.code, amount: placed.order.total, method: 'cash',
  });
  assert.equal(paid.order.status, 'paid');
  assert.match(paid.order.invoiceNumber, /^INV\//);
  assert.equal(paid.order.cgst > 0, true);
});

test('kitchen cannot void, a manager can, and the reason is kept', async () => {
  const db = seeded();
  const placed = await handlers.placeOrder(db, null, diner, {
    restaurantId: 'spice', sessionId: 'sess1', tableId: 'T1', items: [{ menuItemId: 'omelette', qty: 1 }],
  });
  await assert.rejects(
    () => handlers.voidOrder(db, null, kitchen, { restaurantId: 'spice', orderId: placed.order.id, reason: 'no' }),
    /do not have access/
  );
  const voided = await handlers.voidOrder(db, null, manager, {
    restaurantId: 'spice', orderId: placed.order.id, reason: 'Guest left',
  });
  assert.equal(voided.order.status, 'void');
  assert.equal(voided.order.voidReason, 'Guest left');
});

test('partial cash leaves a balance, and a low rating does not open Google reviews', async () => {
  const db = seeded();
  const placed = await handlers.placeOrder(db, null, diner, {
    restaurantId: 'spice', sessionId: 'sess1', tableId: 'T1', items: [{ menuItemId: 'omelette', qty: 1 }],
  });
  const part = await handlers.recordPayment(db, null, cashier, {
    restaurantId: 'spice', orderId: placed.order.id, amount: 10, method: 'upi',
  });
  assert.equal(part.order.status, 'open');
  assert.equal(part.remaining, 63.5);
  const feedback = await handlers.saveFeedback(db, null, diner, {
    restaurantId: 'spice', sessionId: 'sess1', orderId: placed.order.id, rating: 2, comment: 'slow',
  });
  assert.equal(feedback.review.show, false);
  const happy = await handlers.saveFeedback(db, null, diner, {
    restaurantId: 'spice', sessionId: 'sess1', orderId: placed.order.id, rating: 5, comment: 'great',
  });
  assert.equal(happy.review.show, true);
});

test('payroll cannot finalise a negative net', async () => {
  const db = seeded();
  await assert.rejects(
    () => handlers.finalisePayroll(db, null, manager, {
      restaurantId: 'spice',
      rows: [{ agreed: 50, tax: 200, deductions: 0 }],
    }),
    /below zero/
  );
});

test('a diner session is bound to one table', async () => {
  const db = seeded();
  const auth = memoryAuth();
  const session = await handlers.openTableSession(db, auth, { uid: 'anon1' }, { restaurantId: 'spice', tableId: 'T1' });
  assert.equal(session.tableId, 'T1');
  await assert.rejects(
    () => handlers.openTableSession(db, auth, { uid: 'anon1' }, { restaurantId: 'spice', tableId: 'missing' }),
    /not set up/
  );
});
