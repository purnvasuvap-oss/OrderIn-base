import {
  permissionsForRole,
  STAFF_PERMISSIONS,
  validateAvailability,
  validateShift,
} from "../staffService";

// Payroll calculations are covered in payrollService.test.js.
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

  it("rejects zero-length shifts", () => {
    expect(validateShift({ type: "morning", start: "09:00", end: "09:00" }).valid).toBe(false);
  });
});
