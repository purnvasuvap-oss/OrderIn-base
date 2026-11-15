// Admin-only payroll (guarded by the Payroll Login / payrollAuth session).
// Tabs: Pay periods · Employees & roles · Settings.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Download, Lock, Plus, Trash2, Printer } from "lucide-react";
import routes from "../routes";
import "./Payroll.css";
import { clearPayrollSession } from "./PayrollLogin";
import { subscribeStaff, isActiveStaff } from "../services/staffService";
import {
  PAYROLL_SETTINGS_DEFAULTS,
  RUN_STATUS_LABEL,
  PAY_FREQUENCIES,
  ACCESS_LEVELS,
  isMonthKey,
  isDateKey,
  isPayPeriodKey,
  payrollRunId,
  frequencyFromRun,
  periodLabel,
  currentMonthKey,
  nextMonthKey,
  monthLabel,
  formatRupees,
  monthlySalaryOf,
  agreedPayAmountOf,
  payFrequencyOf,
  computeRow,
  buildDraftRows,
  refreshDraftRows,
  updateRowField,
  rowProblems,
  summarizeRows,
  planIncrements,
  payrollCsv,
  subscribePayrollSettings,
  savePayrollSettings,
  subscribePayrollMonths,
  subscribePayrollMonth,
  subscribePayrollMonthRows,
  savePayrollDraft,
  finalizePayrollMonth,
  reopenPayrollMonth,
  markPayslipPaid,
  markAllPayslipsPaid,
  markSelectedPayslipsPaid,
  updateStaffPay,
  setStaffAccessRole,
  setStaffJobRole,
  subscribeJobRoles,
  createJobRole,
  deleteJobRole,
  migratePayrollData,
} from "../services/payrollService";
import { printPayslip } from "../components/Payroll/payslip";
import { signOutPayrollUser } from "../services/payrollAuthService";
import { subscribeStaffPayrollProfiles } from "../services/payrollService";

const actor = () => sessionStorage.getItem("payrollAdminId") || "Admin";
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const currentWeekStart = () => {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDateKey(monday);
};
const selectionFromRunId = (value) => {
  if (isMonthKey(value)) return { frequency: "monthly", periodKey: value };
  const match = String(value || "").match(/^(weekly|daily|contract)-(.+)$/);
  if (match && isPayPeriodKey(match[1], match[2])) return { frequency: match[1], periodKey: match[2] };
  return { frequency: "monthly", periodKey: currentMonthKey() };
};

/** Number input you can clear and retype; never accepts negatives. */
function MoneyInput({ value, onChange, label, disabled = false }) {
  const [text, setText] = useState(String(value ?? 0));
  useEffect(() => {
    if (Number(text || 0) !== Number(value || 0)) setText(String(value ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      min="0"
      step="1"
      inputMode="decimal"
      aria-label={label}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        if (next !== "" && (Number.isNaN(Number(next)) || Number(next) < 0)) return;
        setText(next);
        onChange(next === "" ? 0 : Number(next));
      }}
    />
  );
}

function SummaryTile({ label, value, highlight, tone }) {
  return (
    <div className={`payroll-tile ${highlight ? "highlight" : ""} ${tone ? `tone-${tone}` : ""}`}>
      <div className="payroll-tile-value">{value}</div>
      <div className="payroll-tile-label">{label}</div>
    </div>
  );
}

/** Additional subtractions: amount + reason entries for one row. */
function SubtractionsEditor({ row, editable, onChange }) {
  const items = row.extraDeductions || [];
  const update = (index, patch) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  if (!editable) {
    return items.length ? (
      <ul className="payroll-sub-list">
        {items.map((item, i) => <li key={i}>{item.reason}: {formatRupees(item.amount)}</li>)}
      </ul>
    ) : <span className="payroll-muted">None</span>;
  }
  return (
    <div className="payroll-sub-editor">
      {items.map((item, i) => (
        <div className="payroll-sub-item" key={i}>
          <MoneyInput label={`${row.staffName} subtraction ${i + 1} amount`} value={item.amount} onChange={(amount) => update(i, { amount })} />
          <input
            aria-label={`${row.staffName} subtraction ${i + 1} reason`}
            placeholder="Reason (e.g. salary advance)"
            value={item.reason}
            maxLength={80}
            onChange={(e) => update(i, { reason: e.target.value })}
          />
          <button className="sm-icon-btn" aria-label={`Remove subtraction ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => onChange([...items, { amount: 0, reason: "" }])}>
        <Plus size={12} /> Add subtraction
      </button>
    </div>
  );
}

function MarkPaidInline({ label, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <span className="payroll-paid-form">
      <input aria-label="Payment reference" placeholder="UTR / UPI ref / cash" value={reference} onChange={(e) => setReference(e.target.value)} />
      <button
        className="sm-btn sm-btn-gold sm-btn-xs"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onSubmit(reference);
            setOpen(false);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >Save</button>
      <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setOpen(false)}>Cancel</button>
      {error && <span className="payroll-error-text">{error}</span>}
    </span>
  );
}

/* ============================== Monthly payroll ============================== */
function MonthlyPayroll({ runId, frequency, periodKey, setFrequency, setPeriodKey, staffList, staffLoaded, settings, months }) {
  const [run, setRun] = useState(undefined); // undefined while loading, null = not started
  const [savedRows, setSavedRows] = useState([]);
  const [draftRows, setDraftRows] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", tone: "" });
  const [openSubs, setOpenSubs] = useState(null);
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);

  useEffect(() => {
    setRun(undefined);
    setSavedRows([]);
    setDraftRows(null);
    setDirty(false);
    setMessage({ text: "", tone: "" });
    setSelectedStaffIds([]);
    const unsubRun = subscribePayrollMonth(runId, setRun);
    const unsubRows = subscribePayrollMonthRows(runId, setSavedRows);
    return () => {
      unsubRun();
      unsubRows();
    };
  }, [runId]);

  const editable = run === null || run?.status === "draft";

  // Keep the working copy in sync until the Admin starts editing.
  useEffect(() => {
    if (!editable || dirty || run === undefined || !staffLoaded) return;
    if (run?.status === "draft") setDraftRows(savedRows.map(computeRow));
    else setDraftRows(buildDraftRows(staffList, settings, frequency, periodKey).rows);
  }, [editable, dirty, run, savedRows, staffLoaded, staffList, settings, frequency, periodKey]);

  const rows = editable ? (draftRows || []) : savedRows.map(computeRow);
  const summary = useMemo(() => summarizeRows(rows), [rows]);
  const { missingSalary, otherFrequency } = useMemo(
    () => buildDraftRows(staffList, settings, frequency, periodKey),
    [staffList, settings, frequency, periodKey],
  );
  const laterFinalized = months.some((item) => {
    const itemFrequency = frequencyFromRun(item);
    const itemPeriodKey = item.periodKey || item.id;
    return itemFrequency === frequency && itemPeriodKey > periodKey && item.status !== "draft";
  });
  const status = run ? run.status : "not-started";
  const currentPeriodLabel = periodLabel(frequency, periodKey);

  const say = (text, tone = "ok") => setMessage({ text, tone });
  const act = async (fn) => {
    setBusy(true);
    setMessage({ text: "", tone: "" });
    try {
      await fn();
    } catch (err) {
      say(err.message || "Something went wrong.", "error");
    } finally {
      setBusy(false);
    }
  };

  const editRow = (staffId, change) => {
    setDirty(true);
    setDraftRows((current) => current.map((row) => (row.staffId === staffId ? change(row) : row)));
  };

  const saveDraft = () => act(async () => {
    await savePayrollDraft(runId, draftRows, { actor: actor(), frequency, periodKey });
    setDirty(false);
    say(`${currentPeriodLabel} saved as draft.`);
  });

  const refresh = () => {
    const { rows: next } = refreshDraftRows(draftRows || [], staffList, settings, frequency, periodKey);
    setDraftRows(next);
    setDirty(true);
    say("Pay details and staff refreshed from the employee list. Save to keep.");
  };

  const finalize = () => {
    const increments = planIncrements(draftRows || []);
    const text = [
      `Finalize ${currentPeriodLabel}? Amounts will be locked.`,
      increments.length
        ? `\nThese monthly salaries go up from ${monthLabel(nextMonthKey(periodKey))}:\n${increments.map((i) => `• ${i.staffName}: ${formatRupees(i.from)} → ${formatRupees(i.to)}`).join("\n")}`
        : "",
    ].join("");
    if (!window.confirm(text)) return;
    act(async () => {
      await savePayrollDraft(runId, draftRows, { actor: actor(), frequency, periodKey });
      await finalizePayrollMonth(runId, draftRows, { actor: actor(), laterFinalized });
      setDirty(false);
      say(`${currentPeriodLabel} finalized.${increments.length ? ` ${increments.length} salary increment(s) apply from next month.` : ""}`);
    });
  };

  const reopen = () => {
    if (!window.confirm(`Reopen ${currentPeriodLabel} for changes? Any increments from it will be reversed.`)) return;
    act(async () => {
      await reopenPayrollMonth(runId, { actor: actor(), laterFinalized });
      say(`${currentPeriodLabel} reopened as a draft.`);
    });
  };

  const exportCsv = () => {
    const blob = new Blob([payrollCsv(rows, currentPeriodLabel)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll-${runId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="sm-panel payroll-controls">
        <div className="payroll-preset-row">
          <label>Pay frequency
            <select aria-label="Pay frequency" value={frequency} onChange={(event) => {
              const next = event.target.value;
              if (!Object.hasOwn(PAY_FREQUENCIES, next)) return;
              setFrequency(next);
              const today = new Date();
              const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
              if (next === "monthly") setPeriodKey(currentMonthKey());
              else if (next === "weekly") {
                const monday = new Date(today);
                monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
                setPeriodKey(`${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`);
              } else if (next === "daily") setPeriodKey(todayKey);
              else setPeriodKey(`${todayKey}_${todayKey}`);
            }}>
              {Object.entries(PAY_FREQUENCIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {frequency === "monthly" ? (
            <label>Month <input type="month" aria-label="Payroll month" value={periodKey} onChange={(event) => isMonthKey(event.target.value) && setPeriodKey(event.target.value)} /></label>
          ) : frequency === "contract" ? (
            <>
              <label>Contract period start <input type="date" aria-label="Contract period start" value={periodKey.split("_")[0] || ""} onChange={(event) => {
                const end = periodKey.split("_")[1] || event.target.value;
                if (isDateKey(event.target.value) && event.target.value <= end) setPeriodKey(`${event.target.value}_${end}`);
              }} /></label>
              <label>Contract period end <input type="date" aria-label="Contract period end" value={periodKey.split("_")[1] || ""} onChange={(event) => {
                const start = periodKey.split("_")[0] || event.target.value;
                if (isDateKey(event.target.value) && start <= event.target.value) setPeriodKey(`${start}_${event.target.value}`);
              }} /></label>
            </>
          ) : (
            <label>{frequency === "weekly" ? "Week starting (Monday)" : "Pay date"}
              <input type="date" aria-label={frequency === "weekly" ? "Week starting date" : "Pay date"} value={periodKey} onChange={(event) => {
                if (!isDateKey(event.target.value)) return;
                const selected = new Date(`${event.target.value}T00:00:00`);
                if (frequency === "weekly" && selected.getDay() !== 1) {
                  selected.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
                  setPeriodKey(`${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`);
                } else setPeriodKey(event.target.value);
              }} />
            </label>
          )}
          <span className="payroll-muted">{currentPeriodLabel}</span>
          <span className={`payroll-status-pill status-${status}`}>{run === undefined ? "Loading…" : RUN_STATUS_LABEL[status] || "Not started"}</span>
          {dirty && <span className="payroll-muted">Unsaved changes</span>}
        </div>
        <div className="payroll-action-row">
          {editable && (
            <>
              <button className="sm-btn sm-btn-ghost" disabled={busy || !draftRows?.length || (!dirty && run !== null)} onClick={saveDraft}>Save draft</button>
              <button className="sm-btn sm-btn-ghost" disabled={busy || !staffLoaded} onClick={refresh}>Refresh from employee list</button>
              <button className="sm-btn sm-btn-gold" disabled={busy || !draftRows?.length} onClick={finalize}>Finalize period</button>
            </>
          )}
          {status === "finalized" && (
            <>
              <button className="sm-btn sm-btn-ghost" disabled={busy || summary.paidCount > 0} onClick={reopen} title={summary.paidCount > 0 ? "Someone is already paid" : ""}>Reopen</button>
              {summary.unpaid > 0 && (
                <>
                  {selectedStaffIds.length > 0 && (
                    <MarkPaidInline label={`Record ${selectedStaffIds.length} selected paid`} onSubmit={async (reference) => {
                      await markSelectedPayslipsPaid(runId, selectedStaffIds, { reference, actor: actor() });
                      setSelectedStaffIds([]);
                    }} />
                  )}
                  <MarkPaidInline label="Record all unpaid as paid" onSubmit={(reference) => markAllPayslipsPaid(runId, { reference, actor: actor() })} />
                </>
              )}
            </>
          )}
          <button className="sm-btn sm-btn-ghost" disabled={!rows.length} onClick={exportCsv}><Download size={14} /> Export CSV</button>
        </div>
        {message.text && <div className={message.tone === "error" ? "sm-error" : "sm-success"} role="status">{message.text}</div>}
        {editable && missingSalary.length > 0 && (
          <div className="sm-qr-setup" role="note">
            <strong>No agreed pay set for {missingSalary.length} active employee(s):</strong>
            <span>{missingSalary.map((s) => s.name).join(", ")} — set it under Employees &amp; roles, then refresh.</span>
          </div>
        )}
        {editable && otherFrequency.length > 0 && (
          <div className="payroll-muted">{otherFrequency.length} active employee(s) use a different pay frequency and are not included in this run.</div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="sm-panel payroll-summary">
          <div className="payroll-summary-grid">
            <SummaryTile label="Employees" value={summary.employees} />
            <SummaryTile label="Agreed pay" value={formatRupees(summary.salary)} />
            <SummaryTile label="Increments" value={formatRupees(summary.increments)} />
            <SummaryTile label="Bonuses" value={formatRupees(summary.bonuses)} />
            <SummaryTile label="Deductions" value={formatRupees(summary.deductions)} tone="danger" />
            <SummaryTile label="Net payroll" value={formatRupees(summary.net)} highlight />
            {!editable && <SummaryTile label="Paid" value={formatRupees(summary.paid)} tone="success" />}
          </div>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="sm-panel payroll-table-wrap">
          <table className="payroll-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Agreed pay</th>
                {frequency === "monthly" && <th>+ Increment</th>}
                <th>+ Bonus</th>
                <th>Additions</th>
                <th>− Emp. tax</th>
                <th>− PF</th>
                <th>− Insurance</th>
                <th>− Additional</th>
                <th>Net pay</th>
                <th>UPI ID</th>
                <th>{editable ? "" : "Payment"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const problems = editable ? rowProblems(row) : [];
                return (
                  <React.Fragment key={row.staffId}>
                    <tr className={problems.length ? "payroll-row-invalid" : ""}>
                      <td>
                        <div className="payroll-emp-name">{row.staffName}</div>
                        <div className="payroll-muted">{row.jobRole || row.accessRole || "—"}{row.employeeId ? ` · ${row.employeeId}` : ""}</div>
                        {problems.map((p) => <div key={p} className="payroll-error-text">{p}</div>)}
                      </td>
                      <td>{formatRupees(row.salary)}</td>
                      {frequency === "monthly" && (
                      <td>
                        {editable
                          ? <MoneyInput label={`${row.staffName} increment`} value={row.increment} onChange={(v) => editRow(row.staffId, (r) => updateRowField(r, "increment", v, settings))} />
                          : formatRupees(row.increment)}
                      </td>
                      )}
                      {["bonus"].map((field) => (
                        <td key={field}>
                          {editable
                            ? <MoneyInput label={`${row.staffName} ${field}`} value={row[field]} onChange={(v) => editRow(row.staffId, (r) => updateRowField(r, field, v, settings))} />
                            : formatRupees(row[field])}
                        </td>
                      ))}
                      <td className="payroll-strong">{formatRupees(row.additions)}</td>
                      {["tax", "pf", "insurance"].map((field) => (
                        <td key={field}>
                          {editable
                            ? <MoneyInput label={`${row.staffName} ${field}`} value={row[field]} onChange={(v) => editRow(row.staffId, (r) => updateRowField(r, field, v, settings))} />
                            : formatRupees(row[field])}
                        </td>
                      ))}
                      <td>
                        <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setOpenSubs(openSubs === row.staffId ? null : row.staffId)}>
                          {formatRupees(row.otherDeductions)} · {(row.extraDeductions || []).length} {openSubs === row.staffId ? "▲" : "▼"}
                        </button>
                      </td>
                      <td className="payroll-strong">{formatRupees(row.netPay)}</td>
                      <td>{row.upiId || <span className="payroll-muted">Not provided</span>}</td>
                      <td className="payroll-row-actions">
                        {editable ? null : row.paymentStatus === "paid" ? (
                          <span className="payroll-pay-pill pay-paid" title={row.paymentReference || ""}>Paid · {row.paymentReference}</span>
                        ) : (
                          <>
                            <input type="checkbox" aria-label={`Select ${row.staffName} for bulk payment confirmation`} checked={selectedStaffIds.includes(row.staffId)} onChange={(event) => setSelectedStaffIds((ids) =>
                              event.target.checked ? [...ids, row.staffId] : ids.filter((id) => id !== row.staffId))} />
                            {row.upiId && <a className="sm-btn sm-btn-ghost sm-btn-xs" href={`upi://pay?${new URLSearchParams({ pa: row.upiId, pn: row.staffName, am: Number(row.netPay).toFixed(2), cu: "INR", tn: currentPeriodLabel })}`}>Open UPI app</a>}
                            <MarkPaidInline label="Record paid" onSubmit={(reference) => markPayslipPaid(runId, row.staffId, { reference, actor: actor() })} />
                          </>
                        )}
                        {!editable && (
                          <button className="sm-icon-btn" aria-label={`Payslip for ${row.staffName}`} onClick={() => printPayslip(row, runId)}>
                            <Printer size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {openSubs === row.staffId && (
                      <tr className="payroll-sub-row">
                        <td colSpan={frequency === "monthly" ? 12 : 11}>
                          <strong>Additional subtractions for {row.staffName}</strong>
                          <SubtractionsEditor
                            row={row}
                            editable={editable}
                            onChange={(items) => editRow(row.staffId, (r) => computeRow({ ...r, extraDeductions: items }))}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sm-panel"><div className="sm-state-msg">
          {run === undefined || !staffLoaded ? "Loading…" : "No employees with agreed pay for this period. Set pay under Employees & roles."}
        </div></div>
      )}

      <div className="sm-panel">
        <h4>Pay period history</h4>
        {months.length === 0 ? <div className="sm-state-msg">No pay periods saved yet.</div> : months.map((m) => (
          <div className="sm-request-history-row" key={m.id}>
            <button className={`sm-btn sm-btn-ghost sm-btn-xs ${m.id === runId ? "on" : ""}`} onClick={() => {
              setFrequency(frequencyFromRun(m));
              setPeriodKey(m.periodKey || m.id);
            }}>{m.periodLabel || periodLabel(frequencyFromRun(m), m.periodKey || m.id)}</button>
            <span className={`payroll-status-pill status-${m.status}`}>{RUN_STATUS_LABEL[m.status] || m.status}</span>
            <span className="payroll-muted">{m.rowCount || 0} employees</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ============================ Employees & roles ============================ */
function EmployeeRow({ staff, staffList, jobRoles, onMessage }) {
  const [frequency, setFrequency] = useState(payFrequencyOf(staff));
  const [amount, setAmount] = useState(agreedPayAmountOf(staff, payFrequencyOf(staff)));
  const [upiId, setUpiId] = useState(staff.payrollProfile?.upiId || "");
  const [pfEnabled, setPfEnabled] = useState(Boolean(staff.payrollProfile?.pfEnabled));
  const [insurance, setInsurance] = useState(Number(staff.payrollProfile?.insurance || 0));
  const [busy, setBusy] = useState(false);
  const dirty = frequency !== payFrequencyOf(staff)
    || amount !== agreedPayAmountOf(staff, payFrequencyOf(staff))
    || upiId !== (staff.payrollProfile?.upiId || "")
    || pfEnabled !== Boolean(staff.payrollProfile?.pfEnabled)
    || insurance !== Number(staff.payrollProfile?.insurance || 0);
  const jobRoleOptions = Array.from(new Set([...jobRoles.map((r) => r.name), staff.jobRole].filter(Boolean)));

  const run = async (fn, okText) => {
    setBusy(true);
    try {
      await fn();
      onMessage(okText, "ok");
    } catch (err) {
      onMessage(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td>
        <div className="payroll-emp-name">{staff.name}</div>
        <div className="payroll-muted">{staff.employeeId || "No ID"}{isActiveStaff(staff) ? "" : ` · ${staff.status}`}</div>
      </td>
      <td>
        <select
          aria-label={`${staff.name} access level`}
          value={staff.role || "Floor"}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.value;
            if (!window.confirm(`Change ${staff.name}'s access level to ${next}?`)) return;
            run(() => setStaffAccessRole(staff, next, staffList, { actor: actor() }), `${staff.name} is now ${next}.`);
          }}
        >
          {ACCESS_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
      </td>
      <td>
        <select
          aria-label={`${staff.name} job role`}
          value={staff.jobRole || ""}
          disabled={busy}
          onChange={(e) => run(() => setStaffJobRole(staff, e.target.value, { actor: actor() }), `${staff.name}'s role updated.`)}
        >
          <option value="">— None —</option>
          {jobRoleOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </td>
      <td>
        <select aria-label={`${staff.name} pay frequency`} value={frequency} disabled={busy} onChange={(event) => {
          const next = event.target.value;
          if (!Object.hasOwn(PAY_FREQUENCIES, next)) return;
          setFrequency(next);
          setAmount(agreedPayAmountOf(staff, next));
        }}>
          {Object.entries(PAY_FREQUENCIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </td>
      <td><MoneyInput label={`${staff.name} agreed pay amount`} value={amount} onChange={setAmount} disabled={busy} /></td>
      <td><input type="checkbox" aria-label={`${staff.name} PF`} checked={pfEnabled} disabled={busy} onChange={(e) => setPfEnabled(e.target.checked)} /></td>
      <td><MoneyInput label={`${staff.name} insurance`} value={insurance} onChange={setInsurance} disabled={busy} /></td>
      <td><input aria-label={`${staff.name} UPI ID`} placeholder="name@bank" value={upiId} maxLength={320} disabled={busy} onChange={(event) => setUpiId(event.target.value)} /></td>
      <td>
        <button
          className="sm-btn sm-btn-gold sm-btn-xs"
          disabled={!dirty || busy}
          onClick={() => run(() => updateStaffPay(staff, { monthlySalary: amount, periodAmount: amount, frequency, pfEnabled, insurance, upiId }, { actor: actor() }), `${staff.name}'s pay details saved.`)}
        >Save</button>
      </td>
    </tr>
  );
}

function EmployeesAndRoles({ staffList, jobRoles }) {
  const [message, setMessage] = useState({ text: "", tone: "" });
  const [newRole, setNewRole] = useState("");
  const onMessage = (text, tone) => setMessage({ text, tone });
  const sorted = staffList.slice().sort((a, b) => Number(isActiveStaff(b)) - Number(isActiveStaff(a)) || String(a.name).localeCompare(String(b.name)));

  return (
    <>
      {message.text && <div className={message.tone === "error" ? "sm-error" : "sm-success"} role="status">{message.text}</div>}
      <div className="sm-panel payroll-table-wrap">
        <h4>Employees</h4>
        <p className="payroll-muted">Enter the fixed agreed amount for each selected pay period. Weekly pay uses a Monday–Sunday period; daily pay uses one date; contract pay uses the selected contract date range. Monthly increments, if used, become effective the following month. UPI IDs are staff-provided payment details; verify them with the staff member before paying.</p>
        <table className="payroll-table">
          <thead>
            <tr><th>Employee</th><th>Access level</th><th>Job role</th><th>Pay frequency</th><th>Agreed pay / period</th><th>PF</th><th>Insurance / month</th><th>UPI ID</th><th /></tr>
          </thead>
          <tbody>
            {sorted.map((staff) => (
              <EmployeeRow key={`${staff.id}-${monthlySalaryOf(staff)}-${staff.payrollProfile?.frequency}-${staff.payrollProfile?.periodAmount}-${staff.payrollProfile?.upiId}`} staff={staff} staffList={staffList} jobRoles={jobRoles} onMessage={onMessage} />
            ))}
          </tbody>
        </table>
        {!sorted.length && <div className="sm-state-msg">No staff yet.</div>}
      </div>

      <div className="sm-panel">
        <h4>Job roles</h4>
        <p className="payroll-muted">Custom roles like Waiter, Head Chef or Cashier. Access levels (Admin, General Manager, Kitchen, Floor) control what someone can open in the app.</p>
        <div className="payroll-role-create">
          <input aria-label="New role name" placeholder="New role, e.g. Head Chef" value={newRole} maxLength={40} onChange={(e) => setNewRole(e.target.value)} />
          <button
            className="sm-btn sm-btn-gold sm-btn-xs"
            disabled={!newRole.trim()}
            onClick={async () => {
              try {
                await createJobRole(newRole, jobRoles, { actor: actor() });
                onMessage(`Role "${newRole.trim()}" created.`, "ok");
                setNewRole("");
              } catch (err) {
                onMessage(err.message, "error");
              }
            }}
          ><Plus size={12} /> Create role</button>
        </div>
        <ul className="payroll-role-list">
          {jobRoles.map((role) => {
            const count = staffList.filter((s) => String(s.jobRole || "").toLowerCase() === String(role.name).toLowerCase()).length;
            return (
              <li key={role.id}>
                <span>{role.name}</span>
                <span className="payroll-muted">{count} employee(s)</span>
                <button
                  className="sm-icon-btn"
                  aria-label={`Delete role ${role.name}`}
                  onClick={async () => {
                    if (!window.confirm(`Delete the role "${role.name}"?`)) return;
                    try {
                      await deleteJobRole(role, staffList);
                      onMessage(`Role "${role.name}" deleted.`, "ok");
                    } catch (err) {
                      onMessage(err.message, "error");
                    }
                  }}
                ><Trash2 size={13} /></button>
              </li>
            );
          })}
          {!jobRoles.length && <li className="payroll-muted">No custom roles yet.</li>}
        </ul>
      </div>
    </>
  );
}

/* ================================= Settings ================================ */
function PayrollSettingsForm({ settings }) {
  const [values, setValues] = useState(settings);
  const [message, setMessage] = useState({ text: "", tone: "" });
  useEffect(() => setValues(settings), [settings]);
  return (
    <div className="sm-panel payroll-settings">
      <h4>Deduction defaults</h4>
      <p className="payroll-muted">Monthly employment-tax and PF defaults apply only to monthly runs. Verify statutory amounts with your payroll adviser. Weekly, daily, and contract runs start with no automatic statutory deductions; use only deductions approved for that employee and period.</p>
      {message.text && <div className={message.tone === "error" ? "sm-error" : "sm-success"} role="status">{message.text}</div>}
      <div className="sm-form-group">
        <label>Employment (professional) tax, ₹ per month</label>
        <MoneyInput label="Employment tax" value={values.professionalTax} onChange={(v) => setValues({ ...values, professionalTax: v })} />
        <p className="sm-hint">Set by your state government; check your state's slab (often up to ₹200/month).</p>
      </div>
      <div className="sm-form-group">
        <label>PF rate, % of salary</label>
        <MoneyInput label="PF rate" value={values.pfRatePercent} onChange={(v) => setValues({ ...values, pfRatePercent: v })} />
      </div>
      <div className="sm-form-group">
        <label>PF wage cap, ₹ (0 = no cap)</label>
        <MoneyInput label="PF wage cap" value={values.pfWageCap} onChange={(v) => setValues({ ...values, pfWageCap: v })} />
        <p className="sm-hint">The statutory ceiling is ₹15,000, so 12% PF is ₹1,800 for salaries above it.</p>
      </div>
      <button
        className="sm-btn sm-btn-gold"
        onClick={async () => {
          try {
            await savePayrollSettings(values);
            setMessage({ text: "Settings saved.", tone: "ok" });
          } catch (err) {
            setMessage({ text: err.message, tone: "error" });
          }
        }}
      >Save settings</button>
    </div>
  );
}

/* =================================== Page ================================== */
export default function Payroll() {
  const navigate = useNavigate();
  const { runId: routeRunId } = useParams();
  const [tab, setTab] = useState("month");
  const [selection, setSelection] = useState(() => selectionFromRunId(routeRunId));
  const { frequency, periodKey } = selection;
  const setFrequency = (nextFrequency) => setSelection((current) => ({ ...current, frequency: nextFrequency }));
  const setPeriodKey = (nextPeriodKey) => setSelection((current) => ({ ...current, periodKey: nextPeriodKey }));
  const runId = payrollRunId(frequency, periodKey);
  const [staffList, setStaffList] = useState([]);
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [payrollProfiles, setPayrollProfiles] = useState([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [locking, setLocking] = useState(false);
  const [settings, setSettings] = useState(PAYROLL_SETTINGS_DEFAULTS);
  const [months, setMonths] = useState([]);
  const [jobRoles, setJobRoles] = useState([]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribers = [];
    migratePayrollData().then(() => {
      if (cancelled) return;
      unsubscribers = [
        subscribeStaff((list) => { setStaffList(list); setStaffLoaded(true); }),
        subscribeStaffPayrollProfiles((profiles, error) => {
          if (error) {
            setSetupError("Staff payroll profiles could not be loaded. Payroll is locked until access is restored.");
            return;
          }
          setPayrollProfiles(profiles);
          setProfilesLoaded(true);
        }),
        subscribePayrollSettings(setSettings),
        subscribePayrollMonths(setMonths),
        subscribeJobRoles(setJobRoles),
      ];
    }).catch((error) => {
      console.error("Payroll migration failed:", error);
      if (!cancelled) setSetupError(error.message || "Payroll data migration failed. Payroll is locked.");
    });
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const payrollStaffList = useMemo(() => {
    const profilesById = new Map(payrollProfiles.map((profile) => [profile.id, profile]));
    return staffList.map((staff) => ({
      ...staff,
      payrollProfile: profilesById.get(staff.id) || null,
      compensation: null,
    }));
  }, [staffList, payrollProfiles]);
  const payrollDataReady = staffLoaded && profilesLoaded && !setupError;

  const signedInToStaff = sessionStorage.getItem("staffAuth") === "true";
  const leavePayroll = async (destination, replace = false) => {
    clearPayrollSession();
    setLocking(true);
    try {
      await signOutPayrollUser();
      navigate(destination, { replace });
    } catch (error) {
      console.error("Could not end payroll auth session:", error);
      setSetupError("Could not end the secure payroll session. Please retry before leaving this page.");
      setLocking(false);
    }
  };

  return (
    <div className="staff-mgmt-page payroll-page">
      <div className="sm-pagehead">
        <div>
          <h1 className="sm-page-h1">Payroll</h1>
          <div className="sm-page-sub">Fixed-period pay, deductions and manual UPI reconciliation — Admin only</div>
        </div>
        <div className="payroll-head-actions">
          <span className="payroll-admin-chip" title="Payroll is Admin-only">
            Admin · {sessionStorage.getItem("payrollAdminName") || "Admin"}
          </span>
          <button
            className="sm-btn sm-btn-ghost sm-btn-xs"
            disabled={locking}
            onClick={() => leavePayroll(routes.payrollLogin, true)}
          >
            <Lock size={13} /> Lock payroll
          </button>
          <button className="sm-back-btn" disabled={locking} onClick={() => leavePayroll(signedInToStaff ? routes.staffManagement : routes.dashboard)}>
            <ChevronLeft size={16} /> {signedInToStaff ? "Back to Staff Management" : "Back to Dashboard"}
          </button>
        </div>
      </div>

      <div className="sm-tabs">
        <button className={`sm-tab ${tab === "month" ? "on" : ""}`} onClick={() => setTab("month")}>Pay periods</button>
        <button className={`sm-tab ${tab === "employees" ? "on" : ""}`} onClick={() => setTab("employees")}>Employees &amp; roles</button>
        <button className={`sm-tab ${tab === "settings" ? "on" : ""}`} onClick={() => setTab("settings")}>Settings</button>
      </div>

      {setupError && <div className="sm-error" role="alert">{setupError}</div>}
      {!setupError && !payrollDataReady && <div className="sm-panel payroll-muted" role="status">Preparing protected payroll data…</div>}
      {payrollDataReady && tab === "month" && (
        <MonthlyPayroll runId={runId} frequency={frequency} periodKey={periodKey} setFrequency={setFrequency} setPeriodKey={setPeriodKey} staffList={payrollStaffList} staffLoaded={payrollDataReady} settings={settings} months={months} />
      )}
      {payrollDataReady && tab === "employees" && <EmployeesAndRoles staffList={payrollStaffList} jobRoles={jobRoles} />}
      {payrollDataReady && tab === "settings" && <PayrollSettingsForm settings={settings} />}
    </div>
  );
}
