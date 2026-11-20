'use strict';

const { getAdapter } = require('./adapters');
const { PUSHED_STATUSES, TERMINAL, canStaffMove } = require('./model');

const REQUEST_TIMEOUT_MS = 10000;

/**
 * Decides whether a change to an aggregator order must be reported to the
 * platform, sends it, and returns the `sync` patch to store on the order.
 * Returns null when nothing needs sending (so writing the result back can
 * never trigger another push).
 *
 * A push is due when:
 *  - staff changed the status (statusSource === "staff"), or
 *  - staff pressed "Retry" on a failed push (sync.retryRequestedAt changed).
 *
 * @param {object} p
 * @param {object} p.before  order data before the write
 * @param {object} p.after   order data after the write
 * @param {object} p.env     { SWIGGY_API_BASE_URL, SWIGGY_API_KEY, ZOMATO_API_BASE_URL, ZOMATO_API_KEY }
 * @param {Function} p.fetchImpl  fetch-compatible function
 * @param {number} [p.now]
 */
async function handleStatusChange({ before = {}, after = {}, env = {}, fetchImpl, now = Date.now() }) {
  const statusChanged = before.status !== after.status && after.statusSource === 'staff';
  const retryRequested =
    after.sync &&
    after.sync.state === 'failed' &&
    after.sync.retryRequestedAt &&
    after.sync.retryRequestedAt !== (before.sync && before.sync.retryRequestedAt);
  if (!statusChanged && !retryRequested) return null;

  const status = after.status;
  const attempts = ((after.sync && after.sync.attempts) || 0) + 1;
  const fail = (error) => ({
    state: 'failed',
    attempts,
    lastError: String(error).slice(0, 300),
    lastSentStatus: (after.sync && after.sync.lastSentStatus) || null,
    at: now,
    retryRequestedAt: (after.sync && after.sync.retryRequestedAt) || null,
  });

  if (!PUSHED_STATUSES.has(status)) return null;
  // Orders created by the staff app's "Send test order" button were never on
  // Swiggy/Zomato: record the step but never call the real platform API.
  if (after.simulated === true) {
    return { state: 'skipped', attempts, lastError: null, lastSentStatus: status, at: now, retryRequestedAt: null };
  }
  if (statusChanged) {
    if (TERMINAL.has(before.status)) return fail(`order was already ${before.status}; not sent`);
    if (!canStaffMove(before.status, status)) return fail(`invalid change from ${before.status} to ${status}; not sent`);
  }

  const adapter = getAdapter(after.platform);
  if (!adapter) return fail(`unknown platform ${after.platform}`);

  let request;
  try {
    request = adapter.buildStatusRequest({
      order: after,
      status,
      baseUrl: env[adapter.statusApi.baseUrlEnv],
      apiKey: env[adapter.statusApi.apiKeyEnv],
    });
  } catch (e) {
    return fail(e.message);
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) {
      const text = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
      return fail(`${adapter.platform} replied HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }
    return { state: 'sent', attempts, lastError: null, lastSentStatus: status, at: now, retryRequestedAt: null };
  } catch (e) {
    return fail(e.name === 'AbortError' ? `${adapter.platform} did not answer in ${REQUEST_TIMEOUT_MS / 1000}s` : e.message);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { handleStatusChange, REQUEST_TIMEOUT_MS };
