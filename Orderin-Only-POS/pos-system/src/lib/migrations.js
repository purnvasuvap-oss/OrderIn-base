import { STORES, getAll, removeOne } from "./db";
import { enqueueSync } from "./sync";

// suppliers, employees and users were originally seeded with random ids
// (genId(...)), then switched to fixed ones (e.g. "sup_freshfarm") so
// multiple devices converge on the same Firestore docs instead of each
// creating their own copy. Anyone who'd already opened the app before that
// switch still has the old random-id records sitting in local storage —
// and now also pulls in the new fixed-id ones via realtime sync, so the
// same supplier/employee/user visibly appears twice with different ids.
// This runs once on every boot (cheap — a handful of records) and removes
// any local copy that doesn't match the known-good fixed id for its name,
// both locally and via a delete pushed to Firestore in case a stale one had
// ever been pushed there too.
const KNOWN_FIXED_IDS = [
  {
    store: STORES.suppliers,
    keyField: "name",
    idFor: { "FreshFarm Produce": "sup_freshfarm", "MetroMeat Suppliers": "sup_metromeat" },
  },
  {
    store: STORES.employees,
    keyField: "name",
    idFor: { "Owner Admin": "emp_admin", "Priya Manager": "emp_manager", "Arun Cashier": "emp_cashier", "Kitchen Staff": "emp_kitchen" },
  },
  {
    store: STORES.users,
    keyField: "username",
    idFor: { admin: "usr_admin", manager: "usr_manager", cashier: "usr_cashier", kitchen: "usr_kitchen" },
  },
];

export async function dedupeLegacySeeds() {
  for (const { store, keyField, idFor } of KNOWN_FIXED_IDS) {
    const all = await getAll(store);
    for (const record of all) {
      // users also holds accessControl-cached logins (id "acc_...", see
      // AuthContext.cacheAccessUser) — a *different*, intentionally distinct
      // account from the seeded demo one with the same username, not a
      // stale duplicate of it. Leave those alone.
      if (store === STORES.users && record.source === "accessControl") continue;
      const expectedId = idFor[record[keyField]];
      if (expectedId && record.id !== expectedId) {
        await removeOne(store, record.id);
        enqueueSync(store, "delete", { id: record.id });
      }
    }
  }
}
