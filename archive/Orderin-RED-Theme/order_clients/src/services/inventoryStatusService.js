// src/services/inventoryStatusService.js
import { db } from "../firebase";
import { collection, doc, updateDoc, Timestamp } from "firebase/firestore";

const RESTAURANT_ID = "orderin_restaurant_1";
const restaurantRoot = () => collection(db, "Restaurant", RESTAURANT_ID, "inventory");

const STATUS_FIELDS = {
  active: { itemStatus: "active", pausedAt: null, deletedAt: null },
  paused: { itemStatus: "paused", pausedAt: Timestamp.now(), deletedAt: null },
  deleted: { itemStatus: "deleted", pausedAt: null, deletedAt: Timestamp.now() },
};

/**
 * Applies a lifecycle status to multiple item docs, tolerating per-item failures
 * (e.g. a doc deleted elsewhere mid-loop) rather than aborting the whole batch.
 */
const applyStatusToItems = async (itemIds, targetStatus) => {
  const succeeded = [];
  const failed = [];

  for (const itemId of itemIds) {
    try {
      await updateDoc(doc(restaurantRoot(), itemId), {
        ...STATUS_FIELDS[targetStatus],
        updatedAt: Timestamp.now(),
      });
      succeeded.push(itemId);
    } catch (error) {
      console.error(`Error setting itemStatus="${targetStatus}" on ${itemId}:`, error);
      failed.push(itemId);
    }
  }

  return { succeeded, failed };
};

export const pauseItems = (itemIds) => applyStatusToItems(itemIds, "paused");
export const continueItems = (itemIds) => applyStatusToItems(itemIds, "active");
export const softDeleteItems = (itemIds) => applyStatusToItems(itemIds, "deleted");

export const pauseItem = (itemId) => pauseItems([itemId]);
export const continueItem = (itemId) => continueItems([itemId]);
export const softDeleteItem = (itemId) => softDeleteItems([itemId]);
