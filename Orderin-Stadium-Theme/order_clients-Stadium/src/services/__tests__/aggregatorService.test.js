import { vi } from 'vitest';

// In-memory Firestore stand-in for the few calls the service makes.
const docs = new Map();
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  query: vi.fn((col, ...c) => ({ col, c })),
  where: vi.fn((...a) => a),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(async (ref, data) => {
    docs.set(ref.path, JSON.parse(JSON.stringify(data)));
  }),
  runTransaction: vi.fn(async (_db, fn) =>
    fn({
      get: async (ref) => ({ exists: () => docs.has(ref.path), data: () => docs.get(ref.path) }),
      update: (ref, patch) => docs.set(ref.path, { ...docs.get(ref.path), ...patch }),
    })
  ),
}));

const svc = await import('../aggregatorService');
const PATH = (id) => `Restaurant/${svc.RESTAURANT_ID}/aggregatorOrders/${id}`;
const put = (id, data) => docs.set(PATH(id), data);

const placed = (extra = {}) => ({
  platform: 'swiggy',
  externalOrderId: 'SW-1',
  status: 'placed',
  receivedAt: 1000,
  acceptBy: 181000,
  customer: { name: 'Ravi', phoneMasked: '•••••2345' },
  items: [{ name: 'Dosa', quantity: 2, unitPrice: 90, addons: [{ name: 'Ghee', price: 10 }], instructions: 'crispy' }],
  amounts: { subtotal: 200, taxes: 10, total: 210 },
  payment: { mode: 'prepaid' },
  ...extra,
});

beforeEach(() => docs.clear());

describe('toStaffOrder', () => {
  it('maps an aggregator order onto the Orders page shape', () => {
    const o = svc.toStaffOrder('swiggy_SW-1', placed());
    expect(o).toMatchObject({
      id: 'swiggy_SW-1',
      isAggregator: true,
      platformLabel: 'Swiggy',
      status: 'Pending',
      aggregatorStatus: 'placed',
      username: 'Ravi',
      phoneNumber: '•••••2345',
      totalCost: 210,
      paymentStatus: 'paid',
      paymentType: 'Paid on Swiggy',
    });
    expect(o.items[0]).toEqual({ name: 'Dosa', quantity: 2, price: 90, instructions: '+ Ghee · crispy' });
  });

  it.each([
    ['accepted', 'Preparing'],
    ['ready', 'Ready'],
    ['picked_up', 'Delivered'],
    ['delivered', 'Delivered'],
    ['rejected', 'Rejected'],
    ['cancelled', 'Rejected'],
  ])('%s -> %s', (agg, staff) => {
    expect(svc.toStaffOrder('x', placed({ status: agg })).status).toBe(staff);
  });

  it('labels cash-on-delivery as collected by the rider', () => {
    expect(svc.toStaffOrder('x', placed({ platform: 'zomato', payment: { mode: 'cod' } })).paymentType).toBe('Cash to Zomato rider');
  });
});

describe('staff actions', () => {
  it('accepts with a prep time and marks the change as made by staff', async () => {
    put('swiggy_SW-1', placed());
    await svc.acceptAggregatorOrder('swiggy_SW-1', 20);
    expect(docs.get(PATH('swiggy_SW-1'))).toMatchObject({ status: 'accepted', statusSource: 'staff', prepMinutes: 20 });
  });

  it('refuses to accept without a prep time', async () => {
    put('swiggy_SW-1', placed());
    await expect(svc.acceptAggregatorOrder('swiggy_SW-1', null)).rejects.toThrow('Choose a preparation time.');
  });

  it('rejects only with a listed reason', async () => {
    put('swiggy_SW-1', placed());
    await expect(svc.rejectAggregatorOrder('swiggy_SW-1', 'because')).rejects.toThrow('Choose a reason.');
    await svc.rejectAggregatorOrder('swiggy_SW-1', 'kitchen_busy');
    expect(docs.get(PATH('swiggy_SW-1'))).toMatchObject({ status: 'rejected', rejectReason: 'kitchen_busy' });
  });

  it('explains when the platform already cancelled the order', async () => {
    put('swiggy_SW-1', placed({ status: 'cancelled' }));
    await expect(svc.acceptAggregatorOrder('swiggy_SW-1', 15)).rejects.toThrow('Swiggy cancelled this order.');
  });

  it('moves forward only: Ready, then handed over', async () => {
    put('swiggy_SW-1', placed({ status: 'accepted' }));
    await expect(svc.advanceAggregatorOrder('swiggy_SW-1', 'Delivered')).rejects.toThrow(/Can't change this order/);
    await svc.advanceAggregatorOrder('swiggy_SW-1', 'Ready');
    expect(docs.get(PATH('swiggy_SW-1')).status).toBe('ready');
    await svc.advanceAggregatorOrder('swiggy_SW-1', 'Delivered');
    expect(docs.get(PATH('swiggy_SW-1')).status).toBe('picked_up');
    expect(await svc.advanceAggregatorOrder('swiggy_SW-1', 'Preparing')).toBeNull();
  });

  it('retry stamps retryRequestedAt and keeps the rest of sync', async () => {
    put('swiggy_SW-1', placed({ status: 'accepted', sync: { state: 'failed', attempts: 1, lastError: 'timeout' } }));
    await svc.retryAggregatorSync('swiggy_SW-1');
    const sync = docs.get(PATH('swiggy_SW-1')).sync;
    expect(sync).toMatchObject({ state: 'failed', attempts: 1, lastError: 'timeout' });
    expect(typeof sync.retryRequestedAt).toBe('number');
  });
});

describe('simulateAggregatorOrder', () => {
  it('writes a placed test order that is flagged as simulated', async () => {
    const id = await svc.simulateAggregatorOrder('zomato', [{ id: 'm1', name: 'Biryani', price: '₹220' }], { now: 5000000 });
    const o = docs.get(PATH(id));
    expect(id).toBe('zomato_TEST-5000');
    expect(o).toMatchObject({ platform: 'zomato', status: 'placed', simulated: true, acceptBy: 5000000 + 180000 });
    expect(o.items[0]).toMatchObject({ name: 'Biryani', quantity: 2, unitPrice: 220, menuItemId: 'm1' });
    expect(o.amounts.total).toBe(462); // 440 + 5%
  });
});
