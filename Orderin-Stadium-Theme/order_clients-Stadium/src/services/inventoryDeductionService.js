// src/services/inventoryDeductionService.js
// Takes ingredient stock out of inventory when an order is accepted, using
// each dish's `ingredients` list (set on the Menu page). Stock is taken from
// the batch that expires first (consumeFromBatches).
//
// orderService marks the order `inventoryDeducted: true` inside the same
// transaction that accepts it, so an order is only ever deducted once even
// if two staff accept it at the same moment.

import { db } from "../firebase";
import { collection, doc, getDocs, runTransaction, arrayUnion, Timestamp } from "firebase/firestore";
import { RESTAURANT_PATH, consumeFromBatches, recordInventoryAction } from "./inventoryBatchService";
import { computeIngredientUsage, normalizeName } from "../utils/expiryOffers";

const MENU_CACHE_MS = 60 * 1000;
let menuCache = { at: 0, items: null };

const loadMenu = async () => {
  if (menuCache.items && Date.now() - menuCache.at < MENU_CACHE_MS) return menuCache.items;
  const snap = await getDocs(collection(db, RESTAURANT_PATH, "menu"));
  menuCache = { at: Date.now(), items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  return menuCache.items;
};

export const clearMenuCache = () => {
  menuCache = { at: 0, items: null };
};

const statusFor = (qty, low, veryLow) => {
  if (qty <= (Number(veryLow) || 0)) return "Very Low";
  if (qty <= (Number(low) || 0)) return "Low";
  return "Good";
};

const parseQty = (q) => {
  const n = parseFloat(String(q ?? "").split(" ")[0]);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Deduct the ingredients used by `order` ({ id, items }).
 * Never throws: a failed deduction must not block accepting the order.
 * Returns { deducted: [{name, qty, unit, left}], missing: [names], unmatchedDishes }.
 */
export const deductInventoryForOrder = async (order) => {
  const result = { deducted: [], missing: [], unmatchedDishes: [] };
  try {
    const items = Array.isArray(order?.items) ? order.items : [];
    if (items.length === 0) return result;

    const menu = await loadMenu();
    const { usage, unmatchedDishes } = computeIngredientUsage(items, menu);
    result.unmatchedDishes = unmatchedDishes;
    if (usage.length === 0) return result;

    const invSnap = await getDocs(collection(db, RESTAURANT_PATH, "inventory"));
    const invByName = new Map();
    invSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.itemStatus === "deleted") return;
      invByName.set(normalizeName(data.name || d.id), { id: d.id, name: data.name || d.id });
    });

    for (const use of usage) {
      const inv = invByName.get(normalizeName(use.name));
      if (!inv) {
        result.missing.push(use.name);
        continue;
      }
      try {
        const ref = doc(db, RESTAURANT_PATH, "inventory", inv.id);
        let left = 0;
        let unit = use.unit;
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error("missing");
          const data = snap.data();
          unit = data.unit || unit || "";
          left = Math.max(0, Math.round((parseQty(data.quantity) - use.qty) * 1000) / 1000);
          tx.update(ref, {
            quantity: `${left} ${unit}`.trim(),
            status: statusFor(left, data.thresholdLow, data.thresholdVeryLow),
            updatedAt: Timestamp.now(),
            actions: arrayUnion({
              type: "auto-deduct",
              quantity: use.qty,
              orderId: order.id || null,
              timestamp: Timestamp.now(),
            }),
          });
        });

        let consumptionLog = [];
        try {
          const consumed = await consumeFromBatches(inv.name, use.qty);
          consumptionLog = consumed.consumptionLog;
        } catch (e) {
          console.warn(`Batch deduction failed for ${inv.name}:`, e);
        }
        await recordInventoryAction(inv.name, "auto-deduct", {
          quantity: use.qty,
          unit,
          orderId: order.id || null,
          consumptionLog,
        }).catch(() => {});

        result.deducted.push({ name: inv.name, qty: use.qty, unit, left });
      } catch (e) {
        console.error(`Could not deduct ${use.name} for order ${order?.id}:`, e);
        result.missing.push(use.name);
      }
    }
  } catch (e) {
    console.error("Inventory auto-deduction failed:", e);
  }
  return result;
};
