import {
  permissionsForRole,
  STAFF_PERMISSIONS,
  validateAvailability,
  validateShift,
  calculatePayroll,
  payrollCsv,
  payrollPeriodKey,
  validatePayrollStatusTransition,
  canTransitionPayrollStatus,
} from "../staffService";

describe("staff service policy helpers", () => {
  it("uses explicit role permissions and denies unknown roles", () => {
    expect(permissionsForRole("Admin").can(STAFF_PERMISSIONS.managePayroll)).toBe(true);
    expect(permissionsForRole("Floor").can(STAFF_PERMISSIONS.manageStaff)).toBe(false);
    expect(permissionsForRole("unknown").permissions).toEqual([]);
  });

  it("validates weekly availability bounds and preferred shift", () => {
    expect(validateAvailability({ preferredShift: "morning", minWeeklyHours: 10, maxWeeklyHours: 30 }).valid).toBe(true);
    expect(validateAvailability({ preferredShift: "invalid", minWeeklyHours: 10, maxWeeklyHours: 30 }).valid).toBe(false);
    expect(validateAvailability({ preferredShift: "morning", minWeeklyHours: 40, maxWeeklyHours: 10 }).valid).toBe(false);
  });

  it("rejects zero-length shifts and calculates payroll for date ranges", () => {
    expect(validateShift({ type: "morning", start: "09:00", end: "09:00" }).valid).toBe(false);
    const rows = calculatePayroll([
      { id: "a", staffId: "s1", staffName: "A", dateKey: "2026-01-01", clockInAt: "2026-01-01T09:00:00Z", clockOutAt: "2026-01-01T17:00:00Z", breakMinutes: 0 },
    ], [{ id: "s1", name: "A", compensation: { type: "hourly", rate: 10 } }], "2026-01-01", "2026-01-31");
    expect(rows[0]).toMatchObject({ hours: 8, gross: 80 });
    expect(payrollCsv(rows)).toContain("Staff ID,Employee ID,Staff Name,Role,Hours,Regular Hours,Overtime Hours,Break Hours,Hourly Rate,Overtime Rate,Tips,Bonuses,Deductions,Gross Pay,Net Pay,Approval Status,Payment Status,Payment Reference");
  });

  it("splits regular and overtime hours and applies tips and deductions", () => {
    const records = [{
      staffId: "s1", staffName: "A", dateKey: "2026-01-01",
      clockInAt: "2026-01-01T00:00:00Z", clockOutAt: "2026-01-03T04:00:00Z", breakMinutes: 120,
    }];
    const [row] = calculatePayroll(records, [{ id: "s1", name: "A", compensation: { type: "hourly", rate: 10 } }], "2026-01-01", "2026-01-31", {
      tipsByStaff: { s1: 25 }, deductionsByStaff: { s1: 10 },
    });
    expect(row).toMatchObject({ hours: 50, regularHours: 40, overtimeHours: 10, breakHours: 2, gross: 575, netPay: 565 });
  });

  it("requires safe payroll status transitions and stable period keys", () => {
    expect(payrollPeriodKey("2026-01-01", "2026-01-31")).toBe("2026-01-01_2026-01-31");
    // Full workflow: draft -> under_review -> approved -> processing -> paid/failed,
    // with reopened as an escape hatch back to review.
    expect(canTransitionPayrollStatus("draft", "under_review")).toBe(true);
    expect(canTransitionPayrollStatus("draft", "approved")).toBe(false);
    expect(canTransitionPayrollStatus("under_review", "approved")).toBe(true);
    expect(canTransitionPayrollStatus("approved", "processing")).toBe(true);
    expect(canTransitionPayrollStatus("processing", "paid")).toBe(true);
    expect(canTransitionPayrollStatus("processing", "failed")).toBe(true);
    expect(canTransitionPayrollStatus("failed", "processing")).toBe(true);
    expect(canTransitionPayrollStatus("paid", "processing")).toBe(false);
    expect(canTransitionPayrollStatus("approved", "draft")).toBe(false);
    expect(validatePayrollStatusTransition("approved", "draft").valid).toBe(false);
    expect(validatePayrollStatusTransition("approved", "reopened").valid).toBe(true);
  });
});
