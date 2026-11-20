import { vi } from 'vitest';

// In-memory customers collection.
const docs = new Map();
vi.mock('../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  getDoc: vi.fn(async (ref) => ({ exists: () => docs.has(ref.path), data: () => docs.get(ref.path) })),
  serverTimestamp: vi.fn(() => 'ts'),
  runTransaction: vi.fn(async (_db, fn) =>
    fn({
      get: async (ref) => ({ exists: () => docs.has(ref.path), data: () => docs.get(ref.path) }),
      set: (ref, data, opts) => docs.set(ref.path, opts && opts.merge ? { ...(docs.get(ref.path) || {}), ...data } : data),
    })
  ),
}));

const svc = await import('../reviewService');
const PATH = (phone) => `Restaurant/${svc.RESTAURANT_ID}/customers/${phone}`;

beforeEach(() => docs.clear());

describe('readLoggedInUser', () => {
  it('reads the saved login, and copes with none or broken data', () => {
    localStorage.setItem('user', JSON.stringify({ username: 'Ravi', phone: '+911' }));
    expect(svc.readLoggedInUser()).toEqual({ username: 'Ravi', phone: '+911' });
    localStorage.setItem('user', '{broken');
    expect(svc.readLoggedInUser()).toBeNull();
    localStorage.removeItem('user');
    expect(svc.readLoggedInUser()).toBeNull();
  });
});

describe('one review per customer, ever', () => {
  it('a new customer has not reviewed', async () => {
    expect(await svc.hasCustomerReviewed('+919999900000')).toBe(false);
    docs.set(PATH('+919999900000'), { pastOrders: [] });
    expect(await svc.hasCustomerReviewed('+919999900000')).toBe(false);
  });

  it('saves the review once, and also adds it to feedback for the staff app', async () => {
    docs.set(PATH('+911'), { pastOrders: [{ id: 'ORD-1' }] });
    await svc.saveCustomerReview('+911', { stars: 4, text: '  Great dosa  ', orderId: 'ORD-1' });
    const data = docs.get(PATH('+911'));
    expect(data.review).toMatchObject({ stars: 4, text: 'Great dosa', orderId: 'ORD-1' });
    expect(data.feedback).toHaveLength(1);
    expect(data.pastOrders).toEqual([{ id: 'ORD-1' }]);
    expect(await svc.hasCustomerReviewed('+911')).toBe(true);
  });

  it('refuses a second review', async () => {
    await svc.saveCustomerReview('+912', { stars: 5 });
    await expect(svc.saveCustomerReview('+912', { stars: 1 })).rejects.toBeInstanceOf(svc.AlreadyReviewedError);
    expect(docs.get(PATH('+912')).feedback).toHaveLength(1);
  });

  it('treats feedback left before this rule as already reviewed', async () => {
    docs.set(PATH('+913'), { feedback: [{ stars: 3, text: 'old' }] });
    expect(await svc.hasCustomerReviewed('+913')).toBe(true);
    await expect(svc.saveCustomerReview('+913', { stars: 5 })).rejects.toBeInstanceOf(svc.AlreadyReviewedError);
  });

  it('needs a login and 1–5 stars', async () => {
    await expect(svc.saveCustomerReview('', { stars: 5 })).rejects.toThrow('Please log in');
    await expect(svc.saveCustomerReview('+914', { stars: 0 })).rejects.toThrow('1 to 5 stars');
    await expect(svc.saveCustomerReview('+914', { stars: 6 })).rejects.toThrow('1 to 5 stars');
  });
});
