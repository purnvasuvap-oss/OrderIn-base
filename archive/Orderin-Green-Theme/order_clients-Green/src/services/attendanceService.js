// src/services/attendanceService.js
//
// Staff attendance: entrance-tablet QR + registered device + face check, with
// manager-approved manual attendance as the fallback.
//
//   1. A manager opens the Attendance Display page on a tablet at the
//      entrance. It shows a QR that rotates every KIOSK_REFRESH_MS; each code
//      is a short-lived Firestore doc (id + nonce), so a photo of the QR goes
//      stale within KIOSK_CODE_TTL_MS.
//   2. Staff scan it from the Staff Portal on their own phone. The scanner is
//      only offered on a phone registered (and manager-approved) for that
//      staff member: the "device" is a non-extractable ECDSA key kept in the
//      phone's browser (IndexedDB) — browsers don't expose IMEI/model, so the
//      key is what ties an account to one phone.
//   3. The phone's location must be inside the restaurant radius, then a
//      front-camera face check must match the face enrolled with the device
//      (and pass the liveness / anti-spoof models).
//   4. Phone problems: staff ask for manual attendance with a reason; a
//      manager approves it. Requests from managers need the Admin (owner).
//
// IMPORTANT: there are no Cloud Functions yet, so every check here runs in
// the browser and firestore.rules can only validate data shape/consistency,
// not identity. Each scan stores the device signature, face scores and a
// selfie thumbnail so a future server-side verifier (and managers, today)
// can audit it. The verification steps are kept as pure functions so they
// can move into a Cloud Function unchanged.
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
  runTransaction,
} from "firebase/firestore";
import {
  STAFF_RESTAURANT_ID as RESTAURANT_ID,
  writeStaffAudit as writeAudit,
  isActiveStaff,
  todayKey,
  hoursOf,
} from "./staffService";

const settingsDocRef = () => doc(db, "Restaurant", RESTAURANT_ID, "attendanceConfig", "settings");
const kioskSessionsRef = () => collection(db, "Restaurant", RESTAURANT_ID, "attendanceKioskSessions");
const kioskCodesRef = () => collection(db, "Restaurant", RESTAURANT_ID, "attendanceKioskCodes");
const devicesRef = () => collection(db, "Restaurant", RESTAURANT_ID, "staffDevices");
const facesRef = () => collection(db, "Restaurant", RESTAURANT_ID, "staffFaces");
const requestsRef = () => collection(db, "Restaurant", RESTAURANT_ID, "attendanceRequests");
const attendanceDocRef = (dateKey, staffId) => doc(db, "Restaurant", RESTAURANT_ID, "attendance", `${dateKey}_${staffId}`);

export const KIOSK_QR_PREFIX = "orderin-kiosk:v1";
export const KIOSK_REFRESH_MS = 30000;
// Refresh interval plus time to finish the location + face steps after scanning.
export const KIOSK_CODE_TTL_MS = 120000;
export const FACE_LIVENESS_MIN = 0.5;
export const FACE_ANTISPOOF_MIN = 0.5;
export const ATTENDANCE_SETTINGS_DEFAULTS = Object.freeze({
  lat: null,
  lng: null,
  radiusMeters: 100,
  maxAccuracyMeters: 100,
  faceMatchThreshold: 0.6,
});
// Firestore TTL policies (firestore.indexes.json) delete docs after `deleteAt`.
const KIOSK_CODE_RETENTION_MS = 24 * 60 * 60 * 1000;
const KIOSK_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const KIOSK_SESSION_MAX_MS = 16 * 60 * 60 * 1000;

/* ------------------------------ small helpers ----------------------------- */

export const toMillis = (value) => {
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

const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const bytesToBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const randomNonce = () => {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
};

const isFiniteCoord = (value) => typeof value === "number" && Number.isFinite(value);
export const hasRestaurantLocation = (settings) => isFiniteCoord(settings?.lat) && isFiniteCoord(settings?.lng);

/** Great-circle distance in meters between two {lat, lng} points. */
export const haversineMeters = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Browsers only expose camera + geolocation on HTTPS (or localhost). */
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

/* -------------------------------- settings -------------------------------- */

export const subscribeAttendanceSettings = (onUpdate) => onSnapshot(
  settingsDocRef(),
  (snap) => onUpdate({ ...ATTENDANCE_SETTINGS_DEFAULTS, ...(snap.exists() ? snap.data() : {}) }),
  (err) => {
    console.error("subscribeAttendanceSettings error:", err);
    onUpdate({ ...ATTENDANCE_SETTINGS_DEFAULTS });
  },
);

export const getAttendanceSettings = async () => {
  const snap = await getDoc(settingsDocRef());
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
  if ("faceMatchThreshold" in next) {
    const threshold = Number(next.faceMatchThreshold);
    if (!Number.isFinite(threshold) || threshold < 0.4 || threshold > 0.95) throw new Error("Face match threshold must be between 0.40 and 0.95.");
    next.faceMatchThreshold = Math.round(threshold * 100) / 100;
  }
  await setDoc(settingsDocRef(), { ...next, updatedAt: serverTimestamp() }, { merge: true });
  await writeAudit("attendance.settings_updated", null, { fields: Object.keys(patch) });
};

/* --------------------------- pure verification ---------------------------- */

/** Is the phone inside the restaurant radius with a usable GPS fix?
 * Returns { ok, reason, distanceM }. */
export const evaluateAttendanceGeo = ({ staffGeo, settings = ATTENDANCE_SETTINGS_DEFAULTS }) => {
  const radius = Number(settings.radiusMeters) || ATTENDANCE_SETTINGS_DEFAULTS.radiusMeters;
  const maxAccuracy = Number(settings.maxAccuracyMeters) || ATTENDANCE_SETTINGS_DEFAULTS.maxAccuracyMeters;
  if (!hasRestaurantLocation(settings)) {
    return { ok: false, reason: "The restaurant location hasn't been set yet. Ask your manager." };
  }
  if (!staffGeo || !isFiniteCoord(staffGeo.lat) || !isFiniteCoord(staffGeo.lng)) {
    return { ok: false, reason: "Your location is unavailable." };
  }
  if (isFiniteCoord(staffGeo.accuracy) && staffGeo.accuracy > maxAccuracy) {
    return { ok: false, reason: `Your location is too imprecise (±${Math.round(staffGeo.accuracy)} m). Move near a window and try again.` };
  }
  const distanceM = Math.round(haversineMeters(staffGeo, { lat: settings.lat, lng: settings.lng }));
  if (distanceM > radius) {
    return { ok: false, reason: `You are ${distanceM} m from the restaurant (limit ${radius} m).`, distanceM };
  }
  return { ok: true, reason: null, distanceM };
};

/** Face verification decision from the matcher's scores. */
export const evaluateFaceMatch = ({ similarity, real, live, threshold = ATTENDANCE_SETTINGS_DEFAULTS.faceMatchThreshold }) => {
  if (!Number.isFinite(similarity)) return { ok: false, reason: "No face enrolled for this account. Ask your manager to re-register your phone." };
  if (Number.isFinite(real) && real < FACE_ANTISPOOF_MIN) return { ok: false, reason: "That looked like a photo or screen. Use your real face in good light." };
  if (Number.isFinite(live) && live < FACE_LIVENESS_MIN) return { ok: false, reason: "Liveness check failed. Hold the phone steady, face the camera and try again." };
  if (similarity < threshold) return { ok: false, reason: "Face didn't match the registered staff member." };
  return { ok: true, reason: null };
};

export const parseKioskQr = (text) => {
  const parts = String(text || "").trim().split(":");
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== KIOSK_QR_PREFIX) return null;
  const [, , codeId, nonce] = parts;
  if (!/^[A-Za-z0-9]{10,40}$/.test(codeId) || !/^[0-9a-f]{32}$/.test(nonce)) return null;
  return { codeId, nonce };
};

const normRole = (role) => String(role || "").trim().toLowerCase();
export const isManagerRole = (role) => ["admin", "general manager"].includes(normRole(role));

/** The person approving in Staff Management, from the staff-login session.
 * Legacy section-passcode sessions have no staffId and act as a General
 * Manager. */
export const currentApprover = () => {
  const store = typeof sessionStorage !== "undefined" ? sessionStorage : null;
  return {
    id: store?.getItem("staffId") || null,
    role: store?.getItem("staffRole") || "General Manager",
  };
};

/** Approval chain: staff → Manager/Admin; managers → Admin only; nobody
 * approves their own request. */
export const canApprove = (approver, requester) => {
  if (!approver || !isManagerRole(approver.role)) return { ok: false, reason: "Only managers can approve attendance requests." };
  if (approver.id && approver.id === requester?.staffId) return { ok: false, reason: "You can't approve your own request." };
  if (isManagerRole(requester?.staffRole) && normRole(approver.role) !== "admin") {
    return { ok: false, reason: "Requests from managers must be approved by the Admin (owner)." };
  }
  return { ok: true, reason: null };
};

const approverStamp = (approver) => ({ id: approver?.id || null, role: approver?.role || null });

/* ------------------------------- kiosk (tablet) --------------------------- */

const activeSessionFrom = (docs) => docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((s) => s.active && toMillis(s.expiresAt) > Date.now())
  .sort((a, b) => toMillis(b.expiresAt) - toMillis(a.expiresAt))[0] || null;

export const subscribeActiveKioskSession = (onUpdate) => onSnapshot(
  query(kioskSessionsRef(), where("active", "==", true)),
  (snap) => onUpdate(activeSessionFrom(snap.docs)),
  (err) => {
    console.error("subscribeActiveKioskSession error:", err);
    onUpdate(null);
  },
);

/** Open today's attendance display (ends any previous one). Runs until the
 * end of the day, capped at KIOSK_SESSION_MAX_MS. */
export const startKioskSession = async ({ startedBy = null } = {}) => {
  const settings = await getAttendanceSettings();
  if (!hasRestaurantLocation(settings)) {
    throw attendanceError("no-location", "Save the restaurant location first.");
  }
  const existing = await getDocs(query(kioskSessionsRef(), where("active", "==", true)));
  await Promise.all(existing.docs.map((d) => updateDoc(d.ref, { active: false, endedAt: serverTimestamp() })));
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 0);
  const expiresAt = new Date(Math.min(endOfDay.getTime(), Date.now() + KIOSK_SESSION_MAX_MS));
  const ref = await addDoc(kioskSessionsRef(), {
    active: true,
    startedBy,
    createdAt: serverTimestamp(),
    expiresAt,
    deleteAt: new Date(expiresAt.getTime() + KIOSK_SESSION_RETENTION_MS),
  });
  await writeAudit("attendance.kiosk_started", null, { sessionId: ref.id });
  return { id: ref.id, expiresAt };
};

export const endKioskSession = async (sessionId) => {
  if (!sessionId) return;
  await updateDoc(doc(kioskSessionsRef(), sessionId), { active: false, endedAt: serverTimestamp() });
  await writeAudit("attendance.kiosk_ended", null, { sessionId });
};

/** Mint the next rotating code for the display. */
export const createKioskCode = async (sessionId) => {
  if (!sessionId) throw attendanceError("no-session", "The attendance display isn't running.");
  const nonce = randomNonce();
  const expiresAt = new Date(Date.now() + KIOSK_CODE_TTL_MS);
  const ref = await addDoc(kioskCodesRef(), {
    sessionId,
    nonce,
    createdAt: serverTimestamp(),
    expiresAt,
    deleteAt: new Date(Date.now() + KIOSK_CODE_RETENTION_MS),
  });
  return { codeId: ref.id, payload: `${KIOSK_QR_PREFIX}:${ref.id}:${nonce}`, expiresAt };
};

/** Staff side: confirm a scanned QR is a live code from a running display. */
export const verifyKioskQr = async (qrText) => {
  const parsed = parseKioskQr(qrText);
  if (!parsed) throw attendanceError("invalid-qr", "That's not the OrderIn attendance QR. Scan the code on the entrance display.");
  const codeSnap = await getDoc(doc(kioskCodesRef(), parsed.codeId));
  const code = codeSnap.exists() ? codeSnap.data() : null;
  if (!code || code.nonce !== parsed.nonce) throw attendanceError("invalid-qr", "QR not recognised. Scan the code currently on the display.");
  if (toMillis(code.expiresAt) < Date.now()) throw attendanceError("qr-expired", "That QR has expired. Scan the current one on the display.");
  const sessionSnap = await getDoc(doc(kioskSessionsRef(), code.sessionId));
  const session = sessionSnap.exists() ? sessionSnap.data() : null;
  if (!session?.active || toMillis(session.expiresAt) < Date.now()) throw attendanceError("kiosk-ended", "The attendance display has been closed.");
  return { codeId: parsed.codeId, sessionId: code.sessionId };
};

/* ---------------------------- device registration ------------------------- */

const DEVICE_DB = "orderin-device";
const DEVICE_STORE = "keys";
const DEVICE_KEY = "attendance-device-v1";

const idbRequest = (mode, run) => new Promise((resolve, reject) => {
  const open = indexedDB.open(DEVICE_DB, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(DEVICE_STORE);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const database = open.result;
    const tx = database.transaction(DEVICE_STORE, mode);
    const request = run(tx.objectStore(DEVICE_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => database.close();
  };
});

const deviceIdFor = async (publicKeyJwk) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${publicKeyJwk.x}.${publicKeyJwk.y}`));
  return bytesToBase64Url(new Uint8Array(digest)).slice(0, 32);
};

/** This browser's device identity: a non-extractable ECDSA key created once
 * and kept in IndexedDB. Clearing site data or switching browser produces a
 * new identity (→ device change request). */
export const getDeviceIdentity = async () => {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) {
    throw attendanceError("device-unsupported", "This browser can't register a device. Use Chrome or Safari over https://.");
  }
  let stored = await idbRequest("readonly", (store) => store.get(DEVICE_KEY));
  if (!stored) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const publicKeyJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    stored = { privateKey: pair.privateKey, publicKeyJwk, deviceId: await deviceIdFor(publicKeyJwk), createdAt: Date.now() };
    await idbRequest("readwrite", (store) => store.put(stored, DEVICE_KEY));
  }
  return {
    deviceId: stored.deviceId,
    publicKeyJwk: { kty: stored.publicKeyJwk.kty, crv: stored.publicKeyJwk.crv, x: stored.publicKeyJwk.x, y: stored.publicKeyJwk.y },
    sign: async (text) => {
      const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, stored.privateKey, new TextEncoder().encode(text));
      return bytesToBase64Url(new Uint8Array(sig));
    },
  };
};

/** Human label for the browser/platform; the staff member adds the phone name. */
export const describeDevice = () => {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent || "";
  const platform = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "Other";
  const browser = /SamsungBrowser/i.test(ua) ? "Samsung Internet" : /Edg\//i.test(ua) ? "Edge" : /CriOS|Chrome/i.test(ua) ? "Chrome" : /FxiOS|Firefox/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "Browser";
  return `${platform} · ${browser}`;
};

export const subscribeStaffDevices = (staffId, onUpdate) => onSnapshot(
  query(devicesRef(), where("staffId", "==", staffId)),
  (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
  (err) => {
    console.error("subscribeStaffDevices error:", err);
    onUpdate([]);
  },
);

export const subscribeAllDevices = (onUpdate) => onSnapshot(
  devicesRef(),
  (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(b.requestedAt) - toMillis(a.requestedAt))),
  (err) => {
    console.error("subscribeAllDevices error:", err);
    onUpdate([]);
  },
);

/** Staff action: ask to register this phone (with the enrolled face). */
export const requestDeviceRegistration = async ({ staff, identity, label, reason = "", face }) => {
  if (!staff?.id) throw attendanceError("no-staff", "Sign in to the Staff Portal first.");
  if (!label?.trim()) throw attendanceError("label-required", "Enter your phone's name (e.g. Vivo Y35).");
  if (!Array.isArray(face?.embedding) || !face.embedding.length || !face.thumbnail) {
    throw attendanceError("face-required", "Capture your face to register this phone.");
  }
  const ref = doc(devicesRef(), identity.deviceId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const current = existing.data();
    if (["active", "pending"].includes(current.status) && current.staffId !== staff.id) {
      throw attendanceError("device-taken", "This phone is already registered to another staff member.");
    }
    if (current.status === "active" && current.staffId === staff.id) return { id: ref.id, ...current };
  }
  const payload = {
    staffId: staff.id,
    staffName: staff.name || "Staff",
    staffRole: staff.role || null,
    label: label.trim().slice(0, 60),
    platform: describeDevice(),
    publicKeyJwk: identity.publicKeyJwk,
    reason: String(reason || "").trim().slice(0, 300),
    faceEmbedding: face.embedding.map((v) => Math.round(v * 1e5) / 1e5),
    faceThumbnail: face.thumbnail,
    faceScores: { real: face.real ?? null, live: face.live ?? null },
    consentAt: serverTimestamp(),
    status: "pending",
    requestedAt: serverTimestamp(),
    decidedBy: null,
    decidedAt: null,
  };
  await setDoc(ref, payload);
  await writeAudit("attendance.device_requested", staff.id, { deviceId: identity.deviceId, label: payload.label });
  return { id: ref.id, ...payload };
};

/** Manager action: approve/reject a pending phone. Approving makes it the
 * staff member's only active device and their enrolled face. */
export const decideDevice = async (device, decision, approver = currentApprover()) => {
  const allowed = canApprove(approver, device);
  if (!allowed.ok) throw attendanceError("not-allowed", allowed.reason);
  if (!["approved", "rejected"].includes(decision)) throw new Error(`Unknown decision: ${decision}`);
  const ref = doc(devicesRef(), device.id);
  const others = decision === "approved"
    ? (await getDocs(query(devicesRef(), where("staffId", "==", device.staffId)))).docs
      .filter((d) => d.id !== device.id && d.data().status === "active")
    : [];
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().status !== "pending") throw attendanceError("not-pending", "This device request was already handled.");
    const current = snap.data();
    const stamp = { decidedBy: approverStamp(approver), decidedAt: serverTimestamp() };
    if (decision === "rejected") {
      tx.update(ref, { status: "rejected", ...stamp });
      return;
    }
    others.forEach((other) => tx.update(other.ref, { status: "revoked", revokedAt: serverTimestamp(), revokedBy: approverStamp(approver) }));
    tx.update(ref, { status: "active", ...stamp });
    tx.set(doc(facesRef(), current.staffId), {
      staffId: current.staffId,
      deviceId: device.id,
      embedding: current.faceEmbedding,
      thumbnail: current.faceThumbnail,
      approvedBy: approverStamp(approver),
      approvedAt: serverTimestamp(),
    });
  });
  await writeAudit(`attendance.device_${decision}`, device.staffId, { deviceId: device.id });
};

/** Manager action: cut a phone off (lost phone, staff leaving, etc.). */
export const revokeDevice = async (device, approver = currentApprover()) => {
  const allowed = canApprove(approver, device);
  if (!allowed.ok) throw attendanceError("not-allowed", allowed.reason);
  await updateDoc(doc(devicesRef(), device.id), { status: "revoked", revokedAt: serverTimestamp(), revokedBy: approverStamp(approver) });
  await writeAudit("attendance.device_revoked", device.staffId, { deviceId: device.id });
};

export const getStaffFace = async (staffId) => {
  const snap = await getDoc(doc(facesRef(), staffId));
  return snap.exists() ? snap.data() : null;
};

/* ------------------------------ clocking in/out ---------------------------- */

/**
 * Work out today's clock-in/out write for a verified staff member, given the
 * current attendance doc (or null). `stamp` holds per-side evidence fields by
 * suffix (e.g. { Method: "qr", Geo: {...} } → clockInMethod / clockInGeo).
 * Returns { action: "in"|"out", fields } — "in" is a full overwrite.
 */
export const planPunch = (staff, dateKey, data, stamp = {}) => {
  const side = (prefix) => Object.fromEntries(Object.entries(stamp).map(([key, value]) => [`${prefix}${key}`, value ?? null]));
  if (!data || !data.clockInAt || data.clockOutAt) {
    // Not clocked in yet (or a shift already completed today) -> clock IN.
    // Fold an earlier completed session into priorSessionsMinutes so this
    // overwrite doesn't drop its hours (hoursOf adds it back).
    let priorSessionsMinutes = data?.priorSessionsMinutes || 0;
    if (data && data.clockInAt && data.clockOutAt) priorSessionsMinutes += Math.round(hoursOf(data) * 60);
    return {
      action: "in",
      fields: {
        dateKey,
        staffId: staff.id,
        staffName: staff.name || "Staff",
        clockInAt: serverTimestamp(),
        clockOutAt: null,
        breakMinutes: 0,
        onBreak: false,
        breakStartAt: null,
        priorSessionsMinutes,
        ...side("clockIn"),
        updatedAt: serverTimestamp(),
      },
    };
  }
  // Clocked in -> clock OUT, folding an open break into breakMinutes.
  let extraBreakMinutes = 0;
  if (data.onBreak && data.breakStartAt) {
    extraBreakMinutes = Math.max(0, Math.round((Date.now() - toMillis(data.breakStartAt)) / 60000));
  }
  return {
    action: "out",
    fields: {
      clockOutAt: serverTimestamp(),
      onBreak: false,
      breakStartAt: null,
      breakMinutes: (data.breakMinutes || 0) + extraBreakMinutes,
      ...side("clockOut"),
      updatedAt: serverTimestamp(),
    },
  };
};

/**
 * Record a verified entrance-QR scan. The caller has already checked the QR,
 * location and face; this re-checks what the database can (code still valid,
 * display running, device active for this staff member) inside one
 * transaction and clocks in/out. Returns { action, dateKey }.
 */
export const recordKioskScan = async ({ staff, identity, codeId, geo, geoCheck, face, selfie }) => {
  const dateKey = todayKey();
  const signature = await identity.sign(`${codeId}|${staff.id}|${dateKey}`);
  const codeRef = doc(kioskCodesRef(), codeId);
  const deviceRef = doc(devicesRef(), identity.deviceId);
  const attendanceRef = attendanceDocRef(dateKey, staff.id);

  const action = await runTransaction(db, async (tx) => {
    const codeSnap = await tx.get(codeRef);
    const deviceSnap = await tx.get(deviceRef);
    const staffSnap = await tx.get(doc(db, "Restaurant", RESTAURANT_ID, "staff", staff.id));
    const attendanceSnap = await tx.get(attendanceRef);
    if (!codeSnap.exists() || toMillis(codeSnap.data().expiresAt) < Date.now()) {
      throw attendanceError("qr-expired", "That QR has expired. Scan the current one on the display.");
    }
    const sessionSnap = await tx.get(doc(kioskSessionsRef(), codeSnap.data().sessionId));
    if (!sessionSnap.exists() || !sessionSnap.data().active || toMillis(sessionSnap.data().expiresAt) < Date.now()) {
      throw attendanceError("kiosk-ended", "The attendance display has been closed.");
    }
    const device = deviceSnap.exists() ? deviceSnap.data() : null;
    if (!device || device.status !== "active" || device.staffId !== staff.id) {
      throw attendanceError("device-not-registered", "This phone isn't the registered device for your account.");
    }
    if (!isActiveStaff(staffSnap.exists() ? staffSnap.data() : null)) {
      throw attendanceError("inactive-staff", "Your staff account is not active.");
    }
    const plan = planPunch(staff, dateKey, attendanceSnap.exists() ? attendanceSnap.data() : null, {
      Method: "qr",
      Geo: { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy ?? null, distanceM: geoCheck.distanceM },
      DeviceId: identity.deviceId,
      KioskCode: codeId,
      DeviceSig: signature,
      Face: {
        similarity: Math.round(face.similarity * 1000) / 1000,
        real: face.real ?? null,
        live: face.live ?? null,
      },
      Selfie: selfie || null,
    });
    if (plan.action === "in") tx.set(attendanceRef, plan.fields);
    else tx.update(attendanceRef, plan.fields);
    return plan.action;
  });
  await writeAudit(`attendance.${action}`, staff.id, { dateKey, method: "qr", deviceId: identity.deviceId });
  return { action, dateKey };
};

/* ----------------------- manual attendance requests ------------------------ */

const toDateTime = (dateKey, time) => {
  if (!time) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = new Date(`${dateKey}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
};

/** Validate a manual-attendance request; returns { inAt, outAt } as Dates. */
export const buildManualRequestTimes = ({ dateKey, inTime, outTime, reason }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) throw attendanceError("invalid-date", "Choose the date.");
  if (!inTime && !outTime) throw attendanceError("time-required", "Enter a clock-in or clock-out time.");
  if (String(reason || "").trim().length < 5) throw attendanceError("reason-required", "Explain the reason (e.g. phone damaged).");
  const inAt = toDateTime(dateKey, inTime);
  let outAt = toDateTime(dateKey, outTime);
  if ((inTime && !inAt) || (outTime && !outAt)) throw attendanceError("invalid-time", "Enter valid times.");
  // An out-time earlier than the in-time is an overnight shift ending next day.
  if (inAt && outAt && outAt <= inAt) outAt = new Date(outAt.getTime() + 86400000);
  const day = new Date(`${dateKey}T00:00:00`).getTime();
  const daysAway = (day - new Date(new Date().toDateString()).getTime()) / 86400000;
  if (daysAway > 14) throw attendanceError("too-far", "Requests can be raised at most 14 days in advance.");
  if (daysAway < -31) throw attendanceError("too-old", "Requests older than 31 days need a timecard correction instead.");
  return { inAt, outAt };
};

export const submitManualRequest = async ({ staff, dateKey, inTime = "", outTime = "", reason }) => {
  const { inAt, outAt } = buildManualRequestTimes({ dateKey, inTime, outTime, reason });
  const ref = await addDoc(requestsRef(), {
    type: "manual",
    staffId: staff.id,
    staffName: staff.name || "Staff",
    staffRole: staff.role || null,
    dateKey,
    inAt,
    outAt,
    reason: String(reason).trim().slice(0, 500),
    status: "pending",
    createdAt: serverTimestamp(),
    decidedBy: null,
    decidedAt: null,
    decisionNote: "",
  });
  await writeAudit("attendance.manual_requested", staff.id, { requestId: ref.id, dateKey });
  return ref.id;
};

export const subscribeMyAttendanceRequests = (staffId, onUpdate) => onSnapshot(
  query(requestsRef(), where("staffId", "==", staffId)),
  (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))),
  (err) => {
    console.error("subscribeMyAttendanceRequests error:", err);
    onUpdate([]);
  },
);

export const subscribeAttendanceRequests = (onUpdate) => onSnapshot(
  requestsRef(),
  (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))),
  (err) => {
    console.error("subscribeAttendanceRequests error:", err);
    onUpdate([]);
  },
);

/** How an approved manual request changes the day's record (pure). */
export const planManualAttendance = (request, data, approver) => {
  const inAt = request.inAt ? new Date(toMillis(request.inAt)) : null;
  const outAt = request.outAt ? new Date(toMillis(request.outAt)) : null;
  const now = Date.now();
  if ((inAt && inAt.getTime() > now) || (outAt && outAt.getTime() > now)) {
    throw attendanceError("future-time", "This request is for a time that hasn't happened yet. Approve it after the shift starts.");
  }
  const evidence = (prefix) => ({
    [`${prefix}Method`]: "manual",
    [`${prefix}RequestId`]: request.id,
    [`${prefix}VerifiedBy`]: approverStamp(approver),
  });
  if (!data || !data.clockInAt) {
    if (!inAt) throw attendanceError("needs-in", "There's no clock-in for that day, so the request needs a clock-in time.");
    return {
      create: true,
      fields: {
        dateKey: request.dateKey,
        staffId: request.staffId,
        staffName: request.staffName,
        clockInAt: inAt,
        clockOutAt: outAt,
        breakMinutes: 0,
        onBreak: false,
        breakStartAt: null,
        priorSessionsMinutes: 0,
        ...evidence("clockIn"),
        ...(outAt ? evidence("clockOut") : {}),
        updatedAt: serverTimestamp(),
      },
    };
  }
  if (data.clockOutAt) throw attendanceError("already-complete", "That day already has a complete record. Use Correct on the timecard instead.");
  if (!outAt) throw attendanceError("needs-out", "The staff member is already clocked in that day, so the request needs a clock-out time.");
  if (outAt.getTime() <= toMillis(data.clockInAt)) throw attendanceError("out-before-in", "Clock-out must be after the recorded clock-in.");
  return {
    create: false,
    fields: { clockOutAt: outAt, onBreak: false, breakStartAt: null, ...evidence("clockOut"), updatedAt: serverTimestamp() },
  };
};

/** Manager action: approve (writes attendance) or reject a manual request. */
export const decideManualRequest = async (request, decision, { approver = currentApprover(), note = "" } = {}) => {
  const allowed = canApprove(approver, request);
  if (!allowed.ok) throw attendanceError("not-allowed", allowed.reason);
  if (!["approved", "rejected"].includes(decision)) throw new Error(`Unknown decision: ${decision}`);
  if (decision === "rejected" && String(note).trim().length < 3) throw attendanceError("note-required", "Give a reason for rejecting.");
  const requestRef = doc(requestsRef(), request.id);
  const attendanceRef = attendanceDocRef(request.dateKey, request.staffId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists() || snap.data().status !== "pending") throw attendanceError("not-pending", "This request was already handled.");
    const stamp = { decidedBy: approverStamp(approver), decidedAt: serverTimestamp(), decisionNote: String(note).trim().slice(0, 300) };
    if (decision === "rejected") {
      tx.update(requestRef, { status: "rejected", ...stamp });
      return;
    }
    const attendanceSnap = await tx.get(attendanceRef);
    const plan = planManualAttendance({ ...snap.data(), id: request.id }, attendanceSnap.exists() ? attendanceSnap.data() : null, approver);
    if (plan.create) tx.set(attendanceRef, plan.fields);
    else tx.update(attendanceRef, plan.fields);
    tx.update(requestRef, { status: "approved", attendanceId: attendanceRef.id, ...stamp });
  });
  await writeAudit(`attendance.manual_${decision}`, request.staffId, { requestId: request.id, dateKey: request.dateKey });
};
