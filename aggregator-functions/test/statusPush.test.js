'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { handleStatusChange } = require('../src/statusPush');

const NOW = 1763380900000;
const ENV = {
  SWIGGY_API_BASE_URL: 'https://swiggy.example/partner/',
  SWIGGY_API_KEY: 'sw-key',
  ZOMATO_API_BASE_URL: 'https://zomato.example/api',
  ZOMATO_API_KEY: 'zo-key',
};

const base = (platform = 'swiggy') => ({
  platform,
  externalOrderId: platform === 'swiggy' ? 'SW-1001' : '778899',
  storeId: platform === 'swiggy' ? 'OUT-7' : 'RES-42',
  status: 'placed',
  statusSource: 'platform',
  sync: { state: 'idle', attempts: 0, lastError: null, lastSentStatus: null, at: null },
});

const fakeFetch = (response = { ok: true, status: 200 }) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return { ok: response.ok, status: response.status, text: async () => response.text || '' };
  };
  fn.calls = calls;
  return fn;
};

test('staff accepting a Swiggy order sends accept with the prep time', async () => {
  const fetchImpl = fakeFetch();
  const before = base();
  const after = { ...base(), status: 'accepted', statusSource: 'staff', prepMinutes: 20 };
  const sync = await handleStatusChange({ before, after, env: ENV, fetchImpl, now: NOW });
  assert.equal(fetchImpl.calls.length, 1);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://swiggy.example/partner/orders/SW-1001/accept');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer sw-key');
  assert.deepEqual(JSON.parse(init.body), { order_id: 'SW-1001', outlet_id: 'OUT-7', status: 'accepted', prep_time_minutes: 20 });
  assert.deepEqual(sync, { state: 'sent', attempts: 1, lastError: null, lastSentStatus: 'accepted', at: NOW, retryRequestedAt: null });
});

test('staff rejecting a Zomato order sends the reason with Zomato\'s header', async () => {
  const fetchImpl = fakeFetch();
  const after = { ...base('zomato'), status: 'rejected', statusSource: 'staff', rejectReason: 'item_out_of_stock' };
  await handleStatusChange({ before: base('zomato'), after, env: ENV, fetchImpl, now: NOW });
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://zomato.example/api/order/778899/reject');
  assert.equal(init.headers['X-Zomato-Api-Key'], 'zo-key');
  assert.equal(JSON.parse(init.body).rejection_reason, 'item_out_of_stock');
});

test('ready and handed-over are pushed too', async () => {
  for (const [from, to, path] of [['accepted', 'ready', 'food-ready'], ['ready', 'picked_up', 'handover']]) {
    const fetchImpl = fakeFetch();
    await handleStatusChange({ before: { ...base(), status: from }, after: { ...base(), status: to, statusSource: 'staff' }, env: ENV, fetchImpl, now: NOW });
    assert.equal(fetchImpl.calls[0].url, `https://swiggy.example/partner/orders/SW-1001/${path}`);
  }
});

test('platform-made changes and sync-only writes push nothing (no loops)', async () => {
  const fetchImpl = fakeFetch();
  const cancelled = { ...base(), status: 'cancelled', statusSource: 'platform' };
  assert.equal(await handleStatusChange({ before: base(), after: cancelled, env: ENV, fetchImpl }), null);
  const sent = { ...base(), status: 'accepted', statusSource: 'staff', sync: { state: 'sent', attempts: 1 } };
  const sentAgain = { ...sent, sync: { state: 'sent', attempts: 1, at: NOW } };
  assert.equal(await handleStatusChange({ before: sent, after: sentAgain, env: ENV, fetchImpl }), null);
  assert.equal(fetchImpl.calls.length, 0);
});

test('an invalid jump is not sent and is reported', async () => {
  const fetchImpl = fakeFetch();
  const sync = await handleStatusChange({
    before: base(), after: { ...base(), status: 'picked_up', statusSource: 'staff' }, env: ENV, fetchImpl, now: NOW,
  });
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(sync.state, 'failed');
  assert.match(sync.lastError, /invalid change from placed to picked_up/);
});

test('accepting an order the platform already cancelled is not sent', async () => {
  const fetchImpl = fakeFetch();
  const sync = await handleStatusChange({
    before: { ...base(), status: 'cancelled' }, after: { ...base(), status: 'accepted', statusSource: 'staff' }, env: ENV, fetchImpl, now: NOW,
  });
  assert.equal(fetchImpl.calls.length, 0);
  assert.match(sync.lastError, /already cancelled/);
});

test('HTTP errors, network errors and missing config are recorded as failed', async () => {
  const after = { ...base(), status: 'accepted', statusSource: 'staff', prepMinutes: 15 };

  const http = await handleStatusChange({ before: base(), after, env: ENV, fetchImpl: fakeFetch({ ok: false, status: 409, text: 'order expired' }), now: NOW });
  assert.equal(http.state, 'failed');
  assert.equal(http.lastError, 'swiggy replied HTTP 409: order expired');

  const net = await handleStatusChange({ before: base(), after, env: ENV, fetchImpl: fakeFetch(new Error('ECONNRESET')), now: NOW });
  assert.equal(net.lastError, 'ECONNRESET');

  const noUrl = await handleStatusChange({ before: base(), after, env: { SWIGGY_API_KEY: 'k' }, fetchImpl: fakeFetch(), now: NOW });
  assert.match(noUrl.lastError, /API base URL not configured \(SWIGGY_API_BASE_URL\)/);

  const noKey = await handleStatusChange({ before: base(), after, env: { SWIGGY_API_BASE_URL: 'https://x' }, fetchImpl: fakeFetch(), now: NOW });
  assert.match(noKey.lastError, /API key not configured \(SWIGGY_API_KEY\)/);
});

test('test orders from the simulator are never sent to the real platform', async () => {
  const fetchImpl = fakeFetch();
  const sim = { ...base(), simulated: true };
  const sync = await handleStatusChange({ before: sim, after: { ...sim, status: 'accepted', statusSource: 'staff', prepMinutes: 10 }, env: ENV, fetchImpl, now: NOW });
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(sync.state, 'skipped');
  assert.equal(sync.lastSentStatus, 'accepted');
});

test('"Retry" on a failed push re-sends the current status and counts attempts', async () => {
  const fetchImpl = fakeFetch();
  const failed = { ...base(), status: 'accepted', statusSource: 'staff', prepMinutes: 15, sync: { state: 'failed', attempts: 1, lastError: 'timeout', retryRequestedAt: null } };
  const retry = { ...failed, sync: { ...failed.sync, retryRequestedAt: NOW } };
  const sync = await handleStatusChange({ before: failed, after: retry, env: ENV, fetchImpl, now: NOW + 1 });
  assert.equal(fetchImpl.calls.length, 1);
  assert.match(fetchImpl.calls[0].url, /\/accept$/);
  assert.equal(sync.state, 'sent');
  assert.equal(sync.attempts, 2);
});
