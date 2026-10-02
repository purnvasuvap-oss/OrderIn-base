// src/services/staffService.js
//
// Firestore-backed Staff Management data layer, following the same
// conventions as tableService.js / orderService.js in this app:
//   - RESTAURANT_ID constant + Restaurant/{id}/<collection> path style
//   - onSnapshot-based subscribe* helpers that call back with a plain array
//   - bcrypt PIN storage with a one-time legacy plaintext migration. PIN
//     values are never returned by the staff directory subscription.
import { db } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  runTransaction,
} from "firebase/firestore";
import bcrypt from "bcryptjs";

const RESTAURANT_ID = "orderin_restuarant_6";

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
const auditCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "staffAuditLog");
const notificationCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "staffNotifications");
const pinAttemptCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "staffPinAttempts");
const payrollRunsCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "payrollRuns");
const payrollRunDocRef = (periodKey) => doc(payrollRunsCollectionRef(), periodKey);
const payrollRowsCollectionRef = (periodKey) => collection(payrollRunDocRef(periodKey), "rows");

export const ROLES = ["Admin", "General Manager", "Kitchen", "Floor"];
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const STAFF_PERMISSIONS = Object.freeze({
  viewStaff: "staff.view",
  manageStaff: "staff.manage",
  manageRoles: "staff.roles",
  editRoster: "roster.edit",
  approveRequests: "requests.approve",
  correctAttendance: "attendance.correct",
  viewPayroll: "payroll.view",
  managePayroll: "payroll.manage",
  viewAudit: "audit.view",
  manageNotifications: "notifications.manage",
});
export const ROLE_PERMISSIONS = Object.freeze({
  Admin: Object.values(STAFF_PERMISSIONS),
  "General Manager": Object.values(STAFF_PERMISSIONS).filter((p) => p !== STAFF_PERMISSIONS.manageRoles),
  Kitchen: [STAFF_PERMISSIONS.viewStaff, STAFF_PERMISSIONS.editRoster, STAFF_PERMISSIONS.approveRequests],
  Floor: [STAFF_PERMISSIONS.viewStaff],
});
export const normalizeRole = (role) => {
  const value = String(role || "").trim().toLowerCase();
  return ROLES.find((item) => item.toLowerCase() === value) || null;
};
export const permissionsForRole = (role, explicit = null) => {
  const normalized = normalizeRole(role);
  const permissions = Array.isArray(explicit) ? explicit : (ROLE_PERMISSIONS[normalized] || []);
  return Object.freeze({ role: normalized, permissions, can: (permission) => permissions.includes(permission) });
};

// Zone / Team are organisational tags distinct from `role` (which is the
// access-level enum above). Team is a flat list, not filtered/gated by the
// selected Zone — per user confirmation every team is available under
// every zone despite conceptually sitting "under" one.
export const ZONES = ["Floor", "Kitchen", "Dining Hall", "Management"];
export const TEAMS = [
  "Cooking Team",
  "Finance Team",
  "Cleaning Team",
  "Serving Team",
  "Maintenance Team",
  "Security Team",
];

export const isActiveStaff = (staff) => Boolean(staff) && staff.status !== "inactive" &&
  staff.status !== "archived" && staff.status !== "paused" &&
  staff.status !== "on-leave" && staff.status !== "terminated";

const writeAudit = async (action, staffId, details = {}) => {
  try {
    await addDoc(auditCollectionRef(), {
      schemaVersion: 1,
      action,
      staffId: staffId || null,
      details,
      actor: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("staffRole") || "staff-management" : "staff-management",
      actorId: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("staffId") || null : null,
      actorRole: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("staffRole") || null : null,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // Audit logging must never prevent the requested staff operation.
    console.warn("Staff audit log unavailable:", error);
  }
};

const writeNotification = async (message, type = "staff", staffId = null, details = {}) => {
  try {
    await addDoc(notificationCollectionRef(), {
      message,
      type,
      staffId,
      details,
      source: "staff-management",
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("Staff notification unavailable:", error);
  }
};

export const subscribeStaffAuditLog = (onUpdate, limitCount = 100) => {
  try {
    return onSnapshot(auditCollectionRef(), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, limitCount);
      onUpdate?.(rows);
    }, () => onUpdate?.([]));
  } catch {
    onUpdate?.([]);
    return () => {};
  }
};
export const subscribeStaffNotifications = (onUpdate, staffId = null) => {
  try {
    return onSnapshot(notificationCollectionRef(), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => !item.staffId || !staffId || item.staffId === staffId)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      onUpdate?.(rows);
    }, () => onUpdate?.([]));
  } catch {
    onUpdate?.([]);
    return () => {};
  }
};
export const markStaffNotificationRead = async (id) => updateDoc(doc(notificationCollectionRef(), id), { read: true, readAt: serverTimestamp() });
export const createStaffNotification = (message, type = "staff", staffId = null, details = {}) =>
  writeNotification(message, type, staffId, details);
export const subscribeAuditLog = subscribeStaffAuditLog;
export const subscribeNotifications = subscribeStaffNotifications;
export const markNotificationRead = markStaffNotificationRead;

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

/** Auto-generate a 4-digit PIN, same shape as the demo's random-PIN default. */
export const generatePin = () => String(1000 + Math.floor(Math.random() * 9000));
export const hashStaffPin = (pin) => bcrypt.hash(String(pin), 10);
export const verifyStaffPin = async (pin, staff) => {
  if (!staff || !pin) return false;
  if (staff.pinHash) return bcrypt.compare(String(pin), staff.pinHash);
  // Legacy records are accepted once and upgraded by the next successful punch.
  return staff.pin === String(pin);
};

/** Authenticate a staff member's own PIN without clocking them in/out. */
export const authenticateStaffPin = async (pin) => {
  const snapshot = await getDocs(staffCollectionRef());
  for (const item of snapshot.docs) {
    const staff = { id: item.id, ...item.data() };
    if (!isActiveStaff(staff)) continue;
    if (await verifyStaffPin(pin, staff)) {
      if (!staff.pinHash) {
        await updateDoc(staffDocRef(staff.id), {
          pinHash: await hashStaffPin(pin),
          pinLast4: String(pin).slice(-4),
          updatedAt: serverTimestamp(),
        });
      }
      return { ...staff, pin: undefined, pinHash: undefined };
    }
  }
  return null;
};

/** Throws if `pin` is already assigned to another staff member. `punchPin`
 * resolves a PIN to a staff record via a plain first-match find(), so two
 * staff sharing a PIN means punching it always clocks the wrong (first
 * matched) one in/out — this is the guard that keeps that from happening,
 * called from both addStaff and resetStaffPin. `excludeId` lets
 * resetStaffPin re-assign a staff member their own current PIN without
 * tripping on itself. */
const assertPinAvailable = async (pin, excludeId = null) => {
  const snap = await getDocs(staffCollectionRef());
  for (const item of snap.docs) {
    if (item.id !== excludeId && await verifyStaffPin(pin, { id: item.id, ...item.data() })) {
      throw new Error(`PIN ${pin} is already assigned to another staff member.`);
    }
  }
};

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
 * "inactive", zone (nullable), team (nullable), jobRole (nullable),
 * hireDate, emergencyContact, notes, availability, createdAt, updatedAt }
 */
export const subscribeStaff = (onUpdate) => {
  try {
    return onSnapshot(
      staffCollectionRef(),
      (snapshot) => {
        const staff = snapshot.docs
          .map((d) => {
            const { pin, pinHash, ...safeStaff } = d.data();
            return { id: d.id, ...safeStaff };
          })
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

/** Add a staff member. Email, zone, team, jobRole are all OPTIONAL — pass
 * null/"" if not provided. PIN auto-generates (4-digit) if left blank. */
export const addStaff = async ({
  name, role, phone, email, pin, status = "active", zone, team, jobRole,
  hireDate, emergencyContact, notes, availability, employmentType, address, skills,
  certifications, assignedLocation, terminationDate, lastWorkingDate, rehireDate,
  documents, preferredShift, minWeeklyHours, maxWeeklyHours, compensation,
  availabilityExceptions,
  employeeId, photoUrl, emergencyRelationship, leaveBalances, paymentProvider,
}) => {
  if (pin && !/^\d{4}$/.test(String(pin).trim())) throw new Error("PIN must be exactly 4 digits.");
  let finalPin;
  if (pin && String(pin).trim()) {
    finalPin = String(pin).trim();
    await assertPinAvailable(finalPin);
  } else {
    // Auto-generated PIN: retry on the rare collision instead of erroring.
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generatePin();
      const snap = await getDocs(staffCollectionRef());
      const collision = (await Promise.all(snap.docs.map((item) => verifyStaffPin(candidate, item.data())))).some(Boolean);
      if (!collision) {
        finalPin = candidate;
        break;
      }
    }
    if (!finalPin) {
      throw new Error("Could not generate a unique PIN — please try again.");
    }
  }

  const payload = {
    name: (name || "").trim(),
    role: role || "Floor",
    phone: (phone || "").trim(),
    email: email && email.trim() ? email.trim() : null,
    pinHash: await hashStaffPin(finalPin),
    pinLast4: finalPin.slice(-4),
    status,
    zone: zone && zone.trim() ? zone.trim() : null,
    team: team && team.trim() ? team.trim() : null,
    jobRole: jobRole && jobRole.trim() ? jobRole.trim() : null,
    hireDate: hireDate || null,
    emergencyContact: emergencyContact && emergencyContact.trim() ? emergencyContact.trim() : null,
    notes: notes && notes.trim() ? notes.trim() : null,
    availability: availability || null,
    availabilityExceptions: Array.isArray(availabilityExceptions) ? availabilityExceptions : [],
    employmentType: employmentType || "full-time",
    address: address || null,
    skills: Array.isArray(skills) ? skills : [],
    certifications: Array.isArray(certifications) ? certifications : [],
    assignedLocation: assignedLocation || null,
    terminationDate: terminationDate || null,
    lastWorkingDate: lastWorkingDate || null,
    rehireDate: rehireDate || null,
    documents: Array.isArray(documents) ? documents : [],
    preferredShift: preferredShift || null,
    minWeeklyHours: Number.isFinite(Number(minWeeklyHours)) ? Number(minWeeklyHours) : 0,
    maxWeeklyHours: Number.isFinite(Number(maxWeeklyHours)) ? Number(maxWeeklyHours) : 40,
    compensation: compensation || null,
    employeeId: employeeId && String(employeeId).trim() ? String(employeeId).trim() : null,
    photoUrl: photoUrl && String(photoUrl).trim() ? String(photoUrl).trim() : null,
    emergencyRelationship: emergencyRelationship && String(emergencyRelationship).trim() ? String(emergencyRelationship).trim() : null,
    leaveBalances: leaveBalances && typeof leaveBalances === "object" ? leaveBalances : { vacation: 0, sick: 0 },
    paymentProvider: paymentProvider && typeof paymentProvider === "object" ? {
      providerId: paymentProvider.providerId || null,
      provider: paymentProvider.provider || null,
      last4: paymentProvider.last4 ? String(paymentProvider.last4).slice(-4) : null,
    } : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const docRef = await addDoc(staffCollectionRef(), payload);
  await writeAudit("staff.created", docRef.id, { name: payload.name, role: payload.role });
  await writeNotification(`${payload.name} was added to staff`, "staff-created");
  return docRef.id;
};

/** Edit a staff member's core fields. Email/zone/team/jobRole stay
 * optional/nullable. */
export const updateStaff = async (id, {
  name, role, phone, email, zone, team, jobRole, hireDate, emergencyContact, notes,
  availability, employmentType, address, skills, certifications, assignedLocation,
  terminationDate, lastWorkingDate, rehireDate, documents, preferredShift,
  minWeeklyHours, maxWeeklyHours, compensation, availabilityExceptions,
  employeeId, photoUrl, emergencyRelationship, leaveBalances, paymentProvider,
}) => {
  await updateDoc(staffDocRef(id), {
    name: (name || "").trim(),
    role,
    phone: (phone || "").trim(),
    email: email && email.trim() ? email.trim() : null,
    zone: zone && zone.trim() ? zone.trim() : null,
    team: team && team.trim() ? team.trim() : null,
    jobRole: jobRole && jobRole.trim() ? jobRole.trim() : null,
    hireDate: hireDate || null,
    emergencyContact: emergencyContact && emergencyContact.trim() ? emergencyContact.trim() : null,
    notes: notes && notes.trim() ? notes.trim() : null,
    availability: availability || null,
    availabilityExceptions: Array.isArray(availabilityExceptions) ? availabilityExceptions : [],
    employmentType: employmentType || "full-time",
    address: address || null,
    skills: Array.isArray(skills) ? skills : [],
    certifications: Array.isArray(certifications) ? certifications : [],
    assignedLocation: assignedLocation || null,
    terminationDate: terminationDate || null,
    lastWorkingDate: lastWorkingDate || null,
    rehireDate: rehireDate || null,
    documents: Array.isArray(documents) ? documents : [],
    preferredShift: preferredShift || null,
    minWeeklyHours: Number.isFinite(Number(minWeeklyHours)) ? Number(minWeeklyHours) : 0,
    maxWeeklyHours: Number.isFinite(Number(maxWeeklyHours)) ? Number(maxWeeklyHours) : 40,
    compensation: compensation || null,
    employeeId: employeeId && String(employeeId).trim() ? String(employeeId).trim() : null,
    photoUrl: photoUrl && String(photoUrl).trim() ? String(photoUrl).trim() : null,
    emergencyRelationship: emergencyRelationship && String(emergencyRelationship).trim() ? String(emergencyRelationship).trim() : null,
    leaveBalances: leaveBalances && typeof leaveBalances === "object" ? leaveBalances : { vacation: 0, sick: 0 },
    paymentProvider: paymentProvider && typeof paymentProvider === "object" ? {
      providerId: paymentProvider.providerId || null,
      provider: paymentProvider.provider || null,
      last4: paymentProvider.last4 ? String(paymentProvider.last4).slice(-4) : null,
    } : null,
    updatedAt: serverTimestamp(),
  });
  await writeAudit("staff.updated", id, { name, role });
};

/** Staff may edit only contact details; employment, compensation and payment
 * metadata remain manager-controlled. */
export const updateStaffPersonalInfo = async (id, {
  phone, email, address, emergencyContact, emergencyRelationship, photoUrl,
}) => {
  const changes = {
    phone: String(phone || "").trim(),
    email: email && String(email).trim() ? String(email).trim() : null,
    address: address && String(address).trim() ? String(address).trim() : null,
    emergencyContact: emergencyContact && String(emergencyContact).trim() ? String(emergencyContact).trim() : null,
    emergencyRelationship: emergencyRelationship && String(emergencyRelationship).trim() ? String(emergencyRelationship).trim() : null,
    photoUrl: photoUrl && String(photoUrl).trim() ? String(photoUrl).trim() : null,
    updatedAt: serverTimestamp(),
  };
  await updateDoc(staffDocRef(id), changes);
  await writeAudit("staff.personal_info_updated", id, {
    fields: Object.keys(changes).filter((field) => field !== "updatedAt"),
  });
};

/** Deactivate a staff member without deleting their profile/history — an
 * inactive staff member can't clock in/out (PIN punch rejects). */
export const pauseStaff = async (id) => {
  await updateDoc(staffDocRef(id), {
    status: "inactive",
    deactivatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await writeAudit("staff.deactivated", id);
  await writeNotification("A staff member was deactivated", "staff-deactivated");
};

/** Restore a paused staff member back to active. */
export const restoreStaff = async (id) => {
  await updateDoc(staffDocRef(id), {
    status: "active",
    deactivatedAt: null,
    updatedAt: serverTimestamp(),
  });
  await writeAudit("staff.restored", id);
  await writeNotification("A staff member was reactivated", "staff-restored");
};
export const setStaffLifecycleStatus = async (id, status, dates = {}) => {
  const allowed = ["active", "inactive", "on-leave", "terminated", "archived"];
  if (!allowed.includes(status)) throw new Error("Invalid staff lifecycle status.");
  await updateDoc(staffDocRef(id), {
    status,
    lastWorkingDate: dates.lastWorkingDate || null,
    terminationDate: dates.terminationDate || null,
    rehireDate: dates.rehireDate || null,
    updatedAt: serverTimestamp(),
  });
  await writeAudit(`staff.${status}`, id, dates);
  await writeNotification(`Staff lifecycle changed to ${status}`, `staff-${status}`, id, dates);
};
export const updateStaffDocuments = async (id, documents = []) => {
  if (!Array.isArray(documents) || documents.some((item) => !item?.name || !item?.type)) {
    throw new Error("Documents require a name and type.");
  }
  await updateDoc(staffDocRef(id), { documents, updatedAt: serverTimestamp() });
  await writeAudit("staff.documents_updated", id, { count: documents.length });
};

/** Reset a staff member's login PIN. Generates a new random 4-digit PIN
 * unless an explicit one is passed. Returns the new PIN. */
export const resetStaffPin = async (id, newPin) => {
  let pin;
  if (newPin && String(newPin).trim()) {
    pin = String(newPin).trim();
    await assertPinAvailable(pin, id);
  } else {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generatePin();
      const snap = await getDocs(staffCollectionRef());
      const collision = (await Promise.all(snap.docs.filter((d) => d.id !== id)
        .map((item) => verifyStaffPin(candidate, item.data())))).some(Boolean);
      if (!collision) {
        pin = candidate;
        break;
      }
    }
    if (!pin) {
      throw new Error("Could not generate a unique PIN — please try again.");
    }
  }
  await updateDoc(staffDocRef(id), { pinHash: await hashStaffPin(pin), pinLast4: pin.slice(-4), updatedAt: serverTimestamp() });
  await writeAudit("staff.pin_reset", id);
  return pin;
};

/** Legacy compatibility: deletion is intentionally converted to a
 * non-destructive deactivation so historical rosters and timecards remain
 * auditable. */
export const deleteStaff = async (id) => {
  await pauseStaff(id);
};

export const archiveStaff = pauseStaff;

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
  if (shift) {
    const validation = validateShift(shift);
    if (!validation.valid) throw new Error(validation.error);
  }
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    throw new Error("A roster shift must be assigned to a valid day.");
  }
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

/** Validate a shift before it reaches Firestore. Overnight shifts are
 * supported, but a zero-length shift and malformed values are not. */
export const validateShift = (shift) => {
  if (!shift || !["morning", "evening", "night"].includes(shift.type)) {
    return { valid: false, error: "Choose a valid shift type." };
  }
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(shift.start) || !timePattern.test(shift.end)) {
    return { valid: false, error: "Shift times must use HH:MM format." };
  }
  if (shift.start === shift.end) {
    return { valid: false, error: "Shift start and end times cannot be the same." };
  }
  return { valid: true };
};

export const isDateUnavailable = (dateKey, staff, requests = []) => {
  if (!isActiveStaff(staff)) return true;
  if (staff.availability && typeof staff.availability === "object") {
    const date = new Date(`${dateKey}T00:00:00`);
    const mondayIndex = (date.getDay() + 6) % 7;
    const available = Array.isArray(staff.availability)
      ? staff.availability[mondayIndex]
      : staff.availability[DAY_LABELS[mondayIndex]];
    if (available === false) return true;
  }
  const exception = (staff.availabilityExceptions || []).find((item) => item.date === dateKey);
  if (exception?.type === "unavailable") return true;
  if (exception?.type === "available") return false;
  return requests.some((request) => request.staffId === staff.id &&
    request.status === "approved" &&
    request.startDate <= dateKey &&
    (request.endDate || request.startDate) >= dateKey);
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
  await writeAudit("timeoff.created", staffId, { startDate, endDate });
  await writeNotification(`${staffName || "Staff"} submitted a time-off request`, "timeoff-created");
};

export const decideTimeOffRequest = async (id, status) => {
  await updateDoc(doc(timeOffCollectionRef(), id), { status, decidedAt: serverTimestamp() });
  await writeAudit(`timeoff.${status}`, id);
  await writeNotification(`A time-off request was ${status}`, `timeoff-${status}`);
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
  await writeAudit("shift-swap.created", staffId, { date, withStaffId });
  await writeNotification(`${staffName || "Staff"} submitted a shift-swap request`, "shift-swap-created");
};

export const decideSwapRequest = async (id, status) => {
  await updateDoc(doc(swapCollectionRef(), id), { status, decidedAt: serverTimestamp() });
  await writeAudit(`shift-swap.${status}`, id);
  await writeNotification(`A shift-swap request was ${status}`, `shift-swap-${status}`);
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

/**
 * One-time fetch of attendance records across a date range (inclusive),
 * for the Calendar tab's month grid. Queries the same `attendance`
 * collection `subscribeTodayAttendance` uses, just without the "==
 * todayKey()" restriction. `startKey`/`endKey` are ISO yyyy-mm-dd strings
 * (same format as `dateKey`/`todayKey()`).
 */
export const getAttendanceForDateRange = async (startKey, endKey) => {
  try {
    const q = query(
      attendanceCollectionRef(),
      where("dateKey", ">=", startKey),
      where("dateKey", "<=", endKey),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Failed to fetch attendance for date range:", error);
    return [];
  }
};

export const subscribeAttendanceForStaff = (staffId, startKey, endKey, onUpdate) => {
  if (!staffId) { onUpdate?.([]); return () => {}; }
  try {
    const constraints = [where("staffId", "==", staffId)];
    if (startKey) constraints.push(where("dateKey", ">=", startKey));
    if (endKey) constraints.push(where("dateKey", "<=", endKey));
    return onSnapshot(query(attendanceCollectionRef(), ...constraints), (snapshot) => {
      onUpdate?.(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.dateKey || "").localeCompare(String(a.dateKey || ""))));
    }, () => onUpdate?.([]));
  } catch {
    onUpdate?.([]);
    return () => {};
  }
};

const dateValue = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Correct a timecard while preserving who/why metadata for auditability. */
export const updateAttendanceRecord = async (id, {
  clockInAt, clockOutAt, breakMinutes = 0, correctionReason = "",
}) => {
  const inDate = dateValue(clockInAt);
  const outDate = dateValue(clockOutAt);
  if (!inDate) throw new Error("Clock-in time is required.");
  if (outDate && outDate < inDate) throw new Error("Clock-out must be after clock-in.");
  const minutes = Number(breakMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error("Break minutes must be zero or greater.");
  await updateDoc(doc(attendanceCollectionRef(), id), {
    clockInAt: inDate,
    clockOutAt: outDate,
    breakMinutes: Math.round(minutes),
    onBreak: false,
    breakStartAt: null,
    correctionReason: correctionReason.trim(),
    correctedAt: serverTimestamp(),
    correctedBy: "staff-management",
    updatedAt: serverTimestamp(),
  });
  await writeAudit("attendance.corrected", id, { correctionReason: correctionReason.trim() });
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
  // Earlier clock-in/out sessions from the same day, folded in by punchPin
  // when a staff member clocks in again after already completing a shift
  // that day — without this, a second session overwriting the doc would
  // silently drop the first session's hours from every report.
  const priorMs = (record.priorSessionsMinutes || 0) * 60000;
  return (workedMs + priorMs) / 3600000;
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
  if (!/^\d{4}$/.test(String(pin || ""))) {
    await recordStaffPinFailure(null, pin);
    const err = new Error("Invalid or inactive PIN");
    err.code = "invalid-pin";
    throw err;
  }
  const attemptSnapshot = await getDoc(doc(pinAttemptCollectionRef(), pinFingerprint(pin)));
  if (attemptSnapshot.exists() && attemptSnapshot.data().lockedUntil) {
    const lockedUntil = attemptSnapshot.data().lockedUntil.toDate
      ? attemptSnapshot.data().lockedUntil.toDate() : new Date(attemptSnapshot.data().lockedUntil);
    if (lockedUntil > new Date()) {
      const err = new Error("PIN temporarily locked. Try again later.");
      err.code = "pin-locked";
      throw err;
    }
  }
  const snapshot = await getDocs(staffCollectionRef());
  const staff = (await Promise.all(snapshot.docs.map(async (d) => {
    const value = { id: d.id, ...d.data() };
    return (await verifyStaffPin(pin, value)) ? value : null;
  }))).find(Boolean);

  if (!staff || staff.status !== "active") {
    await recordStaffPinFailure(null, pin);
    const err = new Error("Invalid or inactive PIN");
    err.code = "invalid-pin";
    throw err;
  }
  if (staff.pinLockedUntil) {
    const lockedUntil = staff.pinLockedUntil.toDate ? staff.pinLockedUntil.toDate() : new Date(staff.pinLockedUntil);
    if (lockedUntil > new Date()) {
      const err = new Error("PIN temporarily locked. Try again later.");
      err.code = "pin-locked";
      throw err;
    }
  }
  // Upgrade legacy plaintext PINs after a successful login and clear failures.
  const secureFields = { pinHash: await hashStaffPin(pin), pinLast4: String(pin).slice(-4), pinFailedAttempts: 0, pinLockedUntil: null };
  if (!staff.pinHash || staff.pinFailedAttempts) await updateDoc(staffDocRef(staff.id), secureFields);

  return punchStaff(staff, { method: "pin" });
};

/**
 * Work out today's clock-in/out write for a verified staff member, given the
 * current attendance doc (or null). Pure so the PIN path can apply it directly
 * and the QR path can apply it inside the token-burning transaction.
 * `meta`: { method: "pin"|"qr", geo, verifiedBy, tokenId }.
 * Returns { action: "in"|"out", method, fields } — "in" is a full overwrite
 * (setDoc without merge), "out" is an update.
 */
const planPunch = (staff, dateKey, data, meta = {}) => {
  const method = meta.method || "pin";
  const geo = meta.geo || null;
  const verifiedBy = meta.verifiedBy || null;
  const tokenId = meta.tokenId || null;

  if (!data || !data.clockInAt || data.clockOutAt) {
    // Not clocked in yet today (or already completed a shift) -> clock IN,
    // resetting the record for a fresh shift. If a prior session already
    // completed today (data.clockOutAt set), fold its worked minutes into
    // priorSessionsMinutes first — otherwise this `merge: false` write would
    // silently discard that earlier session's hours, so a staff member who
    // clocks out for a break and back in loses their morning hours from
    // reports (hoursOf() below adds priorSessionsMinutes back in).
    let priorSessionsMinutes = data?.priorSessionsMinutes || 0;
    if (data && data.clockInAt && data.clockOutAt) {
      priorSessionsMinutes += Math.round(hoursOf(data) * 60);
    }
    return {
      action: "in",
      method,
      fields: {
        dateKey,
        staffId: staff.id,
        staffName: staff.name,
        clockInAt: serverTimestamp(),
        clockOutAt: null,
        breakMinutes: 0,
        onBreak: false,
        breakStartAt: null,
        priorSessionsMinutes,
        clockInMethod: method,
        clockInGeo: geo,
        clockInVerifiedBy: verifiedBy,
        clockInTokenId: tokenId,
        updatedAt: serverTimestamp(),
      },
    };
  }

  // Already clocked in -> clock OUT. If on break, fold the open break into
  // breakMinutes first so hours-worked stays accurate.
  let extraBreakMinutes = 0;
  if (data.onBreak && data.breakStartAt) {
    const startMs = data.breakStartAt.toDate ? data.breakStartAt.toDate().getTime() : new Date(data.breakStartAt).getTime();
    extraBreakMinutes = Math.max(0, Math.round((Date.now() - startMs) / 60000));
  }
  return {
    action: "out",
    method,
    fields: {
      clockOutAt: serverTimestamp(),
      onBreak: false,
      breakStartAt: null,
      breakMinutes: (data.breakMinutes || 0) + extraBreakMinutes,
      clockOutMethod: method,
      clockOutGeo: geo,
      clockOutVerifiedBy: verifiedBy,
      clockOutTokenId: tokenId,
      updatedAt: serverTimestamp(),
    },
  };
};

/**
 * Toggle today's clock-in/out for an already-verified staff member (PIN
 * keypad path). Returns { staff, action: "in"|"out" }.
 */
export const punchStaff = async (staff, meta = {}) => {
  const dateKey = todayKey();
  const ref = attendanceDocRef(dateKey, staff.id);
  const existing = await getDoc(ref);
  const plan = planPunch(staff, dateKey, existing.exists() ? existing.data() : null, meta);
  if (plan.action === "in") await setDoc(ref, plan.fields, { merge: false });
  else await updateDoc(ref, plan.fields);
  await writeAudit(`attendance.${plan.action}`, staff.id, { dateKey, method: plan.method });
  return { staff, action: plan.action };
};

/* ======================= QR + geolocation attendance =======================
 * Flow: the manager starts a short QR session on the Attendance tab; while it
 * is active each staff member's portal shows a rotating one-time QR carrying
 * a token id + nonce. The token doc (not the QR) stores the staff member's
 * location, so the QR text can't be edited to fake it. The manager scans the
 * QR; redeemAttendanceToken checks the token, session and distance, then
 * clocks the staff member in/out via punchStaff.
 *
 * firestore.rules enforces the server-side half: tokens are one-time,
 * unlistable and immutable; expiry uses server time; a token needs a live
 * session and an active staff member; and an attendance record can only be
 * tagged "qr" in the same transaction that burns an accepted token for that
 * staff member. Without per-user auth, rules can't prove *who* scanned, so a
 * determined attacker with the Firebase config can still forge a scan; the
 * distance check also trusts the phone's reported location. */
const attendanceSettingsDocRef = () => doc(db, "Restaurant", RESTAURANT_ID, "attendanceConfig", "settings");
const qrSessionCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "attendanceQrSessions");
const qrTokenCollectionRef = () => collection(db, "Restaurant", RESTAURANT_ID, "attendanceQrTokens");

export const ATTENDANCE_QR_PREFIX = "orderin-att:v1";
export const QR_REFRESH_MS = 30000;
// Refresh interval plus a grace period so a QR caught just before it rotates
// still scans.
export const QR_TOKEN_TTL_MS = 45000;
export const ATTENDANCE_SETTINGS_DEFAULTS = Object.freeze({
  lat: null,
  lng: null,
  radiusMeters: 100,
  maxAccuracyMeters: 100,
  requireManagerProximity: false,
  allowPinFallback: false,
  sessionMinutes: 10,
});

const toMillis = (value) => {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  if (value.toDate) return value.toDate().getTime();
  return new Date(value).getTime();
};

const attendanceError = (code, message) => {
  const err = new Error(message);
  err.code = code;
  return err;
};

const randomNonce = () => {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

const isFiniteCoord = (value) => typeof value === "number" && Number.isFinite(value);

/** Great-circle distance in meters between two {lat, lng} points. */
export const haversineMeters = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

// Firestore TTL policies (firestore.indexes.json → fieldOverrides) delete
// docs once `deleteAt` passes, so used/expired QR tokens and old sessions
// don't pile up. TTL deletion runs within ~24h of the timestamp.
const QR_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000;
const QR_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Browsers only expose camera + geolocation on HTTPS (or localhost). Returns
 * a user-facing message when that isn't the case, otherwise null. */
export const insecureContextMessage = () => {
  if (typeof window === "undefined" || window.isSecureContext !== false) return null;
  return "Camera and location only work over a secure connection. Open this page using its https:// address.";
};

/** Promise wrapper around navigator.geolocation with staff-friendly errors. */
export const getCurrentGeo = (options = {}) => new Promise((resolve, reject) => {
  const insecure = insecureContextMessage();
  if (insecure) {
    reject(attendanceError("insecure-context", insecure));
    return;
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    reject(attendanceError("geo-unavailable", "Location is not available on this device/browser."));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
    (err) => reject(attendanceError(
      err.code === 1 ? "geo-denied" : "geo-failed",
      err.code === 1 ? "Location permission was denied. Allow location access to mark attendance." : "Could not get your location. Move near a window and try again.",
    )),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...options },
  );
});

export const subscribeAttendanceSettings = (onUpdate) => onSnapshot(
  attendanceSettingsDocRef(),
  (snap) => onUpdate({ ...ATTENDANCE_SETTINGS_DEFAULTS, ...(snap.exists() ? snap.data() : {}) }),
  (err) => {
    console.error("subscribeAttendanceSettings error:", err);
    onUpdate({ ...ATTENDANCE_SETTINGS_DEFAULTS });
  },
);

export const getAttendanceSettings = async () => {
  const snap = await getDoc(attendanceSettingsDocRef());
  return { ...ATTENDANCE_SETTINGS_DEFAULTS, ...(snap.exists() ? snap.data() : {}) };
};

export const saveAttendanceSettings = async (patch) => {
  const next = { ...patch };
  if ("lat" in next || "lng" in next) {
    if (next.lat !== null || next.lng !== null) {
      if (!isFiniteCoord(next.lat) || Math.abs(next.lat) > 90 || !isFiniteCoord(next.lng) || Math.abs(next.lng) > 180) {
        throw new Error("Restaurant location must be a valid latitude/longitude.");
      }
    }
  }
  if ("radiusMeters" in next) {
    const radius = Number(next.radiusMeters);
    if (!Number.isFinite(radius) || radius < 20 || radius > 5000) throw new Error("Radius must be between 20 and 5000 meters.");
    next.radiusMeters = Math.round(radius);
  }
  await setDoc(attendanceSettingsDocRef(), { ...next, updatedAt: serverTimestamp() }, { merge: true });
  await writeAudit("attendance.settings_updated", null, { fields: Object.keys(patch) });
};

/**
 * Decide whether a staff location is close enough. Pure, so the same rule
 * can later move server-side unchanged. The restaurant's saved location is the
 * reference; the manager's device is used when none is saved, and is also
 * required when settings.requireManagerProximity is on.
 * Returns { ok, reason, distanceM, managerDistanceM }.
 */
export const evaluateAttendanceGeo = ({ staffGeo, settings = ATTENDANCE_SETTINGS_DEFAULTS, managerGeo = null }) => {
  const radius = Number(settings.radiusMeters) || ATTENDANCE_SETTINGS_DEFAULTS.radiusMeters;
  const maxAccuracy = Number(settings.maxAccuracyMeters) || ATTENDANCE_SETTINGS_DEFAULTS.maxAccuracyMeters;
  if (!staffGeo || !isFiniteCoord(staffGeo.lat) || !isFiniteCoord(staffGeo.lng)) {
    return { ok: false, reason: "No location attached to this QR." };
  }
  if (isFiniteCoord(staffGeo.accuracy) && staffGeo.accuracy > maxAccuracy) {
    return { ok: false, reason: `Staff location is too imprecise (±${Math.round(staffGeo.accuracy)} m).` };
  }
  const hasRestaurant = isFiniteCoord(settings.lat) && isFiniteCoord(settings.lng);
  const hasManager = managerGeo && isFiniteCoord(managerGeo.lat) && isFiniteCoord(managerGeo.lng);
  if (!hasRestaurant && !hasManager) {
    return { ok: false, reason: "No restaurant location is set and the manager's location is unavailable." };
  }
  const managerDistanceM = hasManager ? Math.round(haversineMeters(staffGeo, managerGeo)) : null;
  const distanceM = hasRestaurant ? Math.round(haversineMeters(staffGeo, { lat: settings.lat, lng: settings.lng })) : managerDistanceM;
  if (distanceM > radius) {
    return { ok: false, reason: `Staff is ${distanceM} m away from the ${hasRestaurant ? "restaurant" : "manager"} (limit ${radius} m).`, distanceM, managerDistanceM };
  }
  if (hasRestaurant && settings.requireManagerProximity) {
    if (managerDistanceM === null) return { ok: false, reason: "Manager location is required but unavailable.", distanceM, managerDistanceM };
    if (managerDistanceM > radius) {
      return { ok: false, reason: `Staff is ${managerDistanceM} m away from the manager (limit ${radius} m).`, distanceM, managerDistanceM };
    }
  }
  return { ok: true, reason: null, distanceM, managerDistanceM };
};

const activeSessionFrom = (docs) => docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((s) => s.active && toMillis(s.expiresAt) > Date.now())
  .sort((a, b) => toMillis(b.expiresAt) - toMillis(a.expiresAt))[0] || null;

/** Calls back with the current active QR session, or null. */
export const subscribeActiveQrSession = (onUpdate) => onSnapshot(
  query(qrSessionCollectionRef(), where("active", "==", true)),
  (snap) => onUpdate(activeSessionFrom(snap.docs)),
  (err) => {
    console.error("subscribeActiveQrSession error:", err);
    onUpdate(null);
  },
);

/** Manager action: open a fresh QR session (ending any previous one). */
export const startQrSession = async ({ managerGeo = null, startedBy = null, minutes } = {}) => {
  const settings = await getAttendanceSettings();
  const hasRestaurant = isFiniteCoord(settings.lat) && isFiniteCoord(settings.lng);
  if (!hasRestaurant && !managerGeo) {
    throw attendanceError("no-reference-location", "Set the restaurant location in QR settings, or allow location access on this device.");
  }
  const existing = await getDocs(query(qrSessionCollectionRef(), where("active", "==", true)));
  await Promise.all(existing.docs.map((d) => updateDoc(d.ref, { active: false, endedAt: serverTimestamp() })));
  const durationMs = (Number(minutes) || settings.sessionMinutes || ATTENDANCE_SETTINGS_DEFAULTS.sessionMinutes) * 60000;
  const ref = await addDoc(qrSessionCollectionRef(), {
    active: true,
    startedBy,
    managerGeo,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + durationMs),
    deleteAt: new Date(Date.now() + durationMs + QR_SESSION_RETENTION_MS),
  });
  await writeAudit("attendance.qr_session_started", null, { sessionId: ref.id });
  return { id: ref.id, expiresAt: new Date(Date.now() + durationMs) };
};

export const endQrSession = async (sessionId) => {
  if (!sessionId) return;
  await updateDoc(doc(qrSessionCollectionRef(), sessionId), { active: false, endedAt: serverTimestamp() });
  await writeAudit("attendance.qr_session_ended", null, { sessionId });
};

/** Staff-portal action: mint a one-time token for the current session and
 * return the text to render as a QR. */
export const createAttendanceToken = async ({ staffId, sessionId, geo }) => {
  if (!staffId || !sessionId) throw attendanceError("invalid-token-request", "No active attendance session.");
  if (!geo || !isFiniteCoord(geo.lat) || !isFiniteCoord(geo.lng)) {
    throw attendanceError("geo-required", "Your location is needed to generate the attendance QR.");
  }
  const nonce = randomNonce();
  const expiresAt = new Date(Date.now() + QR_TOKEN_TTL_MS);
  const ref = await addDoc(qrTokenCollectionRef(), {
    staffId,
    sessionId,
    nonce,
    geo: { lat: geo.lat, lng: geo.lng, accuracy: isFiniteCoord(geo.accuracy) ? geo.accuracy : null },
    createdAt: serverTimestamp(),
    expiresAt,
    deleteAt: new Date(Date.now() + QR_TOKEN_RETENTION_MS),
    usedAt: null,
    result: null,
  });
  return { tokenId: ref.id, payload: `${ATTENDANCE_QR_PREFIX}:${ref.id}:${nonce}`, expiresAt };
};

/** Staff portal watches its current token to show the scan outcome. */
export const subscribeAttendanceToken = (tokenId, onUpdate) => onSnapshot(
  doc(qrTokenCollectionRef(), tokenId),
  (snap) => onUpdate(snap.exists() ? { id: snap.id, ...snap.data() } : null),
  (err) => console.error("subscribeAttendanceToken error:", err),
);

export const parseAttendanceQr = (text) => {
  const parts = String(text || "").trim().split(":");
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== ATTENDANCE_QR_PREFIX) return null;
  const [, , tokenId, nonce] = parts;
  if (!/^[A-Za-z0-9]{10,40}$/.test(tokenId) || !/^[0-9a-f]{32}$/.test(nonce)) return null;
  return { tokenId, nonce };
};

/**
 * Manager scan: validate the token and location, burn the token, then punch.
 * Every scanned token is marked used (accepted or rejected) so it can't be
 * retried; the staff portal mints a fresh one on its next refresh.
 * Returns { staff, action, distanceM }. Throws an Error with `.code` on reject.
 */
export const redeemAttendanceToken = async (qrText, { sessionId, managerGeo = null, verifiedBy = null } = {}) => {
  const parsed = parseAttendanceQr(qrText);
  if (!parsed) throw attendanceError("invalid-qr", "This is not an OrderIn attendance QR.");
  if (!sessionId) throw attendanceError("no-session", "Start a QR attendance session first.");
  const settings = await getAttendanceSettings();
  const tokenRef = doc(qrTokenCollectionRef(), parsed.tokenId);

  const outcome = await runTransaction(db, async (tx) => {
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists()) return { error: attendanceError("invalid-qr", "QR not recognised. Ask the staff member to refresh it.") };
    const token = tokenSnap.data();
    if (token.nonce !== parsed.nonce) return { error: attendanceError("invalid-qr", "QR does not match. Ask the staff member to refresh it.") };
    if (token.usedAt) return { error: attendanceError("token-used", "This QR was already scanned. Ask for a fresh one.") };

    // All transaction reads must happen before any write.
    const staffSnap = await tx.get(staffDocRef(token.staffId));
    const sessionSnap = await tx.get(doc(qrSessionCollectionRef(), sessionId));
    const dateKey = todayKey();
    const attendanceRef = attendanceDocRef(dateKey, token.staffId);
    const attendanceSnap = await tx.get(attendanceRef);

    const reject = (code, message, extra = {}) => {
      tx.update(tokenRef, { usedAt: serverTimestamp(), result: { status: "rejected", code, reason: message, ...extra } });
      return { error: attendanceError(code, message), token };
    };
    if (toMillis(token.expiresAt) < Date.now()) return reject("token-expired", "QR expired. Ask the staff member to show the new one.");
    if (token.sessionId !== sessionId) return reject("session-mismatch", "QR belongs to a different attendance session.");
    const session = sessionSnap.exists() ? sessionSnap.data() : null;
    if (!session?.active || toMillis(session.expiresAt) < Date.now()) return reject("session-ended", "This attendance session has ended. Start a new one.");

    const staff = staffSnap.exists() ? { id: staffSnap.id, ...staffSnap.data() } : null;
    if (!isActiveStaff(staff)) return reject("inactive-staff", "This staff account is not active.");

    const geoCheck = evaluateAttendanceGeo({ staffGeo: token.geo, settings, managerGeo });
    if (!geoCheck.ok) return reject("geo-rejected", geoCheck.reason, { distanceM: geoCheck.distanceM ?? null });

    const geo = { ...token.geo, distanceM: geoCheck.distanceM, managerDistanceM: geoCheck.managerDistanceM };
    const plan = planPunch(staff, dateKey, attendanceSnap.exists() ? attendanceSnap.data() : null, {
      method: "qr", geo, verifiedBy, tokenId: parsed.tokenId,
    });
    tx.update(tokenRef, {
      usedAt: serverTimestamp(),
      result: { status: "accepted", action: plan.action, distanceM: geoCheck.distanceM, attendanceId: attendanceRef.id },
    });
    if (plan.action === "in") tx.set(attendanceRef, plan.fields);
    else tx.update(attendanceRef, plan.fields);
    return { token, staff, geoCheck, action: plan.action, dateKey };
  });

  if (outcome.error) {
    if (outcome.token) await writeAudit("attendance.qr_rejected", outcome.token.staffId, { code: outcome.error.code, sessionId });
    throw outcome.error;
  }
  const { staff, geoCheck, action, dateKey } = outcome;
  await writeAudit(`attendance.${action}`, staff.id, { dateKey, method: "qr", sessionId });
  const { pin, pinHash, ...safeStaff } = staff;
  return { staff: safeStaff, action, distanceM: geoCheck.distanceM };
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
    // Stamped so firestore.rules can tell a manager clock-out from a forged one.
    clockOutMethod: "manager",
    clockOutGeo: null,
    clockOutTokenId: null,
    clockOutVerifiedBy: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("staffId") || sessionStorage.getItem("staffRole") || "manager" : "manager",
    updatedAt: serverTimestamp(),
  });
};

/** Record a failed PIN attempt without ever storing the supplied PIN. */
const pinFingerprint = (pin) => {
  let hash = 2166136261;
  for (const character of String(pin || "")) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `pin_${(hash >>> 0).toString(36)}`;
};
export const recordStaffPinFailure = async (staffId = null, pin = null) => {
  if (staffId) {
    const ref = staffDocRef(staffId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) return;
    const current = snapshot.data().pinFailedAttempts || 0;
    const failures = current + 1;
    const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await updateDoc(ref, { pinFailedAttempts: failures, pinLockedUntil: lockedUntil, updatedAt: serverTimestamp() });
    await writeAudit("staff.pin_failed", staffId, { failures, locked: Boolean(lockedUntil) });
    return;
  }
  if (!pin) return;
  const ref = doc(pinAttemptCollectionRef(), pinFingerprint(pin));
  const snapshot = await getDoc(ref);
  const failures = (snapshot.exists() ? snapshot.data().failures || 0 : 0) + 1;
  await setDoc(ref, { failures, lockedUntil: failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null, updatedAt: serverTimestamp() }, { merge: true });
};

export const validateAvailability = ({ preferredShift, minWeeklyHours = 0, maxWeeklyHours = 40, exceptions = [] } = {}) => {
  const allowed = ["morning", "evening", "night", "flexible", null];
  if (!allowed.includes(preferredShift || null)) return { valid: false, error: "Choose a valid preferred shift." };
  if (!Number.isFinite(Number(minWeeklyHours)) || !Number.isFinite(Number(maxWeeklyHours)) ||
      Number(minWeeklyHours) < 0 || Number(maxWeeklyHours) > 168 ||
      Number(minWeeklyHours) > Number(maxWeeklyHours)) {
    return { valid: false, error: "Minimum weekly hours must not exceed maximum (0–168)." };
  }
  if (!Array.isArray(exceptions) || exceptions.some((item) => !item?.date || !["available", "unavailable"].includes(item.type))) {
    return { valid: false, error: "Availability exceptions need a date and availability type." };
  }
  return { valid: true };
};

export const validateRoster = (rosterMap, staffList = [], { minRestHours = 8, requiredCoverage = 0 } = {}) => {
  const errors = [];
  const staffById = new Map(staffList.map((staff) => [staff.id, staff]));
  const coverage = Array(7).fill(0);
  for (const [staffId, days] of rosterMap instanceof Map ? rosterMap.entries() : Object.entries(rosterMap || {})) {
    let weeklyHours = 0;
    let previousEnd = null;
    (days || []).forEach((shift, index) => {
      if (!shift) return;
      coverage[index] += Array.isArray(shift) ? shift.length : 1;
      if (Array.isArray(shift)) {
        for (let i = 0; i < shift.length; i += 1) {
          const result = validateShift(shift[i]);
          if (!result.valid) errors.push(`${staffById.get(staffId)?.name || staffId}: day ${index + 1}: ${result.error}`);
          for (let j = i + 1; j < shift.length; j += 1) {
            if (shiftWindowsOverlap(shift[i], shift[j])) errors.push(`${staffById.get(staffId)?.name || staffId}: overlapping shifts.`);
          }
        }
        return;
      }
      const result = validateShift(shift);
      if (!result.valid) errors.push(`${staffById.get(staffId)?.name || staffId}: day ${index + 1}: ${result.error}`);
      weeklyHours += shiftDurationHours(shift);
      const start = timeToMinutes(shift.start);
      if (previousEnd !== null && start + 24 * 60 - previousEnd < minRestHours * 60 && start >= previousEnd % (24 * 60)) {
        errors.push(`${staffById.get(staffId)?.name || staffId}: insufficient rest between shifts.`);
      }
      previousEnd = timeToMinutes(shift.end) <= start ? timeToMinutes(shift.end) + 24 * 60 : timeToMinutes(shift.end);
    });
    const staff = staffById.get(staffId);
    if (staff?.maxWeeklyHours && weeklyHours > Number(staff.maxWeeklyHours)) errors.push(`${staff.name}: maximum weekly hours exceeded.`);
    if (staff?.minWeeklyHours && weeklyHours < Number(staff.minWeeklyHours)) errors.push(`${staff.name}: minimum weekly hours not met.`);
  }
  if (requiredCoverage > 0) coverage.forEach((count, index) => {
    if (count < requiredCoverage) errors.push(`Day ${index + 1}: minimum coverage of ${requiredCoverage} staff is not met.`);
  });
  return { valid: errors.length === 0, errors };
};
const timeToMinutes = (value) => {
  const [hour, minute] = String(value || "0:0").split(":").map(Number);
  return hour * 60 + minute;
};
export const shiftDurationHours = (shift) => {
  if (!shift || !validateShift(shift).valid) return 0;
  let duration = timeToMinutes(shift.end) - timeToMinutes(shift.start);
  if (duration <= 0) duration += 24 * 60;
  return duration / 60;
};
const shiftWindowsOverlap = (first, second) => {
  const startA = timeToMinutes(first.start);
  const endA = startA + (timeToMinutes(first.end) <= startA ? 1440 : timeToMinutes(first.end));
  const startB = timeToMinutes(second.start);
  const endB = startB + (timeToMinutes(second.end) <= startB ? 1440 : timeToMinutes(second.end));
  return startA < endB && startB < endA;
};
export const assignBulkRoster = async (weekKey, assignments = []) => {
  const validation = validateRoster(new Map(assignments.map((item) => [item.staffId, item.days])), assignments.map((item) => item.staff));
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  await Promise.all(assignments.map((item) => setDoc(rosterDocRef(weekKey, item.staffId), {
    weekKey, staffId: item.staffId, days: item.days, updatedAt: serverTimestamp(),
  }, { merge: true })));
  await writeAudit("roster.bulk_assigned", null, { weekKey, staffCount: assignments.length });
};

export const createShiftTemplate = async ({ name, shifts, createdBy = null }) => {
  if (!name?.trim() || !Array.isArray(shifts)) throw new Error("Template name and shifts are required.");
  shifts.forEach((shift) => { const result = validateShift(shift); if (!result.valid) throw new Error(result.error); });
  const ref = await addDoc(collection(db, "Restaurant", RESTAURANT_ID, "shiftTemplates"), {
    name: name.trim(), shifts, createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await writeAudit("roster.template_created", ref.id, { name: name.trim() });
  return ref.id;
};

export const payrollPeriodKey = (startKey, endKey) => {
  const isDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!isDate(startKey) || !isDate(endKey) || startKey > endKey) {
    throw new Error("Payroll period must use valid YYYY-MM-DD dates.");
  }
  return `${startKey}_${endKey}`;
};

export const PAYROLL_STATUSES = Object.freeze([
  "draft", "under_review", "approved", "processing", "paid", "failed", "reopened",
]);
const PAYROLL_TRANSITIONS = Object.freeze({
  draft: ["under_review"],
  under_review: ["draft", "approved"],
  approved: ["processing", "reopened"],
  processing: ["paid", "failed"],
  failed: ["processing", "reopened"],
  paid: [],
  reopened: ["under_review", "approved"],
});
export const canTransitionPayrollStatus = (current, next) => current === next ||
  (PAYROLL_TRANSITIONS[current] || []).includes(next);
export const validatePayrollStatusTransition = (current, next) => {
  if (!PAYROLL_STATUSES.includes(next) || !canTransitionPayrollStatus(current, next)) {
    return { valid: false, error: `Cannot change payroll status from ${current || "unknown"} to ${next}.` };
  }
  return { valid: true };
};

/** Row-level payment status is tracked separately from the run-level workflow
 * status above — a run can be "processing" while individual rows are still
 * settling (paid/failed one at a time). */
export const PAYMENT_STATUSES = Object.freeze(["unpaid", "processing", "paid", "failed"]);

const money = (value) => Number((Number(value) || 0).toFixed(2));
const numericMapValue = (map, id) => Number(map?.[id] ?? (map instanceof Map ? map.get(id) : 0)) || 0;

export const calculatePayroll = (records = [], staffList = [], startKey = "", endKey = "", options = {}) => {
  const byId = new Map(staffList.map((staff) => [staff.id, staff]));
  const rows = new Map();
  records.filter((record) => (!startKey || record.dateKey >= startKey) && (!endKey || record.dateKey <= endKey))
    .forEach((record) => {
      const staff = byId.get(record.staffId) || record;
      const row = rows.get(record.staffId) || {
        staffId: record.staffId, employeeId: staff.employeeId || null,
        staffName: record.staffName || staff.name || "Staff", role: staff.role || null, hours: 0, regularHours: 0,
        overtimeHours: 0, breakHours: 0, tips: numericMapValue(options.tipsByStaff, record.staffId),
        bonuses: numericMapValue(options.bonusesByStaff, record.staffId),
        deductions: numericMapValue(options.deductionsByStaff, record.staffId),
        basePay: 0, gross: 0, netPay: 0, approvalStatus: options.approvalStatus || "draft",
        paymentStatus: "unpaid", paymentReference: null, retryCount: 0,
      };
      row.hours += hoursOf(record);
      row.breakHours += Number(record.breakMinutes || 0) / 60;
      rows.set(record.staffId, row);
    });
  // Include salaried staff even when they have no punch records.
  staffList.filter((staff) => staff.compensation?.type === "salary" && !rows.has(staff.id)).forEach((staff) => {
    rows.set(staff.id, {
      staffId: staff.id, employeeId: staff.employeeId || null, staffName: staff.name || "Staff", role: staff.role || null,
      hours: 0, regularHours: 0, overtimeHours: 0, breakHours: 0,
      tips: numericMapValue(options.tipsByStaff, staff.id),
      bonuses: numericMapValue(options.bonusesByStaff, staff.id),
      deductions: numericMapValue(options.deductionsByStaff, staff.id),
      basePay: 0, gross: 0, netPay: 0, approvalStatus: options.approvalStatus || "draft",
      paymentStatus: "unpaid", paymentReference: null, retryCount: 0,
    });
  });
  return Array.from(rows.values()).map((row) => {
    const staff = byId.get(row.staffId) || {};
    const compensation = staff.compensation || {};
    const rate = Number(compensation.rate || staff.hourlyRate || 0);
    const overtimeRate = Number(compensation.overtimeRate || rate * 1.5);
    row.hours = money(row.hours);
    row.breakHours = money(row.breakHours);
    row.regularHours = money(Math.min(row.hours, Number(options.overtimeThreshold || 40)));
    row.overtimeHours = money(Math.max(0, row.hours - row.regularHours));
    row.rate = money(rate);
    row.overtimeRate = money(overtimeRate);
    row.basePay = compensation.type === "salary"
      ? money(compensation.amount || compensation.rate || 0)
      : money(row.regularHours * rate + row.overtimeHours * overtimeRate);
    row.tips = money(row.tips);
    row.bonuses = money(row.bonuses);
    row.deductions = money(row.deductions);
    row.gross = money(row.basePay + row.tips + row.bonuses);
    row.netPay = money(Math.max(0, row.gross - row.deductions));
    return row;
  });
};

export const payrollCsv = (rows = []) => [
  "Staff ID,Employee ID,Staff Name,Role,Hours,Regular Hours,Overtime Hours,Break Hours,Hourly Rate,Overtime Rate,Tips,Bonuses,Deductions,Gross Pay,Net Pay,Approval Status,Payment Status,Payment Reference",
  ...rows.map((row) => [
    row.staffId, row.employeeId, row.staffName, row.role, row.hours, row.regularHours, row.overtimeHours,
    row.breakHours, row.rate, row.overtimeRate, row.tips, row.bonuses, row.deductions, row.gross, row.netPay,
    row.approvalStatus, row.paymentStatus, row.paymentReference,
  ].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")),
].join("\n");

export const subscribePayrollRuns = (onUpdate) => {
  try {
    return onSnapshot(payrollRunsCollectionRef(), (snapshot) => {
      onUpdate?.(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || ""))));
    }, () => onUpdate?.([]));
  } catch {
    onUpdate?.([]);
    return () => {};
  }
};

export const subscribePayrollRun = (periodKey, onUpdate) => {
  if (!periodKey) { onUpdate?.(null); return () => {}; }
  try {
    return onSnapshot(payrollRunDocRef(periodKey), (snapshot) => {
      onUpdate?.(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    }, () => onUpdate?.(null));
  } catch {
    onUpdate?.(null);
    return () => {};
  }
};

export const getPayrollRun = async (periodKey) => {
  const snapshot = await getDoc(payrollRunDocRef(periodKey));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const subscribePayrollRows = (periodKey, onUpdate) => {
  if (!periodKey) { onUpdate?.([]); return () => {}; }
  try {
    return onSnapshot(payrollRowsCollectionRef(periodKey), (snapshot) => {
      onUpdate?.(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, () => onUpdate?.([]));
  } catch {
    onUpdate?.([]);
    return () => {};
  }
};

/** Upsert a period exactly once. A period key is the Firestore document ID,
 * making retries idempotent and preventing duplicate payroll runs. */
export const savePayrollRun = async ({
  startDate, endDate, rows = [], createdBy = null, notes = "",
}) => {
  const periodKey = payrollPeriodKey(startDate, endDate);
  const runRef = payrollRunDocRef(periodKey);
  const existing = await getDoc(runRef);
  if (existing.exists()) {
    const current = existing.data();
    if (current.status === "approved") return { id: existing.id, ...current, idempotent: true };
    await updateDoc(runRef, { rowCount: rows.length, staffIds: rows.map((row) => row.staffId), updatedAt: serverTimestamp() });
    await Promise.all(rows.map((row) => setDoc(doc(payrollRowsCollectionRef(periodKey), row.staffId), {
      ...row, periodKey, updatedAt: serverTimestamp(),
    }, { merge: true })));
    await writeAudit("payroll.updated", periodKey, { rowCount: rows.length });
    return { id: existing.id, ...current, rowCount: rows.length, staffIds: rows.map((row) => row.staffId), idempotent: true };
  }
  const payload = {
    periodKey, startDate, endDate, status: "draft", notes: notes || "",
    rowCount: rows.length, staffIds: rows.map((row) => row.staffId), createdBy,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  await setDoc(runRef, payload);
  await Promise.all(rows.map((row) => setDoc(doc(payrollRowsCollectionRef(periodKey), row.staffId), {
    ...row, periodKey, updatedAt: serverTimestamp(),
  })));
  await writeAudit("payroll.created", periodKey, { startDate, endDate, rowCount: rows.length });
  return { id: periodKey, ...payload, idempotent: false };
};

export const createPayrollRun = async (args) => savePayrollRun(args);

export const updatePayrollRunStatus = async (periodKey, nextStatus, { actor = null, note = "" } = {}) => {
  const ref = payrollRunDocRef(periodKey);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error("Payroll run not found.");
  const current = snapshot.data().status || "draft";
  const validation = validatePayrollStatusTransition(current, nextStatus);
  if (!validation.valid) throw new Error(validation.error);
  if (current === nextStatus) return { id: periodKey, ...snapshot.data() };
  const historyEntry = { status: nextStatus, from: current, actor, note: note || "", changedAt: new Date().toISOString() };
  await updateDoc(ref, {
    status: nextStatus, updatedAt: serverTimestamp(), approvalHistory: arrayUnion(historyEntry),
  });
  await writeAudit(`payroll.${nextStatus}`, periodKey, { from: current, to: nextStatus });
  return { id: periodKey, ...snapshot.data(), status: nextStatus, approvalHistory: [...(snapshot.data().approvalHistory || []), historyEntry] };
};
export const approvePayrollRun = (periodKey, opts) => updatePayrollRunStatus(periodKey, "approved", opts);
export const reopenPayrollRun = (periodKey, opts) => updatePayrollRunStatus(periodKey, "reopened", opts);
export const submitPayrollForReview = (periodKey, opts) => updatePayrollRunStatus(periodKey, "under_review", opts);
export const calculatePayrollReport = calculatePayroll;
export const exportPayrollCsv = payrollCsv;

/** Aggregates a payroll run's rows into the summary tiles the payroll page
 * shows (total staff, hours breakdown, gross/net, paid/failed amounts). */
export const summarizePayrollRows = (rows = []) => rows.reduce((summary, row) => ({
  totalStaff: summary.totalStaff + 1,
  regularHours: money(summary.regularHours + Number(row.regularHours || 0)),
  overtimeHours: money(summary.overtimeHours + Number(row.overtimeHours || 0)),
  breakHours: money(summary.breakHours + Number(row.breakHours || 0)),
  tips: money(summary.tips + Number(row.tips || 0)),
  bonuses: money(summary.bonuses + Number(row.bonuses || 0)),
  deductions: money(summary.deductions + Number(row.deductions || 0)),
  gross: money(summary.gross + Number(row.gross || 0)),
  net: money(summary.net + Number(row.netPay || 0)),
  paidAmount: money(summary.paidAmount + (row.paymentStatus === "paid" ? Number(row.netPay || 0) : 0)),
  failedAmount: money(summary.failedAmount + (row.paymentStatus === "failed" ? Number(row.netPay || 0) : 0)),
}), {
  totalStaff: 0, regularHours: 0, overtimeHours: 0, breakHours: 0, tips: 0, bonuses: 0,
  deductions: 0, gross: 0, net: 0, paidAmount: 0, failedAmount: 0,
});

/** Placeholder for the real payout rail: RazorpayX Payouts requires a
 * business account, KYC, and server-side API credentials, none of which
 * exist yet (see docs/staff-payroll-review.md §3). Until that backend is
 * wired up, "sending" a bulk payment just marks the run/rows as
 * "processing" so the workflow and UI are ready to plug a real payout call
 * into later — no money actually moves here. */
export const sendBulkPayments = async (periodKey, { actor = null } = {}) => {
  const run = await updatePayrollRunStatus(periodKey, "processing", { actor, note: "Bulk payment initiated (payout provider not yet connected)." });
  const rowsSnapshot = await getDocs(payrollRowsCollectionRef(periodKey));
  await Promise.all(rowsSnapshot.docs.map((rowDoc) => updateDoc(rowDoc.ref, {
    paymentStatus: "processing", updatedAt: serverTimestamp(),
  })));
  await writeAudit("payroll.payments_initiated", periodKey, { rowCount: rowsSnapshot.size });
  return run;
};

/** Manual reconciliation until RazorpayX webhooks exist: lets a manager
 * record the outcome of a payment for one staff row. */
export const markPayrollRowPaymentStatus = async (periodKey, staffId, status, { reference = null, failureReason = "" } = {}) => {
  if (!PAYMENT_STATUSES.includes(status)) throw new Error(`Unknown payment status: ${status}`);
  const rowRef = doc(payrollRowsCollectionRef(periodKey), staffId);
  const snapshot = await getDoc(rowRef);
  if (!snapshot.exists()) throw new Error("Payroll row not found.");
  const retryCount = status === "processing" && snapshot.data().paymentStatus === "failed"
    ? Number(snapshot.data().retryCount || 0) + 1
    : Number(snapshot.data().retryCount || 0);
  await updateDoc(rowRef, {
    paymentStatus: status, paymentReference: reference, failureReason: failureReason || "",
    retryCount, updatedAt: serverTimestamp(),
  });
  await writeAudit("payroll.row_payment_status", periodKey, { staffId, status, reference });
  return { id: staffId, ...snapshot.data(), paymentStatus: status, paymentReference: reference, failureReason, retryCount };
};

export const retryFailedPayment = (periodKey, staffId) =>
  markPayrollRowPaymentStatus(periodKey, staffId, "processing");
