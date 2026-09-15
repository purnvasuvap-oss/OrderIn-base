const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

// This deployment is single-tenant (see src/lib/firebase.js RESTAURANT_ID) —
// every other collection path in this app is hardcoded to the same id, so
// these triggers match that instead of using a {restaurantId} wildcard.
const RESTAURANT_ID = "orderin_restaurant_pos";
const db = admin.firestore();

// Mirrors ROLE_CATEGORIES in src/components/NotificationWatcher.jsx — which
// roles' devices should be pushed to for which alert category. printFail is
// deliberately absent: a print failure only matters to the device doing the
// printing, and print jobs aren't synced to Firestore, so there's nothing
// for a Cloud Function to observe there anyway.
const ROLE_CATEGORIES = {
  admin: ["newOrder", "kitchenDelay", "lowStock", "activity"],
  manager: ["newOrder", "kitchenDelay", "lowStock", "activity"],
  kitchen: ["newOrder", "kitchenDelay"],
  cashier: ["newOrder"],
};

// "activity" = everything else: menu, inventory catalog edits, staff,
// suppliers, expenses, settings, and order status/cancel/refund. Kitchen and
// cashier don't get it — a cashier doesn't need to know a supplier record
// changed, and it'd bury the alerts they actually act on.

// Mirrors inventoryStatus() in src/lib/repo.js exactly.
function inventoryStatus(item) {
  if (!item) return "in_stock";
  if (item.stock <= 0) return "out";
  if (item.stock <= item.minStock * 0.5) return "critical";
  if (item.stock <= item.minStock) return "low";
  return "in_stock";
}

/** Writes/merges a durable notification record — the single source of truth
 * behind the /notifications page (see src/lib/notifications.js). `refId`
 * mirrors whatever the client would compute for the same event, so a device
 * that was open when this fired and one that wasn't converge on one doc
 * instead of two. */
async function writeNotificationDoc(category, refId, title, body, url) {
  const id = `${category}_${refId}`;
  await db
    .collection("Restaurant").doc(RESTAURANT_ID).collection("notifications").doc(id)
    .set({ category, title, body: body || "", url: url || null, at: Date.now(), read: false }, { merge: true });
  return id;
}

async function tokensForCategory(category) {
  const snap = await db.collection("Restaurant").doc(RESTAURANT_ID).collection("fcmTokens").get();
  return snap.docs
    .filter((d) => (ROLE_CATEGORIES[d.data().role] || []).includes(category))
    .map((d) => ({ id: d.id, token: d.data().token }))
    .filter((t) => t.token);
}

/** Sends a data-only push to every given token, then deletes any token
 * Firebase reports as unregistered/invalid — devices come and go (browser
 * data cleared, notifications revoked, app uninstalled), and there's no
 * other event that would ever clean these up. */
async function sendPush(tokenRecords, data) {
  if (!tokenRecords.length) return;
  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? "")]));
  const resp = await admin.messaging().sendEachForMulticast({
    tokens: tokenRecords.map((t) => t.token),
    data: stringData,
  });
  const stale = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument") {
        stale.push(tokenRecords[i].id);
      }
    }
  });
  await Promise.all(
    stale.map((id) => db.collection("Restaurant").doc(RESTAURANT_ID).collection("fcmTokens").doc(id).delete())
  );
}

// --- new order -------------------------------------------------------------
exports.onOrderCreated = functions.firestore
  .document(`Restaurant/${RESTAURANT_ID}/orders/{orderId}`)
  .onCreate(async (snap, context) => {
    const order = snap.data();
    if (!order || order.status !== "new") return null;

    const orderId = context.params.orderId;
    const title = `New order ${order.orderNo || orderId}`;
    const body = (order.items || []).map((it) => `${it.qty}x ${it.name}`).join(", ");
    const url = "/orders";

    await writeNotificationDoc("newOrder", orderId, title, body, url);
    const tokens = await tokensForCategory("newOrder");
    await sendPush(tokens, { category: "newOrder", title, body, url, tag: `newOrder-${orderId}` });
    return null;
  });

// --- low stock ---------------------------------------------------------
exports.onInventoryUpdated = functions.firestore
  .document(`Restaurant/${RESTAURANT_ID}/inventory/{itemId}`)
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const prevStatus = inventoryStatus(before);
    const nextStatus = inventoryStatus(after);
    const ALERT = new Set(["out", "critical", "low"]);
    const HEALTHY = new Set(["in_stock", undefined, null]);
    if (!(ALERT.has(nextStatus) && HEALTHY.has(prevStatus))) return null;

    const refId = `${context.params.itemId}_${nextStatus}`;
    const title = `Low stock: ${after.name}`;
    const body = `${after.stock} ${after.unit || ""} left${nextStatus === "out" ? " — out of stock" : ""}`.trim();
    const url = "/inventory";

    await writeNotificationDoc("lowStock", refId, title, body, url);
    const tokens = await tokensForCategory("lowStock");
    await sendPush(tokens, { category: "lowStock", title, body, url, tag: `lowStock-${refId}` });
    return null;
  });

// --- kitchen delay (scheduled — nothing else writes a "this order is late"
// event to Firestore, so this has to poll rather than trigger) --------------
exports.checkLateOrders = functions.pubsub.schedule("every 5 minutes").onRun(async () => {
  const restaurantRef = db.collection("Restaurant").doc(RESTAURANT_ID);
  const [ordersSnap, settingsSnap] = await Promise.all([
    restaurantRef.collection("orders").where("status", "in", ["new", "preparing"]).get(),
    restaurantRef.collection("settings").doc("order").get(),
  ]);
  const threshold = Number(settingsSnap.exists ? settingsSnap.data().avgPrepTimeAlertMin : null) || 15;
  const now = Date.now();
  const tokens = await tokensForCategory("kitchenDelay");

  for (const orderDoc of ordersSnap.docs) {
    const order = orderDoc.data();
    if (order.lateNotifiedAt) continue; // already alerted once for this order — mirrors alertedLate in NotificationWatcher.jsx
    const minutesAgo = Math.floor((now - order.createdAt) / 60000);
    if (minutesAgo < threshold) continue;

    const title = `Order ${order.orderNo || orderDoc.id} is running late`;
    const body = `${minutesAgo} min in the kitchen (threshold ${threshold} min)`;
    const url = "/kitchen";

    await writeNotificationDoc("kitchenDelay", orderDoc.id, title, body, url);
    await sendPush(tokens, { category: "kitchenDelay", title, body, url, tag: `kitchenDelay-${orderDoc.id}` });
    await orderDoc.ref.update({ lateNotifiedAt: now });
  }
  return null;
});

// --- everything else: menu, inventory, staff, suppliers, expenses, settings,
// order status/cancel/refund --------------------------------------------
//
// Every mutation in this app already calls logAudit() (see src/lib/repo.js)
// with a consistent { action: "entity.verb", entity, entityId, before, after }
// shape, into one auditLogs collection. Rather than write a near-identical
// trigger per entity type, this single trigger covers all of them — and any
// entity added later gets push coverage for free the moment it starts
// calling logAudit(), no Cloud Functions change required.
const ENTITY_LABELS = {
  category: "Menu category", product: "Menu item", inventory: "Inventory item",
  employee: "Staff", supplier: "Supplier", expense: "Expense", settings: "Settings", order: "Order",
};
const ACTION_VERBS = {
  create: "added", save: "saved", update: "updated", delete: "deleted",
  status: "status updated", cancel: "cancelled", refund: "refunded",
  reactivate: "reactivated", discontinue: "discontinued",
};
const ENTITY_URLS = {
  category: "/menu", product: "/menu", inventory: "/inventory",
  employee: "/employees", supplier: "/suppliers", expense: "/expenses",
  settings: "/settings", order: "/orders",
};

function subjectOf(entityKey, log) {
  const rec = log.after || log.before || {};
  if (entityKey === "expense") return rec.description || rec.category || log.entityId;
  if (entityKey === "order") return rec.orderNo || log.entityId;
  return rec.name || log.entityId;
}

exports.onAuditLogCreated = functions.firestore
  .document(`Restaurant/${RESTAURANT_ID}/auditLogs/{logId}`)
  .onCreate(async (snap, context) => {
    const log = snap.data();
    // order.create already gets a richer, dedicated push from onOrderCreated
    // above (with the item list) — skip it here to avoid a second, blander
    // notification for the same event. Every other order action (status,
    // cancel, refund) isn't covered by that trigger, so it flows through here.
    if (!log || !log.action || log.action === "order.create") return null;

    const [entityKey, verbKey] = log.action.split(".");
    const label = ENTITY_LABELS[entityKey];
    if (!label) return null; // an action we don't have a friendly label for yet — skip rather than guess

    const verb = ACTION_VERBS[verbKey] || verbKey;
    const subject = subjectOf(entityKey, log);
    const title = `${label} ${verb}: ${subject}`;
    const body = log.user ? `by ${log.user}` : "";
    const url = ENTITY_URLS[entityKey] || "/dashboard";
    const logId = context.params.logId;

    await writeNotificationDoc("activity", logId, title, body, url);
    const tokens = await tokensForCategory("activity");
    await sendPush(tokens, { category: "activity", title, body, url, tag: `activity-${logId}` });
    return null;
  });
