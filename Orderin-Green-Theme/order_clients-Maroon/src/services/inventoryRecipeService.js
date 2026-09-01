import { db } from "../firebase";
import { doc, getDoc, updateDoc, arrayUnion, Timestamp } from "firebase/firestore";

const RESTAURANT_PATH = "Restaurant/orderin_restaurant_4";

/**
 * Mirrors Inventory.jsx's own updateStatusBasedOnQuantity so recipe-driven
 * deductions land on the same Good/Low/Very Low status a manual "Take Stock"
 * action would produce.
 */
const statusForQuantity = (quantity, thresholdLow, thresholdVeryLow) => {
  const qty = Number(quantity) || 0;
  const low = Number(thresholdLow) || 0;
  const veryLow = Number(thresholdVeryLow) || 0;
  if (qty <= veryLow) return "Very Low";
  if (qty <= low) return "Low";
  return "Good";
};

/**
 * Deduct one recipe ingredient's usage from its inventory item doc, using
 * the exact same read-current -> parse -> subtract -> updateDoc shape as the
 * manual "take" action in Inventory.jsx (quantity/status/actions all kept in
 * sync so the Inventory page and Recent Activity feed need no special-casing
 * for recipe-driven deductions).
 *
 * Returns a summary line on success, or null if the ingredient couldn't be
 * found/deducted (caller treats this as best-effort and never throws).
 */
const deductIngredient = async (inventoryItemName, neededQty) => {
  try {
    const itemRef = doc(db, RESTAURANT_PATH, "inventory", inventoryItemName);
    const snap = await getDoc(itemRef);
    if (!snap.exists()) {
      console.warn(`Recipe deduction: inventory item "${inventoryItemName}" not found — skipping.`);
      return null;
    }

    const item = snap.data();
    const currentQty = parseFloat(String(item.quantity || "0").split(" ")[0]) || 0;
    const newQty = Math.max(0, currentQty - neededQty);
    const newStatus = statusForQuantity(newQty, item.thresholdLow, item.thresholdVeryLow);
    const unit = item.unit || "";

    await updateDoc(itemRef, {
      quantity: `${newQty} ${unit}`.trim(),
      status: newStatus,
      updatedAt: Timestamp.now(),
      actions: arrayUnion({
        type: "recipe-deduct",
        quantity: neededQty,
        timestamp: Timestamp.now(),
      }),
    });

    return { itemName: inventoryItemName, deducted: neededQty, unit, newQty };
  } catch (error) {
    console.error(`Recipe deduction failed for "${inventoryItemName}":`, error);
    return null;
  }
};

/**
 * For every order item whose matching menu item (looked up by name in
 * `menuItemsByName`) has a non-empty `recipe`, deduct
 * `ingredient.quantity * orderItem.quantity` from that ingredient's
 * inventory item. Best-effort: a missing menu item, missing recipe, missing
 * inventory item, or a single ingredient's Firestore write failing never
 * throws — inventory bookkeeping is a side effect of accepting an order, not
 * a gate on it.
 *
 * @param {Array} orderItems - order.items, each {name, quantity, ...}
 * @param {Object} menuItemsByName - { [menuItem.name]: menuItem } lookup
 * @returns {Promise<Array>} summary of every ingredient actually deducted
 */
export const deductInventoryForOrderItems = async (orderItems, menuItemsByName) => {
  if (!Array.isArray(orderItems) || !menuItemsByName) return [];

  const summary = [];
  for (const orderItem of orderItems) {
    const menuItem = menuItemsByName[orderItem.name];
    const recipe = menuItem?.recipe;
    if (!Array.isArray(recipe) || recipe.length === 0) continue;

    const orderedQty = Number(orderItem.quantity) || 1;
    for (const ingredient of recipe) {
      const ingredientName = String(ingredient?.inventoryItemName || "").trim();
      const perUnitQty = Number(ingredient?.quantity) || 0;
      if (!ingredientName || perUnitQty <= 0) continue;

      const result = await deductIngredient(ingredientName, perUnitQty * orderedQty);
      if (result) summary.push(result);
    }
  }
  return summary;
};
