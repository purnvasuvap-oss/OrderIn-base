// src/services/inventoryAuditService.js
import { db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { DEFAULT_AUDIT_WINDOWS } from "../utils/auditWindow";

const RESTAURANT_ID = "orderin_restaurant_3";

const restaurantRoot = () => collection(db, "Restaurant", RESTAURANT_ID, "inventory");
const auditLogRef = () => collection(db, "Restaurant", RESTAURANT_ID, "inventoryAuditLog");
const settingsDocRef = () => doc(db, "Restaurant", RESTAURANT_ID, "settings", "inventoryAudit");

// Bulk action types shown to kitchen staff, and how they affect stock quantity.
export const AUDIT_ACTION_TYPES = [
  { value: "received", label: "Received Delivery", sign: 1, category: "in" },
  { value: "spoiled", label: "Spoiled / Discarded", sign: -1, category: "out" },
  { value: "personalUse", label: "Staff Personal Use", sign: -1, category: "out" },
  { value: "correction", label: "Stock Correction", sign: -1, category: "out" },
];

export const getAuditActionMeta = (value) =>
  AUDIT_ACTION_TYPES.find((a) => a.value === value) || AUDIT_ACTION_TYPES[0];

/** Fetch the owner-configured stock-in/stock-out timing windows. */
export const getAuditWindowSettings = async () => {
  try {
    const snap = await getDoc(settingsDocRef());
    if (!snap.exists()) return DEFAULT_AUDIT_WINDOWS;
    return { ...DEFAULT_AUDIT_WINDOWS, ...snap.data() };
  } catch (error) {
    console.error("getAuditWindowSettings error:", error);
    return DEFAULT_AUDIT_WINDOWS;
  }
};

/** Save owner-configured timing windows. */
export const saveAuditWindowSettings = async (windows) => {
  await setDoc(settingsDocRef(), windows, { merge: true });
};

/** Fetch recent audit log entries (Inbox view), newest first. */
export const fetchAuditLog = async (max = 50) => {
  try {
    const q = query(auditLogRef(), orderBy("performedAt", "desc"), limit(max));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("fetchAuditLog error:", error);
    // Fallback without orderBy if index isn't ready yet.
    const snap = await getDocs(auditLogRef());
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (b.performedAt?.seconds || 0) - (a.performedAt?.seconds || 0));
    return rows.slice(0, max);
  }
};

const parseQty = (quantityString) => parseFloat(String(quantityString).split(" ")[0]) || 0;

const statusForQty = (qty, low, veryLow) => {
  if (qty <= (veryLow ?? 0)) return "Very Low";
  if (qty <= (low ?? 0)) return "Low";
  return "Good";
};

/**
 * Apply one bulk action (e.g. "Spoiled/Discarded") to multiple inventory items at once.
 * `lines` = [{ item, quantity }] where `item` is the full inventory doc (with id) and
 * `quantity` is the amount to add/remove for that specific item.
 * Writes one audit-log doc for the whole batch, plus updates each item doc.
 */
export const applyBulkAuditAction = async ({ actionType, lines, note, performedBy = "Staff" }) => {
  const meta = getAuditActionMeta(actionType);
  const now = Timestamp.now();
  const batchResults = [];

  for (const line of lines) {
    const { item, quantity } = line;
    const qty = Math.abs(parseFloat(quantity));
    if (!item || !qty) continue;

    const currentQty = parseQty(item.quantity);
    let newQty = currentQty + meta.sign * qty;
    if (newQty < 0) newQty = 0;
    const newStatus = statusForQty(newQty, item.thresholdLow, item.thresholdVeryLow);

    const itemDocRef = doc(restaurantRoot(), item.id);
    await updateDoc(itemDocRef, {
      quantity: `${newQty} ${item.unit}`,
      status: newStatus,
      updatedAt: now,
      actions: [
        ...(Array.isArray(item.actions) ? item.actions : []),
        {
          type: actionType,
          quantity: qty,
          timestamp: now,
          source: "auditInbox",
        },
      ],
    });

    batchResults.push({
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      quantity: qty,
      previousQuantity: currentQty,
      newQuantity: newQty,
    });
  }

  await addDoc(auditLogRef(), {
    actionType,
    actionLabel: meta.label,
    items: batchResults,
    note: note || "",
    performedBy,
    performedAt: now,
  });

  return batchResults;
};
