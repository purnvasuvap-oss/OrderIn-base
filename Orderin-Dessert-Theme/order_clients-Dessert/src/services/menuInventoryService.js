// src/services/menuInventoryService.js
//
// Bridges the menu and inventory collections: lets a menu item declare a
// "recipe" (which inventory ingredients, and how much of each, 1 unit of the
// dish consumes) and deducts that stock automatically when an order for the
// dish is confirmed.
import { db } from "../firebase";
import { collection, doc, getDoc, getDocs, updateDoc, arrayUnion, Timestamp } from "firebase/firestore";
import { consumeFromBatches, recordInventoryAction } from "./inventoryBatchService";

const RESTAURANT_ID = "orderin_restaurant_3";
const menuCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "menu");
const inventoryCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "inventory");

const isItemActive = (item) => !item.itemStatus || item.itemStatus === "active";

/**
 * Lightweight list of inventory items for the menu editor's recipe picker.
 * Inventory doc IDs are the item name itself (see Inventory.jsx), so `id`
 * doubles as the value to store on a recipe line.
 */
export const getInventoryItemOptions = async () => {
  const snapshot = await getDocs(inventoryCollectionRef());
  return snapshot.docs
    .filter((d) => isItemActive(d.data()))
    .map((d) => ({ id: d.id, name: d.data().name || d.id, unit: d.data().unit || "" }));
};

/**
 * Same status thresholds as Inventory.jsx's updateStatusBasedOnQuantity —
 * kept in sync here since inventory deduction happens outside that page.
 */
const statusForQuantity = (qty, thresholdLow, thresholdVeryLow) => {
  if (qty <= (thresholdVeryLow || 0)) return "Very Low";
  if (qty <= (thresholdLow || 0)) return "Low";
  return "Good";
};

/**
 * Deduct inventory stock for a confirmed order's items, using each menu
 * item's saved `recipe` (ingredient inventory-item-id + quantity per 1 unit
 * of the dish). Items with no recipe (or a recipe referencing an inventory
 * item that no longer exists) are skipped — this only touches dishes an
 * admin has explicitly linked to inventory, and never blocks the order
 * itself on a deduction failure.
 */
export const deductInventoryForOrder = async (orderItems) => {
  if (!Array.isArray(orderItems) || orderItems.length === 0) return;

  const menuSnapshot = await getDocs(menuCollectionRef());
  const menuByName = new Map();
  menuSnapshot.docs.forEach((d) => {
    const data = d.data();
    if (data.name) menuByName.set(data.name, data);
  });

  // Aggregate consumption across all ordered items first, so an ingredient
  // shared by two dishes in the same order is only read/written once.
  const consumption = new Map(); // inventory item id -> total qty to consume
  for (const orderItem of orderItems) {
    const menuItem = menuByName.get(orderItem?.name);
    if (!menuItem || !Array.isArray(menuItem.recipe) || menuItem.recipe.length === 0) continue;
    const orderedQty = Number(orderItem.quantity) || 1;
    for (const ingredient of menuItem.recipe) {
      if (!ingredient?.itemId || !ingredient?.quantity) continue;
      const needed = Number(ingredient.quantity) * orderedQty;
      if (!Number.isFinite(needed) || needed <= 0) continue;
      consumption.set(ingredient.itemId, (consumption.get(ingredient.itemId) || 0) + needed);
    }
  }

  for (const [inventoryItemId, qtyNeeded] of consumption.entries()) {
    try {
      const inventoryDocRef = doc(inventoryCollectionRef(), inventoryItemId);
      const snap = await getDoc(inventoryDocRef);
      if (!snap.exists()) {
        console.warn(`deductInventoryForOrder: inventory item "${inventoryItemId}" not found — skipping`);
        continue;
      }
      const existing = snap.data();
      const currentQty = parseFloat(String(existing.quantity).split(" ")[0]) || 0;
      const newQty = Math.max(0, currentQty - qtyNeeded);
      const newStatus = statusForQuantity(newQty, existing.thresholdLow, existing.thresholdVeryLow);

      await updateDoc(inventoryDocRef, {
        quantity: `${newQty} ${existing.unit}`,
        status: newStatus,
        updatedAt: Timestamp.now(),
        actions: arrayUnion({ type: "take", quantity: qtyNeeded, timestamp: Timestamp.now(), source: "order" }),
      });

      try {
        await consumeFromBatches(inventoryItemId, qtyNeeded);
        await recordInventoryAction(inventoryItemId, "take", {
          quantity: qtyNeeded,
          unit: existing.unit,
          locationOfStorage: existing.locationOfStorage,
          source: "order",
        });
      } catch (batchErr) {
        console.warn(`Non-fatal: batch/history tracking failed for order deduction of "${inventoryItemId}":`, batchErr);
      }
    } catch (err) {
      console.error(`Failed to deduct inventory for "${inventoryItemId}":`, err);
    }
  }
};
