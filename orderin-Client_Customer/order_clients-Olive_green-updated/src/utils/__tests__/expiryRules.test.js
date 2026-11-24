import { describe, it, expect } from "vitest";
import {
  addSpan,
  computeExpiryPlan,
  collectExpiringBatches,
  getBatchExpiryState,
  EXPIRY_STATUS,
  formatSpan,
  normalizeSpan,
} from "../expiryRules";

const d = (y, m, day, h = 0) => new Date(y, m - 1, day, h);

describe("expiryRules", () => {
  it("adds calendar months, hours and weeks", () => {
    expect(addSpan(d(2026, 1, 31), { value: 1, unit: "months" }).getMonth()).toBe(2); // Jan 31 + 1 month rolls into March
    expect(addSpan(d(2026, 5, 1), { value: 6, unit: "months" })).toEqual(d(2026, 11, 1));
    expect(addSpan(d(2026, 5, 1, 10), { value: 2, unit: "hours" })).toEqual(d(2026, 5, 1, 12));
    expect(addSpan(d(2026, 5, 1), { value: 2, unit: "weeks" })).toEqual(d(2026, 5, 15));
    expect(addSpan(d(2026, 5, 15), { value: 15, unit: "days" }, -1)).toEqual(d(2026, 4, 30));
  });

  it("rejects empty spans", () => {
    expect(normalizeSpan({ value: "", unit: "days" })).toBeNull();
    expect(normalizeSpan({ value: "0", unit: "days" })).toBeNull();
    expect(normalizeSpan({ value: "3", unit: "bogus" })).toEqual({ value: 3, unit: "days" });
    expect(formatSpan({ value: 1, unit: "hours" })).toBe("1 hour");
    expect(formatSpan({ value: 15, unit: "days" })).toBe("15 days");
  });

  it("rice bag: 6 months by duration with a 15-day buffer", () => {
    const plan = computeExpiryPlan({
      mode: "duration",
      arrivalDate: "2026-05-01",
      duration: { value: 6, unit: "months" },
      buffer: { value: 15, unit: "days" },
      alertBefore: { value: 10, unit: "days" },
    });
    expect(plan.expiry).toEqual(d(2026, 11, 1));
    expect(plan.useBefore).toEqual(d(2026, 10, 17));
    expect(plan.alertAt).toEqual(d(2026, 10, 7));
    expect(plan.shelfLifeDays).toBeGreaterThan(160);
  });

  it("milk: printed date, alert 2 hours before end of day", () => {
    const plan = computeExpiryPlan({
      mode: "date",
      arrivalDate: "2026-11-24",
      expiryDate: "2026-11-26",
      alertBefore: { value: 2, unit: "hours" },
    });
    expect(plan.expiry).toEqual(new Date(2026, 10, 26, 23, 59));
    expect(plan.useBefore).toEqual(plan.expiry);
    expect(plan.alertAt).toEqual(new Date(2026, 10, 26, 21, 59));
  });

  it("returns null with no expiry information", () => {
    expect(computeExpiryPlan({ mode: "date", expiryDate: "" })).toBeNull();
    expect(computeExpiryPlan({ mode: "duration", duration: { value: "", unit: "days" } })).toBeNull();
  });

  it("never alerts before the stock arrived", () => {
    const plan = computeExpiryPlan({
      mode: "date",
      arrivalDate: "2026-11-24",
      expiryDate: "2026-11-25",
      buffer: { value: 5, unit: "days" },
      alertBefore: { value: 1, unit: "months" },
    });
    expect(plan.useBefore).toEqual(d(2026, 11, 24));
    expect(plan.alertAt).toEqual(d(2026, 11, 24));
  });

  it("reads batch state from new and legacy fields", () => {
    const now = d(2026, 11, 24, 12);
    expect(getBatchExpiryState({ useBefore: d(2026, 12, 10), alertAt: d(2026, 12, 1) }, now).status).toBe(EXPIRY_STATUS.FRESH);
    expect(getBatchExpiryState({ useBefore: d(2026, 11, 25), alertAt: d(2026, 11, 24) }, now).status).toBe(EXPIRY_STATUS.ALERT);
    expect(getBatchExpiryState({ expiryDate: d(2026, 11, 20) }, now).status).toBe(EXPIRY_STATUS.EXPIRED);
    // legacy: expiryDate + warningPeriodDays (3) => alert window starts Nov 23
    expect(getBatchExpiryState({ expiryDate: d(2026, 11, 26), warningPeriodDays: 3 }, now).status).toBe(EXPIRY_STATUS.ALERT);
    expect(getBatchExpiryState({}, now).status).toBe(EXPIRY_STATUS.UNKNOWN);
  });

  it("collects active expiring batches soonest first", () => {
    const now = d(2026, 11, 24, 12);
    const list = collectExpiringBatches(
      {
        Milk: [
          { status: "active", remainingQty: 5, useBefore: d(2026, 11, 25), alertAt: d(2026, 11, 24) },
          { status: "consumed", remainingQty: 0, useBefore: d(2026, 11, 25), alertAt: d(2026, 11, 24) },
        ],
        Tomato: [{ status: "active", remainingQty: 2, useBefore: d(2026, 11, 24, 18), alertAt: d(2026, 11, 24) }],
        Rice: [{ status: "active", remainingQty: 20, useBefore: d(2027, 3, 1), alertAt: d(2027, 2, 1) }],
      },
      now
    );
    expect(list.map((b) => b.itemName)).toEqual(["Tomato", "Milk"]);
  });
});
