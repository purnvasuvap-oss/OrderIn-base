import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Download } from "lucide-react";
import routes from "../routes";
import "./Payroll.css";
import {
  subscribePayrollRun,
  subscribePayrollRows,
  payrollCsv,
  markPayrollRowPaymentStatus,
  retryFailedPayment,
} from "../services/staffService";

const STATUS_LABEL = {
  draft: "Draft", under_review: "Under review", approved: "Approved",
  processing: "Processing", paid: "Paid", failed: "Failed", reopened: "Reopened",
};

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

export default function PayrollRunDetail() {
  const navigate = useNavigate();
  const { runId } = useParams();
  const [run, setRun] = useState(null);
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => subscribePayrollRun(runId, setRun), [runId]);
  useEffect(() => subscribePayrollRows(runId, setRows), [runId]);

  const downloadPayslip = (row) => {
    const blob = new Blob([payrollCsv([row])], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payslip-${row.staffName || row.staffId}-${runId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const markPaid = async (staffId) => {
    try {
      await markPayrollRowPaymentStatus(runId, staffId, "paid", { reference: `manual-${Date.now()}` });
      setMessage("Marked as paid.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const markFailed = async (staffId) => {
    const reason = window.prompt("Failure reason?") || "";
    try {
      await markPayrollRowPaymentStatus(runId, staffId, "failed", { failureReason: reason });
      setMessage("Marked as failed.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const retry = async (staffId) => {
    try {
      await retryFailedPayment(runId, staffId);
      setMessage("Payment retry queued.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  if (!run) {
    return (
      <div className="staff-mgmt-page payroll-page">
        <div className="sm-pagehead">
          <h1 className="sm-page-h1">Payroll run</h1>
          <button className="sm-back-btn" onClick={() => navigate(routes.staffPayroll)}>
            <ChevronLeft size={16} /> Back to Payroll
          </button>
        </div>
        <div className="sm-panel"><div className="sm-state-msg">Loading payroll run…</div></div>
      </div>
    );
  }

  return (
    <div className="staff-mgmt-page payroll-page">
      <div className="sm-pagehead">
        <div>
          <h1 className="sm-page-h1">Payroll run · {run.startDate} – {run.endDate}</h1>
          <div className="sm-page-sub">
            <span className={`payroll-status-pill status-${run.status || "draft"}`}>{STATUS_LABEL[run.status] || run.status || "draft"}</span>
            {" "}· {run.rowCount || rows.length} staff
          </div>
        </div>
        <button className="sm-back-btn" onClick={() => navigate(routes.staffPayroll)}>
          <ChevronLeft size={16} /> Back to Payroll
        </button>
      </div>

      {message && <div className="sm-panel"><div className="sm-state-msg" role="status">{message}</div></div>}

      <div className="sm-panel payroll-table-wrap">
        <table className="payroll-table">
          <thead>
            <tr>
              <th>Employee</th><th>Reg. Hrs</th><th>OT Hrs</th><th>Break Hrs</th>
              <th>Tips</th><th>Bonuses</th><th>Deductions</th><th>Gross</th><th>Net</th>
              <th>Payment</th><th>Reference</th><th>Payslip</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.staffName}</td>
                <td>{row.regularHours}</td>
                <td>{row.overtimeHours}</td>
                <td>{row.breakHours}</td>
                <td>{money(row.tips)}</td>
                <td>{money(row.bonuses)}</td>
                <td>{money(row.deductions)}</td>
                <td>{money(row.gross)}</td>
                <td>{money(row.netPay)}</td>
                <td><span className={`payroll-pay-pill pay-${row.paymentStatus || "unpaid"}`}>{row.paymentStatus || "unpaid"}</span></td>
                <td>{row.paymentReference || "—"}</td>
                <td>
                  <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => downloadPayslip(row)}>
                    <Download size={12} /> CSV
                  </button>
                </td>
                <td className="payroll-row-actions">
                  {run.status === "processing" && row.paymentStatus !== "paid" && (
                    <>
                      <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={() => markPaid(row.staffId)}>Mark paid</button>
                      <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => markFailed(row.staffId)}>Mark failed</button>
                    </>
                  )}
                  {row.paymentStatus === "failed" && (
                    <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => retry(row.staffId)}>Retry</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="sm-state-msg">No rows in this run.</div>}
      </div>

      <div className="sm-panel">
        <h4>Approval history</h4>
        {(run.approvalHistory || []).slice().reverse().map((entry, i) => (
          <div className="sm-request-history-row" key={i}>
            <span>{STATUS_LABEL[entry.status] || entry.status} (from {STATUS_LABEL[entry.from] || entry.from})</span>
            <span>{entry.changedAt ? new Date(entry.changedAt).toLocaleString() : ""}{entry.note ? ` · ${entry.note}` : ""}</span>
          </div>
        ))}
        {!(run.approvalHistory || []).length && <div className="sm-state-msg">No status changes recorded yet.</div>}
      </div>
    </div>
  );
}
