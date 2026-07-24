import { db } from "../firebase";
import { collection, getDocs, doc, setDoc, updateDoc, addDoc, Timestamp, serverTimestamp, query, orderBy, limit } from "firebase/firestore";

const RESTAURANT_PATH = "Restaurant/orderin_restaurant_3";

/**
 * Add a new batch to an inventory item
 */
export const addInventoryBatch = async (itemName, batchData) => {
  try {
    const batchRef = collection(db, RESTAURANT_PATH, "inventory", itemName, "batches");
    const timestamp = Timestamp.now();
    
    const batch = {
      batchId: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      itemName,
      quantity: Number(batchData.quantity) || 0,
      unit: batchData.unit || "Kgs",
      arrivalDate: batchData.arrivalDate ? Timestamp.fromDate(new Date(batchData.arrivalDate)) : timestamp,
      expiryDate: batchData.expiryDate ? Timestamp.fromDate(new Date(batchData.expiryDate)) : null,
      warningPeriodDays: Number(batchData.warningPeriodDays) || 3,
      shelfLifeDays: Number(batchData.shelfLifeDays) || 0,
      locationOfStorage: batchData.locationOfStorage || "",
      addedAt: timestamp,
      updatedAt: timestamp,
      remainingQty: Number(batchData.quantity) || 0,
      status: "active", // active, consumed, expired, warning
    };

    await addDoc(batchRef, batch);
    return batch;
  } catch (error) {
    console.error("Error adding inventory batch:", error);
    throw error;
  }
};

/**
 * Get all batches for an inventory item
 */
export const getItemBatches = async (itemName) => {
  try {
    const batchRef = collection(db, RESTAURANT_PATH, "inventory", itemName, "batches");
    const q = query(batchRef, orderBy("addedAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        firestoreId: doc.id,
        ...data,
        // Compute remaining days to expiry
        daysToExpiry: data.expiryDate 
          ? Math.round((data.expiryDate.toDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null,
        // Check if warning should trigger
        isWarningTriggered: data.expiryDate && data.warningPeriodDays
          ? Math.round((data.expiryDate.toDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= data.warningPeriodDays
          : false,
      };
    });
  } catch (error) {
    console.error("Error fetching batches:", error);
    return [];
  }
};

/**
 * Get ALL batches across all items with expiry info for alerts
 */
export const getAllBatchesWithExpiry = async () => {
  try {
    const inventoryRef = collection(db, RESTAURANT_PATH, "inventory");
    const inventorySnapshot = await getDocs(inventoryRef);
    const allBatches = [];

    for (const itemDoc of inventorySnapshot.docs) {
      const itemName = itemDoc.id;
      const itemData = itemDoc.data();
      const batches = await getItemBatches(itemName);
      
      batches.forEach((batch) => {
        allBatches.push({
          ...batch,
          itemName,
          itemCategory: itemData.itemCategory,
        });
      });
    }

    // Sort by expiry date (soonest first)
    allBatches.sort((a, b) => {
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate.toDate().getTime() - b.expiryDate.toDate().getTime();
    });

    return allBatches;
  } catch (error) {
    console.error("Error fetching all batches:", error);
    return [];
  }
};

/**
 * Consume inventory using FIFO + expiry priority
 * Items with nearest expiry get consumed first
 */
export const consumeFromBatches = async (itemName, quantityNeeded) => {
  try {
    const batchRef = collection(db, RESTAURANT_PATH, "inventory", itemName, "batches");
    const snapshot = await getDocs(batchRef);
    
    // Get active batches sorted by expiry (soonest first), then oldest first
    let activeBatches = snapshot.docs
      .map((doc) => ({ firestoreId: doc.id, ...doc.data() }))
      .filter((b) => b.status === "active" && b.remainingQty > 0)
      .sort((a, b) => {
        // First by expiry date (soonest first)
        if (a.expiryDate && b.expiryDate) {
          return a.expiryDate.toDate().getTime() - b.expiryDate.toDate().getTime();
        }
        if (a.expiryDate) return -1;
        if (b.expiryDate) return 1;
        // Then by arrival date (FIFO)
        return a.addedAt.toDate().getTime() - b.addedAt.toDate().getTime();
      });

    let remainingToConsume = quantityNeeded;
    const consumptionLog = [];

    for (const batch of activeBatches) {
      if (remainingToConsume <= 0) break;

      const consumeFromThis = Math.min(batch.remainingQty, remainingToConsume);
      const newRemaining = batch.remainingQty - consumeFromThis;
      const newStatus = newRemaining <= 0 ? "consumed" : "active";
      const now = Timestamp.now();

      // Update batch
      const batchDocRef = doc(db, RESTAURANT_PATH, "inventory", itemName, "batches", batch.firestoreId);
      await updateDoc(batchDocRef, {
        remainingQty: newRemaining,
        status: newStatus,
        updatedAt: now,
        consumedAt: now,
      });

      consumptionLog.push({
        batchId: batch.batchId,
        consumedQty: consumeFromThis,
        remainingQty: newRemaining,
      });

      remainingToConsume -= consumeFromThis;
    }

    // Check if we could fulfill the request
    if (remainingToConsume > 0) {
      console.warn(`Could only partially fulfill: ${quantityNeeded - remainingToConsume} of ${quantityNeeded} consumed`);
    }

    return {
      fulfilled: remainingToConsume <= 0,
      consumed: quantityNeeded - remainingToConsume,
      remaining: remainingToConsume,
      consumptionLog,
    };
  } catch (error) {
    console.error("Error consuming from batches:", error);
    throw error;
  }
};

/**
 * Get expiry warnings based on warning period
 */
export const getExpiryWarnings = async (warningDays = 3) => {
  try {
    const allBatches = await getAllBatchesWithExpiry();
    const now = new Date();
    
    return allBatches.filter((batch) => {
      if (!batch.expiryDate || batch.status !== "active") return false;
      const daysUntilExpiry = Math.round((batch.expiryDate.toDate().getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry <= (batch.warningPeriodDays || warningDays) && daysUntilExpiry >= 0;
    });
  } catch (error) {
    console.error("Error getting expiry warnings:", error);
    return [];
  }
};

/**
 * Record an inventory action with timestamp
 */
export const recordInventoryAction = async (itemName, actionType, details) => {
  try {
    const actionsRef = collection(db, RESTAURANT_PATH, "inventory", itemName, "actions");
    const action = {
      type: actionType,
      ...details,
      timestamp: Timestamp.now(),
    };
    await addDoc(actionsRef, action);
    return action;
  } catch (error) {
    console.error("Error recording inventory action:", error);
    throw error;
  }
};

/**
 * Add a subcollection entry for inventory changes
 */
export const logInventoryChange = async (itemName, changeType, quantity, batchId, notes = "") => {
  try {
    const logRef = collection(db, RESTAURANT_PATH, "inventory", itemName, "changes");
    const entry = {
      changeType, // "added", "consumed", "adjusted", "expired"
      quantity,
      batchId,
      notes,
      timestamp: Timestamp.now(),
    };
    await addDoc(logRef, entry);
    return entry;
  } catch (error) {
    console.error("Error logging inventory change:", error);
    throw error;
  }
};

/**
 * Fetch the full add/take action history for an item, newest first,
 * including whatever batch/expiry details were recorded with each action.
 */
export const getItemActionHistory = async (itemName) => {
  try {
    const actionsRef = collection(db, RESTAURANT_PATH, "inventory", itemName, "actions");
    const q = query(actionsRef, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ firestoreId: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching item action history:", error);
    return [];
  }
};

/**
 * Consume stock from a specific set of user-selected batches only
 * (as opposed to consumeFromBatches, which auto-picks batches via FIFO/expiry).
 * Within the selected subset, still prioritizes soonest-expiry then oldest-arrival.
 */
export const consumeFromSpecificBatches = async (itemName, batchIds, quantity) => {
  try {
    const allBatches = await getItemBatches(itemName);
    const selected = allBatches
      .filter((b) => batchIds.includes(b.firestoreId))
      .sort((a, b) => {
        if (a.expiryDate && b.expiryDate) {
          return a.expiryDate.toDate().getTime() - b.expiryDate.toDate().getTime();
        }
        if (a.expiryDate) return -1;
        if (b.expiryDate) return 1;
        return a.addedAt.toDate().getTime() - b.addedAt.toDate().getTime();
      });

    let remainingToConsume = quantity;
    const consumptionLog = [];

    for (const batch of selected) {
      if (remainingToConsume <= 0) break;

      const consumeFromThis = Math.min(batch.remainingQty, remainingToConsume);
      const newRemaining = batch.remainingQty - consumeFromThis;
      const newStatus = newRemaining <= 0 ? "consumed" : "active";
      const now = Timestamp.now();

      const batchDocRef = doc(db, RESTAURANT_PATH, "inventory", itemName, "batches", batch.firestoreId);
      await updateDoc(batchDocRef, {
        remainingQty: newRemaining,
        status: newStatus,
        updatedAt: now,
        consumedAt: now,
      });

      consumptionLog.push({
        batchId: batch.batchId,
        firestoreId: batch.firestoreId,
        consumedQty: consumeFromThis,
        remainingQty: newRemaining,
      });

      remainingToConsume -= consumeFromThis;
    }

    if (remainingToConsume > 0) {
      console.warn(`consumeFromSpecificBatches: could only fulfill ${quantity - remainingToConsume} of ${quantity} from the selected batches`);
    }

    return {
      fulfilled: remainingToConsume <= 0,
      consumed: quantity - remainingToConsume,
      remaining: remainingToConsume,
      consumptionLog,
    };
  } catch (error) {
    console.error("Error consuming from specific batches:", error);
    throw error;
  }
};

