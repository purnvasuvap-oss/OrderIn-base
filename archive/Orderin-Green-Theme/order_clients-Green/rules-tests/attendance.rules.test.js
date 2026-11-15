// Firestore rules tests for staff attendance (entrance QR + registered phone +
// face check, and manager-approved manual attendance). Drives the real
// attendanceService / staffService code against the local emulator.
//   npm run test:rules
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, serverTimestamp,
} from "firebase/firestore";

const holder = vi.hoisted(() => ({ db: null }));
vi.mock("../src/firebase", () => ({
  get db() {
    return holder.db;
  },
}));

const att = await import("../src/services/attendanceService");
const staffSvc = await import("../src/services/staffService");

const RID = "orderin_restuarant_6";
const R = (...segments) => ["Restaurant", RID, ...segments].join("/");
const RESTAURANT = { lat: 12.9716, lng: 77.5946 };
const near = { lat: RESTAURANT.lat + 0.0003, lng: RESTAURANT.lng, accuracy: 20 };
const GM = { id: "m1", role: "General Manager" };
const GM2 = { id: "m2", role: "General Manager" };
const ADMIN = { id: "a1", role: "Admin" };
const FACE = { embedding: Array.from({ length: 1024 }, (_, i) => (i % 7) / 10), thumbnail: "data:image/jpeg;base64,AAAA", real: 0.9, live: 0.9 };
const STAFF = {
  s1: { id: "s1", name: "Anirudh", role: "Floor", status: "active" },
  s2: { id: "s2", name: "Paused", role: "Floor", status: "paused" },
  m1: { id: "m1", name: "Ravi", role: "General Manager", status: "active" },
  m2: { id: "m2", name: "Meena", role: "General Manager", status: "active" },
  a1: { id: "a1", name: "Owner", role: "Admin", status: "active" },
};

let env;
let db;
let seq = 0;

const makeIdentity = async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  seq += 1;
  return {
    deviceId: `device${String(seq).padStart(6, "0")}`,
    publicKeyJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    sign: async (text) => `sig:${text}`,
  };
};

const seed = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    await Promise.all(Object.values(STAFF).map(({ id, ...data }) => setDoc(doc(admin, R("staff", id)), data)));
    await setDoc(doc(admin, R("attendanceConfig", "settings")), {
      ...RESTAURANT, radiusMeters: 100, faceMatchThreshold: 0.6, updatedAt: new Date(),
    });
  });
};

/** Registers + approves a phone for staff, returns its identity. */
const registeredPhone = async (staffId, approver = GM) => {
  const identity = await makeIdentity();
  await att.requestDeviceRegistration({ staff: STAFF[staffId], identity, label: "Vivo Y35", face: FACE });
  const device = { id: identity.deviceId, ...(await getDoc(doc(db, R("staffDevices", identity.deviceId)))).data() };
  await att.decideDevice(device, "approved", approver);
  return identity;
};

const scan = async (staffId, identity, overrides = {}) => {
  const session = overrides.sessionId || (await att.startKioskSession({ startedBy: "m1" })).id;
  const code = await att.createKioskCode(session);
  return att.recordKioskScan({
    staff: STAFF[staffId],
    identity,
    codeId: code.codeId,
    geo: near,
    geoCheck: { ok: true, distanceM: 33 },
    face: { similarity: 0.82, real: 0.9, live: 0.9 },
    selfie: "data:image/jpeg;base64,BBBB",
    ...overrides,
  });
};

/** A hand-built "qr" attendance write, for forgery attempts. */
const forgedQrRecord = (staffId, { codeId, deviceId, similarity = 0.82, distanceM = 33 }) => ({
  dateKey: staffSvc.todayKey(), staffId, staffName: "x", clockInAt: serverTimestamp(), clockOutAt: null,
  clockInMethod: "qr", clockInDeviceId: deviceId, clockInKioskCode: codeId, clockInDeviceSig: "sig",
  clockInFace: { similarity, real: 0.9, live: 0.9 }, clockInGeo: { lat: near.lat, lng: near.lng, accuracy: 20, distanceM },
  updatedAt: serverTimestamp(),
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-orderin",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
  db = env.unauthenticatedContext().firestore();
  holder.db = db;
});

afterAll(async () => {
  await env?.cleanup();
});

describe("happy path (real service code)", () => {
  beforeEach(() => seed());

  it("registers a phone, approves it, then clocks in and out by scanning the display", async () => {
    const phone = await registeredPhone("s1");
    expect((await getDoc(doc(db, R("staffFaces", "s1")))).data()).toMatchObject({ deviceId: phone.deviceId });

    const session = (await att.startKioskSession({ startedBy: "m1" })).id;
    await expect(scan("s1", phone, { sessionId: session })).resolves.toMatchObject({ action: "in" });
    await expect(scan("s1", phone, { sessionId: session })).resolves.toMatchObject({ action: "out" });
    // Second shift the same day: the heaviest write (both sides' stamps change).
    await expect(scan("s1", phone, { sessionId: session })).resolves.toMatchObject({ action: "in" });
    await expect(scan("s1", phone, { sessionId: session })).resolves.toMatchObject({ action: "out" });
    const record = (await getDoc(doc(db, R("attendance", `${staffSvc.todayKey()}_s1`)))).data();
    expect(record).toMatchObject({ clockInMethod: "qr", clockOutMethod: "qr", clockInDeviceId: phone.deviceId });
  });

  it("keeps breaks, manager clock-out and reasoned corrections working", async () => {
    const phone = await registeredPhone("s1");
    await scan("s1", phone);
    const id = `${staffSvc.todayKey()}_s1`;
    const read = async () => (await getDoc(doc(db, R("attendance", id)))).data();
    await assertSucceeds(staffSvc.toggleBreak(id, await read()));
    await assertSucceeds(staffSvc.toggleBreak(id, await read()));
    await assertSucceeds(staffSvc.clockOutRecord(id, await read()));
    await assertSucceeds(staffSvc.updateAttendanceRecord(id, {
      clockInAt: new Date(Date.now() - 3600000), clockOutAt: new Date(), breakMinutes: 5, correctionReason: "Scanned late",
    }));
  });

  it("approving a new phone retires the old one", async () => {
    const oldPhone = await registeredPhone("s1");
    const newPhone = await registeredPhone("s1");
    expect((await getDoc(doc(db, R("staffDevices", oldPhone.deviceId)))).data().status).toBe("revoked");
    await expect(scan("s1", oldPhone)).rejects.toMatchObject({ code: "device-not-registered" });
    await expect(scan("s1", newPhone)).resolves.toMatchObject({ action: "in" });
  });

  it("manual attendance: staff → manager, manager → Admin", async () => {
    const inTime = "00:01";
    const dateKey = staffSvc.todayKey();
    const staffReq = await att.submitManualRequest({ staff: STAFF.s1, dateKey, inTime, reason: "Phone broken" });
    const staffRequest = { id: staffReq, ...(await getDoc(doc(db, R("attendanceRequests", staffReq)))).data() };
    await assertSucceeds(att.decideManualRequest(staffRequest, "approved", { approver: GM }));
    expect((await getDoc(doc(db, R("attendance", `${dateKey}_s1`)))).data()).toMatchObject({ clockInMethod: "manual", clockInRequestId: staffReq });

    const gmReq = await att.submitManualRequest({ staff: STAFF.m1, dateKey, inTime, reason: "Phone broken" });
    const gmRequest = { id: gmReq, ...(await getDoc(doc(db, R("attendanceRequests", gmReq)))).data() };
    await expect(att.decideManualRequest(gmRequest, "approved", { approver: GM2 })).rejects.toMatchObject({ code: "not-allowed" });
    await assertSucceeds(att.decideManualRequest(gmRequest, "approved", { approver: ADMIN }));

    // In + out in one request (both sides stamped in a single write).
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
    const fullReq = await att.submitManualRequest({ staff: STAFF.s1, dateKey: yesterday, inTime: "09:00", outTime: "17:00", reason: "Phone broken" });
    const fullRequest = { id: fullReq, ...(await getDoc(doc(db, R("attendanceRequests", fullReq)))).data() };
    await assertSucceeds(att.decideManualRequest(fullRequest, "approved", { approver: GM }));
    expect((await getDoc(doc(db, R("attendance", `${yesterday}_s1`)))).data()).toMatchObject({ clockInMethod: "manual", clockOutMethod: "manual" });

  });
});

describe("forgery attempts are blocked by the rules", () => {
  beforeEach(() => seed());

  it("display codes can't be listed, edited or deleted", async () => {
    const session = (await att.startKioskSession({ startedBy: "m1" })).id;
    const code = await att.createKioskCode(session);
    await assertFails(getDocs(collection(db, R("attendanceKioskCodes"))));
    await assertSucceeds(getDoc(doc(db, R("attendanceKioskCodes", code.codeId))));
    await assertFails(updateDoc(doc(db, R("attendanceKioskCodes", code.codeId)), { expiresAt: new Date(Date.now() + 86400000) }));
    await assertFails(deleteDoc(doc(db, R("attendanceKioskCodes", code.codeId))));
    await assertFails(setDoc(doc(db, R("attendanceKioskCodes", "longlivedcode000001")), {
      sessionId: session, nonce: "a".repeat(32), createdAt: serverTimestamp(), expiresAt: new Date(Date.now() + 3600000), deleteAt: new Date(),
    }));
  });

  it("a phone can't be self-approved, approved past the chain, or hijacked", async () => {
    const identity = await makeIdentity();
    await att.requestDeviceRegistration({ staff: STAFF.m1, identity, label: "Pixel", face: FACE });
    const ref = doc(db, R("staffDevices", identity.deviceId));
    const approve = (decidedBy) => updateDoc(ref, { status: "active", decidedBy, decidedAt: serverTimestamp() });
    await assertFails(approve(GM)); // self-approval (m1 approving own phone)
    await assertFails(approve(GM2)); // a manager's phone needs the Admin
    const thief = await makeIdentity();
    await assertFails(setDoc(doc(db, R("staffDevices", identity.deviceId)), {
      ...(await getDoc(ref)).data(), staffId: "s1", staffName: "Anirudh", staffRole: "Floor", publicKeyJwk: thief.publicKeyJwk,
      consentAt: serverTimestamp(), requestedAt: serverTimestamp(),
    }));
    // Approval without writing the face alongside is refused too.
    await assertFails(updateDoc(ref, { status: "active", decidedBy: ADMIN, decidedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, R("staffFaces", "m1")), { staffId: "m1", deviceId: identity.deviceId, embedding: [1], thumbnail: "x", approvedAt: serverTimestamp() }));
  });

  it("a phone request must carry the staff member's real role", async () => {
    const identity = await makeIdentity();
    await expect(att.requestDeviceRegistration({ staff: { ...STAFF.m1, role: "Floor" }, identity, label: "Pixel", face: FACE }))
      .rejects.toThrow();
  });

  it("QR attendance needs a live code, an active phone, a good face score and a distance in range", async () => {
    const phone = await registeredPhone("s1");
    const session = (await att.startKioskSession({ startedBy: "m1" })).id;
    const code = await att.createKioskCode(session);
    const ref = doc(db, R("attendance", `${staffSvc.todayKey()}_s1`));

    await assertFails(setDoc(ref, forgedQrRecord("s1", { codeId: code.codeId, deviceId: phone.deviceId, similarity: 0.3 })));
    await assertFails(setDoc(ref, forgedQrRecord("s1", { codeId: code.codeId, deviceId: phone.deviceId, distanceM: 5000 })));
    await assertFails(setDoc(ref, forgedQrRecord("s1", { codeId: "nosuchcode00000001", deviceId: phone.deviceId })));
    const otherPhone = await registeredPhone("m2", ADMIN);
    await assertFails(setDoc(ref, forgedQrRecord("s1", { codeId: code.codeId, deviceId: otherPhone.deviceId })));
    await att.endKioskSession(session);
    await assertFails(setDoc(ref, forgedQrRecord("s1", { codeId: code.codeId, deviceId: phone.deviceId })));
  });

  it("manual attendance can't be written without an approved request", async () => {
    const reqId = await att.submitManualRequest({ staff: STAFF.s1, dateKey: staffSvc.todayKey(), inTime: "00:01", reason: "Phone broken" });
    const req = (await getDoc(doc(db, R("attendanceRequests", reqId)))).data();
    await assertFails(setDoc(doc(db, R("attendance", `${staffSvc.todayKey()}_s1`)), {
      dateKey: staffSvc.todayKey(), staffId: "s1", staffName: "x", clockInAt: req.inAt, clockOutAt: null,
      clockInMethod: "manual", clockInRequestId: reqId, updatedAt: serverTimestamp(),
    }));
    // A manager can't relabel themselves as floor staff to dodge the Admin.
    await assertFails(setDoc(doc(db, R("attendanceRequests", "sneaky")), {
      type: "manual", staffId: "m1", staffName: "Ravi", staffRole: "Floor", dateKey: staffSvc.todayKey(), inAt: new Date(), outAt: null,
      reason: "Phone broken", status: "pending", createdAt: serverTimestamp(), decidedBy: null, decidedAt: null, decisionNote: "",
    }));
    // Nor approve a request directly without the attendance write.
    await assertFails(updateDoc(doc(db, R("attendanceRequests", reqId)), {
      status: "approved", decidedBy: GM, decidedAt: serverTimestamp(), attendanceId: `${staffSvc.todayKey()}_s1`,
    }));
  });

  it("no legacy PIN punches, no backdating, no deletes", async () => {
    const ref = doc(db, R("attendance", `${staffSvc.todayKey()}_s1`));
    await assertFails(setDoc(ref, {
      dateKey: staffSvc.todayKey(), staffId: "s1", clockInAt: serverTimestamp(), clockInMethod: "pin",
    }));
    const phone = await registeredPhone("s1");
    await scan("s1", phone);
    await assertFails(updateDoc(ref, { clockInAt: new Date(Date.now() - 4 * 3600000) }));
    await assertFails(deleteDoc(ref));
  });
});

describe("everything else in the shared project stays open", () => {
  beforeEach(() => seed());

  it("allows the same reads/writes as the previous allow-all rules", async () => {
    await assertSucceeds(setDoc(doc(db, "Restaurant", RID), { name: "Green" }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, R("orders", "o1")), { total: 10 }));
    await assertSucceeds(getDocs(collection(db, R("orders"))));
    await assertSucceeds(setDoc(doc(db, R("staff", "s9")), { name: "New" }));
    await assertSucceeds(setDoc(doc(db, R("settings", "general")), { anything: true }));
    await assertSucceeds(setDoc(doc(db, "Restaurant", "orderin_restaurant_4", "attendance", "x"), { anything: true }));
    await assertSucceeds(deleteDoc(doc(db, "Restaurant", "orderin_restaurant_4", "attendance", "x")));
    await assertSucceeds(setDoc(doc(db, "customers", "c1", "pastOrders", "p1"), { a: 1 }));
    await assertSucceeds(getDocs(collection(db, R("attendance"))));
    await assertSucceeds(getDocs(collection(db, R("staffDevices"))));
  });
});
