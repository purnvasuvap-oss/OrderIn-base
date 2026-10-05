# Green Theme Payroll Guide

**Scope:** the payroll work in `Orderin-Green-Theme/order_clients-Green`  
**Purpose:** explain the screens, fixed-period pay calculations, manual UPI reconciliation, and remaining business and production risks.

This guide describes the current implementation in the Green restaurant operations app. It is not a payroll, tax, or legal compliance opinion. In particular, the tax and provident-fund (PF) values are configurable defaults and must be checked by the restaurant's payroll/accounting adviser before use.

## 1. What this feature is

This is an **Admin-operated fixed-period pay register**. Each employee has a fixed agreed amount and a pay frequency: monthly, weekly, daily, or a contract date range. An Admin prepares and finalizes a run, then records the results of manual payments made outside OrderIn.

It does **not** calculate pay from shifts, attendance, hourly rates, overtime, leave, or tips, and it does not send money to staff. A UPI link can open an external payment app with the staff's UPI ID and amount prefilled. The Admin must review and submit the transfer there, then return to OrderIn and record a reference. “Mark paid” does not verify a bank, UPI, or cash transaction.

The feature is in the **Green theme only**. Its implementation is in:

- `Orderin-Green-Theme/order_clients-Green/src/pages/Payroll.jsx` — payroll screens.
- `Orderin-Green-Theme/order_clients-Green/src/pages/PayrollLogin.jsx` — payroll login screen.
- `Orderin-Green-Theme/order_clients-Green/src/services/payrollService.js` — calculations and Firestore reads/writes.
- `Orderin-Green-Theme/order_clients-Green/src/pages/StaffSelfService.jsx` — staff payslip view.
- `Orderin-Green-Theme/order_clients-Green/src/components/Payroll/payslip.js` — printable payslip.
- `Orderin-Green-Theme/order_clients-Green/src/services/payrollAuthService.js` — Firebase session sign-out.
- `Orderin-Green-Theme/order_clients-Green/firestore.rules` — Firestore access rules, including the browser-accessible payroll data paths.

## 2. Who uses it and where

### Admin

1. Open **Payroll** from the restaurant app.
2. Sign in with the restaurant's `PayrollAccess` section passcode. The browser reads and checks this passcode in Firestore.
3. Use the three tabs:
   - **Pay periods** — choose monthly, weekly, daily, or contract dates; prepare, save, finalize, export, and record payment.
   - **Employees & roles** — set each employee's agreed pay per period, UPI ID, PF eligibility, insurance, access level, and job role.
   - **Settings** — set defaults for employment tax and PF.
4. The first Admin visit runs a browser-side migration before payroll data loads. It moves legacy compensation and salary history to payroll profile documents and creates staff-specific indexes for finalized runs.
5. Use **Lock payroll** when finished; this clears payroll session values from the current browser tab and ends the Firebase session.

The payroll routes are `/payroll-login`, `/staff-management/payroll`, and `/staff-management/payroll/:runId`.

### Staff member

A staff member signs into **Staff Self-Service** with their staff PIN and sees finalized or paid periods indexed to their staff ID. They can view or print payslips and add or update a UPI ID in their payroll profile. Staff identity is kept in browser session storage and is not verified by Firestore rules.

## 3. What each payroll term means in this app

| Term | Meaning in the current calculation |
|---|---|
| Pay frequency | Monthly, weekly, daily, or contract. Contract runs have a start and end date. An employee is included only in a run matching their saved frequency. |
| Agreed pay / period | The fixed amount agreed for one selected pay period. It is not derived from attendance or hours. |
| Increment | An addition available only for monthly runs. When finalized, it becomes part of the monthly agreed amount from the following month. |
| Bonus | A one-time addition for the selected run. It does not change future agreed pay. |
| Employment tax | The configured professional-tax default applies only to monthly runs; the Admin can change an individual row. |
| PF | PF is calculated for monthly runs from salary plus increment, subject to the configured rate and wage cap, unless the Admin manually edits the row's PF amount. Weekly, daily, and contract rows do not auto-apply PF. |
| Insurance | The saved insurance amount is applied only to monthly runs; the Admin can edit it for a row. |
| Additional subtractions | Other deductions entered as an amount plus a reason, for example a salary advance. |
| Additions | `Salary + Increment + Bonus`. |
| Deductions | `Employment tax + PF + Insurance + Additional subtractions`. |
| Net pay | `Additions − Deductions`. A negative net amount blocks finalization. |
| UPI ID | A staff-provided payment address stored in the private payroll profile. It is sensitive personal/payment data and must be verified with the staff member. |
| Payment reference | A reference typed by the Admin after making payment outside OrderIn, such as a UTR or UPI reference. It is not proof that funds moved. |

### Calculation example

For a ₹20,000 base salary, ₹10,000 increment, ₹2,000 bonus, ₹200 employment-tax deduction, ₹1,800 PF, ₹500 insurance, and ₹1,000 additional subtraction:

```text
Additions  = ₹20,000 + ₹10,000 + ₹2,000 = ₹32,000
Deductions = ₹200 + ₹1,800 + ₹500 + ₹1,000 = ₹3,500
Net pay    = ₹32,000 - ₹3,500 = ₹28,500
```

With the default 12% PF rate and ₹15,000 wage cap, PF is calculated as 12% of the lower of salary plus increment or the cap, rounded to a whole rupee. These are software defaults, not a guarantee of the legally correct employee/employer contribution.

## 4. Pay-period workflow

### A. Prepare the employee records

In **Employees & roles**:

- Choose a pay frequency and set the fixed agreed amount for each period for every employee who should be included.
- Add or confirm the employee's UPI ID. Staff can also add or update it in their own Staff Self-Service portal.
- Decide whether PF is enabled and enter monthly insurance, if applicable. These automatic deductions apply only to monthly runs.
- Choose an access level (which controls app permissions) separately from the job role (for example, Waiter or Head Chef).
- Save the employee's pay changes.

Only active staff with the selected frequency and a positive agreed amount are included automatically in a new payroll draft. Active staff with no amount are shown as missing pay; staff with another frequency and inactive staff are excluded. If you change staff or pay data after beginning a draft, use **Refresh from employee list** and review the resulting rows. Refresh keeps the Admin's existing bonus, increment, tax, insurance, and additional-subtraction entries; it refreshes staff identity and agreed pay and recalculates PF unless PF was manually edited.

### B. Prepare a pay period

1. Select the employee frequency and a pay period: month, Monday-starting week, day, or contract start/end dates.
2. Review each included employee and the prefilled deductions.
3. Enter bonuses and any additional subtractions with reasons. Monthly runs also allow increments and per-person tax/PF/insurance adjustments. Weekly, daily, and contract runs do not apply automatic statutory deductions.
4. Fix validation messages. The app checks for a positive agreed amount, non-negative numeric values, a positive amount and a reason for each additional subtraction, and non-negative net pay.
5. Click **Save draft** before finalizing a new period. Review saved rows again after saving.

Monthly runs use `YYYY-MM`; weekly and daily runs use a date key; contract runs use a start/end date pair. A new run uses the current agreed amount and current settings, even if the selected period is in the past.

### C. Finalize

Finalizing locks the run's payroll rows and records the finalization time and actor. For monthly runs only, it applies each entered increment to the employee's private payroll profile as the new agreed monthly amount effective from the following month, and writes a salary-history entry. Bonuses do not carry forward.

Finalization is blocked when the guards detect a later finalized period, when a monthly employee's base amount changed since the draft was prepared, when a row fails validation, when there are no rows, or when the run has not first been saved as a draft. If pay data changed, refresh and recheck the draft rather than assuming the old amount is still correct.

### D. Record payment

After a run is finalized, the Admin can use an individual UPI link, record one or more selected staff as paid, or use **Mark all paid**. The UPI link opens an external app; an Admin must verify the recipient and amount and submit the transfer there first. A reference of at least two characters is required when recording payment. Bulk marking applies the same entered reference to the selected unpaid staff; it is not a bulk transfer.

When every row is marked paid, the run status becomes **Paid**. The status is an Admin-entered reconciliation record; there is no integrated payout, bank confirmation, failed-transfer state, retry handling, or duplicate-transfer prevention.

### E. Reopen or export

- A finalized run can be reopened only if nobody has been marked paid, no later period is finalized/paid, and the affected monthly pay values have not since changed. Reopening changes the run to draft and reverses that run's recorded increments.
- The Admin can export the displayed rows as CSV and print/save an individual payslip as PDF.
- A payslip is a generated document, not a tax certificate or statutory payroll filing.

## 5. Statuses and stored data

The intended run statuses are:

```text
Draft → Finalized → Paid
          ↘ Reopened to Draft (only before payment and subject to guards)
```

Payroll data is stored under the Green restaurant's Firestore `Restaurant/{restaurantId}` record:

- `payrollRuns/{YYYY-MM}` — run status, staff IDs, row count, timestamps, actor labels, and applied increments.
- `payrollRuns/{YYYY-MM}/rows/{staffId}` — a frozen payroll breakdown and payment status/reference for that month.
- `payrollConfig/settings` — employment-tax and PF calculation defaults.
- `staffPayrollProfiles/{staffId}` — agreed amount, frequency, UPI ID, PF/insurance choices, and salary-history subcollection.
- `staffPayrollProfiles/{staffId}/salaryHistory/{historyId}` — manual salary changes and monthly increments applied by finalization.
- `staffPayrollProfiles/{staffId}/runs/{runId}` — staff-specific index of finalized/paid runs, used by the staff portal.
- `jobRoles` — optional custom job-role names.

Staff audit events are also written for selected operations such as saving/finalizing/reopening a run, changing pay/settings, and marking payments. The app does not provide a detailed, manager-readable change history for every individual edit made within a draft.

## 6. Important limitations and business gaps

The following are based on the current code, not on assumptions about the restaurant's policies.

### Critical — production verification and deployment

Payroll and staff PIN checks run in the browser to avoid callable Cloud Function dependencies. Firestore rules cannot verify browser session storage or prove which staff member entered a PIN. Payroll runs, profile, salary-history, and payroll-configuration paths are therefore accessible to any client permitted by these rules; payroll figures and UPI IDs must not be considered private or protected from a user who can access the Firebase project. Restoring server-enforced payroll identity requires a trusted backend/authentication flow.

The first Admin load runs a one-time browser migration to move legacy compensation and salary history and index finalized runs. Back up/verify production data before deploying the frontend and these rules. Confirm the migration completed and inspect the resulting profile/index records.

The Green Cloud Functions source previously contained hardcoded Razorpay credential fallbacks; those fallbacks have been removed. Treat any key that was ever committed in repository history as compromised: rotate it in Razorpay, then configure the current customer-checkout key and secret only in server-side configuration. They are customer-payment credentials, not a staff-payout authorization. Do not reuse them for RazorpayX.

### High — incomplete payroll basis

- Pay can be configured monthly, weekly, daily, or for a contract range, but each period is a fixed agreed amount. It does not connect attendance, rosters, hours, overtime, breaks, unpaid leave, paid leave, commissions, tips, or hourly wages to pay.
- It does not define joiner/leaver proration, partial-month salary, unpaid absences, arrears, retroactive adjustments, or salary effective dates.
- A new run for a historical month starts from the employee's current base salary and current deduction settings. Salary history is recorded but is not used to reconstruct salary/settings as they applied in the selected month. Backfilled runs can therefore be wrong unless the historical values are manually corrected.
- Automatic tax/PF/insurance handling is monthly-only; it is not a jurisdiction-aware calculation. Weekly, daily, and contract pay therefore need an independently verified deduction policy. There is no effective-dated statutory setup, employer-contribution accounting, filing/export, or configurable employee-eligibility model.

### High — payment and approval controls

- There is no separate preparer/reviewer/approver workflow. The same Admin can prepare, finalize, and mark payments.
- “Paid” is manually recorded and not linked to bank/UPI/cash evidence. A payment reference can be arbitrary text.
- Selected/all bulk actions mark rows paid with an Admin-entered reference; they do not transfer funds. There is no payment date entry, payout batch, failure/retry state, duplicate-transfer control, or automated reconciliation.
- The callable applies IP-based failed-attempt throttling, but PIN-only login still needs an operational review (PIN strength/rotation, identity proofing, monitoring, and a recovery procedure).

### Medium — employee and operational coverage

- UPI IDs are stored privately and displayed to Admins, but the app does not validate account ownership or perform/verify a transfer. Staff and Admins must verify the destination independently.
- The UI does not show gross-to-net annual totals, employer labour cost, accounting export mappings, or reconciliation against the general ledger.
- No payroll calendar, cutoff dates, payment due dates, payslip acknowledgement, correction/dispute request, or notification is tied to payroll.
- The Green implementation has not thereby become available in the other themes; payroll parity and data migration need a separate rollout plan.

## 7. Recommended next decisions

Before production use, the restaurant and product team should answer:

1. Should the agreed fixed amount remain the only pay basis, or is attendance-derived hourly/overtime pay also required?
2. What is the authoritative pay amount for a past period: a saved draft, effective-dated salary history, or a manually approved correction?
3. Which jurisdiction and current statutory rules apply, and who approves tax/PF/insurance calculations?
4. Who may prepare, review, approve, reopen, and mark payments? Should two people be required for approval/payment?
5. What counts as acceptable payment evidence, and should manual UPI reconciliation remain the design or should a separate RazorpayX payout integration be evaluated?
6. What personal and salary data can each employee see, and how long should payroll records be retained?
7. When should this feature be rolled out to other themes, and how will existing staff/pay data be migrated and verified?

## 8. Related documentation and checks

- [OrderIn product document](./ORDERIN_PRODUCT_DOCUMENT.md) — overall product scope and roadmap.
- `Orderin-Green-Theme/order_clients-Green/src/services/__tests__/payrollService.test.js` — calculation and validation tests.
- `Orderin-Green-Theme/order_clients-Green/rules-tests/payroll.flow.test.js` — emulator flow and payroll-authorization tests. They must pass, and the rules/functions must be deployed, before treating production payroll data as protected.
