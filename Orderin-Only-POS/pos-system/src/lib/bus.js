const target = new EventTarget();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("orderin_pos_bus") : null;

if (channel) {
  channel.onmessage = (e) => {
    target.dispatchEvent(new CustomEvent(e.data?.type, { detail: e.data?.detail }));
  };
}

export function emit(type, detail) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
  channel?.postMessage({ type, detail });
}

export function on(type, handler) {
  const wrapped = (e) => handler(e.detail);
  target.addEventListener(type, wrapped);
  return () => target.removeEventListener(type, wrapped);
}

export const EVENTS = {
  ORDERS_CHANGED: "orders_changed",
  INVENTORY_CHANGED: "inventory_changed",
  MENU_CHANGED: "menu_changed",
  SYNC_STATUS_CHANGED: "sync_status_changed",
  AUDIT_CHANGED: "audit_changed",
  PRINT_JOBS_CHANGED: "print_jobs_changed",
  PRINTER_STATUS_CHANGED: "printer_status_changed",
  EMPLOYEES_CHANGED: "employees_changed",
  SUPPLIERS_CHANGED: "suppliers_changed",
  EXPENSES_CHANGED: "expenses_changed",
  WASTAGE_CHANGED: "wastage_changed",
  CUSTOMERS_CHANGED: "customers_changed",
  SETTINGS_CHANGED: "settings_changed",
  USERS_CHANGED: "users_changed",
  NOTIFICATIONS_CHANGED: "notifications_changed",
};
