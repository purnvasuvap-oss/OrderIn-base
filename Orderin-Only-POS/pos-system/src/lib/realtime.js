import { collection, onSnapshot } from "firebase/firestore";
import { STORES, getAll, putOne, removeOne } from "./db";
import { firebaseEnabled, db as firestore } from "./firebase";
import { emit } from "./bus";
import { ENTITY_EVENT, REALTIME_STORES } from "./entityEvents";

let started = false;
let unsubscribers = [];

/**
 * Subscribes to Firestore for every synced collection so changes made on
 * another device/tab show up here in real time (not just within this
 * browser via BroadcastChannel). A doc is skipped if this device still has
 * an un-flushed local edit for it queued — the local edit wins until it's
 * actually pushed, at which point the normal conflict-resolution path in
 * sync.js reconciles anything that changed remotely in the meantime.
 */
export function startRealtimeSync() {
  if (!firebaseEnabled || started) return;
  started = true;

  REALTIME_STORES.forEach((storeName) => {
    const unsub = onSnapshot(
      collection(firestore, storeName),
      async (snapshot) => {
        const queue = await getAll(STORES.syncQueue);
        const pendingIds = new Set(
          queue.filter((i) => i.entity === storeName && i.status !== "failed").map((i) => i.payload?.id)
        );

        let changed = false;
        for (const change of snapshot.docChanges()) {
          const id = change.doc.id;
          if (pendingIds.has(id)) continue;
          if (change.type === "removed") {
            await removeOne(storeName, id);
          } else {
            await putOne(storeName, { ...change.doc.data(), id });
          }
          changed = true;
        }
        if (changed) {
          const evt = ENTITY_EVENT[storeName];
          if (evt) emit(evt);
        }
      },
      (err) => {
        console.warn(`Realtime sync error on "${storeName}":`, err.message);
      }
    );
    unsubscribers.push(unsub);
  });
}

export function stopRealtimeSync() {
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];
  started = false;
}
