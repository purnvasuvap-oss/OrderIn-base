import { openDB } from "idb";

const DB_NAME = "orderin_pos_db";
const DB_VERSION = 2;

export const STORES = {
  users: "users",
  categories: "categories",
  products: "products",
  inventory: "inventory",
  inventoryTx: "inventoryTx",
  orders: "orders",
  employees: "employees",
  suppliers: "suppliers",
  expenses: "expenses",
  wastage: "wastage",
  customers: "customers",
  settings: "settings",
  auditLogs: "auditLogs",
  syncQueue: "syncQueue",
  syncConflicts: "syncConflicts",
  printJobs: "printJobs",
};

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const mk = (name, keyPath = "id") => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath });
          }
        };
        mk(STORES.users);
        mk(STORES.categories);
        mk(STORES.products);
        mk(STORES.inventory);
        mk(STORES.inventoryTx);
        mk(STORES.orders);
        mk(STORES.employees);
        mk(STORES.suppliers);
        mk(STORES.expenses);
        mk(STORES.wastage);
        mk(STORES.customers);
        mk(STORES.settings);
        mk(STORES.auditLogs);
        mk(STORES.syncQueue);
        mk(STORES.syncConflicts);
        mk(STORES.printJobs);
      },
    });
  }
  return dbPromise;
}

export async function getAll(store) {
  const db = await getDB();
  return db.getAll(store);
}

export async function getOne(store, id) {
  const db = await getDB();
  return db.get(store, id);
}

export async function putOne(store, value) {
  const db = await getDB();
  await db.put(store, value);
  return value;
}

export async function putMany(store, values) {
  const db = await getDB();
  const tx = db.transaction(store, "readwrite");
  await Promise.all(values.map((v) => tx.store.put(v)));
  await tx.done;
  return values;
}

export async function removeOne(store, id) {
  const db = await getDB();
  await db.delete(store, id);
}

export async function clearStore(store) {
  const db = await getDB();
  await db.clear(store);
}

export async function countAll(store) {
  const db = await getDB();
  return db.count(store);
}

export function genId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
