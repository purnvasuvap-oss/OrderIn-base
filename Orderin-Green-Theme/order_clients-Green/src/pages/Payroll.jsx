import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Download, Play } from "lucide-react";
import routes from "../routes";
import "./Payroll.css";
import {
  subscribeStaff,
  getAttendanceForDateRange,
  calculatePayroll,
  payrollCsv,
  savePayrollRun,
  subscribePayrollRuns,
  submitPayrollForReview,
  approvePayrollRun,
  reopenPayrollRun,
  sendBulkPayments,
  retryFailedPayment,
  summarizePayrollRows,
} from "../services/staffService";

/** yyyy-mm-dd for a Date, local time — matches staffService's dateKey format. */
const dateKeyOf = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const PRESETS = {
  weekly: (end) => { const s = new Date(end); s.setDate(end.getDate() - 6); return s; },
  biweekly: (end) => { const s = new Date(end); s.setDate(end.getDate() - 13); return s; },
  monthly: (end) => new Date(end.getFullYear(), end.getMonth(), 1),
};

const STATUS_LABEL = {
  draft: "Draft", under_review: "Under review", approved: "Approved",
  processing: "Processing", paid: "Paid", failed: "Failed", reopened: "Reopened",
};

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

export default function Payroll() {
  const navigate = useNavigate();
  const [staffList, setStaffList] = useState([]);
  const [preset, setPreset] = useState("weekly");
  const [period, setPeriod] = useState(() => {
    const end = new Date();
    return { start: dateKeyOf(PRESETS.weekly(end)), end: dateKeyOf(end) };
  });
  const [rows, setRows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null); // { id/periodKey, status } once calculated/saved
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeStaff(setStaffList), []);
  useEffect(() => subscribePayrollRuns(setRuns), []);

  const summary = useMemo(() => summarizePayrollRows(rows), [rows]);

  const applyPreset = (name) => {
    setPreset(name);
    if (name === "custom") return;
    const end = new Date();
    setPeriod({ start: dateKeyOf(PRESETS[name](end)), end: dateKeyOf(end) });
  };

  const calculate = async () => {
    if (!period.start || !period.end || period.start > period.end) {
      setMessage("Choose a valid payroll period.");
      return;
    }
    setBusy(true);
    try {
      const records = await getAttendanceForDateRange(period.start, period.end);
      setRows(calculatePayroll(records, staffList, period.start, period.end));
      setActiveRun(null);
      setMessage("Payroll calculated. Review tips, bonuses, and deductions before saving.");
    } finally {
      setBusy(false);
    }
  };

  const editAmount = (staffId, field, value) => {
    const amount = Number(value) || 0;
    setRows((current) => current.map((row) => {
      if (row.staffId !== staffId) return row;
      const next = { ...row, [field]: amount };
      next.gross = Number((Number(next.basePay || 0) + Number(next.tips || 0) + Number(next.bonuses || 0)).toFixed(2));
      next.netPay = Number(Math.max(0, next.gross - Number(next.deductions || 0)).toFixed(2));
      return next;
    }));
  };

  const saveDraft = async () => {
    if (!rows.length) return;
    setBusy(true);
    try {
      const run = await savePayrollRun({ startDate: period.start, endDate: period.end, rows });
      setActiveRun(run);
      setMessage("Payroll run saved as draft.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const submitForReview = async () => {
    if (!activeRun) return;
    setBusy(true);
    try {
      const updated = await submitPayrollForReview(activeRun.periodKey || activeRun.id);
      setActiveRun(updated);
      setMessage("Submitted for review.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!activeRun) return;
    setBusy(true);
    try {
      const updated = await approvePayrollRun(activeRun.periodKey || activeRun.id);
      setActiveRun(updated);
      setMessage("Payroll approved.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!activeRun) return;
    setBusy(true);
    try {
      const updated = await reopenPayrollRun(activeRun.periodKey || activeRun.id);
      setActiveRun(updated);
      setMessage("Payroll reopened.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const sendPayments = async () => {
    if (!activeRun) return;
    setBusy(true);
    try {
      const updated = await sendBulkPayments(activeRun.periodKey || activeRun.id);
      setActiveRun(updated);
      setRows((current) => current.map((row) => ({ ...row, paymentStatus: "processing" })));
      setMessage("Bulk payment initiated. A payout provider (RazorpayX) still needs to be connected on the backend before money actually moves — see docs/staff-payroll-review.md.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const retryRow = async (staffId) => {
    if (!activeRun) return;
    try {
      await retryFailedPayment(activeRun.periodKey || activeRun.id, staffId);
      setRows((current) => current.map((row) => (row.staffId === staffId ? { ...row, paymentStatus: "processing" } : row)));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const downloadCsv = () => {
    const blob = new Blob([payrollCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll-${period.start}_${period.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const status = activeRun?.status || "draft";

  return (
    <div className="staff-mgmt-page payroll-page">
      <div className="sm-pagehead">
        <div>
          <h1 className="sm-page-h1">Payroll</h1>
          <div className="sm-page-sub">Calculate, review, approve, and pay staff for a period — backed by Firestore</div>
        </div>
        <button className="sm-back-btn" onClick={() => navigate(routes.staffManagement)}>
          <ChevronLeft size={16} /> Back to Staff Management
        </button>
      </div>

      <div className="sm-panel payroll-controls">
        <div className="payroll-preset-row">
          {["weekly", "biweekly", "monthly", "custom"].map((name) => (
            <button
              key={name}
              className={`sm-btn sm-btn-ghost sm-btn-xs ${preset === name ? "on" : ""}`}
              onClick={() => applyPreset(name)}
            >
              {name[0].toUpperCase() + name.slice(1)}
            </button>
          ))}
          <label>From <input type="date" value={period.start} onChange={(e) => { setPreset("custom"); setPeriod({ ...period, start: e.target.value }); }} /></label>
          <label>To <input type="date" value={period.end} onChange={(e) => { setPreset("custom"); setPeriod({ ...period, end: e.target.value }); }} /></label>
          <button className="sm-btn sm-btn-gold" disabled={busy} onClick={calculate}>Calculate Payroll</button>
          {activeRun && <span className={`payroll-status-pill status-${status}`}>{STATUS_LABEL[status] || status}</span>}
        </div>
        {rows.length > 0 && (
          <div className="payroll-action-row">
            <button className="sm-btn sm-btn-ghost" disabled={busy} onClick={saveDraft}>Save Draft</button>
            <button className="sm-btn sm-btn-ghost" disabled={busy || !activeRun || status !== "draft"} onClick={submitForReview}>Submit for Review</button>
            <button className="sm-btn sm-btn-gold" disabled={busy || !activeRun || (status !== "under_review" && status !== "reopened")} onClick={approve}>Approve Payroll</button>
            <button className="sm-btn sm-btn-ghost" disabled={busy || !activeRun || status !== "approved"} onClick={reopen}>Reopen</button>
            <button className="sm-btn sm-btn-gold" disabled={busy || !activeRun || status !== "approved"} onClick={sendPayments}>
              <Play size={14} /> Send Bulk Payments
            </button>
            <button className="sm-btn sm-btn-ghost" onClick={downloadCsv}><Download size={14} /> Export Payroll</button>
          </div>
        )}
        {message && <div className="sm-state-msg" role="status">{message}</div>}
      </div>

      {rows.length > 0 && (
        <div className="sm-panel payroll-summary">
          <div className="payroll-summary-grid">
            <SummaryTile label="Total Staff" value={summary.totalStaff} />
            <SummaryTile label="Regular Hours" value={summary.regularHours} />
            <SummaryTile label="Overtime Hours" value={summary.overtimeHours} />
            <SummaryTile label="Break Hours" value={summary.breakHours} />
            <SummaryTile label="Tips" value={money(summary.tips)} />
            <SummaryTile label="Bonuses" value={money(summary.bonuses)} />
            <SummaryTile label="Deductions" value={money(summary.deductions)} />
            <SummaryTile label="Gross Payroll" value={money(summary.gross)} />
            <SummaryTile label="Net Payroll" value={money(summary.net)} highlight />
            <SummaryTile label="Paid Amount" value={money(summary.paidAmount)} tone="success" />
            <SummaryTile label="Failed Amount" value={money(summary.failedAmount)} tone="danger" />
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="sm-panel payroll-table-wrap">
          <table className="payroll-table">
            <thead>
              <tr>
                <th>Employee</th><th>Employee ID</th><th>Role</th><th>Reg. Hrs</th><th>OT Hrs</th>
                <th>Break Hrs</th><th>Rate</th><th>OT Rate</th><th>Tips</th><th>Bonuses</th>
                <th>Deductions</th><th>Gross</th><th>Net</th><th>Payment</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.staffId}>
                  <td>{row.staffName}</td>
                  <td>{row.employeeId || "—"}</td>
                  <td>{row.role || "—"}</td>
                  <td>{row.regularHours}</td>
                  <td>{row.overtimeHours}</td>
                  <td>{row.breakHours}</td>
                  <td>{money(row.rate)}</td>
                  <td>{money(row.overtimeRate)}</td>
                  <td>
                    <input aria-label={`${row.staffName} tips`} type="number" min="0" step="0.01" value={row.tips}
                      onChange={(e) => editAmount(row.staffId, "tips", e.target.value)} />
                  </td>
                  <td>
                    <input aria-label={`${row.staffName} bonuses`} type="number" min="0" step="0.01" value={row.bonuses}
                      onChange={(e) => editAmount(row.staffId, "bonuses", e.target.value)} />
                  </td>
                  <td>
                    <input aria-label={`${row.staffName} deductions`} type="number" min="0" step="0.01" value={row.deductions}
                      onChange={(e) => editAmount(row.staffId, "deductions", e.target.value)} />
                  </td>
                  <td>{money(row.gross)}</td>
                  <td>{money(row.netPay)}</td>
                  <td><span className={`payroll-pay-pill pay-${row.paymentStatus}`}>{row.paymentStatus}</span></td>
                  <td>
                    {row.paymentStatus === "failed" && (
                      <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => retryRow(row.staffId)}>Retry</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!rows.length && <div className="sm-panel"><div className="sm-state-msg">Choose a pay period and calculate payroll to get started.</div></div>}

      <div className="sm-panel">
        <h4>Payroll run history</h4>
        {runs.map((run) => (
          <div className="sm-request-history-row" key={run.id}>
            <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => navigate(routes.staffPayroll + "/" + run.id)}>
              {run.startDate} – {run.endDate}
            </button>
            <span className={`payroll-status-pill status-${run.status || "draft"}`}>{STATUS_LABEL[run.status] || run.status || "draft"}</span>
          </div>
        ))}
        {!runs.length && <div className="sm-state-msg">No saved payroll runs.</div>}
      </div>
    </div>
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
