'use strict';

/**
 * Firestore implementation of the storage functions the webhook needs.
 *
 * Data layout (all server-written; clients never write the first two):
 *   aggregatorOutlets/{platform}_{storeId}         -> { restaurantId, enabled }
 *       Which restaurant a Swiggy/Zomato outlet id belongs to. One backend
 *       serves every restaurant, since all apps share one Firebase project.
 *   Restaurant/{rid}/aggregatorConfig/{platform}    -> { itemMap: { externalItemId: menuDocId }, acceptWindowSeconds }
 *   Restaurant/{rid}/aggregatorOrders/{platform}_{externalOrderId}  -> normalised order (model.js)
 */
function createFirestoreStore(db) {
  const outletRef = (platform, storeId) => db.collection('aggregatorOutlets').doc(`${platform}_${storeId}`);
  const configRef = (rid, platform) => db.collection('Restaurant').doc(rid).collection('aggregatorConfig').doc(platform);
  const orderRef = (rid, docId) => db.collection('Restaurant').doc(rid).collection('aggregatorOrders').doc(docId);

  return {
    async getOutlet(platform, storeId) {
      const snap = await outletRef(platform, storeId).get();
      return snap.exists ? snap.data() : null;
    },

    async getConfig(restaurantId, platform) {
      const snap = await configRef(restaurantId, platform).get();
      return snap.exists ? snap.data() : null;
    },

    /** Creates the order unless it already exists (re-delivered webhook). */
    async createOrderIfAbsent(restaurantId, docId, order) {
      try {
        await orderRef(restaurantId, docId).create(order);
        return { created: true };
      } catch (e) {
        // ALREADY_EXISTS (gRPC code 6) means this is a retry of an order we have.
        if (e && (e.code === 6 || e.code === 'already-exists')) return { created: false };
        throw e;
      }
    },

    /** Applies mutate(current) -> patch|null inside a transaction. */
    async updateOrder(restaurantId, docId, mutate) {
      const ref = orderRef(restaurantId, docId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { found: false, updated: false };
        const patch = mutate(snap.data());
        if (!patch) return { found: true, updated: false };
        tx.update(ref, patch);
        return { found: true, updated: true };
      });
    },
  };
}

module.exports = { createFirestoreStore };
