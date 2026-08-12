import { STORES } from "./db";
import { EVENTS } from "./bus";

// Maps a synced IndexedDB store to the bus event UI components listen on,
// so both the local write path (repo.js) and the realtime pull path
// (realtime.js / sync.js conflict resolution) refresh the same way.
export const ENTITY_EVENT = {
  [STORES.orders]: EVENTS.ORDERS_CHANGED,
  [STORES.inventory]: EVENTS.INVENTORY_CHANGED,
  [STORES.products]: EVENTS.MENU_CHANGED,
  [STORES.categories]: EVENTS.MENU_CHANGED,
  [STORES.employees]: EVENTS.EMPLOYEES_CHANGED,
  [STORES.suppliers]: EVENTS.SUPPLIERS_CHANGED,
  [STORES.expenses]: EVENTS.EXPENSES_CHANGED,
  [STORES.wastage]: EVENTS.WASTAGE_CHANGED,
  [STORES.customers]: EVENTS.CUSTOMERS_CHANGED,
  [STORES.settings]: EVENTS.SETTINGS_CHANGED,
};

// Stores that live-sync bidirectionally with Firestore (push local writes,
// pull remote changes in realtime). Local-only stores (users, auditLogs,
// syncQueue, syncConflicts, printJobs, inventoryTx) are deliberately excluded.
export const REALTIME_STORES = Object.keys(ENTITY_EVENT);
