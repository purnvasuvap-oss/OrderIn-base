// Firestore rules tests for QR + geolocation attendance. Runs the real
// staffService code against the local emulator with firestore.rules loaded.
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

const svc = await import("../src/services/staffService");

const RID = "orderin_restuarant_6";
const R = (...segments) => ["Restaurant", RID, ...segments].join("/");
const RESTAURANT = { lat: 12.9716, lng: 77.5946 };
const near = { lat: RESTAURANT.lat + 0.0003, lng: RESTAURANT.lng, accuracy: 20 };
const todayId = (staffId) => `${svc.todayKey()}_${staffId}`;

let env;
let db;

const seed = async ({ allowPinFallback = false } = {}) => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    await setDoc(doc(admin, R("staff", "s1")), { name: "Priya", status: "active" });
    await setDoc(doc(admin, R("staff", "s2")), { name: "Arun", status: "paused" });
    await setDoc(doc(admin, R("attendanceConfig", "settings")), {
      ...RESTAURANT, radiusMeters: 100, allowPinFallback, updatedAt: new Date(),
    });
  });
};

const startSession = async () => (await svc.startQrSession({ managerGeo: RESTAURANT, startedBy: "m1" })).id;

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

describe("QR attendance happy path (real service code)", () => {
  beforeEach(() => seed());

  it("starts a session, mints a token, and clocks in then out", async () => {
    const sessionId = await startSession();
    const first = await svc.createAttendanceToken({ staffId: "s1", sessionId, geo: near });
    await expect(svc.redeemAttendanceToken(first.payload, { sessionId, verifiedBy: "m1" })).resolves.toMatchObject({ action: "in" });

    const record = (await getDoc(doc(db, R("attendance", todayId("s1"))))).data();
    expect(record).toMatchObject({ clockInMethod: "qr", clockInTokenId: first.tokenId });

    const second = await svc.createAttendanceToken({ staffId: "s1", sessionId, geo: near });
    await expect(svc.redeemAttendanceToken(second.payload, { sessionId })).resolves.toMatchObject({ action: "out" });
  });

  it("allows break toggles, manager clock-out, reasoned corrections and ending a session", async () => {
    const sessionId = await startSession();
    const token = await svc.createAttendanceToken({ staffId: "s1", sessionId, geo: near });
    await svc.redeemAttendanceToken(token.payload, { sessionId });
    const id = todayId("s1");
    const read = async () => (await getDoc(doc(db, R("attendance", id)))).data();

    await assertSucceeds(svc.toggleBreak(id, await read()));
    await assertSucceeds(svc.toggleBreak(id, await read()));
    await assertSucceeds(svc.clockOutRecord(id, await read()));
    await assertSucceeds(svc.updateAttendanceRecord(id, {
      clockInAt: new Date(Date.now() - 3600000), clockOutAt: new Date(), breakMinutes: 5, correctionReason: "Forgot to scan",
    }));
    await assertSucceeds(svc.endQrSession(sessionId));
  });

  it("rejected scans burn the token without touching attendance", async () => {
    const sessionId = await startSession();
    const far = await svc.createAttendanceToken({ staffId: "s1", sessionId, geo: { lat: 13.1, lng: 77.6, accuracy: 10 } });
    await expect(svc.redeemAttendanceToken(far.payload, { sessionId })).rejects.toMatchObject({ code: "geo-rejected" });
    expect((await getDoc(doc(db, R("attendance", todayId("s1"))))).exists()).toBe(false);
  });

  it("PIN punches work only when the fallback is enabled", async () => {
    const pinPunch = () => setDoc(doc(db, R("attendance", todayId("s1"))), {
      dateKey: svc.todayKey(), staffId: "s1", staffName: "Priya", clockInAt: serverTimestamp(), clockOutAt: null,
      clockInMethod: "pin", clockInGeo: null, clockInVerifiedBy: null, clockInTokenId: null, updatedAt: serverTimestamp(),
    });
    await assertFails(pinPunch());
    await seed({ allowPinFallback: true });
    await assertSucceeds(pinPunch());
  });
});

describe("forgery attempts are blocked", () => {
  beforeEach(() => seed());

  it("cannot list tokens or reuse / rewrite one", async () => {
    const sessionId = await startSession();
    const token = await svc.createAttendanceToken({ staffId: "s1", sessionId, geo: near });
    await assertFails(getDocs(collection(db, R("attendanceQrTokens"))));
    await assertSucceeds(getDoc(doc(db, R("attendanceQrTokens", token.tokenId))));

    await svc.redeemAttendanceToken(token.payload, { sessionId });
    const ref = doc(db, R("attendanceQrTokens", token.tokenId));
    await assertFails(updateDoc(ref, { usedAt: serverTimestamp(), result: { status: "rejected" } }));
    await assertFails(updateDoc(ref, { geo: { lat: 0, lng: 0 } }));
    await assertFails(deleteDoc(ref));
  });

  it("cannot mark a token accepted without the matching attendance write", async () => {
    const sessionId = await startSession();
    const token = await svc.createAttendanceToken({ staffId: "s1", sessionId, geo: near });
    await assertFails(updateDoc(doc(db, R("attendanceQrTokens", token.tokenId)), {
      usedAt: serverTimestamp(), result: { status: "accepted", action: "in", attendanceId: todayId("s1") },
    }));
  });

  it("cannot tag attendance as QR without burning a real token", async () => {
    const sessionId = await startSession();
    const token = await svc.createAttendanceToken({ staffId: "s1", sessionId, geo: near });
    await assertFails(setDoc(doc(db, R("attendance", todayId("s1"))), {
      dateKey: svc.todayKey(), staffId: "s1", staffName: "Priya", clockInAt: serverTimestamp(), clockOutAt: null,
      clockInMethod: "qr", clockInGeo: near, clockInTokenId: token.tokenId, clockInVerifiedBy: "m1", updatedAt: serverTimestamp(),
    }));
  });

  it("cannot backdate punches, edit times without a reason, or delete records", async () => {
    await seed({ allowPinFallback: true });
    const ref = doc(db, R("attendance", todayId("s1")));
    await assertFails(setDoc(ref, {
      dateKey: svc.todayKey(), staffId: "s1", staffName: "Priya", clockInAt: new Date(Date.now() - 4 * 3600000),
      clockOutAt: null, clockInMethod: "pin", updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(ref, {
      dateKey: svc.todayKey(), staffId: "s1", staffName: "Priya", clockInAt: serverTimestamp(),
      clockOutAt: null, clockInMethod: "pin", updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(ref, { clockInAt: new Date(Date.now() - 4 * 3600000) }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(db, R("attendance", "2020-01-01_someoneElse")), {
      dateKey: svc.todayKey(), staffId: "s1", clockInAt: serverTimestamp(), clockInMethod: "pin",
    }));
  });

  it("cannot mint tokens for inactive staff, ended sessions, or with long expiry", async () => {
    const sessionId = await startSession();
    await assertFails(svc.createAttendanceToken({ staffId: "s2", sessionId, geo: near }));
    await assertFails(setDoc(doc(db, R("attendanceQrTokens", "forgedtoken0000000001")), {
      staffId: "s1", sessionId, nonce: "a".repeat(32), geo: near, createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 3600000), deleteAt: new Date(Date.now() + 86400000), usedAt: null, result: null,
    }));
    await svc.endQrSession(sessionId);
    await assertFails(svc.createAttendanceToken({ staffId: "s1", sessionId, geo: near }));
    await assertFails(updateDoc(doc(db, R("attendanceQrSessions", sessionId)), { active: true }));
  });

  it("validates attendance settings", async () => {
    await expect(svc.saveAttendanceSettings({ radiusMeters: 100000 })).rejects.toThrow(/Radius/);
    await assertFails(setDoc(doc(db, R("attendanceConfig", "settings")), { radiusMeters: 5, updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(db, R("attendanceConfig", "settings")), { lat: 999, lng: 0, updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(svc.saveAttendanceSettings({ radiusMeters: 150, allowPinFallback: true }));
  });
});

describe("everything else in the shared project stays open", () => {
  beforeEach(() => seed());

  it("allows the same reads/writes as the previous allow-all rules", async () => {
    await assertSucceeds(setDoc(doc(db, "Restaurant", RID), { name: "Green" }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, R("orders", "o1")), { total: 10 }));
    await assertSucceeds(getDocs(collection(db, R("orders"))));
    await assertSucceeds(setDoc(doc(db, R("staff", "s9")), { name: "New", pinHash: "x" }));
    await assertSucceeds(setDoc(doc(db, R("settings", "general")), { anything: true }));
    await assertSucceeds(setDoc(doc(db, "Restaurant", "orderin_restaurant_4", "attendance", "x"), { anything: true }));
    await assertSucceeds(deleteDoc(doc(db, "Restaurant", "orderin_restaurant_4", "attendance", "x")));
    await assertSucceeds(setDoc(doc(db, "customers", "c1", "pastOrders", "p1"), { a: 1 }));
    await assertSucceeds(getDocs(collection(db, "customers")));
    await assertSucceeds(getDocs(collection(db, R("attendance"))));
  });
});
