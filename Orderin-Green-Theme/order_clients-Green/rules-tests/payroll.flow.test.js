// Monthly payroll against the local emulator with the real payrollService:
// finalize applies increments to the base salary, reopen reverses them,
// payments roll the month up to "paid", and guards hold.
//   npm run test:rules
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";

const holder = vi.hoisted(() => ({ db: null }));
vi.mock("../src/firebase", () => ({
  get db() {
    return holder.db;
  },
}));

const pay = await import("../src/services/payrollService");

const RID = "orderin_restuarant_6";
const R = (...segments) => ["Restaurant", RID, ...segments].join("/");
const MONTH = "2026-10";

let env;
let db;

const salaryOf = async (id) => (await getDoc(doc(db, R("staffPayrollProfiles", id)))).data().periodAmount;

const seed = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    await setDoc(doc(admin, R("staff", "s1")), { name: "Anirudh", role: "Floor", status: "active" });
    await setDoc(doc(admin, R("staff", "s2")), { name: "Meena", role: "Kitchen", status: "active" });
    await setDoc(doc(admin, R("staffPayrollProfiles", "s1")), { frequency: "monthly", periodAmount: 20000, pfEnabled: false });
    await setDoc(doc(admin, R("staffPayrollProfiles", "s2")), { frequency: "monthly", periodAmount: 15000, pfEnabled: false });
  });
  db = env.authenticatedContext("admin", {
    payrollAccess: true,
    payrollRole: "admin",
    restaurantId: RID,
  }).firestore();
  holder.db = db;
};

const draftRows = async () => {
  const snap = await getDocs(collection(db, R("staff")));
  const staff = await Promise.all(snap.docs.map(async (d) => ({
    id: d.id,
    ...d.data(),
    payrollProfile: (await getDoc(doc(db, R("staffPayrollProfiles", d.id)))).data(),
  })));
  const { rows } = pay.buildDraftRows(staff, pay.PAYROLL_SETTINGS_DEFAULTS);
  return rows.map((row) => (row.staffId === "s1"
    ? pay.updateRowField(pay.updateRowField(row, "increment", 10000), "bonus", 2000)
    : row));
};

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

describe("monthly payroll flow", () => {
  beforeEach(() => seed());

  it("finalizing applies the increment (not the bonus) to next month's salary", async () => {
    const rows = await draftRows();
    await pay.savePayrollDraft(MONTH, rows, { actor: "a1" });
    const result = await pay.finalizePayrollMonth(MONTH, rows, { actor: "a1" });
    expect(result).toMatchObject({ effectiveFrom: "2026-11" });
    expect(await salaryOf("s1")).toBe(30000);
    expect(await salaryOf("s2")).toBe(15000);
    expect((await getDoc(doc(db, R("payrollRuns", MONTH)))).data().status).toBe("finalized");
    const history = await getDocs(collection(db, R("staffPayrollProfiles", "s1", "salaryHistory")));
    expect(history.docs.map((d) => d.data())).toEqual([expect.objectContaining({ from: 20000, to: 30000, effectiveFrom: "2026-11" })]);

    // Next month starts from ₹30,000 with no increment.
    const staff = await Promise.all((await getDocs(collection(db, R("staff")))).docs.map(async (d) => ({
      id: d.id,
      ...d.data(),
      payrollProfile: (await getDoc(doc(db, R("staffPayrollProfiles", d.id)))).data(),
    })));
    expect(pay.buildDraftRows(staff).rows.find((r) => r.staffId === "s1")).toMatchObject({ salary: 30000, increment: 0 });
  });

  it("can't be finalized twice or edited once finalized", async () => {
    const rows = await draftRows();
    await pay.savePayrollDraft(MONTH, rows);
    await pay.finalizePayrollMonth(MONTH, rows);
    await expect(pay.finalizePayrollMonth(MONTH, rows)).rejects.toMatchObject({ code: "not-draft" });
    await expect(pay.savePayrollDraft(MONTH, rows)).rejects.toMatchObject({ code: "not-draft" });
    expect(await salaryOf("s1")).toBe(30000);
  });

  it("reopening reverses the increment, but not after a payment", async () => {
    const rows = await draftRows();
    await pay.savePayrollDraft(MONTH, rows);
    await pay.finalizePayrollMonth(MONTH, rows);
    await pay.reopenPayrollMonth(MONTH);
    expect(await salaryOf("s1")).toBe(20000);
    expect((await getDocs(collection(db, R("staffPayrollProfiles", "s1", "salaryHistory")))).size).toBe(0);

    await pay.finalizePayrollMonth(MONTH, rows);
    await pay.markPayslipPaid(MONTH, "s1", { reference: "UTR1" });
    await expect(pay.reopenPayrollMonth(MONTH)).rejects.toMatchObject({ code: "already-paid" });
  });

  it("refuses to finalize if a salary changed since the draft", async () => {
    const rows = await draftRows();
    await pay.savePayrollDraft(MONTH, rows);
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), R("staffPayrollProfiles", "s1")), { periodAmount: 22000 }, { merge: true }));
    await expect(pay.finalizePayrollMonth(MONTH, rows)).rejects.toMatchObject({ code: "salary-changed" });
    expect(await salaryOf("s1")).toBe(22000);
  });

  describe("browser-only payroll access", () => {
    beforeEach(() => seed());

    it("allows browser clients to read payroll data", async () => {
      const anonymous = env.unauthenticatedContext().firestore();
      expect((await getDoc(doc(anonymous, R("staffPayrollProfiles", "s1")))).exists()).toBe(true);
      await expect(getDocs(collection(anonymous, R("payrollRuns")))).resolves.toBeDefined();
      await expect(getDoc(doc(anonymous, R("payrollConfig", "_migration")))).resolves.toBeDefined();
      expect((await getDoc(doc(db, R("staffPayrollProfiles", "s1")))).exists()).toBe(true);
    });

    it("migrates legacy payroll fields using only the browser Firestore SDK", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const admin = ctx.firestore();
        await setDoc(doc(admin, R("staff", "legacy")), {
          name: "Legacy Staff",
          compensation: { monthlySalary: 24000 },
          payrollProfile: { pfEnabled: true, insurance: 500, upiId: "legacy@bank" },
        });
        await setDoc(doc(admin, R("staff", "legacy", "salaryHistory", "old-entry")), { from: 20000, to: 24000 });
        await setDoc(doc(admin, R("payrollRuns", "2026-09")), {
          status: "finalized",
          staffIds: ["legacy"],
          frequency: "monthly",
          periodKey: "2026-09",
        });
      });

      db = env.unauthenticatedContext().firestore();
      holder.db = db;
      const result = await pay.migratePayrollData();

      expect(result).toMatchObject({ migratedProfiles: 3, migratedSalaryHistory: 1 });
      expect((await getDoc(doc(db, R("staffPayrollProfiles", "legacy")))).data()).toMatchObject({
        periodAmount: 24000,
        pfEnabled: true,
        insurance: 500,
        upiId: "legacy@bank",
      });
      expect((await getDoc(doc(db, R("staffPayrollProfiles", "legacy", "salaryHistory", "old-entry")))).exists()).toBe(true);
      expect((await getDoc(doc(db, R("staffPayrollProfiles", "legacy", "runs", "2026-09")))).exists()).toBe(true);
      expect((await getDoc(doc(db, R("staff", "legacy")))).data()).not.toHaveProperty("compensation");
      expect((await getDoc(doc(db, R("staff", "legacy")))).data()).not.toHaveProperty("payrollProfile");
      expect((await pay.migratePayrollData())).toMatchObject({ alreadyMigrated: true });
    });

    it("does not enforce staff/admin identity at the Firestore layer", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const admin = ctx.firestore();
        await setDoc(doc(admin, R("payrollRuns", MONTH)), { status: "finalized", staffIds: ["s1"] });
        await setDoc(doc(admin, R("payrollRuns", MONTH, "rows", "s1")), { staffId: "s1", netPay: 20000 });
        await setDoc(doc(admin, R("staffPayrollProfiles", "s1", "runs", MONTH)), { runId: MONTH, status: "finalized" });
      });
      const staffDb = env.authenticatedContext("staff-s1", {
        payrollAccess: true,
        payrollRole: "staff",
        restaurantId: RID,
        staffId: "s1",
      }).firestore();
      expect((await getDoc(doc(staffDb, R("staffPayrollProfiles", "s1")))).exists()).toBe(true);
      expect((await getDoc(doc(staffDb, R("staffPayrollProfiles", "s2")))).exists()).toBe(true);
      expect((await getDoc(doc(staffDb, R("staffPayrollProfiles", "s1", "runs", MONTH)))).exists()).toBe(true);
      expect((await getDoc(doc(staffDb, R("payrollRuns", MONTH, "rows", "s1")))).exists()).toBe(true);
      expect((await getDoc(doc(staffDb, R("payrollRuns", MONTH, "rows", "s2")))).exists()).toBe(false);
      await expect(setDoc(doc(staffDb, R("staffPayrollProfiles", "s1")), { upiId: "staff@bank" }, { merge: true })).resolves.toBeUndefined();
      await expect(setDoc(doc(staffDb, R("staffPayrollProfiles", "s1")), { periodAmount: 1 }, { merge: true })).resolves.toBeUndefined();
    });
  });

  it("marks the month paid once everyone is paid", async () => {
    const rows = await draftRows();
    await pay.savePayrollDraft(MONTH, rows);
    await expect(pay.markPayslipPaid(MONTH, "s1", { reference: "UTR1" })).rejects.toMatchObject({ code: "not-finalized" });
    await pay.finalizePayrollMonth(MONTH, rows);
    await pay.markPayslipPaid(MONTH, "s1", { reference: "UTR1" });
    expect((await getDoc(doc(db, R("payrollRuns", MONTH)))).data().status).toBe("finalized");
    await pay.markAllPayslipsPaid(MONTH, { reference: "Bank batch 7" });
    expect((await getDoc(doc(db, R("payrollRuns", MONTH)))).data().status).toBe("paid");
    expect((await getDoc(doc(db, R("payrollRuns", MONTH, "rows", "s1")))).data().paymentReference).toBe("UTR1");
  });

  it("drops rows removed from a re-saved draft", async () => {
    const rows = await draftRows();
    await pay.savePayrollDraft(MONTH, rows);
    await pay.savePayrollDraft(MONTH, rows.filter((r) => r.staffId === "s1"));
    const saved = await getDocs(collection(db, R("payrollRuns", MONTH, "rows")));
    expect(saved.docs.map((d) => d.id)).toEqual(["s1"]);
  });

  it("never demotes the last Admin, and blocks duplicate job roles", async () => {
    const staff = [{ id: "a1", name: "Owner", role: "Admin", status: "active" }];
    await expect(pay.setStaffAccessRole(staff[0], "Floor", staff)).rejects.toThrow(/only Admin/);
    await expect(pay.createJobRole("waiter", [{ id: "x", name: "Waiter" }])).rejects.toThrow(/already exists/);
    await expect(pay.createJobRole("Admin", [])).rejects.toThrow(/access level/);
  });
});
