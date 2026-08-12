import { doc, getDoc, setDoc, deleteDoc, collection } from "firebase/firestore";
import { STORES, genId, getAll, getOne, putOne, removeOne } from "./db";
import { firebaseEnabled, db as firestore } from "./firebase";
import { emit, EVENTS } from "./bus";
import { ENTITY_EVENT } from "./entityEvents";

let syncing = false;
let lastSyncAt = null;

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 15000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

// Kitchen workflow is monotonic; a status further along should never be
// clobbered by an older/stale write racing in from another device. Terminal
// states always win over an in-progress status from a stale write.
const STATUS_RANK = { new: 1, confirmed: 2, preparing: 3, ready: 4, completed: 5, cancelled: 9, refunded: 9 };

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function enqueueSync(entity, action, payload) {
  const item = {
    id: genId("sync"),
    entity,
    action, // "put" | "delete"
    payload,
    baseUpdatedAt: payload?.updatedAt || payload?.createdAt || Date.now(),
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
    nextAttemptAt: 0,
    lastError: null,
  };
  await putOne(STORES.syncQueue, item);
  emit(EVENTS.SYNC_STATUS_CHANGED, { pending: await countPending() });
  if (isOnline()) flushSyncQueue();
  return item;
}

export async function countPending() {
  const all = await getAll(STORES.syncQueue);
  return all.filter((i) => i.status === "pending").length;
}

export async function countFailed() {
  const all = await getAll(STORES.syncQueue);
  return all.filter((i) => i.status === "failed").length;
}

export async function listSyncQueue() {
  return (await getAll(STORES.syncQueue)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function listSyncConflicts() {
  return (await getAll(STORES.syncConflicts)).sort((a, b) => b.timestamp - a.timestamp);
}

export async function retryQueueItem(id) {
  const item = await getOne(STORES.syncQueue, id);
  if (!item) return;
  await putOne(STORES.syncQueue, { ...item, status: "pending", attempts: 0, nextAttemptAt: 0, lastError: null });
  emit(EVENTS.SYNC_STATUS_CHANGED, { pending: await countPending() });
  if (isOnline()) flushSyncQueue();
}

export async function retryAllFailed() {
  const all = await getAll(STORES.syncQueue);
  await Promise.all(
    all.filter((i) => i.status === "failed")
      .map((i) => putOne(STORES.syncQueue, { ...i, status: "pending", attempts: 0, nextAttemptAt: 0, lastError: null }))
  );
  emit(EVENTS.SYNC_STATUS_CHANGED, { pending: await countPending() });
  if (isOnline()) flushSyncQueue();
}

export async function discardQueueItem(id) {
  await removeOne(STORES.syncQueue, id);
  emit(EVENTS.SYNC_STATUS_CHANGED, { pending: await countPending() });
}

export function getLastSyncAt() {
  return lastSyncAt;
}

function statusRank(status) {
  return STATUS_RANK[status] ?? 0;
}

function backoffFor(attempts) {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

async function resolveConflict(item, remote) {
  const local = item.payload;
  let resolvedValue = local;
  let resolution = "local-wins";

  if (item.entity === STORES.orders && local.status && remote.status) {
    const localRank = statusRank(local.status);
    const remoteRank = statusRank(remote.status);
    if (remoteRank > localRank) {
      resolvedValue = { ...local, status: remote.status, kitchenStatus: remote.kitchenStatus, readyAt: remote.readyAt, completedAt: remote.completedAt, cancelReason: remote.cancelReason ?? local.cancelReason, refund: remote.refund ?? local.refund };
      resolution = "remote-status-ahead";
    } else if (remoteRank < localRank) {
      resolution = "local-status-ahead";
    } else {
      resolution = "status-equal-local-kept";
    }
  } else {
    const remoteUpdatedAt = remote.updatedAt || remote.createdAt || 0;
    const localUpdatedAt = local.updatedAt || local.createdAt || 0;
    if (remoteUpdatedAt > localUpdatedAt) {
      resolvedValue = remote;
      resolution = "remote-newer";
    } else {
      resolution = "local-newer";
    }
  }

  await putOne(STORES.syncConflicts, {
    id: genId("cfl"), entity: item.entity, entityId: local.id,
    localSnapshot: local, remoteSnapshot: remote, resolution, resolvedValue,
    timestamp: Date.now(),
  });

  // Keep the local cache consistent with whatever value wins the conflict.
  await putOne(item.entity, resolvedValue);
  const evt = ENTITY_EVENT[item.entity];
  if (evt) emit(evt);

  return resolvedValue;
}

export async function flushSyncQueue() {
  if (!firebaseEnabled || !isOnline() || syncing) return;
  syncing = true;
  try {
    const now = Date.now();
    const queue = (await getAll(STORES.syncQueue)).filter((i) => i.status === "pending" && now >= (i.nextAttemptAt || 0));

    for (const item of queue) {
      try {
        const ref = doc(collection(firestore, item.entity), item.payload.id);

        if (item.action === "delete") {
          await deleteDoc(ref);
          await removeOne(STORES.syncQueue, item.id);
          continue;
        }

        const remoteSnap = await getDoc(ref);
        let payloadToWrite = item.payload;
        if (remoteSnap.exists()) {
          const remote = remoteSnap.data();
          const remoteUpdatedAt = remote.updatedAt || remote.createdAt || 0;
          if (remoteUpdatedAt > item.baseUpdatedAt) {
            payloadToWrite = await resolveConflict(item, remote);
          }
        }

        await setDoc(ref, payloadToWrite, { merge: true });
        await removeOne(STORES.syncQueue, item.id);
      } catch (err) {
        const attempts = item.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await putOne(STORES.syncQueue, {
          ...item,
          attempts,
          status: failed ? "failed" : "pending",
          nextAttemptAt: failed ? 0 : Date.now() + backoffFor(attempts),
          lastError: String(err?.message || err),
        });
      }
    }
    lastSyncAt = Date.now();
  } finally {
    syncing = false;
    emit(EVENTS.SYNC_STATUS_CHANGED, { pending: await countPending(), failed: await countFailed(), lastSyncAt });
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    emit(EVENTS.SYNC_STATUS_CHANGED, { online: true });
    flushSyncQueue();
  });
  window.addEventListener("offline", () => {
    emit(EVENTS.SYNC_STATUS_CHANGED, { online: false });
  });
  if (firebaseEnabled) {
    setInterval(flushSyncQueue, 15000);
  }
}
