// Pure verification + planning logic of attendanceService (no Firestore).
import {
  haversineMeters,
  evaluateAttendanceGeo,
  evaluateFaceMatch,
  parseKioskQr,
  canApprove,
  buildManualRequestTimes,
  planManualAttendance,
  planPunch,
  ATTENDANCE_SETTINGS_DEFAULTS,
} from "../attendanceService";
import { averageEmbedding, frameProblem } from "../faceRecognition";

const RESTAURANT = { lat: 12.9716, lng: 77.5946 };
const settings = { ...ATTENDANCE_SETTINGS_DEFAULTS, ...RESTAURANT };
const near = { lat: RESTAURANT.lat + 0.0003, lng: RESTAURANT.lng, accuracy: 20 };
const far = { lat: RESTAURANT.lat + 0.01, lng: RESTAURANT.lng, accuracy: 20 };
const isoDay = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA");
};

describe("location check", () => {
  it("measures distances in meters", () => {
    const d = haversineMeters(RESTAURANT, { lat: RESTAURANT.lat + 0.001, lng: RESTAURANT.lng });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(117);
  });

  it("accepts phones inside the radius and rejects outside / imprecise / unset", () => {
    expect(evaluateAttendanceGeo({ staffGeo: near, settings })).toMatchObject({ ok: true });
    expect(evaluateAttendanceGeo({ staffGeo: far, settings }).reason).toMatch(/from the restaurant/);
    expect(evaluateAttendanceGeo({ staffGeo: { ...near, accuracy: 400 }, settings }).reason).toMatch(/imprecise/);
    expect(evaluateAttendanceGeo({ staffGeo: near, settings: ATTENDANCE_SETTINGS_DEFAULTS }).reason).toMatch(/hasn't been set/);
  });
});

describe("face decision", () => {
  it("needs a match above the threshold plus liveness and anti-spoof", () => {
    expect(evaluateFaceMatch({ similarity: 0.72, real: 0.9, live: 0.9 }).ok).toBe(true);
    expect(evaluateFaceMatch({ similarity: 0.5, real: 0.9, live: 0.9 }).reason).toMatch(/didn't match/);
    expect(evaluateFaceMatch({ similarity: 0.5, real: 0.9, live: 0.9, threshold: 0.45 }).ok).toBe(true);
    expect(evaluateFaceMatch({ similarity: 0.9, real: 0.2, live: 0.9 }).reason).toMatch(/photo or screen/);
    expect(evaluateFaceMatch({ similarity: 0.9, real: 0.9, live: 0.1 }).reason).toMatch(/Liveness/);
    expect(evaluateFaceMatch({ similarity: NaN }).reason).toMatch(/No face enrolled/);
  });

  it("averages frames and explains unusable ones", () => {
    expect(averageEmbedding([[1, 3], [3, 5]])).toEqual([2, 4]);
    expect(frameProblem([], 640)).toMatch(/Position your face/);
    expect(frameProblem([{}, {}], 640)).toMatch(/Only one person/);
    expect(frameProblem([{ score: 0.9, box: [0, 0, 60, 60], embedding: [1] }], 640)).toMatch(/closer/);
    expect(frameProblem([{ score: 0.9, box: [0, 0, 300, 300], embedding: [1] }], 640)).toBeNull();
  });
});

describe("entrance QR", () => {
  it("accepts only well-formed display codes", () => {
    const nonce = "a".repeat(32);
    expect(parseKioskQr(`orderin-kiosk:v1:abcdefghij123:${nonce}`)).toEqual({ codeId: "abcdefghij123", nonce });
    expect(parseKioskQr(`orderin-att:v1:abcdefghij123:${nonce}`)).toBeNull();
    expect(parseKioskQr("https://example.com")).toBeNull();
  });
});

describe("approval chain", () => {
  const floor = { staffId: "s1", staffRole: "Floor" };
  const gmRequest = { staffId: "m1", staffRole: "General Manager" };

  it("lets managers approve staff, but not themselves", () => {
    expect(canApprove({ id: "m1", role: "General Manager" }, floor).ok).toBe(true);
    expect(canApprove({ id: null, role: "General Manager" }, floor).ok).toBe(true);
    expect(canApprove({ id: "s1", role: "Admin" }, floor).reason).toMatch(/own request/);
    expect(canApprove({ id: "k1", role: "Kitchen" }, floor).ok).toBe(false);
  });

  it("sends managers' requests to the Admin", () => {
    expect(canApprove({ id: "m2", role: "General Manager" }, gmRequest).reason).toMatch(/Admin/);
    expect(canApprove({ id: "a1", role: "Admin" }, gmRequest).ok).toBe(true);
    expect(canApprove({ id: "a1", role: "Admin" }, { staffId: "a1", staffRole: "Admin" }).ok).toBe(false);
  });
});

describe("manual attendance", () => {
  it("validates the request and handles overnight shifts", () => {
    const { inAt, outAt } = buildManualRequestTimes({ dateKey: isoDay(-1), inTime: "22:00", outTime: "06:00", reason: "Phone broken" });
    expect(outAt.getTime() - inAt.getTime()).toBe(8 * 3600000);
    expect(() => buildManualRequestTimes({ dateKey: isoDay(), inTime: "", outTime: "", reason: "Phone broken" })).toThrow(/clock-in or clock-out/);
    expect(() => buildManualRequestTimes({ dateKey: isoDay(), inTime: "09:00", reason: "x" })).toThrow(/reason/);
    expect(() => buildManualRequestTimes({ dateKey: isoDay(30), inTime: "09:00", reason: "Phone broken" })).toThrow(/14 days/);
    expect(buildManualRequestTimes({ dateKey: isoDay(3), inTime: "09:00", reason: "Phone broken" }).inAt).toBeInstanceOf(Date);
  });

  const approver = { id: "m1", role: "General Manager" };
  const past = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000);

  it("creates a full record when the day has none", () => {
    const plan = planManualAttendance({ id: "r1", staffId: "s1", staffName: "Priya", dateKey: "2026-10-01", inAt: past(9), outAt: past(1) }, null, approver);
    expect(plan.create).toBe(true);
    expect(plan.fields).toMatchObject({ clockInMethod: "manual", clockInRequestId: "r1", clockOutMethod: "manual", clockOutRequestId: "r1" });
  });

  it("only adds a clock-out to an open record, and refuses complete ones or future times", () => {
    const open = { clockInAt: past(8), clockOutAt: null };
    expect(planManualAttendance({ id: "r2", outAt: past(1) }, open, approver).fields).toMatchObject({ clockOutMethod: "manual" });
    expect(() => planManualAttendance({ id: "r3", inAt: past(8) }, open, approver)).toThrow(/clock-out time/);
    expect(() => planManualAttendance({ id: "r4", outAt: past(1) }, { clockInAt: past(8), clockOutAt: past(2) }, approver)).toThrow(/complete record/);
    expect(() => planManualAttendance({ id: "r5", inAt: new Date(Date.now() + 3600000) }, null, approver)).toThrow(/hasn't happened/);
  });
});

describe("planPunch", () => {
  const staff = { id: "s1", name: "Priya" };

  it("stamps evidence on the side being punched", () => {
    const clockIn = planPunch(staff, "2026-10-02", null, { Method: "qr", DeviceId: "d1" });
    expect(clockIn.action).toBe("in");
    expect(clockIn.fields).toMatchObject({ clockInMethod: "qr", clockInDeviceId: "d1", staffId: "s1" });

    const clockOut = planPunch(staff, "2026-10-02", { clockInAt: new Date(), clockOutAt: null }, { Method: "qr", DeviceId: "d1" });
    expect(clockOut.action).toBe("out");
    expect(clockOut.fields).toMatchObject({ clockOutMethod: "qr", clockOutDeviceId: "d1" });
    expect(clockOut.fields.clockInMethod).toBeUndefined();
  });
});
