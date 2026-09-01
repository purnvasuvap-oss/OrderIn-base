import { useEffect, useRef } from "react";
import { EVENTS, on } from "../lib/bus";
import { listOrders, listInventory, inventoryStatus, getSettings } from "../lib/repo";
import { listPrintJobs } from "../lib/printer";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ROLES } from "../lib/auth";
import { notify, recordNotification } from "../lib/notifications";

// Which roles care about which event. The per-category toggle in Settings can
// still mute any of these; this just avoids, say, popping "print failed" at
// kitchen staff who can't act on it.
const ROLE_CATEGORIES = {
  [ROLES.ADMIN]: ["newOrder", "kitchenDelay", "lowStock", "printFail"],
  [ROLES.MANAGER]: ["newOrder", "kitchenDelay", "lowStock", "printFail"],
  [ROLES.KITCHEN]: ["newOrder", "kitchenDelay"],
  [ROLES.CASHIER]: ["newOrder", "printFail"],
};

// Plural noun for the "N x happened at once" summary popup.
const CATEGORY_PLURAL = {
  newOrder: "new orders",
  kitchenDelay: "orders running late",
  lowStock: "low-stock items",
  printFail: "print failures",
};

const LATE_FALLBACK_MIN = 15; // mirrors LONG_WAIT_MIN in Kitchen.jsx
const ACTIVE_STATUSES = ["new", "preparing", "ready"];
const HEALTHY = new Set(["ok", undefined, null]);
const ALERT_STATUSES = new Set(["out", "critical", "low"]);

/**
 * Headless: subscribes to the app event bus and raises OS notifications for
 * new orders, kitchen delays, low stock and failed print jobs. Mounted once
 * inside the authenticated layout.
 *
 * Burst handling: when several things happen in one pass (e.g. 4 orders sync
 * at once) each is logged to the notification history individually, but the
 * user gets a single "4 new orders" popup + toast, and the sound is throttled
 * in lib/notifications.js — so a rush never turns into machine-gun alerts.
 */
export default function NotificationWatcher() {
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.role;

  // useToast() returns a fresh object each render — keep it in a ref so the
  // effect below doesn't re-subscribe on every parent render.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const knownOrderIds = useRef(new Set());
  const alertedLate = useRef(new Set());
  const invStatus = useRef(new Map());
  const seenFailedJobs = useRef(new Set());
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (!role) return undefined;
    const allowed = new Set(ROLE_CATEGORIES[role] || []);
    mountedAt.current = Date.now();

    // Log every item, but only ever raise ONE popup/toast per batch.
    // items: [{ key, title, label, body }]
    const raise = (category, items, url) => {
      if (!allowed.has(category) || !items.length) return;
      items.forEach((it) => recordNotification({ category, title: it.title, body: it.body, url }));

      const single = items.length === 1;
      const title = single ? items[0].title : `${items.length} ${CATEGORY_PLURAL[category]}`;
      const body = single ? items[0].body : items.map((it) => it.label).join(", ");
      const tag = single ? `${category}-${items[0].key}` : `${category}-batch`;

      notify(category, title, { body, tag, url });
      toastRef.current.info(title);
    };

    // --- seed "already seen" state so we only alert on things that happen
    // after this component mounts ---
    let cancelled = false;
    listOrders().then((orders) => {
      if (cancelled) return;
      (orders || []).forEach((o) => knownOrderIds.current.add(o.id));
    });
    listInventory().then((items) => {
      if (cancelled) return;
      (items || []).forEach((i) => invStatus.current.set(i.id, inventoryStatus(i)));
    });
    listPrintJobs().then((jobs) => {
      if (cancelled) return;
      (jobs || []).filter((j) => j.status === "failed").forEach((j) => seenFailedJobs.current.add(j.id));
    });

    // --- new order ---
    const offOrders = on(EVENTS.ORDERS_CHANGED, async () => {
      const orders = (await listOrders()) || [];
      const activeIds = new Set();
      const fresh = [];
      for (const o of orders) {
        if (ACTIVE_STATUSES.includes(o.status)) activeIds.add(o.id);
        const isNew = !knownOrderIds.current.has(o.id);
        knownOrderIds.current.add(o.id);
        if (isNew && o.status === "new" && o.createdAt >= mountedAt.current) {
          fresh.push({
            key: o.id,
            title: `New order ${o.orderNo}`,
            label: o.orderNo,
            body: (o.items || []).map((it) => `${it.qty}x ${it.name}`).join(", "),
          });
        }
      }
      raise("newOrder", fresh, role === ROLES.KITCHEN ? "/kitchen" : "/orders");
      // let a re-opened order alert again later
      for (const id of alertedLate.current) if (!activeIds.has(id)) alertedLate.current.delete(id);
    });

    // --- kitchen delay (poll, mirrors Kitchen.jsx 30s tick) ---
    const checkLate = async () => {
      const [orders, orderSettings] = await Promise.all([listOrders(), getSettings("order")]);
      const threshold = Number(orderSettings?.avgPrepTimeAlertMin) || LATE_FALLBACK_MIN;
      const late = [];
      for (const o of orders || []) {
        if (!["new", "preparing"].includes(o.status)) continue;
        const minutesAgo = Math.floor((Date.now() - o.createdAt) / 60000);
        if (minutesAgo >= threshold && !alertedLate.current.has(o.id)) {
          alertedLate.current.add(o.id);
          late.push({
            key: o.id,
            title: `Order ${o.orderNo} is running late`,
            label: o.orderNo,
            body: `${minutesAgo} min in the kitchen (threshold ${threshold} min)`,
          });
        }
      }
      raise("kitchenDelay", late, "/kitchen");
    };
    const lateTimer = setInterval(checkLate, 30000);
    checkLate();

    // --- low stock ---
    const offInv = on(EVENTS.INVENTORY_CHANGED, async () => {
      const items = (await listInventory()) || [];
      const dropped = [];
      for (const i of items) {
        const prev = invStatus.current.get(i.id);
        const next = inventoryStatus(i);
        invStatus.current.set(i.id, next);
        if (ALERT_STATUSES.has(next) && HEALTHY.has(prev)) {
          dropped.push({
            key: i.id,
            title: `Low stock: ${i.name}`,
            label: i.name,
            body: `${i.stock} ${i.unit || ""} left${next === "out" ? " — out of stock" : ""}`.trim(),
          });
        }
      }
      raise("lowStock", dropped, "/inventory");
    });

    // --- failed print job ---
    const offJobs = on(EVENTS.PRINT_JOBS_CHANGED, async () => {
      const jobs = (await listPrintJobs()) || [];
      const failed = [];
      for (const j of jobs) {
        if (j.status === "failed" && !seenFailedJobs.current.has(j.id)) {
          seenFailedJobs.current.add(j.id);
          failed.push({
            key: j.id,
            title: "Print failed",
            label: j.kind || "Job",
            body: `${j.kind || "Job"} — ${j.error || "unknown error"}`,
          });
        }
      }
      raise("printFail", failed, "/settings");
    });

    return () => {
      cancelled = true;
      clearInterval(lateTimer);
      offOrders();
      offInv();
      offJobs();
    };
  }, [role]);

  return null;
}
