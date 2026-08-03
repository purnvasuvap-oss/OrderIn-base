// src/services/staffService.js
//
// Firestore-backed Staff Management data layer, following the same
// conventions as tableService.js / orderService.js in this app:
//   - RESTAURANT_ID constant + Restaurant/{id}/<collection> path style
//   - onSnapshot-based subscribe* helpers that call back with a plain array
//   - plain-string PIN storage (this app doesn't hash internal section
//     passcodes either — see verifySectionPasscode in ../firebase.js, which
//     compares `passcodeHash` with plain `===`; staff PINs follow that same
//     established convention rather than introducing new crypto here)
import { db } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

const RESTAURANT_ID = "orderin_restaurant_4";

const staffCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "staff");
const staffDocRef = (id) => doc(db, "Restaurant", RESTAURANT_ID, "staff", id);

const rosterCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "staffRoster");
const rosterDocId = (weekKey, staffId) => `${weekKey}_${staffId}`;
const rosterDocRef = (weekKey, staffId) =>
  doc(db, "Restaurant", RESTAURANT_ID, "staffRoster", rosterDocId(weekKey, staffId));

const timeOffCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "timeOffRequests");
const swapCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "shiftSwapRequests");

const attendanceCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "attendance");
const attendanceDocId = (dateKey, staffId) => `${dateKey}_${staffId}`;
const attendanceDocRef = (dateKey, staffId) =>
  doc(db, "Restaurant", RESTAURANT_ID, "attendance", attendanceDocId(dateKey, staffId));

export const ROLES = ["Admin", "General Manager", "Kitchen", "Floor"];
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

/** Auto-generate a 4-digit PIN, same shape as the demo's random-PIN default. */
export const generatePin = () => String(1000 + Math.floor(Math.random() * 9000));

/** ISO yyyy-mm-dd for a Date, in local time. */
const isoDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Today's date-key (local), used for attendance doc ids/queries. */
export const todayKey = () => isoDate(new Date());

/** The Monday (ISO date, local) of the week containing `date`. Used as a
 * stable roster week-key so prev/next-week navigation always resolves to
 * the same doc regardless of which day of that week you're viewing from. */
export const weekKeyFor = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return isoDate(d);
};

/** The 7 calendar dates (Mon..Sun) for a given week-key, for display. */
export const datesForWeek = (weekKey) => {
  const [y, m, d] = weekKey.split("-").map(Number);
  const monday = new Date(y, m - 1, d);
  return Array.from({ length: 7 }).map((_, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return dt;
  });
};

/** Previous/next week-key relative to a given week-key. */
export const shiftWeekKey = (weekKey, deltaWeeks) => {
  const [y, m, d] = weekKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaWeeks * 7);
  return isoDate(dt);
};

/* ---------------------------------------------------------------------- */
/* Staff directory                                                        */
/* ---------------------------------------------------------------------- */

/**
 * Subscribe to the `staff` collection.
 * Doc shape: { name, role, phone, email (nullable), pin, status: "active"|
 * "paused", createdAt, updatedAt }
 */
export const subscribeStaff = (onUpdate) => {
  try {
    return onSnapshot(
      staffCollectionRef(),
      (snapshot) => {
        const staff = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        if (typeof onUpdate === "function") onUpdate(staff);
      },
      (error) => {
        console.error("onSnapshot error (staff):", error);
        if (typeof onUpdate === "function") onUpdate([]);
      },
    );
  } catch (error) {
    console.error("Failed to subscribe to staff:", error);
    if (typeof onUpdate === "function") onUpdate([]);
    return () => {};
  }
};

/** Add a staff member. Email is OPTIONAL — pass null/"" if not provided.
 * PIN auto-generates (4-digit) if left blank. */
export const addStaff = async ({ name, role, phone, email, pin, status = "active" }) => {
  const payload = {
    name: (name || "").trim(),
    role: role || "Floor",
    phone: (phone || "").trim(),
    email: email && email.trim() ? email.trim() : null,
    pin: pin && String(pin).trim() ? String(pin).trim() : generatePin(),
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const docRef = await addDoc(staffCollectionRef(), payload);
  return docRef.id;
};

/** Edit a staff member's core fields. Email stays optional/nullable. */
export const updateStaff = async (id, { name, role, phone, email }) => {
  await updateDoc(staffDocRef(id), {
    name: (name || "").trim(),
    role,
    phone: (phone || "").trim(),
    email: email && email.trim() ? email.trim() : null,
    updatedAt: serverTimestamp(),
  });
};

/** Pause a staff member — paused staff can't clock in/out (PIN punch
 * rejects with "Invalid or inactive PIN"), matching the demo's behaviour. */
export const pauseStaff = async (id) => {
  await updateDoc(staffDocRef(id), { status: "paused", updatedAt: serverTimestamp() });
};

/** Restore a paused staff member back to active. */
export const restoreStaff = async (id) => {
  await updateDoc(staffDocRef(id), { status: "active", updatedAt: serverTimestamp() });
};

/** Reset a staff member's login PIN. Generates a new random 4-digit PIN
 * unless an explicit one is passed. Returns the new PIN. */
export const resetStaffPin = async (id, newPin) => {
  const pin = newPin && String(newPin).trim() ? String(newPin).trim() : generatePin();
  await updateDoc(staffDocRef(id), { pin, updatedAt: serverTimestamp() });
  return pin;
};

/** Permanently remove a staff member's directory entry. */
export const deleteStaff = async (id) => {
  await deleteDoc(staffDocRef(id));
};

/* ---------------------------------------------------------------------- */
/* Roster / shifts                                                        */
/* ---------------------------------------------------------------------- */

/**
 * Subscribe to a single week's roster. Doc shape (one doc per staff member
 * per week, id `${weekKey}_${staffId}`):
 *   { weekKey, staffId, days: [ null | { type: "morning"|"evening"|"night",
 *     start: "HH:MM", end: "HH:MM" }, ...7 entries, Mon..Sun ], updatedAt }
 * Calls back with a Map keyed by staffId -> days[7].
 */
export const subscribeRoster = (weekKey, onUpdate) => {
  try {
    const q = query(rosterCollectionRef(), where("weekKey", "==", weekKey));
    return onSnapshot(
      q,
      (snapshot) => {
        const map = new Map();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          map.set(data.staffId, data.days || Array(7).fill(null));
        });
        if (typeof onUpdate === "function") onUpdate(map);
      },
      (error) => {
        console.error("onSnapshot error (roster):", error);
        if (typeof onUpdate === "function") onUpdate(new Map());
      },
    );
  } catch (error) {
    console.error("Failed to subscribe to roster:", error);
    if (typeof onUpdate === "function") onUpdate(new Map());
    return () => {};
  }
};

/** Set (or clear, with shift=null) a single day's shift for a staff member
 * in a given week. Creates the roster doc for that staff+week if needed. */
export const setShift = async (weekKey, staffId, dayIndex, shift) => {
  const ref = rosterDocRef(weekKey, staffId);
  const snap = await getDoc(ref);
  const days = snap.exists() ? snap.data().days || Array(7).fill(null) : Array(7).fill(null);
  const nextDays = [...days];
  nextDays[dayIndex] = shift || null;
  await setDoc(
    ref,
    { weekKey, staffId, days: nextDays, updatedAt: serverTimestamp() },
    { merge: true },
  );
};

/** Mark a week's roster as published (a lightweight flag doc). */
export const publishRoster = async (weekKey) => {
  const ref = doc(db, "Restaurant", RESTAURANT_ID, "staffRosterMeta", weekKey);
  await setDoc(ref, { weekKey, publishedAt: serverTimestamp() }, { merge: true });
};

/* ---------------------------------------------------------------------- */
/* Time-off requests                                                      */
/* ---------------------------------------------------------------------- */

/**
 * Doc shape: { staffId, staffName, startDate, endDate, reason, status:
 * "pending"|"approved"|"denied", createdAt, decidedAt }
 *
 * NOTE (judgment call): staff have no self-service app of their own — the
 * only staff-facing surface in this codebase is the PIN punch-clock — so
 * there's no natural place for a staff member to originate a request
 * themselves. Instead, a manager logs the request on the staff member's
 * behalf from a small "Log request" affordance in the Roster tab, and the
 * normal Approve/Deny actions operate on it exactly as if the staff member
 * had filed it.
 */
export const subscribeTimeOffRequests = (onUpdate) => {
  try {
    return onSnapshot(
      timeOffCollectionRef(),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (typeof onUpdate === "function") onUpdate(list);
      },
      (error) => {
        console.error("onSnapshot error (timeOffRequests):", error);
        if (typeof onUpdate === "function") onUpdate([]);
      },
    );
  } catch (error) {
    console.error("Failed to subscribe to timeOffRequests:", error);
    if (typeof onUpdate === "function") onUpdate([]);
    return () => {};
  }
};

export const addTimeOffRequest = async ({ staffId, staffName, startDate, endDate, reason }) => {
  await addDoc(timeOffCollectionRef(), {
    staffId,
    staffName,
    startDate,
    endDate,
    reason: reason || "",
    status: "pending",
    createdAt: serverTimestamp(),
    decidedAt: null,
  });
};

export const decideTimeOffRequest = async (id, status) => {
  await updateDoc(doc(timeOffCollectionRef(), id), { status, decidedAt: serverTimestamp() });
};

/* ---------------------------------------------------------------------- */
/* Shift-swap requests                                                    */
/* ---------------------------------------------------------------------- */

/**
 * Doc shape: { staffId, staffName, withStaffId, withStaffName, date, reason,
 * status: "pending"|"approved"|"denied", createdAt, decidedAt }
 * Same manager-logs-on-behalf-of-staff pattern as time-off requests above.
 */
export const subscribeSwapRequests = (onUpdate) => {
  try {
    return onSnapshot(
      swapCollectionRef(),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (typeof onUpdate === "function") onUpdate(list);
      },
      (error) => {
        console.error("onSnapshot error (shiftSwapRequests):", error);
        if (typeof onUpdate === "function") onUpdate([]);
      },
    );
  } catch (error) {
    console.error("Failed to subscribe to shiftSwapRequests:", error);
    if (typeof onUpdate === "function") onUpdate([]);
    return () => {};
  }
};

export const addSwapRequest = async ({ staffId, staffName, withStaffId, withStaffName, date, reason }) => {
  await addDoc(swapCollectionRef(), {
    staffId,
    staffName,
    withStaffId: withStaffId || null,
    withStaffName: withStaffName || "",
    date,
    reason: reason || "",
    status: "pending",
    createdAt: serverTimestamp(),
    decidedAt: null,
  });
};

export const decideSwapRequest = async (id, status) => {
  await updateDoc(doc(swapCollectionRef(), id), { status, decidedAt: serverTimestamp() });
};

/* ---------------------------------------------------------------------- */
/* Attendance / PIN punch-clock                                           */
/* ---------------------------------------------------------------------- */

/**
 * Doc shape (one doc per staff member per day, id `${dateKey}_${staffId}`):
 *   { dateKey, staffId, staffName, clockInAt, clockOutAt, breakMinutes,
 *     onBreak, breakStartAt, updatedAt }
 */
export const subscribeTodayAttendance = (onUpdate) => {
  try {
    const q = query(attendanceCollectionRef(), where("dateKey", "==", todayKey()));
    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (typeof onUpdate === "function") onUpdate(list);
      },
      (error) => {
        console.error("onSnapshot error (attendance):", error);
        if (typeof onUpdate === "function") onUpdate([]);
      },
    );
  } catch (error) {
    console.error("Failed to subscribe to attendance:", error);
    if (typeof onUpdate === "function") onUpdate([]);
    return () => {};
  }
};

/** Compute worked hours for an attendance record, using "now" if the staff
 * member hasn't clocked out yet. */
export const hoursOf = (record) => {
  if (!record || !record.clockInAt) return 0;
  const inMs = record.clockInAt.toDate ? record.clockInAt.toDate().getTime() : new Date(record.clockInAt).getTime();
  const outMs = record.clockOutAt
    ? record.clockOutAt.toDate
      ? record.clockOutAt.toDate().getTime()
      : new Date(record.clockOutAt).getTime()
    : Date.now();
  const breakMs = (record.breakMinutes || 0) * 60000;
  const workedMs = Math.max(0, outMs - inMs - breakMs);
  return workedMs / 3600000;
};

/** Derive a display status for an attendance row. */
export const attendanceStatus = (record) => {
  if (!record || !record.clockInAt) return "not-in";
  if (record.clockOutAt) return "clocked-out";
  if (record.onBreak) return "on-break";
  return "on-shift";
};

/**
 * PIN punch-clock: look up the active staff member with this PIN, then
 * toggle today's clock-in/out.
 *   - No match, or matched staff is paused -> throws with the demo's exact
 *     "Invalid or inactive PIN" message.
 *   - Match, not yet clocked in today (or already clocked out) -> clocks IN.
 *   - Match, currently clocked in (no clockOutAt yet) -> clocks OUT.
 * Returns { staff, action: "in"|"out" }.
 */
export const punchPin = async (pin) => {
  const snapshot = await getDocs(staffCollectionRef());
  const staff = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((s) => s.pin === pin);

  if (!staff || staff.status !== "active") {
    const err = new Error("Invalid or inactive PIN");
    err.code = "invalid-pin";
    throw err;
  }

  const dateKey = todayKey();
  const ref = attendanceDocRef(dateKey, staff.id);
  const existing = await getDoc(ref);
  const data = existing.exists() ? existing.data() : null;

  if (!data || !data.clockInAt || data.clockOutAt) {
    // Not clocked in yet today (or already completed a shift) -> clock IN,
    // resetting the record for a fresh shift.
    await setDoc(
      ref,
      {
        dateKey,
        staffId: staff.id,
        staffName: staff.name,
        clockInAt: serverTimestamp(),
        clockOutAt: null,
        breakMinutes: 0,
        onBreak: false,
        breakStartAt: null,
        updatedAt: serverTimestamp(),
      },
      { merge: false },
    );
    return { staff, action: "in" };
  }

  // Already clocked in -> clock OUT. If on break, fold the open break into
  // breakMinutes first so hours-worked stays accurate.
  let extraBreakMinutes = 0;
  if (data.onBreak && data.breakStartAt) {
    const startMs = data.breakStartAt.toDate ? data.breakStartAt.toDate().getTime() : new Date(data.breakStartAt).getTime();
    extraBreakMinutes = Math.max(0, Math.round((Date.now() - startMs) / 60000));
  }
  await updateDoc(ref, {
    clockOutAt: serverTimestamp(),
    onBreak: false,
    breakStartAt: null,
    breakMinutes: (data.breakMinutes || 0) + extraBreakMinutes,
    updatedAt: serverTimestamp(),
  });
  return { staff, action: "out" };
};

/** Toggle break on/off for an attendance record (manager row action). */
export const toggleBreak = async (attendanceRecordId, record) => {
  const ref = doc(attendanceCollectionRef(), attendanceRecordId);
  if (record.onBreak) {
    let extraBreakMinutes = 0;
    if (record.breakStartAt) {
      const startMs = record.breakStartAt.toDate
        ? record.breakStartAt.toDate().getTime()
        : new Date(record.breakStartAt).getTime();
      extraBreakMinutes = Math.max(0, Math.round((Date.now() - startMs) / 60000));
    }
    await updateDoc(ref, {
      onBreak: false,
      breakStartAt: null,
      breakMinutes: (record.breakMinutes || 0) + extraBreakMinutes,
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, { onBreak: true, breakStartAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
};

/** Manual "Clock out" row action (manager-initiated, same effect as the
 * staff member punching out via PIN). */
export const clockOutRecord = async (attendanceRecordId, record) => {
  const ref = doc(attendanceCollectionRef(), attendanceRecordId);
  let extraBreakMinutes = 0;
  if (record.onBreak && record.breakStartAt) {
    const startMs = record.breakStartAt.toDate
      ? record.breakStartAt.toDate().getTime()
      : new Date(record.breakStartAt).getTime();
    extraBreakMinutes = Math.max(0, Math.round((Date.now() - startMs) / 60000));
  }
  await updateDoc(ref, {
    clockOutAt: serverTimestamp(),
    onBreak: false,
    breakStartAt: null,
    breakMinutes: (record.breakMinutes || 0) + extraBreakMinutes,
    updatedAt: serverTimestamp(),
  });
};
