// Pure monthly-payroll logic (no Firestore).
import {
  PAYROLL_SETTINGS_DEFAULTS,
  monthlySalaryOf,
  agreedPayAmountOf,
  payFrequencyOf,
  calculatePf,
  computeRow,
  buildDraftRows,
  refreshDraftRows,
  updateRowField,
  rowProblems,
  summarizeRows,
  planIncrements,
  payrollCsv,
  nextMonthKey,
  isMonthKey,
  isPayPeriodKey,
  payrollRunId,
  formatRupees,
} from "../payrollService";
import { payslipHtml } from "../../components/Payroll/payslip";

const settings = { ...PAYROLL_SETTINGS_DEFAULTS }; // ₹200 tax, 12% PF capped at ₹15,000
const staff = (id, salary, extra = {}) => ({
  id, name: id.toUpperCase(), role: "Floor", status: "active",
  compensation: { type: "salary", monthlySalary: salary }, ...extra,
});

describe("salary and PF", () => {
  it("reads the monthly base salary, ignoring old hourly rates", () => {
    expect(monthlySalaryOf(staff("a", 20000))).toBe(20000);
    expect(monthlySalaryOf({ compensation: { type: "hourly", rate: 120 } })).toBe(0);
    expect(monthlySalaryOf({})).toBe(0);
  });

  it("uses a fixed agreed amount for the employee's saved pay frequency", () => {
    const weekly = staff("w", 0, { payrollProfile: { frequency: "weekly", periodAmount: 8500 } });
    expect(payFrequencyOf(weekly)).toBe("weekly");
    expect(agreedPayAmountOf(weekly, "weekly")).toBe(8500);
    expect(agreedPayAmountOf(weekly, "monthly")).toBe(0);
  });

  it("builds only matching frequency rows and avoids monthly deductions by default", () => {
    const weekly = staff("w", 0, { payrollProfile: { frequency: "weekly", periodAmount: 8500, pfEnabled: true, insurance: 500 } });
    const monthly = staff("m", 12000);
    const { rows, otherFrequency } = buildDraftRows([weekly, monthly], settings, "weekly", "2026-10-05");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ staffId: "w", salary: 8500, tax: 0, pf: 0, insurance: 0, payFrequency: "weekly" });
    expect(otherFrequency.map((item) => item.id)).toEqual(["m"]);
  });

  it("calculates PF on salary + increment, up to the wage cap", () => {
    expect(calculatePf({ salary: 10000, pfEnabled: true }, settings)).toBe(1200);
    expect(calculatePf({ salary: 20000, increment: 10000, pfEnabled: true }, settings)).toBe(1800);
    expect(calculatePf({ salary: 20000, pfEnabled: true }, { ...settings, pfWageCap: 0 })).toBe(2400);
    expect(calculatePf({ salary: 20000, pfEnabled: false }, settings)).toBe(0);
  });
});

describe("the owner's example: ₹20,000 salary + ₹10,000 increment", () => {
  const { rows } = buildDraftRows([staff("anirudh", 20000, { payrollProfile: { pfEnabled: true, insurance: 500 } })], settings);
  const row = updateRowField(rows[0], "increment", 10000, settings);

  it("adds salary + increment + bonus and subtracts tax, PF, insurance and extras", () => {
    const withBonus = updateRowField(row, "bonus", 2000, settings);
    const withExtra = computeRow({ ...withBonus, extraDeductions: [{ amount: 1000, reason: "Salary advance" }] });
    expect(withExtra).toMatchObject({
      additions: 32000, // 20,000 + 10,000 + 2,000
      tax: 200,
      pf: 1800, // 12% of the ₹15,000 cap
      insurance: 500,
      otherDeductions: 1000,
      deductions: 3500,
      netPay: 28500,
    });
  });

  it("raises next month's salary by the increment, not the bonus", () => {
    const withBonus = updateRowField(row, "bonus", 2000, settings);
    expect(planIncrements([withBonus])).toEqual([{ staffId: "anirudh", staffName: "ANIRUDH", from: 20000, to: 30000, increment: 10000 }]);
    // After finalize, the staff record holds ₹30,000, so next month's draft
    // starts at ₹30,000 with increment 0.
    const next = buildDraftRows([staff("anirudh", 30000)], settings).rows[0];
    expect(next).toMatchObject({ salary: 30000, increment: 0, bonus: 0 });
  });
});

describe("drafts", () => {
  it("includes active staff with a salary and lists who is missing one", () => {
    const { rows, missingSalary } = buildDraftRows([
      staff("b", 15000), staff("a", 18000), staff("c", 0), staff("d", 20000, { status: "inactive" }),
    ], settings);
    expect(rows.map((r) => r.staffId)).toEqual(["a", "b"]);
    expect(missingSalary.map((s) => s.id)).toEqual(["c"]);
    expect(rows[0]).toMatchObject({ tax: 200, pf: 0, netPay: 17800 });
  });

  it("keeps the owner's entries when refreshing from the staff list", () => {
    const { rows } = buildDraftRows([staff("a", 18000)], settings);
    const edited = computeRow({ ...updateRowField(rows[0], "bonus", 1500, settings), extraDeductions: [{ amount: 300, reason: "Uniform" }] });
    const { rows: refreshed } = refreshDraftRows([edited], [staff("a", 19000), staff("b", 12000)], settings);
    expect(refreshed.find((r) => r.staffId === "a")).toMatchObject({ salary: 19000, bonus: 1500, otherDeductions: 300 });
    expect(refreshed.find((r) => r.staffId === "b")).toMatchObject({ salary: 12000, bonus: 0 });
  });

  it("stops auto-calculating PF once the owner types it", () => {
    const { rows } = buildDraftRows([staff("a", 10000, { payrollProfile: { pfEnabled: true } })], settings);
    const typed = updateRowField(rows[0], "pf", 500, settings);
    expect(updateRowField(typed, "increment", 5000, settings).pf).toBe(500);
    expect(updateRowField(rows[0], "increment", 5000, settings).pf).toBe(1800);
  });
});

describe("validation and totals", () => {
  const base = buildDraftRows([staff("a", 10000)], settings).rows[0];

  it("needs a reason and amount for each additional subtraction", () => {
    expect(rowProblems(computeRow({ ...base, extraDeductions: [{ amount: 100, reason: "" }] }))[0]).toMatch(/reason/);
    expect(rowProblems(computeRow({ ...base, extraDeductions: [{ amount: 0, reason: "Advance" }] }))[0]).toMatch(/amount/);
    expect(rowProblems(computeRow({ ...base, extraDeductions: [{ amount: 100, reason: "Advance" }] }))).toEqual([]);
  });

  it("blocks negative values and deductions bigger than the pay", () => {
    expect(rowProblems({ ...base, bonus: -5 }).join(" ")).toMatch(/negative/);
    expect(rowProblems(computeRow({ ...base, extraDeductions: [{ amount: 20000, reason: "Advance" }] })).join(" ")).toMatch(/more than the pay/);
  });

  it("summarises the month and exports CSV with subtraction reasons", () => {
    const rows = [base, { ...base, staffId: "b", staffName: "B", paymentStatus: "paid" }];
    expect(summarizeRows(rows)).toMatchObject({ employees: 2, salary: 20000, net: 19600, paid: 9800, unpaid: 1 });
    const csv = payrollCsv([computeRow({ ...base, extraDeductions: [{ amount: 300, reason: "Uniform" }] })], "2026-10");
    expect(csv.split("\n")[0]).toContain("Additional subtractions");
    expect(csv).toContain("Uniform: 300");
    expect(csv).not.toMatch(/Tips/);
  });
});

describe("helpers", () => {
  it("handles months and Indian rupee formatting", () => {
    expect(nextMonthKey("2026-12")).toBe("2027-01");
    expect(nextMonthKey("2026-09")).toBe("2026-10");
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isPayPeriodKey("weekly", "2026-10-05")).toBe(true);
    expect(isPayPeriodKey("weekly", "2026-10-06")).toBe(false);
    expect(isPayPeriodKey("daily", "2026-02-31")).toBe(false);
    expect(isPayPeriodKey("contract", "2026-10-01_2026-10-31")).toBe(true);
    expect(isPayPeriodKey("contract", "2026-10-31_2026-10-01")).toBe(false);
    expect(payrollRunId("monthly", "2026-10")).toBe("2026-10");
    expect(payrollRunId("weekly", "2026-10-05")).toBe("weekly-2026-10-05");
    expect(formatRupees(125000)).toBe("₹1,25,000.00");
  });

  it("renders an escaped payslip with the breakdown", () => {
    const row = computeRow({ ...buildDraftRows([staff("a", 20000)], settings).rows[0], staffName: "<b>A</b>", bonus: 1000, extraDeductions: [{ amount: 250, reason: "Advance" }] });
    const html = payslipHtml(row, "2026-10");
    expect(html).toContain("&lt;b&gt;A&lt;/b&gt;");
    expect(html).toContain("Bonus");
    expect(html).toContain("Advance");
    expect(html).toContain("₹20,550.00");
  });
});
