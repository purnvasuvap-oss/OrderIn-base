import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  CalendarDays,
  Clock,
  Wallet,
  Bell,
  X,
  KeyRound,
} from "lucide-react";
import routes from "../routes";
import "./StaffManagement.css";
import {
  subscribeStaff,
  subscribeRoster,
  weekKeyFor,
  shiftWeekKey,
  datesForWeek,
  subscribeTodayAttendance,
  subscribeAttendanceForStaff,
  subscribeTimeOffRequests,
  addTimeOffRequest,
  subscribeSwapRequests,
  addSwapRequest,
  subscribeStaffNotifications,
  resetStaffPin,
  updateStaffPersonalInfo,
  subscribePayrollRuns,
  subscribePayrollRows,
} from "../services/staffService";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFT_CHIP = { morning: "morning", evening: "evening", night: "night" };

const emptyDays = Array(7).fill(null);
const monthBounds = (month) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(year, monthNumber, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
};
const dateText = (value) => {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { month: "short", day: "numeric" });
};
const hoursFor = (record) => {
  if (!record?.clockInAt) return 0;
  const start = record.clockInAt.toDate ? record.clockInAt.toDate() : new Date(record.clockInAt);
  const end = record.clockOutAt ? (record.clockOutAt.toDate ? record.clockOutAt.toDate() : new Date(record.clockOutAt)) : new Date();
  return Math.max(0, (end - start) / 3600000 - Number(record.breakMinutes || 0) / 60 + Number(record.priorSessionsMinutes || 0) / 60);
};
const initialsOf = (name) => (name || "?").trim().charAt(0).toUpperCase();

/* ======================= Request time off modal ======================= */
function TimeOffModal({ onClose, onSubmit }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const handleSubmit = async () => {
    if (!startDate) { setError("Start date is required."); return; }
    setBusy(true);
    setError("");
    try {
      await onSubmit({ startDate, endDate: endDate || startDate, reason });
      onClose();
    } catch (err) {
      setError(err.message || "Could not submit request.");
      setBusy(false);
    }
  };
  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal sm-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>Request time off</h3>
          <button className="sm-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sm-modal-body">
          {error && <div className="sm-error">{error}</div>}
          <div className="sm-form-row">
            <div className="sm-form-group">
              <label htmlFor="timeoff-start">Start date</label>
              <input id="timeoff-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="sm-form-group">
              <label htmlFor="timeoff-end">End date <span className="sm-optional">(optional)</span></label>
              <input id="timeoff-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="sm-form-group">
            <label htmlFor="timeoff-reason">Reason <span className="sm-optional">(optional)</span></label>
            <textarea id="timeoff-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="sm-btn sm-btn-gold" onClick={handleSubmit} disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Request shift swap modal ======================= */
function SwapModal({ onClose, onSubmit }) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const handleSubmit = async () => {
    if (!date) { setError("Shift date is required."); return; }
    setBusy(true);
    setError("");
    try {
      await onSubmit({ date, reason });
      onClose();
    } catch (err) {
      setError(err.message || "Could not submit request.");
      setBusy(false);
    }
  };
  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal sm-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>Request shift swap</h3>
          <button className="sm-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sm-modal-body">
          {error && <div className="sm-error">{error}</div>}
          <div className="sm-form-group">
            <label htmlFor="swap-date">Shift date</label>
            <input id="swap-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sm-form-group">
            <label htmlFor="swap-reason">Reason <span className="sm-optional">(optional)</span></label>
            <textarea id="swap-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="sm-btn sm-btn-gold" onClick={handleSubmit} disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Change PIN modal ======================= */
function ChangePinModal({ onClose, onSubmit }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealedPin, setRevealedPin] = useState("");
  const handleSubmit = async () => {
    if (!/^\d{4}$/.test(pin)) { setError("PIN must be exactly 4 digits."); return; }
    setBusy(true);
    setError("");
    try {
      const confirmed = await onSubmit(pin);
      setRevealedPin(confirmed);
    } catch (err) {
      setError(err.message || "Could not change PIN.");
      setBusy(false);
    }
  };
  if (revealedPin) {
    return (
      <div className="sm-overlay" onClick={onClose}>
        <div className="sm-modal sm-modal-small" onClick={(e) => e.stopPropagation()}>
          <div className="sm-modal-head">
            <h3>PIN changed</h3>
            <button className="sm-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="sm-modal-body">
            <p>Your new login PIN:</p>
            <div className="sm-pin-reveal">{revealedPin}</div>
            <p className="sm-hint">Store it securely; it will not be shown again.</p>
          </div>
          <div className="sm-modal-foot">
            <button className="sm-btn sm-btn-gold" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal sm-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>Change PIN</h3>
          <button className="sm-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sm-modal-body">
          {error && <div className="sm-error">{error}</div>}
          <div className="sm-form-group">
            <label htmlFor="new-pin">New 4-digit PIN</label>
            <input id="new-pin" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </div>
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="sm-btn sm-btn-gold" onClick={handleSubmit} disabled={busy}>{busy ? "Saving…" : "Change PIN"}</button>
        </div>
      </div>
    </div>
  );
}

export default function StaffSelfService() {
  const navigate = useNavigate();
  const staffId = sessionStorage.getItem("staffPortalStaffId");
  const [staff, setStaff] = useState(null);
  const [weekKey, setWeekKey] = useState(() => weekKeyFor());
  const [days, setDays] = useState(emptyDays);
  const [attendanceView, setAttendanceView] = useState("week");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [attendance, setAttendance] = useState([]);
  const [timeOff, setTimeOff] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [payrollRows, setPayrollRows] = useState([]);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({});
  const [modal, setModal] = useState(null); // "timeoff" | "swap" | "pin"

  useEffect(() => subscribeStaff((items) => {
    const current = items.find((item) => item.id === staffId) || null;
    setStaff(current);
    if (current) setProfile({
      phone: current.phone || "", email: current.email || "", address: current.address || "",
      emergencyContact: current.emergencyContact || "", emergencyRelationship: current.emergencyRelationship || "",
      photoUrl: current.photoUrl || "",
    });
  }), [staffId]);
  useEffect(() => subscribeRoster(weekKey, (map) => setDays(map.get(staffId) || emptyDays)), [staffId, weekKey]);
  const range = useMemo(() => {
    if (attendanceView === "month") return monthBounds(month);
    const dates = datesForWeek(weekKey);
    return {
      start: dates[0].toISOString().slice(0, 10),
      end: dates[6].toISOString().slice(0, 10),
    };
  }, [attendanceView, month, weekKey]);
  useEffect(() => {
    if (typeof subscribeAttendanceForStaff === "function") return subscribeAttendanceForStaff(staffId, range.start, range.end, setAttendance);
    return subscribeTodayAttendance((items) => setAttendance(items.filter((item) => item.staffId === staffId)));
  }, [staffId, range.start, range.end]);
  useEffect(() => subscribeTimeOffRequests((items) => setTimeOff(items.filter((item) => item.staffId === staffId))), [staffId]);
  useEffect(() => subscribeSwapRequests((items) => setSwaps(items.filter((item) => item.staffId === staffId))), [staffId]);
  useEffect(() => subscribeStaffNotifications(setNotifications, staffId), [staffId]);
  useEffect(() => typeof subscribePayrollRuns === "function"
    ? subscribePayrollRuns((runs) => setPayrollRuns(runs.filter((run) => !Array.isArray(run.staffIds) || run.staffIds.includes(staffId))))
    : undefined, [staffId]);
  useEffect(() => {
    if (!selectedRun || typeof subscribePayrollRows !== "function") return undefined;
    return subscribePayrollRows(selectedRun.periodKey, (rows) => setPayrollRows(rows.filter((row) => row.staffId === staffId)));
  }, [selectedRun, staffId]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const weekDates = datesForWeek(weekKey);
  const totalHours = attendance.reduce((sum, record) => sum + hoursFor(record), 0);
  const pendingRequests = [...timeOff, ...swaps].filter((item) => (item.status || "pending") === "pending").length;
  const unreadCount = notifications.filter((item) => !item.read).length;

  const submitTimeOff = async ({ startDate, endDate, reason }) => {
    await addTimeOffRequest({ staffId, staffName: staff.name, startDate, endDate, reason: reason || "Staff self-service request" });
    setMessage("Time-off request submitted.");
  };
  const submitSwap = async ({ date, reason }) => {
    await addSwapRequest({ staffId, staffName: staff.name, date, reason: reason || "Staff self-service request" });
    setMessage("Shift-swap request submitted.");
  };
  const submitPinChange = async (pin) => {
    const confirmed = await resetStaffPin(staffId, pin);
    setMessage("PIN changed. Store it securely; it will not be shown again.");
    return confirmed;
  };
  const saveProfile = async () => {
    try {
      await updateStaffPersonalInfo(staffId, profile);
      setEditing(false);
      setMessage("Personal information updated.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const profileFieldLabel = { emergencyContact: "Emergency contact", emergencyRelationship: "Emergency relationship", photoUrl: "Photo URL" };

  return (
    <main className="staff-mgmt-page" aria-label="Staff self-service">
      <div className="sm-pagehead">
        <div><h1 className="sm-page-h1">My Staff Portal</h1><div className="sm-page-sub">{staff?.name || "Staff self-service"}</div></div>
        <button className="sm-back-btn" onClick={() => navigate(routes.dashboard)}>Back</button>
      </div>
      {message && <div className="sm-success" role="status">{message}</div>}

      <div className="sm-stats">
        <div className="sm-statc">
          <div className="sm-statc-n">{totalHours.toFixed(1)}h</div>
          <div className="sm-statc-lbl">Hours this {attendanceView}</div>
        </div>
        <div className="sm-statc">
          <div className="sm-statc-n sm-statc-n-shift">{staff?.leaveBalances?.vacation ?? 0}</div>
          <div className="sm-statc-lbl">Vacation days left</div>
        </div>
        <div className="sm-statc">
          <div className="sm-statc-n sm-statc-n-pending">{pendingRequests}</div>
          <div className="sm-statc-lbl">Pending requests</div>
        </div>
        <div className="sm-statc">
          <div className="sm-statc-n sm-statc-n-break">{unreadCount}</div>
          <div className="sm-statc-lbl">New announcements</div>
        </div>
      </div>

      <div className="sm-ss-grid">
        <section className="sm-ss-card">
          <div className="sm-ss-card-head">
            <h3><User size={16} /> My profile</h3>
            {!editing && <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setEditing(true)}>Edit</button>}
          </div>
          {!editing ? (
            <>
              <div className="sm-ss-avatar-row">
                {staff?.photoUrl
                  ? <img className="sm-ss-avatar" src={staff.photoUrl} alt="" />
                  : <span className="sm-ss-avatar">{initialsOf(staff?.name)}</span>}
                <div>
                  <div className="sm-ss-identity-name">{staff?.name || "—"}</div>
                  <div className="sm-ss-identity-role">{staff?.role || "Staff"} · {staff?.employeeId || "No ID assigned"}</div>
                </div>
              </div>
              <div className="sm-ss-field-list">
                <div className="sm-ss-field"><span className="sm-ss-field-label">Phone</span><span className="sm-ss-field-value">{staff?.phone || "—"}</span></div>
                <div className="sm-ss-field"><span className="sm-ss-field-label">Email</span><span className="sm-ss-field-value">{staff?.email || "—"}</span></div>
                <div className="sm-ss-field"><span className="sm-ss-field-label">Emergency contact</span><span className="sm-ss-field-value">{staff?.emergencyContact || "—"} {staff?.emergencyRelationship ? `(${staff.emergencyRelationship})` : ""}</span></div>
                <div className="sm-ss-field"><span className="sm-ss-field-label">Leave balances</span><span className="sm-ss-field-value">Vacation {staff?.leaveBalances?.vacation ?? 0} · Sick {staff?.leaveBalances?.sick ?? 0}</span></div>
                <div className="sm-ss-field"><span className="sm-ss-field-label">Payment</span><span className="sm-ss-field-value">{staff?.paymentProvider?.provider || "Not configured"} {staff?.paymentProvider?.last4 ? `•••• ${staff.paymentProvider.last4}` : ""}</span></div>
              </div>
              <button className="sm-btn sm-btn-ghost" onClick={() => setModal("pin")}><KeyRound size={14} /> Change PIN</button>
            </>
          ) : (
            <>
              {["phone", "email", "address", "emergencyContact", "emergencyRelationship", "photoUrl"].map((field) => (
                <div className="sm-form-group" key={field}>
                  <label>{profileFieldLabel[field] || field[0].toUpperCase() + field.slice(1)}</label>
                  {field === "address" ? <textarea rows={2} value={profile[field]} onChange={(event) => setProfile({ ...profile, [field]: event.target.value })} /> : <input value={profile[field]} onChange={(event) => setProfile({ ...profile, [field]: event.target.value })} />}
                </div>
              ))}
              <div className="sm-toolbar">
                <button className="sm-btn sm-btn-gold" onClick={saveProfile}>Save</button>
                <button className="sm-btn sm-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </>
          )}
        </section>

        <section className="sm-ss-card">
          <div className="sm-ss-card-head">
            <h3><CalendarDays size={16} /> My schedule · week of {dateText(weekDates[0])}</h3>
            <div className="sm-toolbar" style={{ marginBottom: 0 }}>
              <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setWeekKey(shiftWeekKey(weekKey, -1))}>Previous</button>
              <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setWeekKey(shiftWeekKey(weekKey, 1))}>Next</button>
            </div>
          </div>
          {days.map((shift, index) => (
            <div className="sm-ss-schedule-row" key={index}>
              <span className="sm-ss-schedule-day">{DAY_NAMES[index]}</span>
              {shift
                ? <span className={`sm-shift-chip sm-shift-chip-${SHIFT_CHIP[shift.type] || "morning"}`} style={{ width: "auto", display: "inline-flex" }}>{shift.type} <small>{shift.start}–{shift.end}</small></span>
                : <span className="sm-shift-off">Off</span>}
            </div>
          ))}
        </section>
      </div>

      <section className="sm-ss-card">
        <div className="sm-ss-card-head">
          <h3><Clock size={16} /> Attendance history</h3>
          <div className="sm-toolbar" style={{ marginBottom: 0 }}>
            <button className={`sm-btn sm-btn-xs ${attendanceView === "week" ? "sm-btn-gold" : "sm-btn-ghost"}`} onClick={() => setAttendanceView("week")}>Week</button>
            <button className={`sm-btn sm-btn-xs ${attendanceView === "month" ? "sm-btn-gold" : "sm-btn-ghost"}`} onClick={() => setAttendanceView("month")}>Month</button>
            {attendanceView === "month" && <input aria-label="Attendance month" type="month" className="sm-select" value={month} onChange={(event) => setMonth(event.target.value)} />}
          </div>
        </div>
        <div className="sm-summary-strip">
          <div className="sm-summary-card">
            <div className="sm-summary-n">{totalHours.toFixed(2)}h</div>
            <div className="sm-summary-lbl">Hours worked</div>
          </div>
        </div>
        {attendance.length ? (
          <div className="sm-table">
            <div className="sm-thead sm-thead-ss-att">
              <span>Date</span><span>Clock in</span><span>Clock out</span><span>Break</span><span>Hours</span>
            </div>
            {attendance.map((item) => (
              <div className="sm-trow sm-trow-ss-att" key={item.id}>
                <span className="sm-att-field"><span className="sm-cell-label">Date</span><span>{item.dateKey}</span></span>
                <span className="sm-att-field"><span className="sm-cell-label">Clock in</span><span>{dateText(item.clockInAt)}</span></span>
                <span className="sm-att-field"><span className="sm-cell-label">Clock out</span><span>{item.clockOutAt ? dateText(item.clockOutAt) : "In progress"}</span></span>
                <span className="sm-att-field"><span className="sm-cell-label">Break</span><span>{item.breakMinutes || 0}m</span></span>
                <span className="sm-att-field"><span className="sm-cell-label">Hours</span><span>{hoursFor(item).toFixed(2)}</span></span>
              </div>
            ))}
          </div>
        ) : <div className="sm-state-msg">No attendance in this period.</div>}
      </section>

      <section className="sm-ss-card">
        <h3><Wallet size={16} /> Pay &amp; payslip history</h3>
        {!payrollRuns.length ? (
          <div className="sm-state-msg">No payslips available yet. Payment provider transfers are disabled until a provider is configured.</div>
        ) : (
          payrollRuns.map((run) => (
            <div className="sm-request-card" key={run.id}>
              <div className="sm-request-who">{run.startDate} – {run.endDate}</div>
              <div className="sm-request-dates">{run.status}{selectedRun?.id === run.id && payrollRows.length ? ` · Net ${payrollRows.reduce((sum, row) => sum + Number(row.netPay || 0), 0).toFixed(2)}` : ""}</div>
              <div className="sm-request-actions">
                <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setSelectedRun(run)}>View payslip</button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="sm-ss-card">
        <div className="sm-ss-card-head">
          <h3><Bell size={16} /> Requests &amp; announcements</h3>
          <div className="sm-toolbar" style={{ marginBottom: 0 }}>
            <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={() => setModal("timeoff")}>Request time off</button>
            <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setModal("swap")}>Request shift swap</button>
          </div>
        </div>
        <div className="sm-requests-cols">
          <div className="sm-requests-col">
            <h4>My requests</h4>
            {[...timeOff, ...swaps].length ? [...timeOff, ...swaps].map((item) => (
              <div className="sm-request-card" key={item.id}>
                <div className="sm-request-who">{item.startDate || item.date}</div>
                {item.reason && <div className="sm-request-reason">{item.reason}</div>}
                <div className={`sm-request-status sm-request-status-${item.status || "pending"}`}>{item.status || "pending"}</div>
              </div>
            )) : <div className="sm-state-msg">No requests yet.</div>}
          </div>
          <div className="sm-requests-col">
            <h4>Announcements</h4>
            {notifications.length ? notifications.map((item) => (
              <div className="sm-request-card" key={item.id}>
                <div className="sm-request-who">{item.message}</div>
                <div className="sm-request-dates">{item.read ? "Read" : "New"}</div>
              </div>
            )) : <div className="sm-state-msg">No announcements yet.</div>}
          </div>
        </div>
      </section>

      {modal === "timeoff" && <TimeOffModal onClose={() => setModal(null)} onSubmit={submitTimeOff} />}
      {modal === "swap" && <SwapModal onClose={() => setModal(null)} onSubmit={submitSwap} />}
      {modal === "pin" && <ChangePinModal onClose={() => setModal(null)} onSubmit={submitPinChange} />}
    </main>
  );
}
