// Swiggy / Zomato orders for the staff app.
//
// Orders arrive through the aggregator backend (/aggregator-functions at the
// repo root, not deployed yet — pending billing review) and live in their own
// documents at Restaurant/{id}/aggregatorOrders/{platform}_{orderId}, not in
// the customers/{phone}.pastOrders array.
//
// Staff actions here only change the order's `status`; the backend's
// aggregatorStatusPush function reports each change to Swiggy/Zomato and
// writes the outcome to `sync`, which the Online orders inbox shows.
//
// The status rules below mirror aggregator-functions/src/model.js — keep both
// in sync.

import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

export const RESTAURANT_ID = "orderin_restaurant_2";

export const PLATFORM_LABEL = { swiggy: "Swiggy", zomato: "Zomato" };

export const AGG_STATUS = Object.freeze({
  PLACED: "placed",
  ACCEPTED: "accepted",
  READY: "ready",
  PICKED_UP: "picked_up",
  DELIVERED: "delivered",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

const STAFF_TRANSITIONS = {
  placed: ["accepted", "rejected"],
  accepted: ["ready"],
  ready: ["picked_up"],
};

export const canStaffMove = (from, to) => (STAFF_TRANSITIONS[from] || []).includes(to);

export const REJECT_REASONS = [
  { value: "item_out_of_stock", label: "An item is out of stock" },
  { value: "kitchen_busy", label: "Kitchen too busy" },
  { value: "store_closing", label: "Restaurant closing" },
  { value: "cannot_fulfil_instructions", label: "Can't follow the instructions" },
  { value: "other", label: "Other" },
];

export const PREP_TIME_CHOICES = [10, 15, 20, 30, 45];

// Aggregator status -> the staff app's existing order statuses
// (Pending / Preparing / Ready / Delivered / Rejected).
const STAFF_STATUS = {
  placed: "Pending",
  accepted: "Preparing",
  ready: "Ready",
  picked_up: "Delivered",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Rejected",
};

// Staff status chosen on the Orders page -> aggregator status to set.
export const AGG_STATUS_FOR_STAFF_STATUS = { Ready: "ready", Delivered: "picked_up" };

const ordersCol = (rid = RESTAURANT_ID) => collection(db, "Restaurant", rid, "aggregatorOrders");
const orderRef = (id, rid = RESTAURANT_ID) => doc(db, "Restaurant", rid, "aggregatorOrders", id);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Converts a stored aggregator order into the same shape the Orders page uses
 * for dine-in orders, so it can share the list, board, counts and status pill.
 */
export function toStaffOrder(id, data) {
  const platform = data.platform;
  const label = PLATFORM_LABEL[platform] || platform;
  const items = (Array.isArray(data.items) ? data.items : []).map((it) => ({
    name: it.name,
    quantity: it.quantity,
    price: it.unitPrice,
    instructions: [
      it.addons && it.addons.length ? `+ ${it.addons.map((a) => a.name).join(", ")}` : "",
      it.instructions || "",
    ]
      .filter(Boolean)
      .join(" · "),
  }));
  const amounts = data.amounts || {};
  return {
    id,
    isAggregator: true,
    platform,
    platformLabel: label,
    externalOrderId: data.externalOrderId,
    aggregatorStatus: data.status,
    status: STAFF_STATUS[data.status] || "Pending",
    username: (data.customer && data.customer.name) || "Customer",
    tableNumber: label,
    phoneNumber: (data.customer && data.customer.phoneMasked) || "",
    items,
    itemDetails: items.map((it) => ({ ...it, total: (Number(it.price) || 0) * (Number(it.quantity) || 1) })),
    timestamp: new Date(data.receivedAt || data.placedAt || Date.now()),
    receivedAt: data.receivedAt || null,
    acceptBy: data.acceptBy || null,
    prepMinutes: data.prepMinutes || null,
    acceptedAt: data.acceptedAt || null,
    instructions: data.instructions || "",
    subtotal: amounts.subtotal || 0,
    tax: amounts.taxes || 0,
    totalCost: amounts.total || 0,
    // Swiggy/Zomato collect the money (prepaid, or cash by their rider).
    paymentStatus: "paid",
    paymentType: data.payment && data.payment.mode === "cod" ? `Cash to ${label} rider` : `Paid on ${label}`,
    paid: "Yes",
    isManualOrder: false,
    unmappedItems: data.unmappedItems || 0,
    rider: data.rider || null,
    cancelReason: data.cancelReason || null,
    rejectReason: data.rejectReason || null,
    sync: data.sync || null,
    simulated: data.simulated === true,
  };
}

/** Live list of aggregator orders received in the last 24 hours. */
export function subscribeAggregatorOrders(onUpdate, { restaurantId = RESTAURANT_ID, now = Date.now() } = {}) {
  try {
    const q = query(ordersCol(restaurantId), where("receivedAt", ">=", now - DAY_MS));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => toStaffOrder(d.id, d.data()));
        list.sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
        onUpdate(list);
      },
      (err) => {
        console.error("aggregator orders subscription failed:", err);
        onUpdate([]);
      }
    );
  } catch (err) {
    console.error("aggregator orders subscription failed:", err);
    onUpdate([]);
    return () => {};
  }
}

/** Moves an order to `to` if that's an allowed staff move from its current status. */
async function moveOrder(id, to, extra = {}, restaurantId = RESTAURANT_ID) {
  const ref = orderRef(id, restaurantId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("This order no longer exists.");
    const current = snap.data();
    if (!canStaffMove(current.status, to)) {
      if (current.status === "cancelled") {
        throw new Error(`${PLATFORM_LABEL[current.platform] || "The platform"} cancelled this order.`);
      }
      throw new Error(`Can't change this order from "${current.status}" to "${to}".`);
    }
    tx.update(ref, { status: to, statusSource: "staff", statusUpdatedAt: Date.now(), ...extra });
    return to;
  });
}

export const acceptAggregatorOrder = (id, prepMinutes, restaurantId) => {
  const minutes = Number(prepMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return Promise.reject(new Error("Choose a preparation time."));
  return moveOrder(id, AGG_STATUS.ACCEPTED, { prepMinutes: minutes, acceptedAt: Date.now() }, restaurantId);
};

export const rejectAggregatorOrder = (id, reason, restaurantId) => {
  if (!REJECT_REASONS.some((r) => r.value === reason)) return Promise.reject(new Error("Choose a reason."));
  return moveOrder(id, AGG_STATUS.REJECTED, { rejectReason: reason }, restaurantId);
};

/** Ready / handed over, from the Orders page status controls. */
export const advanceAggregatorOrder = (id, staffStatus, restaurantId) => {
  const to = AGG_STATUS_FOR_STAFF_STATUS[staffStatus];
  if (!to) return Promise.resolve(null); // e.g. "Preparing" — already the case once accepted
  return moveOrder(id, to, {}, restaurantId);
};

/** Asks the backend to re-send the last status after a failed push. */
export const retryAggregatorSync = (id, restaurantId = RESTAURANT_ID) =>
  runTransaction(db, async (tx) => {
    const ref = orderRef(id, restaurantId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("This order no longer exists.");
    const sync = snap.data().sync || {};
    tx.update(ref, { sync: { ...sync, retryRequestedAt: Date.now() } });
  });

/**
 * "Send test order": writes an order exactly as the backend would after a
 * webhook, marked `simulated` so it is never sent to the real platform.
 * Lets staff rehearse the flow before the integration goes live.
 */
export async function simulateAggregatorOrder(platform, menuItems = [], { restaurantId = RESTAURANT_ID, now = Date.now() } = {}) {
  const pool = menuItems.filter((m) => m && m.name && Number(String(m.price).replace(/[^0-9.]/g, "")) > 0);
  const picks = (pool.length ? pool : [{ id: null, name: "Test dish", price: 150 }]).slice(0, 3);
  const items = picks.map((m, i) => {
    const unitPrice = Number(String(m.price).replace(/[^0-9.]/g, "")) || 150;
    const quantity = i === 0 ? 2 : 1;
    return {
      externalId: `test-${m.id || i}`,
      name: m.name,
      quantity,
      unitPrice,
      addons: [],
      total: unitPrice * quantity,
      instructions: i === 0 ? "Less spicy" : "",
      menuItemId: m.id || null,
    };
  });
  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const taxes = Math.round(subtotal * 0.05 * 100) / 100;
  const externalOrderId = `TEST-${Math.floor(now / 1000)}`;
  const id = `${platform}_${externalOrderId}`;
  await setDoc(orderRef(id, restaurantId), {
    platform,
    externalOrderId,
    storeId: "TEST",
    restaurantId,
    status: "placed",
    statusSource: "platform",
    statusUpdatedAt: now,
    placedAt: now,
    receivedAt: now,
    acceptBy: now + 3 * 60 * 1000,
    prepMinutes: null,
    rejectReason: null,
    customer: { name: "Test", phoneMasked: "•••••0000" },
    items,
    unmappedItems: items.filter((it) => !it.menuItemId).length,
    instructions: "Test order — not a real customer",
    amounts: { subtotal, taxes, packaging: 0, discount: 0, total: subtotal + taxes },
    payment: { mode: "prepaid", collectedBy: "platform" },
    rider: null,
    sync: { state: "idle", attempts: 0, lastError: null, lastSentStatus: null, at: null },
    simulated: true,
  });
  return id;
}
