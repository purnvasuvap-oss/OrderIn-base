import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../routes";
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

export default function StaffSelfService() {
  const navigate = useNavigate();
  const staffId = sessionStorage.getItem("staffId");
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
  const [newPin, setNewPin] = useState("");
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({});

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

  const weekDates = datesForWeek(weekKey);
  const totalHours = attendance.reduce((sum, record) => sum + hoursFor(record), 0);
  const requestTimeOff = async () => {
    const startDate = window.prompt("Start date (YYYY-MM-DD)");
    if (!startDate || !staff) return;
    await addTimeOffRequest({ staffId, staffName: staff.name, startDate, endDate: startDate, reason: "Staff self-service request" });
    setMessage("Time-off request submitted.");
  };
  const requestSwap = async () => {
    const date = window.prompt("Shift date (YYYY-MM-DD)");
    if (!date || !staff) return;
    await addSwapRequest({ staffId, staffName: staff.name, date, reason: "Staff self-service request" });
    setMessage("Shift-swap request submitted.");
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
  const changePin = async () => {
    const pin = window.prompt("Enter a new 4-digit PIN");
    if (!/^\d{4}$/.test(pin || "")) { setMessage("PIN must be exactly 4 digits."); return; }
    setNewPin(await resetStaffPin(staffId, pin));
    setMessage("PIN changed. Store it securely; it will not be shown again.");
  };
  useEffect(() => {
    if (!newPin) return undefined;
    const timer = window.setTimeout(() => setNewPin(""), 30000);
    return () => window.clearTimeout(timer);
  }, [newPin]);

  return (
    <main className="staff-mgmt-page" aria-label="Staff self-service">
      <div className="sm-pagehead">
        <div><h1 className="sm-page-h1">My Staff Portal</h1><div className="sm-page-sub">{staff?.name || "Staff self-service"}</div></div>
        <button className="sm-back-btn" onClick={() => navigate(routes.staffManagement)}>Back to Staff Management</button>
      </div>
      {message && <div className="sm-success" role="status">{message}</div>}
      {newPin && <div className="sm-success">Your new PIN is ready to share privately: <strong>{newPin}</strong></div>}
      <div className="sm-requests-cols">
        <section className="sm-panel">
          <h3>My profile</h3>
          {!editing ? (
            <>
              {staff?.photoUrl && <img src={staff.photoUrl} alt="" width="56" height="56" />}
              <div className="sm-request-history-row"><span>Employee ID</span><span>{staff?.employeeId || "Not assigned"}</span></div>
              <div className="sm-request-history-row"><span>Phone / email</span><span>{staff?.phone || "—"} · {staff?.email || "—"}</span></div>
              <div className="sm-request-history-row"><span>Emergency contact</span><span>{staff?.emergencyContact || "—"} {staff?.emergencyRelationship ? `(${staff.emergencyRelationship})` : ""}</span></div>
              <div className="sm-request-history-row"><span>Leave balances</span><span>Vacation {staff?.leaveBalances?.vacation ?? 0} · Sick {staff?.leaveBalances?.sick ?? 0}</span></div>
              <div className="sm-request-history-row"><span>Payment</span><span>{staff?.paymentProvider?.provider || "Not configured"} {staff?.paymentProvider?.last4 ? `•••• ${staff.paymentProvider.last4}` : ""}</span></div>
              <button className="sm-btn sm-btn-ghost" onClick={() => setEditing(true)}>Edit personal information</button>
            </>
          ) : (
            <>
              {["phone", "email", "address", "emergencyContact", "emergencyRelationship", "photoUrl"].map((field) => (
                <label className="sm-form-group" key={field}>{field === "emergencyContact" ? "Emergency contact" : field === "emergencyRelationship" ? "Emergency relationship" : field === "photoUrl" ? "Photo URL" : field[0].toUpperCase() + field.slice(1)}
                  {field === "address" ? <textarea value={profile[field]} onChange={(event) => setProfile({ ...profile, [field]: event.target.value })} /> : <input value={profile[field]} onChange={(event) => setProfile({ ...profile, [field]: event.target.value })} />}
                </label>
              ))}
              <button className="sm-btn sm-btn-gold" onClick={saveProfile}>Save</button>
              <button className="sm-btn sm-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </>
          )}
          <button className="sm-btn sm-btn-ghost" onClick={changePin}>Change PIN</button>
        </section>
        <section className="sm-panel"><h3>My schedule · week of {dateText(weekDates[0])}</h3><div className="sm-toolbar"><button className="sm-btn sm-btn-ghost" onClick={() => setWeekKey(shiftWeekKey(weekKey, -1))}>Previous</button><button className="sm-btn sm-btn-ghost" onClick={() => setWeekKey(shiftWeekKey(weekKey, 1))}>Next</button></div>{days.map((shift, index) => <div className="sm-request-history-row" key={index}><span>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</span><span>{shift ? `${shift.type} ${shift.start}–${shift.end}` : "Off"}</span></div>)}</section>
      </div>
      <section className="sm-panel">
        <div className="sm-toolbar"><h3>Attendance history</h3><button className={`sm-btn ${attendanceView === "week" ? "sm-btn-gold" : "sm-btn-ghost"}`} onClick={() => setAttendanceView("week")}>Week</button><button className={`sm-btn ${attendanceView === "month" ? "sm-btn-gold" : "sm-btn-ghost"}`} onClick={() => setAttendanceView("month")}>Month</button>{attendanceView === "month" && <input aria-label="Attendance month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />}</div>
        <div className="sm-state-msg">Hours worked: <strong>{totalHours.toFixed(2)}</strong></div>
        {attendance.length ? attendance.map((item) => <div className="sm-request-history-row" key={item.id}><span>{item.dateKey} · {dateText(item.clockInAt)} – {item.clockOutAt ? dateText(item.clockOutAt) : "In progress"}</span><span>{hoursFor(item).toFixed(2)}h · {item.breakMinutes || 0}m break</span></div>) : <div className="sm-state-msg">No attendance in this period.</div>}
      </section>
      <section className="sm-panel"><h3>Pay &amp; payslip history</h3><div className="sm-state-msg">Payment provider transfers are disabled until a provider is configured.</div>{payrollRuns.map((run) => <div className="sm-request-history-row" key={run.id}><button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setSelectedRun(run)}>{run.startDate} – {run.endDate}</button><span>{run.status} {selectedRun?.id === run.id && payrollRows.length ? `· Net ${payrollRows.reduce((sum, row) => sum + Number(row.netPay || 0), 0).toFixed(2)}` : ""}</span></div>)}{!payrollRuns.length && <div className="sm-state-msg">No payslips available yet.</div>}</section>
      <section className="sm-panel"><h3>Requests &amp; announcements</h3><div className="sm-toolbar"><button className="sm-btn sm-btn-gold" onClick={requestTimeOff}>Request time off</button><button className="sm-btn sm-btn-ghost" onClick={requestSwap}>Request shift swap</button></div><h4>My requests</h4>{[...timeOff, ...swaps].map((item) => <div className="sm-request-history-row" key={item.id}><span>{item.startDate || item.date}</span><span>{item.status}</span></div>)}<h4>Announcements</h4>{notifications.map((item) => <div className="sm-request-history-row" key={item.id}><span>{item.message}</span><span>{item.read ? "Read" : "New"}</span></div>)}</section>
    </main>
  );
}
