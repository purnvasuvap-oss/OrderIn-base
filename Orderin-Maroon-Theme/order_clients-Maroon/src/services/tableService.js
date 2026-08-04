import { db } from "../firebase";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  writeBatch,
  updateDoc,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { isOrderQueued, isOrderActive } from "./orderService";

// Same restaurant id used throughout orderService.js / firebase.js.
const RESTAURANT_ID = "orderin_restaurant_4";

const TOTAL_SEED_TABLES = 25;
const DEFAULT_CAPACITY = 4;

const tablesCollectionRef = () =>
  collection(db, "Restaurant", RESTAURANT_ID, "tables");

const tableDocRef = (num) =>
  doc(db, "Restaurant", RESTAURANT_ID, "tables", String(num));

/**
 * One-time seed: if the `tables` collection is empty, batch-write docs for
 * tables 1..25 (num, capacity: 4, status: "available"). Matches the existing
 * hardcoded "/ 25" assumption in Dashboard.jsx / utils/tableCount.js — this
 * is the real per-table system that assumption always implied but never had.
 * Safe to call on every page load: it checks emptiness first and is a no-op
 * once any table docs exist.
 */
export const seedTablesIfEmpty = async () => {
  try {
    const snapshot = await getDocs(tablesCollectionRef());
    if (!snapshot.empty) return false;

    const batch = writeBatch(db);
    for (let num = 1; num <= TOTAL_SEED_TABLES; num += 1) {
      batch.set(tableDocRef(num), {
        num,
        capacity: DEFAULT_CAPACITY,
        status: "available",
        reservedName: null,
        reservedTime: null,
        reservedAt: null,
        reservationAlerted: false,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return true;
  } catch (error) {
    console.error("Error seeding tables collection:", error);
    throw error;
  }
};

/**
 * Subscribe to the stored `tables` collection. `status` is fully
 * authoritative here — "available" | "reserved" | "cleaning" | "occupied" —
 * see `reconcileOccupiedTables` below for how a table gets promoted to
 * "occupied" and why clearing it is a manual-only action.
 */
export const subscribeTables = (onUpdate) => {
  try {
    const unsubscribe = onSnapshot(
      tablesCollectionRef(),
      (snapshot) => {
        const tables = snapshot.docs
          .map((d) => {
            const data = d.data() || {};
            return {
              id: d.id,
              num: Number(data.num ?? d.id) || 0,
              capacity: Number(data.capacity) || DEFAULT_CAPACITY,
              status: data.status || "available",
              reservedName: data.reservedName ?? null,
              // `reservedTime` is the legacy free-text field (kept for
              // display fallback on old docs); `reservedAt` is the new
              // ISO-string real timestamp `reconcileReservations` acts on.
              reservedTime: data.reservedTime ?? null,
              reservedAt: data.reservedAt ?? null,
              reservationAlerted: Boolean(data.reservationAlerted),
            };
          })
          .sort((a, b) => a.num - b.num);
        if (typeof onUpdate === "function") onUpdate(tables);
      },
      (error) => {
        console.error("onSnapshot error (tables):", error);
        if (typeof onUpdate === "function") onUpdate([]);
      },
    );
    return unsubscribe;
  } catch (error) {
    console.error("Failed to subscribe to tables:", error);
    if (typeof onUpdate === "function") onUpdate([]);
    return () => {};
  }
};

/** Add a new table doc — used by "Add Table" for a staff-added 26th+ table. */
export const addTable = async (num, capacity = DEFAULT_CAPACITY) => {
  await setDoc(tableDocRef(num), {
    num: Number(num),
    capacity: Number(capacity) || DEFAULT_CAPACITY,
    status: "available",
    reservedName: null,
    reservedTime: null,
    reservedAt: null,
    reservationAlerted: false,
    updatedAt: serverTimestamp(),
  });
};

/** Set a table's capacity (inline "edit capacity" control). */
export const updateTableCapacity = async (num, capacity) => {
  await updateDoc(tableDocRef(num), {
    capacity: Number(capacity) || DEFAULT_CAPACITY,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Reserve a table: staff-entered guest/party name + a real ISO-string
 * arrival timestamp (`reservedAt`, from the `datetime-local` picker in
 * `ReserveTableModal`). Replaces the old free-text `reservedTime` field —
 * that field is cleared here so a re-reservation of a table that still has
 * an old free-text value doesn't leave stale data around. `reservationAlerted`
 * resets to false so the 15-minute cleanup alert can fire for this booking.
 */
export const reserveTable = async (num, reservedName, reservedAt) => {
  await updateDoc(tableDocRef(num), {
    status: "reserved",
    reservedName: reservedName || null,
    reservedAt: reservedAt || null,
    reservedTime: null,
    reservationAlerted: false,
    updatedAt: serverTimestamp(),
  });
};

/** Cancel a reservation, returning the table to Available. */
export const cancelReservation = async (num) => {
  await updateDoc(tableDocRef(num), {
    status: "available",
    reservedName: null,
    reservedTime: null,
    reservedAt: null,
    reservationAlerted: false,
    updatedAt: serverTimestamp(),
  });
};

/**
 * "Free" a table — the ONLY way an Occupied table goes back to Cleaning.
 * Guests keep sitting at a table after their order is marked Delivered, so
 * occupancy is never auto-cleared just because the order finished; staff
 * click this once the party has actually left.
 */
export const markTableCleaning = async (num) => {
  await updateDoc(tableDocRef(num), {
    status: "cleaning",
    updatedAt: serverTimestamp(),
  });
};

/** "Mark ready": Cleaning -> Available. */
export const markTableReady = async (num) => {
  await updateDoc(tableDocRef(num), {
    status: "available",
    updatedAt: serverTimestamp(),
  });
};

/** Delete a table's doc entirely (does not touch any order data). */
export const deleteTable = async (num) => {
  await deleteDoc(tableDocRef(num));
};

// Same tableNumber/tableNo/table fallback chain used everywhere else this
// is checked (TableManagement.jsx, utils/tableCount.js), kept in one place
// here so Dashboard.jsx and TableManagement.jsx can never drift apart on
// what counts as "this order belongs to table N".
const getOrderTableNumber = (order) => {
  const raw = order.tableNumber || order.tableNo || order.table || null;
  if (raw === null || raw === undefined || raw === "N/A") return null;
  return String(raw);
};

/** Which table numbers have a currently-live (queued or active, i.e. not
 * yet delivered/rejected) order, given the rolling-24h feed from
 * `subscribeRecentOrders` (same feed Orders.jsx itself uses). */
export const getLiveOccupiedTableNumbers = (orders = []) => {
  const set = new Set();
  orders.forEach((o) => {
    if (!(isOrderQueued(o) || isOrderActive(o))) return;
    const tableNum = getOrderTableNumber(o);
    if (tableNum) set.add(tableNum);
  });
  return set;
};

// De-dupes concurrent promotion writes across whichever page(s) happen to
// be mounted (Dashboard and TableManagement both call this).
const promotingInFlight = new Set();

/**
 * One-way auto-promotion: any table with a currently-live order gets its
 * STORED status set to "occupied" if it isn't already. This is the single
 * source of truth both Dashboard.jsx and TableManagement.jsx rely on for
 * "is this table occupied" (they just read `status` off the `tables`
 * subscription — no more re-deriving it from orders on every render).
 *
 * Deliberately one-directional: once a live order shows up, the table
 * stays "occupied" even after that order is marked Delivered — guests are
 * still sitting there eating. Only the manual "Free" action (staff, once
 * the party has actually left) moves it to "cleaning". Call this from
 * every page that subscribes to both tables and recent orders so occupancy
 * gets promoted promptly regardless of which admin page is open.
 */
export const reconcileOccupiedTables = async (rawTables, orders) => {
  const liveTableNumbers = getLiveOccupiedTableNumbers(orders);
  if (liveTableNumbers.size === 0) return;
  const byNum = new Map((rawTables || []).map((t) => [String(t.num), t]));
  for (const numStr of liveTableNumbers) {
    const t = byNum.get(numStr);
    if (!t || t.status === "occupied" || promotingInFlight.has(numStr)) continue;
    promotingInFlight.add(numStr);
    try {
      await updateDoc(tableDocRef(t.num), {
        status: "occupied",
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error auto-promoting table to occupied:", error);
    } finally {
      promotingInFlight.delete(numStr);
    }
  }
};

// --- Time-aware reservations -------------------------------------------
//
// `reservedAt` is an ISO string captured from the `datetime-local` picker in
// `ReserveTableModal`. Some existing table docs may still only have the OLD
// free-text `reservedTime` field from before this change (no `reservedAt`
// at all) — every helper below treats a missing/unparseable `reservedAt` as
// "not time-tracked" and simply skips time-based logic for that table,
// rather than crashing on it.

/** Parses `reservedAt` to epoch ms, or null if missing/unparseable. */
const parseReservedAtMs = (reservedAt) => {
  if (!reservedAt) return null;
  const ms = new Date(reservedAt).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** Human-readable arrival time for notification text / display fallback. */
export const formatReservedAt = (reservedAt) => {
  const ms = parseReservedAtMs(reservedAt);
  if (ms === null) return null;
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

/**
 * "Is this reserved table effectively available right now" — true up until
 * ~15 minutes before the reserved time, so `TableManagement.jsx` can show it
 * as bookable-for-walk-ins (display-layer only; the reservation fields stay
 * untouched in Firestore). Also true (backward-compat) when `reservedAt` is
 * missing/unparseable, e.g. an old free-text-only doc.
 */
export const isReservationPending = (table) => {
  if (!table || table.status !== "reserved") return false;
  const ms = parseReservedAtMs(table.reservedAt);
  if (ms === null) return true;
  return Date.now() < ms - 15 * 60 * 1000;
};

// De-dupe guards, same pattern/purpose as `promotingInFlight` above — both
// TableManagement.jsx and Dashboard.jsx call `reconcileReservations` from
// their own periodic effects, so concurrent writes for the same table need
// to be avoided.
const alertingInFlight = new Set();
const clearingInFlight = new Set();

/**
 * Time-based reservation reconciliation, mirroring `reconcileOccupiedTables`'s
 * style (error-tolerant per-table try/catch, in-flight de-dupe guards,
 * `updateDoc`/`serverTimestamp()` conventions). For every table with
 * `status === "reserved"` and a valid, parseable `reservedAt`:
 *  - within 15 minutes of the reserved time (and not yet alerted): flips
 *    `reservationAlerted` and writes a `reservation-alert` doc into the
 *    `notifications` collection (same shape `NotificationContext.jsx`'s
 *    `addActivity` writes, so it renders on the existing "Recent Activities"
 *    tab unchanged).
 *  - 30+ minutes past the reserved time and the table is STILL "reserved"
 *    (i.e. no live order ever showed up — `reconcileOccupiedTables` would
 *    already have flipped it to "occupied" otherwise): auto-clears the
 *    reservation as a no-show.
 * Tables with no parseable `reservedAt` (missing, or an old free-text-only
 * doc) are skipped entirely — no time-based logic applies to them.
 */
export const reconcileReservations = async (rawTables) => {
  const now = Date.now();
  for (const t of rawTables || []) {
    if (!t || t.status !== "reserved") continue;
    const ms = parseReservedAtMs(t.reservedAt);
    if (ms === null) continue;
    const numStr = String(t.num);

    if (
      now >= ms - 15 * 60 * 1000 &&
      now < ms &&
      !t.reservationAlerted &&
      !alertingInFlight.has(numStr)
    ) {
      alertingInFlight.add(numStr);
      try {
        await updateDoc(tableDocRef(t.num), {
          reservationAlerted: true,
          updatedAt: serverTimestamp(),
        });
        await addDoc(collection(db, "Restaurant", RESTAURANT_ID, "notifications"), {
          message: `Table ${t.num} has a reservation at ${formatReservedAt(t.reservedAt)} — clean it up within 15 minutes`,
          type: "reservation-alert",
          source: "table-management",
          tableNum: t.num,
          timestamp: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error firing reservation alert for table:", t.num, error);
      } finally {
        alertingInFlight.delete(numStr);
      }
      continue;
    }

    if (now >= ms + 30 * 60 * 1000 && !clearingInFlight.has(numStr)) {
      clearingInFlight.add(numStr);
      try {
        await updateDoc(tableDocRef(t.num), {
          status: "available",
          reservedName: null,
          reservedAt: null,
          reservationAlerted: false,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error auto-clearing no-show reservation for table:", t.num, error);
      } finally {
        clearingInFlight.delete(numStr);
      }
    }
  }
};
