// src/services/payrollService.js
//
// Period payroll (Admin-only), per the restaurant owner's model:
//
//   Additions    = monthly salary + increment + bonus
//   Deductions   = employment tax + PF + insurance + additional subtractions
//                  (each additional subtraction is an amount + a reason)
//   Net pay      = Additions − Deductions
//
// Tips are not part of payroll — customers pay them to staff directly.
// A bonus is one-off. An increment is permanent: finalizing the month raises
// the employee's base salary by it, so next month's salary already includes
// it and next month's increment starts at 0. Reopening an unpaid finalized
// month reverses that.
//
// Pay is a fixed agreed amount per configured pay period. Customer tips and
// attendance are not part of this register.
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
  deleteDoc,
  deleteField,
  serverTimestamp,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import {
  STAFF_RESTAURANT_ID as RESTAURANT_ID,
  writeStaffAudit as writeAudit,
  isActiveStaff,
  normalizeRole,
  ROLES,
} from "./staffService";

const runsRef = () => collection(db, "Restaurant", RESTAURANT_ID, "payrollRuns");
const runRef = (month) => doc(runsRef(), month);
const rowsRef = (month) => collection(runRef(month), "rows");
const rowRef = (month, staffId) => doc(rowsRef(month), staffId);
const settingsRef = () => doc(db, "Restaurant", RESTAURANT_ID, "payrollConfig", "settings");
const jobRolesRef = () => collection(db, "Restaurant", RESTAURANT_ID, "jobRoles");
const staffRef = (id) => doc(db, "Restaurant", RESTAURANT_ID, "staff", id);
const payrollProfilesRef = () => collection(db, "Restaurant", RESTAURANT_ID, "staffPayrollProfiles");
const payrollProfileRef = (id) => doc(payrollProfilesRef(), id);
const salaryHistoryRef = (id) => collection(payrollProfileRef(id), "salaryHistory");
const migrationRef = () => doc(db, "Restaurant", RESTAURANT_ID, "payrollConfig", "_migration");

/** Move legacy payroll fields into profile documents using the client Firestore SDK. */
export const migratePayrollData = async () => {
  const markerRef = migrationRef();
  const marker = await getDoc(markerRef);
  if (marker.data()?.complete === true) {
    return { migratedProfiles: 0, migratedSalaryHistory: 0, alreadyMigrated: true };
  }

  const staffSnapshot = await getDocs(collection(db, "Restaurant", RESTAURANT_ID, "staff"));
  let movedProfiles = 0;
  let movedHistory = 0;

  for (const staffDoc of staffSnapshot.docs) {
    const staff = staffDoc.data();
    const legacyProfile = staff.payrollProfile || {};
    const compensation = staff.compensation || {};
    const frequency = ["monthly", "weekly", "daily", "contract"].includes(legacyProfile.frequency)
      ? legacyProfile.frequency
      : "monthly";
    const legacyAmount = frequency === "monthly"
      ? (compensation.monthlySalary ?? legacyProfile.periodAmount ?? compensation.amount ?? compensation.rate ?? 0)
      : (legacyProfile.periodAmount ?? 0);
    const profileRef = payrollProfileRef(staffDoc.id);
    const existingProfile = await getDoc(profileRef);
    if (!existingProfile.exists()) {
      await setDoc(profileRef, {
        frequency,
        periodAmount: Number.isFinite(Number(legacyAmount)) ? Number(legacyAmount) : 0,
        pfEnabled: Boolean(legacyProfile.pfEnabled),
        insurance: Number(legacyProfile.insurance) || 0,
        upiId: legacyProfile.upiId || null,
        migratedAt: serverTimestamp(),
      });
    }
    movedProfiles += 1;

    const history = await getDocs(collection(staffDoc.ref, "salaryHistory"));
    for (let offset = 0; offset < history.docs.length; offset += 200) {
      const batch = writeBatch(db);
      history.docs.slice(offset, offset + 200).forEach((entry) => {
        batch.set(doc(salaryHistoryRef(staffDoc.id), entry.id), entry.data(), { merge: true });
        batch.delete(entry.ref);
      });
      await batch.commit();
      movedHistory += Math.min(200, history.docs.length - offset);
    }

    if (staff.compensation || staff.payrollProfile) {
      await updateDoc(staffDoc.ref, {
        compensation: deleteField(),
        payrollProfile: deleteField(),
      });
    }
  }

  const runs = await getDocs(runsRef());
  for (const runDoc of runs.docs) {
    const run = runDoc.data();
    if (!["finalized", "paid"].includes(run.status) || !Array.isArray(run.staffIds)) continue;
    for (let offset = 0; offset < run.staffIds.length; offset += 400) {
      const batch = writeBatch(db);
      run.staffIds.slice(offset, offset + 400).forEach((staffId) => batch.set(
        doc(payrollProfileRef(staffId), "runs", runDoc.id),
        {
          runId: runDoc.id,
          frequency: ["monthly", "weekly", "daily", "contract"].includes(run.frequency) ? run.frequency : "monthly",
          periodKey: run.periodKey || runDoc.id,
          periodLabel: run.periodLabel || runDoc.id,
          status: run.status,
        },
        { merge: true },
      ));
      await batch.commit();
    }
  }

  await setDoc(markerRef, { complete: true, completedAt: serverTimestamp() });
  return { migratedProfiles: movedProfiles, migratedSalaryHistory: movedHistory };
};

export const PAYROLL_SETTINGS_DEFAULTS = Object.freeze({
  professionalTax: 200, // employment / professional tax, ₹ per month
  pfRatePercent: 12, // employee PF contribution
  pfWageCap: 15000, // PF is calculated on salary up to this amount (0 = no cap)
});
export const RUN_STATUS_LABEL = Object.freeze({ draft: "Draft", finalized: "Finalized", paid: "Paid" });
export const PAY_FREQUENCIES = Object.freeze({
  monthly: "Monthly",
  weekly: "Weekly",
  daily: "Daily",
  contract: "Contract period",
});

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isMonthKey = (value) => MONTH_RE.test(String(value || ""));
export const isDateKey = (value) => {
  if (!DATE_RE.test(String(value || ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};
export const isPayFrequency = (value) => Object.hasOwn(PAY_FREQUENCIES, value);
export const isContractPeriodKey = (value) => {
  const parts = String(value || "").split("_");
  return parts.length === 2 && isDateKey(parts[0]) && isDateKey(parts[1]) && parts[0] <= parts[1];
};
export const isPayPeriodKey = (frequency, value) => {
  if (frequency === "monthly") return isMonthKey(value);
  if (frequency === "daily") return isDateKey(value);
  if (frequency === "weekly") return isDateKey(value) && new Date(`${value}T00:00:00`).getDay() === 1;
  if (frequency === "contract") return isContractPeriodKey(value);
  return false;
};
export const payrollRunId = (frequency, periodKey) =>
  frequency === "monthly" ? periodKey : `${frequency}-${periodKey}`;
export const frequencyFromRun = (run) => isPayFrequency(run?.frequency) ? run.frequency : "monthly";
export const periodLabel = (frequency, key) => {
  if (frequency === "monthly") return monthLabel(key);
  if (frequency === "contract" && isContractPeriodKey(key)) {
    const [start, end] = key.split("_");
    return `${start} to ${end}`;
  }
  if (isDateKey(key)) {
    const start = new Date(`${key}T00:00:00`);
    const end = frequency === "weekly" ? new Date(start.getTime() + 6 * 86400000) : start;
    const dateOptions = { day: "numeric", month: "short", year: "numeric" };
    return `${start.toLocaleDateString("en-IN", dateOptions)}${frequency === "weekly" ? ` – ${end.toLocaleDateString("en-IN", dateOptions)}` : ""}`;
  }
  return key || "";
};
export const currentMonthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
export const nextMonthKey = (month) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
export const monthLabel = (month) => {
  if (!isMonthKey(month)) return month || "";
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

/** ₹1,25,000.00 */
export const formatRupees = (value) => `₹${(Number(value) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const payrollError = (code, message) => {
  const err = new Error(message);
  err.code = code;
  return err;
};

/* ------------------------------ pure calculation --------------------------- */

/** The employee's current monthly base salary. */
export const monthlySalaryOf = (staff) => {
  const profile = staff?.payrollProfile || {};
  if (profile.frequency === "monthly" && Number.isFinite(Number(profile.periodAmount))) return round2(profile.periodAmount);
  const comp = staff?.compensation || {};
  return round2(comp.monthlySalary ?? (comp.type === "salary" ? comp.amount ?? comp.rate : 0) ?? 0);
};

export const payFrequencyOf = (staff) => {
  const saved = staff?.payrollProfile?.frequency;
  return isPayFrequency(saved) ? saved : "monthly";
};

export const agreedPayAmountOf = (staff, frequency = payFrequencyOf(staff)) => {
  const profile = staff?.payrollProfile || {};
  const savedAmount = Number(profile.periodAmount);
  if (payFrequencyOf(staff) === frequency && Number.isFinite(savedAmount) && savedAmount >= 0) {
    return round2(savedAmount);
  }
  return frequency === "monthly" ? monthlySalaryOf(staff) : 0;
};

export const calculatePf = ({ salary = 0, increment = 0, pfEnabled = false }, settings = PAYROLL_SETTINGS_DEFAULTS) => {
  if (!pfEnabled) return 0;
  const wage = Number(salary) + Number(increment);
  const cap = Number(settings.pfWageCap) || 0;
  const base = cap > 0 ? Math.min(wage, cap) : wage;
  return Math.round(base * (Number(settings.pfRatePercent) || 0) / 100);
};

/** Recompute the totals of a row from its parts. */
export const computeRow = (row) => {
  const extra = (row.extraDeductions || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const additions = round2(Number(row.salary) + Number(row.increment) + Number(row.bonus));
  const deductions = round2(Number(row.tax) + Number(row.pf) + Number(row.insurance) + extra);
  return { ...row, otherDeductions: round2(extra), additions, deductions, netPay: round2(additions - deductions) };
};

/** A fresh row for an employee for a month that hasn't been drafted yet. */
export const buildDraftRow = (staff, settings = PAYROLL_SETTINGS_DEFAULTS, frequency = payFrequencyOf(staff), periodKey = "") => {
  const salary = agreedPayAmountOf(staff, frequency);
  const monthly = frequency === "monthly";
  const pfEnabled = Boolean(staff.payrollProfile?.pfEnabled);
  return computeRow({
    staffId: staff.id,
    staffName: staff.name || "Staff",
    employeeId: staff.employeeId || null,
    jobRole: staff.jobRole || null,
    accessRole: staff.role || null,
    payFrequency: frequency,
    periodKey,
    upiId: staff.payrollProfile?.upiId || null,
    salary,
    increment: 0,
    bonus: 0,
    tax: monthly ? round2(settings.professionalTax) : 0,
    pfEnabled: monthly && pfEnabled,
    pf: monthly ? calculatePf({ salary, increment: 0, pfEnabled }, settings) : 0,
    pfEdited: false,
    insurance: monthly ? round2(staff.payrollProfile?.insurance || 0) : 0,
    extraDeductions: [],
    paymentStatus: "unpaid",
    paymentReference: null,
  });
};

/** Rows for every active employee with a salary, plus who's missing one. */
export const buildDraftRows = (staffList = [], settings = PAYROLL_SETTINGS_DEFAULTS, frequency = "monthly", periodKey = "") => {
  const active = staffList.filter(isActiveStaff);
  const selected = active.filter((s) => payFrequencyOf(s) === frequency);
  return {
    rows: selected.filter((s) => agreedPayAmountOf(s, frequency) > 0)
      .map((s) => buildDraftRow(s, settings, frequency, periodKey))
      .sort((a, b) => a.staffName.localeCompare(b.staffName)),
    missingSalary: selected.filter((s) => agreedPayAmountOf(s, frequency) <= 0),
    otherFrequency: active.filter((s) => payFrequencyOf(s) !== frequency),
  };
};

/**
 * Bring an existing draft up to date with the staff list: new employees are
 * added, salary / names / roles refreshed, and the owner's entries
 * (increment, bonus, tax, insurance, subtractions) kept.
 */
export const refreshDraftRows = (rows = [], staffList = [], settings = PAYROLL_SETTINGS_DEFAULTS, frequency = "monthly", periodKey = "") => {
  const existing = new Map(rows.map((row) => [row.staffId, row]));
  const { rows: fresh, missingSalary, otherFrequency } = buildDraftRows(staffList, settings, frequency, periodKey);
  return {
    rows: fresh.map((row) => {
      const kept = existing.get(row.staffId);
      if (!kept) return row;
      const merged = {
        ...kept,
        staffName: row.staffName,
        employeeId: row.employeeId,
        jobRole: row.jobRole,
        accessRole: row.accessRole,
        payFrequency: row.payFrequency,
        periodKey: row.periodKey,
        upiId: row.upiId,
        salary: row.salary,
        pfEnabled: row.pfEnabled,
      };
      if (!kept.pfEdited) merged.pf = calculatePf(merged, settings);
      return computeRow(merged);
    }),
    missingSalary,
    otherFrequency,
  };
};

const NUMERIC_FIELDS = ["increment", "bonus", "tax", "pf", "insurance"];

/** Apply one edit to a row; PF follows salary + increment until the owner
 * types a PF amount themselves. */
export const updateRowField = (row, field, value, settings = PAYROLL_SETTINGS_DEFAULTS) => {
  if (!NUMERIC_FIELDS.includes(field)) throw new Error(`Unknown payroll field: ${field}`);
  const next = { ...row, [field]: value === "" ? 0 : round2(value) };
  if (field === "pf") next.pfEdited = true;
  if (field === "increment" && !next.pfEdited) next.pf = calculatePf(next, settings);
  return computeRow(next);
};

/** Human-readable problems that block finalizing this row. */
export const rowProblems = (row) => {
  const problems = [];
  if (!(Number(row.salary) > 0)) problems.push("No salary set.");
  NUMERIC_FIELDS.forEach((field) => {
    if (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0) problems.push(`${field} can't be negative.`);
  });
  (row.extraDeductions || []).forEach((item, i) => {
    if (!(Number(item.amount) > 0)) problems.push(`Subtraction ${i + 1}: enter an amount above 0.`);
    if (String(item.reason || "").trim().length < 3) problems.push(`Subtraction ${i + 1}: give a reason.`);
  });
  if (computeRow(row).netPay < 0) problems.push("Deductions are more than the pay.");
  return problems;
};

export const summarizeRows = (rows = []) => rows.reduce((sum, raw) => {
  const row = computeRow(raw);
  return {
    employees: sum.employees + 1,
    salary: round2(sum.salary + Number(row.salary)),
    increments: round2(sum.increments + Number(row.increment)),
    bonuses: round2(sum.bonuses + Number(row.bonus)),
    additions: round2(sum.additions + row.additions),
    deductions: round2(sum.deductions + row.deductions),
    net: round2(sum.net + row.netPay),
    paid: round2(sum.paid + (row.paymentStatus === "paid" ? row.netPay : 0)),
    paidCount: sum.paidCount + (row.paymentStatus === "paid" ? 1 : 0),
    unpaid: sum.unpaid + (row.paymentStatus === "paid" ? 0 : 1),
  };
}, { employees: 0, salary: 0, increments: 0, bonuses: 0, additions: 0, deductions: 0, net: 0, paid: 0, paidCount: 0, unpaid: 0 });

/** Salary changes a finalize will make: [{ staffId, staffName, from, to, increment }]. */
export const planIncrements = (rows = []) => rows
  .filter((row) => (row.payFrequency || "monthly") === "monthly" && Number(row.increment) > 0)
  .map((row) => ({
    staffId: row.staffId,
    staffName: row.staffName,
    from: round2(row.salary),
    to: round2(Number(row.salary) + Number(row.increment)),
    increment: round2(row.increment),
  }));

export const payrollCsv = (rows = [], period = "") => [
  ["Pay period", "Frequency", "Employee", "Employee ID", "Job role", "Agreed pay", "Increment", "Bonus", "Additions", "Employment tax", "PF", "Insurance",
    "Additional subtractions", "Subtraction details", "Deductions", "Net pay", "UPI ID", "Payment", "Reference"].join(","),
  ...rows.map((raw) => {
    const row = computeRow(raw);
    return [
      period, PAY_FREQUENCIES[row.payFrequency] || "Monthly", row.staffName, row.employeeId, row.jobRole, row.salary, row.increment, row.bonus, row.additions, row.tax, row.pf,
      row.insurance, row.otherDeductions, (row.extraDeductions || []).map((d) => `${d.reason}: ${d.amount}`).join("; "),
      row.deductions, row.netPay, row.upiId, row.paymentStatus, row.paymentReference,
    ].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",");
  }),
].join("\n");

/* -------------------------------- settings --------------------------------- */

export const subscribePayrollSettings = (onUpdate) => onSnapshot(
  settingsRef(),
  (snap) => onUpdate({ ...PAYROLL_SETTINGS_DEFAULTS, ...(snap.exists() ? snap.data() : {}) }),
  () => onUpdate({ ...PAYROLL_SETTINGS_DEFAULTS }),
);

export const subscribeStaffPayrollProfiles = (onUpdate) => onSnapshot(
  payrollProfilesRef(),
  (snap) => onUpdate(snap.docs.map((item) => ({ id: item.id, ...item.data() })), null),
  (error) => {
    console.error("Could not load staff payroll profiles:", error);
    onUpdate([], error);
  },
);

export const savePayrollSettings = async ({ professionalTax, pfRatePercent, pfWageCap }) => {
  const values = { professionalTax: Number(professionalTax), pfRatePercent: Number(pfRatePercent), pfWageCap: Number(pfWageCap) };
  if (!Number.isFinite(values.professionalTax) || values.professionalTax < 0) throw new Error("Employment tax must be 0 or more.");
  if (!Number.isFinite(values.pfRatePercent) || values.pfRatePercent < 0 || values.pfRatePercent > 50) throw new Error("PF rate must be between 0 and 50%.");
  if (!Number.isFinite(values.pfWageCap) || values.pfWageCap < 0) throw new Error("PF wage cap must be 0 (no cap) or more.");
  await setDoc(settingsRef(), { ...values, updatedAt: serverTimestamp() }, { merge: true });
  await writeAudit("payroll.settings_updated", null, { updatedFields: Object.keys(values) });
};

/* ------------------------------- runs & rows ------------------------------- */

export const subscribePayrollMonths = (onUpdate) => onSnapshot(
  runsRef(),
  (snap) => onUpdate(snap.docs
    .filter((d) => {
      const data = d.data();
      return isPayFrequency(data.frequency || "monthly")
        && isPayPeriodKey(data.frequency || "monthly", data.periodKey || d.id);
    })
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.periodKey || b.id).localeCompare(String(a.periodKey || a.id)))),
  () => onUpdate([]),
);

export const subscribePayrollMonth = (month, onUpdate) => onSnapshot(
  runRef(month),
  (snap) => onUpdate(snap.exists() ? { id: snap.id, ...snap.data() } : null),
  () => onUpdate(null),
);

export const subscribePayrollMonthRows = (month, onUpdate) => onSnapshot(
  rowsRef(month),
  (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.staffName).localeCompare(String(b.staffName)))),
  () => onUpdate([]),
);

/** Staff portal: only the signed-in employee's own row. */
export const subscribeMyPayslip = (month, staffId, onUpdate) => onSnapshot(
  rowRef(month, staffId),
  (snap) => onUpdate(snap.exists() ? { id: snap.id, ...snap.data() } : null, null),
  (error) => onUpdate(null, error),
);

export const subscribeMyPayrollRuns = (staffId, onUpdate) => onSnapshot(
  collection(payrollProfileRef(staffId), "runs"),
  (snap) => onUpdate(snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(b.periodKey || b.id).localeCompare(String(a.periodKey || a.id))), null),
  (error) => {
    console.error("Could not load your payslip history:", error);
    onUpdate([], error);
  },
);

export const subscribeMyPayrollProfile = (staffId, onUpdate) => onSnapshot(
  payrollProfileRef(staffId),
  (snap) => onUpdate(snap.exists() ? { id: snap.id, ...snap.data() } : null, null),
  (error) => {
    console.error("Could not load your payroll profile:", error);
    onUpdate(null, error);
  },
);

export const saveMyPayrollUpi = async (staffId, value) => {
  const upiId = String(value || "").trim();
  if (upiId && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(upiId)) {
    throw new Error("Enter a valid UPI ID (for example name@bank).");
  }
  await updateDoc(payrollProfileRef(staffId), { upiId: upiId || null, upiUpdatedAt: serverTimestamp() });
};

const cleanRow = (row) => {
  const computed = computeRow(row);
  return {
    staffId: computed.staffId,
    staffName: computed.staffName,
    employeeId: computed.employeeId ?? null,
    jobRole: computed.jobRole ?? null,
    accessRole: computed.accessRole ?? null,
    payFrequency: isPayFrequency(computed.payFrequency) ? computed.payFrequency : "monthly",
    periodKey: computed.periodKey ?? null,
    upiId: computed.upiId ?? null,
    salary: round2(computed.salary),
    increment: round2(computed.increment),
    bonus: round2(computed.bonus),
    tax: round2(computed.tax),
    pfEnabled: Boolean(computed.pfEnabled),
    pf: round2(computed.pf),
    pfEdited: Boolean(computed.pfEdited),
    insurance: round2(computed.insurance),
    extraDeductions: (computed.extraDeductions || []).map((d) => ({ amount: round2(d.amount), reason: String(d.reason || "").trim() })),
    otherDeductions: computed.otherDeductions,
    additions: computed.additions,
    deductions: computed.deductions,
    netPay: computed.netPay,
    paymentStatus: computed.paymentStatus || "unpaid",
    paymentReference: computed.paymentReference ?? null,
  };
};

/** Save (or re-save) a month as a draft. Rows removed from the draft are
 * deleted so they can't linger. */
export const savePayrollDraft = async (runId, rows, { actor = null, frequency = "monthly", periodKey = runId } = {}) => {
  if (!isPayFrequency(frequency) || !isPayPeriodKey(frequency, periodKey) || payrollRunId(frequency, periodKey) !== runId) {
    throw payrollError("bad-period", "Choose a valid pay frequency and period.");
  }
  const existing = await getDoc(runRef(runId));
  if (existing.exists() && existing.data().status !== "draft") {
    throw payrollError("not-draft", `${periodLabel(frequency, periodKey)} is already ${RUN_STATUS_LABEL[existing.data().status] || existing.data().status}. Reopen it to make changes.`);
  }
  const previousRows = await getDocs(rowsRef(runId));
  const keep = new Set(rows.map((row) => row.staffId));
  const batch = writeBatch(db);
  batch.set(runRef(runId), {
    frequency,
    periodKey,
    periodLabel: periodLabel(frequency, periodKey),
    periodStart: frequency === "contract" ? periodKey.split("_")[0] : periodKey,
    periodEnd: frequency === "contract" ? periodKey.split("_")[1] : frequency === "weekly" ? new Date(new Date(`${periodKey}T00:00:00`).getTime() + 6 * 86400000).toISOString().slice(0, 10) : periodKey,
    status: "draft",
    rowCount: rows.length,
    staffIds: rows.map((row) => row.staffId),
    updatedAt: serverTimestamp(),
    updatedBy: actor,
    ...(existing.exists() ? {} : { createdAt: serverTimestamp(), createdBy: actor }),
  }, { merge: true });
  rows.forEach((row) => batch.set(rowRef(runId, row.staffId), { ...cleanRow(row), runId, periodKey, updatedAt: serverTimestamp() }));
  previousRows.docs.filter((d) => !keep.has(d.id)).forEach((d) => batch.delete(d.ref));
  await batch.commit();
  await writeAudit("payroll.draft_saved", null, { runId, frequency, periodKey, rowCount: rows.length });
};

/**
 * Lock the month. Every row must be valid; increments become the new base
 * salary from next month (with a salary-history entry). Refuses if a salary
 * changed since the draft was built, or a later month is already finalized.
 */
export const finalizePayrollMonth = async (runId, rows, { actor = null, laterFinalized = false } = {}) => {
  if (laterFinalized) throw payrollError("later-finalized", "A later period is already finalized. Finalize periods in order.");
  const invalid = rows.map((row) => ({ row, problems: rowProblems(row) })).filter((item) => item.problems.length);
  if (invalid.length) {
    throw payrollError("invalid-rows", `Fix ${invalid.map((item) => item.row.staffName).join(", ")} before finalizing: ${invalid[0].problems[0]}`);
  }
  if (!rows.length) throw payrollError("empty", "There's no one on this month's payroll.");
  const increments = planIncrements(rows);
  const run = await getDoc(runRef(runId));
  const frequency = frequencyFromRun(run.data());
  const periodKey = run.data()?.periodKey || runId;
  const effectiveFrom = frequency === "monthly" && isMonthKey(periodKey) ? nextMonthKey(periodKey) : "next pay period";
  await runTransaction(db, async (tx) => {
    const runSnap = await tx.get(runRef(runId));
    if (!runSnap.exists() || runSnap.data().status !== "draft") throw payrollError("not-draft", "Save the draft first; only drafts can be finalized.");
    const staffSnaps = await Promise.all(increments.map((inc) => tx.get(payrollProfileRef(inc.staffId))));
    staffSnaps.forEach((snap, i) => {
      if (!snap.exists() || agreedPayAmountOf({ payrollProfile: snap.data() }, "monthly") !== increments[i].from) {
        throw payrollError("salary-changed", `${increments[i].staffName}'s salary changed since this draft. Refresh salaries and check again.`);
      }
    });
    rows.forEach((row) => tx.set(rowRef(runId, row.staffId), { ...cleanRow(row), runId, periodKey, updatedAt: serverTimestamp() }));
    staffSnaps.forEach((snap, i) => {
      const inc = increments[i];
      tx.set(snap.ref, {
        ...snap.data(),
        frequency: "monthly",
        periodAmount: inc.to,
        salaryUpdatedAt: serverTimestamp(),
      });
      tx.set(doc(salaryHistoryRef(inc.staffId), `${runId}-increment`), {
        from: inc.from, to: inc.to, increment: inc.increment, effectiveFrom, sourceRun: runId,
        type: "increment", by: actor, at: serverTimestamp(),
      });
    });
    rows.forEach((row) => tx.set(doc(payrollProfileRef(row.staffId), "runs", runId), {
      runId,
      frequency,
      periodKey,
      periodLabel: run.data()?.periodLabel || periodLabel(frequency, periodKey),
      status: "finalized",
    }));
    tx.update(runRef(runId), {
      status: "finalized",
      rowCount: rows.length,
      staffIds: rows.map((row) => row.staffId),
      appliedIncrements: increments,
      finalizedAt: serverTimestamp(),
      finalizedBy: actor,
      updatedAt: serverTimestamp(),
    });
  });
  await writeAudit("payroll.finalized", null, { runId, frequency, periodKey, rowCount: rows.length, increments: increments.length });
  return { increments, effectiveFrom };
};

/** Undo a finalize before anyone is paid, reversing its increments. */
export const reopenPayrollMonth = async (runId, { actor = null, laterFinalized = false } = {}) => {
  if (laterFinalized) throw payrollError("later-finalized", "A later period is already finalized, so this period can't be reopened.");
  const rowSnaps = await getDocs(rowsRef(runId));
  if (rowSnaps.docs.some((d) => d.data().paymentStatus === "paid")) {
    throw payrollError("already-paid", "Someone in this month has already been paid, so it can't be reopened.");
  }
  await runTransaction(db, async (tx) => {
    const runSnap = await tx.get(runRef(runId));
    if (!runSnap.exists() || runSnap.data().status !== "finalized") throw payrollError("not-finalized", "Only a finalized month can be reopened.");
    const increments = runSnap.data().appliedIncrements || [];
    const staffSnaps = await Promise.all(increments.map((inc) => tx.get(payrollProfileRef(inc.staffId))));
    staffSnaps.forEach((snap, i) => {
      if (!snap.exists() || agreedPayAmountOf({ payrollProfile: snap.data() }, "monthly") !== increments[i].to) {
        throw payrollError("salary-changed", `${increments[i].staffName}'s salary was changed after finalizing. Fix it in Employees before reopening.`);
      }
    });
    staffSnaps.forEach((snap, i) => {
      const inc = increments[i];
      tx.set(snap.ref, {
        ...snap.data(),
        frequency: "monthly",
        periodAmount: inc.from,
        salaryUpdatedAt: serverTimestamp(),
      });
      tx.delete(doc(salaryHistoryRef(inc.staffId), `${runId}-increment`));
    });
    rowSnaps.docs.forEach((item) => tx.delete(doc(payrollProfileRef(item.id), "runs", runId)));
    tx.update(runRef(runId), { status: "draft", appliedIncrements: [], reopenedAt: serverTimestamp(), reopenedBy: actor, updatedAt: serverTimestamp() });
  });
  await writeAudit("payroll.reopened", null, { runId });
};

const settleRunIfAllPaid = async (runId) => {
  const rowSnaps = await getDocs(rowsRef(runId));
  if (rowSnaps.size && rowSnaps.docs.every((d) => d.data().paymentStatus === "paid")) {
    const runSnap = await getDoc(runRef(runId));
    const run = runSnap.data() || {};
    const batch = writeBatch(db);
    batch.update(runRef(runId), { status: "paid", paidAt: serverTimestamp(), updatedAt: serverTimestamp() });
    rowSnaps.docs.forEach((item) => batch.set(doc(payrollProfileRef(item.id), "runs", runId), {
      runId,
      frequency: frequencyFromRun(run),
      periodKey: run.periodKey || runId,
      periodLabel: run.periodLabel || runId,
      status: "paid",
    }, { merge: true }));
    await batch.commit();
  }
};

/** Record that an employee was paid (bank transfer / UPI / cash reference). */
export const markPayslipPaid = async (runId, staffId, { reference, actor = null }) => {
  await markSelectedPayslipsPaid(runId, [staffId], { reference, actor });
  await writeAudit("payroll.row_paid", staffId, { runId });
  await settleRunIfAllPaid(runId);
};

export const markSelectedPayslipsPaid = async (runId, staffIds, { reference, actor = null }) => {
  if (String(reference || "").trim().length < 2) throw payrollError("reference-required", "Enter the payment reference.");
  if (!Array.isArray(staffIds) || staffIds.length === 0) throw payrollError("empty-selection", "Select at least one employee.");
  const uniqueStaffIds = [...new Set(staffIds)];
  await runTransaction(db, async (tx) => {
    const run = await tx.get(runRef(runId));
    if (!run.exists() || run.data().status !== "finalized") throw payrollError("not-finalized", "Finalize the pay period before recording payments.");
    const snapshots = await Promise.all(uniqueStaffIds.map((staffId) => tx.get(rowRef(runId, staffId))));
    if (snapshots.some((snap) => !snap.exists())) throw payrollError("missing-row", "A selected employee is no longer in this payroll run.");
    if (snapshots.some((snap) => snap.data().paymentStatus === "paid")) throw payrollError("already-paid", "A selected employee is already marked paid. Refresh the run and select unpaid rows only.");
    snapshots.forEach((snap) => tx.update(snap.ref, {
      paymentStatus: "paid", paymentReference: String(reference).trim(), paidAt: serverTimestamp(), paidBy: actor,
    }));
  });
  await writeAudit("payroll.bulk_paid", null, { runId, staffIds: uniqueStaffIds });
  await settleRunIfAllPaid(runId);
};

export const markAllPayslipsPaid = async (runId, options) => {
  const rows = await getDocs(rowsRef(runId));
  const unpaid = rows.docs.filter((item) => item.data().paymentStatus !== "paid").map((item) => item.id);
  return markSelectedPayslipsPaid(runId, unpaid, options);
};

/* ----------------------------- employees & roles --------------------------- */

/** Admin: set an employee's salary, PF and insurance. A direct salary
 * change (not via increment) is recorded in salary history. */
export const updateStaffPay = async (staff, { monthlySalary, periodAmount, frequency = "monthly", pfEnabled, insurance, upiId }, { actor = null } = {}) => {
  const salary = Number(frequency === "monthly" ? monthlySalary : periodAmount);
  const ins = Number(insurance || 0);
  if (!Number.isFinite(salary) || salary < 0) throw new Error("Salary must be 0 or more.");
  if (!Number.isFinite(ins) || ins < 0) throw new Error("Insurance must be 0 or more.");
  if (!isPayFrequency(frequency)) throw new Error("Choose a valid pay frequency.");
  const cleanUpi = String(upiId || "").trim();
  if (cleanUpi && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(cleanUpi)) throw new Error("Enter a valid UPI ID (for example name@bank).");
  const from = agreedPayAmountOf(staff, frequency);
  await setDoc(payrollProfileRef(staff.id), {
    frequency,
    periodAmount: round2(salary),
    pfEnabled: Boolean(pfEnabled),
    insurance: round2(ins),
    upiId: cleanUpi || null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  if (round2(salary) !== from && frequency === "monthly") {
    await addDoc(salaryHistoryRef(staff.id), { from, to: round2(salary), type: "manual", by: actor, at: serverTimestamp() });
  }
  await writeAudit("payroll.staff_pay_updated", staff.id, { frequency, upiIdUpdated: true });
};

/** Admin: move an employee to another access level, never removing the
 * last active Admin. */
export const setStaffAccessRole = async (staff, role, staffList = [], { actor = null } = {}) => {
  const next = normalizeRole(role);
  if (!next) throw new Error(`Unknown access level: ${role}`);
  if (normalizeRole(staff.role) === "Admin" && next !== "Admin") {
    const admins = staffList.filter((s) => isActiveStaff(s) && normalizeRole(s.role) === "Admin");
    if (admins.length <= 1) throw new Error("This is the only Admin. Make someone else Admin first.");
  }
  await updateDoc(staffRef(staff.id), { role: next, updatedAt: serverTimestamp() });
  await writeAudit("staff.role_changed", staff.id, { from: staff.role || null, to: next, by: actor });
};

export const setStaffJobRole = async (staff, jobRole, { actor = null } = {}) => {
  const value = String(jobRole || "").trim() || null;
  await updateDoc(staffRef(staff.id), { jobRole: value, updatedAt: serverTimestamp() });
  await writeAudit("staff.job_role_changed", staff.id, { from: staff.jobRole || null, to: value, by: actor });
};

export const ACCESS_LEVELS = ROLES;

export const subscribeJobRoles = (onUpdate) => onSnapshot(
  jobRolesRef(),
  (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)))),
  () => onUpdate([]),
);

export const createJobRole = async (name, existing = [], { actor = null } = {}) => {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 40) throw new Error("Role name must be 2–40 characters.");
  if (existing.some((role) => String(role.name).toLowerCase() === clean.toLowerCase())) throw new Error(`"${clean}" already exists.`);
  if (ROLES.some((role) => role.toLowerCase() === clean.toLowerCase())) throw new Error(`"${clean}" is an access level, not a job role.`);
  const ref = await addDoc(jobRolesRef(), { name: clean, createdAt: serverTimestamp(), createdBy: actor });
  await writeAudit("staff.job_role_created", null, { name: clean });
  return ref.id;
};

export const deleteJobRole = async (role, staffList = []) => {
  const users = staffList.filter((s) => String(s.jobRole || "").toLowerCase() === String(role.name).toLowerCase());
  if (users.length) throw new Error(`${users.length} employee(s) still have "${role.name}". Change their role first.`);
  await deleteDoc(doc(jobRolesRef(), role.id));
  await writeAudit("staff.job_role_deleted", null, { name: role.name });
};
