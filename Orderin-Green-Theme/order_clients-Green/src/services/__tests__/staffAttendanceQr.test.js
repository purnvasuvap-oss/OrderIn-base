// QR + geolocation attendance: pure geo/QR helpers plus the token redeem flow
// against a small in-memory Firestore fake.
const store = vi.hoisted(() => new Map());

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => {
  const pathOf = (base, segments) => [base?.path, ...segments].filter(Boolean).join("/");
  let autoId = 0;
  const snap = (ref) => ({
    id: ref.path.split("/").pop(),
    ref,
    exists: () => store.has(ref.path),
    data: () => store.get(ref.path),
  });
  const update = (ref, patch) => {
    const next = { ...(store.get(ref.path) || {}) };
    Object.entries(patch).forEach(([key, value]) => {
      if (key.includes(".")) {
        const [outer, inner] = key.split(".");
        next[outer] = { ...(next[outer] || {}), [inner]: value };
      } else {
        next[key] = value;
      }
    });
    store.set(ref.path, next);
  };
  return {
    collection: (base, ...segments) => ({ path: pathOf(base, segments) }),
    doc: (base, ...segments) => {
      const path = pathOf(base, segments);
      return { path, id: path.split("/").pop() };
    },
    getDoc: async (ref) => snap(ref),
    getDocs: async (q) => ({
      docs: [...store.keys()]
        .filter((key) => key.startsWith(`${q.path}/`) && !key.slice(q.path.length + 1).includes("/"))
        .map((key) => snap({ path: key })),
    }),
    setDoc: async (ref, data, opts) => store.set(ref.path, opts?.merge ? { ...(store.get(ref.path) || {}), ...data } : { ...data }),
    updateDoc: async (ref, patch) => update(ref, patch),
    addDoc: async (coll, data) => {
      autoId += 1;
      const ref = { path: `${coll.path}/tok${String(autoId).padStart(10, "0")}` };
      store.set(ref.path, { ...data });
      return { id: ref.path.split("/").pop(), path: ref.path };
    },
    runTransaction: async (_db, fn) => fn({
      get: async (ref) => snap(ref),
      update: (ref, patch) => update(ref, patch),
      set: (ref, data) => store.set(ref.path, { ...data }),
    }),
    onSnapshot: () => () => {},
    query: (coll) => coll,
    where: () => ({}),
    serverTimestamp: () => new Date(),
    arrayUnion: (...items) => items,
  };
});

import {
  haversineMeters,
  evaluateAttendanceGeo,
  parseAttendanceQr,
  createAttendanceToken,
  redeemAttendanceToken,
  ATTENDANCE_SETTINGS_DEFAULTS,
} from "../staffService";

const BASE = "Restaurant/orderin_restuarant_6";
const RESTAURANT = { lat: 12.9716, lng: 77.5946 };
// ~0.0009° latitude ≈ 100 m.
const near = { lat: RESTAURANT.lat + 0.0003, lng: RESTAURANT.lng, accuracy: 20 };
const far = { lat: RESTAURANT.lat + 0.01, lng: RESTAURANT.lng, accuracy: 20 };

const seed = ({ settings = { ...RESTAURANT }, staffStatus = "active" } = {}) => {
  store.clear();
  store.set(`${BASE}/attendanceConfig/settings`, settings);
  store.set(`${BASE}/staff/s1`, { name: "Priya", status: staffStatus, pinHash: "secret" });
  store.set(`${BASE}/attendanceQrSessions/sess1`, { active: true, expiresAt: new Date(Date.now() + 600000) });
};

describe("haversineMeters", () => {
  it("measures short distances in meters", () => {
    expect(haversineMeters(RESTAURANT, RESTAURANT)).toBe(0);
    const d = haversineMeters(RESTAURANT, { lat: RESTAURANT.lat + 0.001, lng: RESTAURANT.lng });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(117);
  });
});

describe("evaluateAttendanceGeo", () => {
  const settings = { ...ATTENDANCE_SETTINGS_DEFAULTS, ...RESTAURANT };

  it("accepts staff inside the restaurant radius", () => {
    const result = evaluateAttendanceGeo({ staffGeo: near, settings });
    expect(result.ok).toBe(true);
    expect(result.distanceM).toBeLessThan(100);
  });

  it("rejects staff outside the radius", () => {
    const result = evaluateAttendanceGeo({ staffGeo: far, settings });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/away from the restaurant/);
  });

  it("rejects imprecise locations", () => {
    expect(evaluateAttendanceGeo({ staffGeo: { ...near, accuracy: 500 }, settings }).reason).toMatch(/imprecise/);
  });

  it("falls back to the manager's device when no restaurant location is saved", () => {
    const result = evaluateAttendanceGeo({ staffGeo: near, settings: ATTENDANCE_SETTINGS_DEFAULTS, managerGeo: RESTAURANT });
    expect(result.ok).toBe(true);
    expect(evaluateAttendanceGeo({ staffGeo: near, settings: ATTENDANCE_SETTINGS_DEFAULTS }).ok).toBe(false);
  });

  it("enforces manager proximity when required", () => {
    const strict = { ...settings, requireManagerProximity: true };
    expect(evaluateAttendanceGeo({ staffGeo: near, settings: strict, managerGeo: far }).ok).toBe(false);
    expect(evaluateAttendanceGeo({ staffGeo: near, settings: strict, managerGeo: RESTAURANT }).ok).toBe(true);
  });
});

describe("parseAttendanceQr", () => {
  it("accepts only well-formed OrderIn attendance payloads", () => {
    const nonce = "a".repeat(32);
    expect(parseAttendanceQr(`orderin-att:v1:abcdefghij123:${nonce}`)).toEqual({ tokenId: "abcdefghij123", nonce });
    expect(parseAttendanceQr("https://example.com")).toBeNull();
    expect(parseAttendanceQr(`orderin-att:v2:abcdefghij123:${nonce}`)).toBeNull();
    expect(parseAttendanceQr(`orderin-att:v1:abc:${nonce}`)).toBeNull();
  });
});

describe("redeemAttendanceToken", () => {
  beforeEach(() => seed());

  it("clocks the staff member in, then out, recording QR + distance", async () => {
    const first = await createAttendanceToken({ staffId: "s1", sessionId: "sess1", geo: near });
    const result = await redeemAttendanceToken(first.payload, { sessionId: "sess1", verifiedBy: "m1" });
    expect(result).toMatchObject({ action: "in", staff: { name: "Priya" } });
    expect(result.staff.pinHash).toBeUndefined();

    const [attendanceKey] = [...store.keys()].filter((key) => key.includes("/attendance/"));
    expect(store.get(attendanceKey)).toMatchObject({ clockInMethod: "qr", clockInVerifiedBy: "m1", clockInTokenId: first.tokenId });
    expect(store.get(attendanceKey).clockInGeo.distanceM).toBeLessThan(100);
    expect(store.get(`${BASE}/attendanceQrTokens/${first.tokenId}`).result).toMatchObject({
      status: "accepted", action: "in", attendanceId: attendanceKey.split("/").pop(),
    });

    const second = await createAttendanceToken({ staffId: "s1", sessionId: "sess1", geo: near });
    expect((await redeemAttendanceToken(second.payload, { sessionId: "sess1" })).action).toBe("out");
    expect(store.get(attendanceKey)).toMatchObject({ clockOutMethod: "qr", clockOutTokenId: second.tokenId });
  });

  it("refuses to reuse a token", async () => {
    const token = await createAttendanceToken({ staffId: "s1", sessionId: "sess1", geo: near });
    await redeemAttendanceToken(token.payload, { sessionId: "sess1" });
    await expect(redeemAttendanceToken(token.payload, { sessionId: "sess1" })).rejects.toMatchObject({ code: "token-used" });
  });

  it("rejects a tampered nonce without burning the real token", async () => {
    const token = await createAttendanceToken({ staffId: "s1", sessionId: "sess1", geo: near });
    const forged = `orderin-att:v1:${token.tokenId}:${"0".repeat(32)}`;
    await expect(redeemAttendanceToken(forged, { sessionId: "sess1" })).rejects.toMatchObject({ code: "invalid-qr" });
    expect(store.get(`${BASE}/attendanceQrTokens/${token.tokenId}`).usedAt).toBeNull();
  });

  it("rejects expired tokens, other sessions, distant staff and inactive staff", async () => {
    const expired = await createAttendanceToken({ staffId: "s1", sessionId: "sess1", geo: near });
    store.get(`${BASE}/attendanceQrTokens/${expired.tokenId}`).expiresAt = new Date(Date.now() - 1000);
    await expect(redeemAttendanceToken(expired.payload, { sessionId: "sess1" })).rejects.toMatchObject({ code: "token-expired" });

    const otherSession = await createAttendanceToken({ staffId: "s1", sessionId: "old", geo: near });
    await expect(redeemAttendanceToken(otherSession.payload, { sessionId: "sess1" })).rejects.toMatchObject({ code: "session-mismatch" });

    const distant = await createAttendanceToken({ staffId: "s1", sessionId: "sess1", geo: far });
    await expect(redeemAttendanceToken(distant.payload, { sessionId: "sess1" })).rejects.toMatchObject({ code: "geo-rejected" });
    expect(store.get(`${BASE}/attendanceQrTokens/${distant.tokenId}`).result.status).toBe("rejected");

    store.get(`${BASE}/attendanceQrSessions/sess1`).active = false;
    const ended = await createAttendanceToken({ staffId: "s1", sessionId: "sess1", geo: near });
    await expect(redeemAttendanceToken(ended.payload, { sessionId: "sess1" })).rejects.toMatchObject({ code: "session-ended" });

    seed({ staffStatus: "paused" });
    const paused = await createAttendanceToken({ staffId: "s1", sessionId: "sess1", geo: near });
    await expect(redeemAttendanceToken(paused.payload, { sessionId: "sess1" })).rejects.toMatchObject({ code: "inactive-staff" });

    expect([...store.keys()].some((key) => key.includes("/attendance/"))).toBe(false);
  });

  it("requires a location to mint a token", async () => {
    await expect(createAttendanceToken({ staffId: "s1", sessionId: "sess1", geo: null })).rejects.toMatchObject({ code: "geo-required" });
  });
});
