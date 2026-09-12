import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Plus,
  Search,
  Eye,
  EyeOff,
  X,
  ChevronLeft as ArrowLeft,
  ChevronRight as ArrowRight,
  Download,
  Calendar as CalendarIcon,
} from "lucide-react";
import routes from "../routes";
import "./StaffManagement.css";
import { sanitizePhoneInput } from "../utils/phoneValidation";
import {
  ROLES,
  ZONES,
  TEAMS,
  DAY_LABELS,
  subscribeStaff,
  addStaff,
  updateStaff,
  pauseStaff,
  restoreStaff,
  resetStaffPin,
  weekKeyFor,
  shiftWeekKey,
  datesForWeek,
  subscribeRoster,
  setShift,
  publishRoster,
  subscribeTimeOffRequests,
  addTimeOffRequest,
  decideTimeOffRequest,
  subscribeSwapRequests,
  addSwapRequest,
  decideSwapRequest,
  subscribeTodayAttendance,
  punchPin,
  toggleBreak,
  clockOutRecord,
  hoursOf,
  attendanceStatus,
  getAttendanceForDateRange,
  updateAttendanceRecord,
  validateShift,
  isDateUnavailable,
  validateAvailability,
  subscribeStaffAuditLog,
  subscribeStaffNotifications,
  markStaffNotificationRead,
  createShiftTemplate,
} from "../services/staffService";

const ROLE_META = {
  Admin: { key: "admin", label: "Admin" },
  "General Manager": { key: "gm", label: "General Manager" },
  Kitchen: { key: "kitchen", label: "Kitchen" },
  Floor: { key: "floor", label: "Floor" },
};

const getStaffPermissions = () => {
  const role = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("staffRole") : null;
  let explicit = null;
  if (typeof sessionStorage !== "undefined") {
    try { explicit = JSON.parse(sessionStorage.getItem("staffPermissions") || "null"); } catch { explicit = null; }
  }
  // Legacy section-passcode sessions have no identity/role claim. Preserve
  // their existing manager experience until a role-aware auth provider exists.
  if (!role) return { role: null, manageStaff: true, editRoster: true, correctAttendance: true };
  const managerPermissions = ["staff.view", "staff.manage", "roster.edit", "requests.approve", "attendance.correct", "payroll.view", "audit.view", "notifications.manage"];
  const rolePermissions = {
    Admin: [...managerPermissions, "staff.roles", "payroll.manage"],
    "General Manager": managerPermissions,
    Kitchen: ["staff.view", "roster.edit", "requests.approve"],
    Floor: ["staff.view"],
  };
  const resolved = explicit || rolePermissions[Object.keys(rolePermissions).find((item) => item.toLowerCase() === role.toLowerCase())] || [];
  const can = (permission) => resolved.includes(permission);
  return {
    role,
    manageStaff: can("staff.manage"),
    editRoster: can("roster.edit"),
    correctAttendance: can("attendance.correct"),
  };
};

const SHIFT_META = {
  morning: { key: "morning", label: "Morning" },
  evening: { key: "evening", label: "Evening" },
  night: { key: "night", label: "Night" },
};

const fmtWeekLabel = (weekKey) => {
  const dates = datesForWeek(weekKey);
  const opts = { month: "short", day: "numeric" };
  return `${dates[0].toLocaleDateString(undefined, opts)} – ${dates[6].toLocaleDateString(undefined, opts)}`;
};

const fmtClock = (ts) => {
  if (!ts) return "—";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

/* ======================= Add / Edit Staff modal ======================= */
function StaffFormModal({ onClose, onConfirm, initialStaff = null }) {
  const isEdit = Boolean(initialStaff);
  const [name, setName] = useState(initialStaff?.name || "");
  const [role, setRole] = useState(initialStaff?.role || "Floor");
  const [phone, setPhone] = useState(initialStaff?.phone || "");
  const [email, setEmail] = useState(initialStaff?.email || "");
  const [pin, setPin] = useState("");
  const [zone, setZone] = useState(initialStaff?.zone || ZONES[0]);
  const [team, setTeam] = useState(initialStaff?.team || TEAMS[0]);
  const [jobRole, setJobRole] = useState(initialStaff?.jobRole || "");
  const [hireDate, setHireDate] = useState(initialStaff?.hireDate || "");
  const [employeeId, setEmployeeId] = useState(initialStaff?.employeeId || "");
  const [photoUrl, setPhotoUrl] = useState(initialStaff?.photoUrl || "");
  const [emergencyContact, setEmergencyContact] = useState(initialStaff?.emergencyContact || "");
  const [emergencyRelationship, setEmergencyRelationship] = useState(initialStaff?.emergencyRelationship || "");
  const [leaveBalances, setLeaveBalances] = useState(initialStaff?.leaveBalances || { vacation: 0, sick: 0 });
  const [paymentProvider, setPaymentProvider] = useState(initialStaff?.paymentProvider || { provider: "", providerId: "", last4: "" });
  const [notes, setNotes] = useState(initialStaff?.notes || "");
  const [preferredShift, setPreferredShift] = useState(initialStaff?.preferredShift || "flexible");
  const [minWeeklyHours, setMinWeeklyHours] = useState(initialStaff?.minWeeklyHours ?? 0);
  const [maxWeeklyHours, setMaxWeeklyHours] = useState(initialStaff?.maxWeeklyHours ?? 40);
  const [availabilityExceptions, setAvailabilityExceptions] = useState(initialStaff?.availabilityExceptions || []);
  const [employmentType, setEmploymentType] = useState(initialStaff?.employmentType || "full-time");
  const [address, setAddress] = useState(initialStaff?.address || "");
  const [skills, setSkills] = useState((initialStaff?.skills || []).join(", "));
  const [certifications, setCertifications] = useState((initialStaff?.certifications || []).map((item) => typeof item === "string" ? item : `${item.name || ""}${item.expiry ? ` (${item.expiry})` : ""}`).join(", "));
  const [assignedLocation, setAssignedLocation] = useState(initialStaff?.assignedLocation || "");
  const [lastWorkingDate, setLastWorkingDate] = useState(initialStaff?.lastWorkingDate || "");
  const [terminationDate, setTerminationDate] = useState(initialStaff?.terminationDate || "");
  const [rehireDate, setRehireDate] = useState(initialStaff?.rehireDate || "");
  const [compensationRate, setCompensationRate] = useState(initialStaff?.compensation?.rate || "");
  const [documents, setDocuments] = useState((initialStaff?.documents || []).map((item) => item.name || "").join(", "));
  const [availability, setAvailability] = useState(() => initialStaff?.availability || DAY_LABELS.reduce((days, day) => {
    days[day] = true;
    return days;
  }, {}));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!name.trim()) {
      setError("Full name is required");
      return;
    }
    if (!phone.trim()) {
      setError("Phone number is required");
      return;
    }
    if (pin.trim() && !/^\d{4}$/.test(pin.trim())) {
      setError("PIN must be exactly 4 digits");
      return;
    }
    const availabilityValidation = typeof validateAvailability === "function"
      ? validateAvailability({ preferredShift, minWeeklyHours, maxWeeklyHours, exceptions: availabilityExceptions })
      : { valid: true };
    if (!availabilityValidation.valid) {
      setError(availabilityValidation.error);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm({
        name, role, phone, email, pin, zone, team, jobRole, hireDate, employeeId, photoUrl, emergencyContact,
        emergencyRelationship, leaveBalances, paymentProvider, notes, availability,
        preferredShift, minWeeklyHours, maxWeeklyHours, availabilityExceptions,
        employmentType, address, skills: skills.split(",").map((item) => item.trim()).filter(Boolean),
        certifications: certifications.split(",").map((item) => item.trim()).filter(Boolean),
        assignedLocation, lastWorkingDate, terminationDate, rehireDate,
        compensation: { type: "hourly", rate: Number(compensationRate) || 0 },
        documents: documents.split(",").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, type: "metadata" })),
      });
    } catch (err) {
      setError(`Failed to ${isEdit ? "update" : "add"} staff: ` + err.message);
      setSaving(false);
    }
  };

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>{isEdit ? "Edit Staff Profile" : "Add Staff"}</h3>
          <button className="sm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sm-modal-body">
          {error && <div className="sm-error">{error}</div>}
          <div className="sm-form-group">
            <label>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Ravi Kumar" />
          </div>
          <div className="sm-form-group">
            <label>Access Level</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="sm-form-row">
            <div className="sm-form-group">
              <label>Zone</label>
              <select value={zone} onChange={(e) => setZone(e.target.value)}>
                {ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm-form-group">
              <label>Team</label>
              <select value={team} onChange={(e) => setTeam(e.target.value)}>
                {TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="sm-form-group">
            <label>Job Role <span className="sm-optional">(optional)</span></label>
            <input value={jobRole} onChange={(e) => setJobRole(e.target.value)} placeholder="e.g. Sous Chef" />
          </div>
          <div className="sm-form-group">
            <label>Phone</label>
            <input
              type="tel"
              maxLength={20}
              value={phone}
              onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
              placeholder="e.g. +1 (555) 123-4567"
            />
          </div>
          <div className="sm-form-group">
            <label>Email <span className="sm-optional">(optional)</span></label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. ravi@example.com" />
          </div>
          <div className="sm-form-group">
            <label>Login PIN <span className="sm-optional">(auto-generated if blank)</span></label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={isEdit ? "Leave blank to keep current PIN" : "4-digit PIN"}
            />
          </div>
          <div className="sm-form-row">
            <div className="sm-form-group">
              <label htmlFor="staff-hire-date">Hire date <span className="sm-optional">(optional)</span></label>
              <input id="staff-hire-date" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            </div>
            <div className="sm-form-group">
              <label htmlFor="staff-employee-id">Employee ID</label>
              <input id="staff-employee-id" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
            </div>
          </div>
          <div className="sm-form-group">
            <label htmlFor="staff-photo-url">Photo URL <span className="sm-optional">(metadata only)</span></label>
            <input id="staff-photo-url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
          </div>
          <div className="sm-form-row">
            <div className="sm-form-group">
              <label htmlFor="staff-emergency-contact">Emergency contact <span className="sm-optional">(optional)</span></label>
              <input id="staff-emergency-contact" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} />
            </div>
            <div className="sm-form-group">
              <label htmlFor="staff-emergency-relationship">Emergency relationship</label>
              <input id="staff-emergency-relationship" value={emergencyRelationship} onChange={(e) => setEmergencyRelationship(e.target.value)} />
            </div>
          </div>
          <div className="sm-form-row">
            <div className="sm-form-group"><label htmlFor="staff-vacation-balance">Vacation leave balance</label><input id="staff-vacation-balance" type="number" min="0" value={leaveBalances.vacation ?? 0} onChange={(e) => setLeaveBalances({ ...leaveBalances, vacation: Number(e.target.value) || 0 })} /></div>
            <div className="sm-form-group"><label htmlFor="staff-sick-balance">Sick leave balance</label><input id="staff-sick-balance" type="number" min="0" value={leaveBalances.sick ?? 0} onChange={(e) => setLeaveBalances({ ...leaveBalances, sick: Number(e.target.value) || 0 })} /></div>
          </div>
          <div className="sm-form-row">
            <div className="sm-form-group"><label htmlFor="staff-payment-provider">Payment provider</label><input id="staff-payment-provider" value={paymentProvider.provider || ""} onChange={(e) => setPaymentProvider({ ...paymentProvider, provider: e.target.value })} placeholder="Provider name" /></div>
            <div className="sm-form-group"><label htmlFor="staff-payment-provider-id">Provider ID</label><input id="staff-payment-provider-id" value={paymentProvider.providerId || ""} onChange={(e) => setPaymentProvider({ ...paymentProvider, providerId: e.target.value })} /></div>
            <div className="sm-form-group"><label htmlFor="staff-payment-last4">Account last 4</label><input id="staff-payment-last4" maxLength={4} value={paymentProvider.last4 || ""} onChange={(e) => setPaymentProvider({ ...paymentProvider, last4: e.target.value.replace(/\D/g, "").slice(-4) })} /></div>
          </div>
          <div className="sm-form-group">
            <label>Profile notes <span className="sm-optional">(optional)</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="sm-form-row">
            <div className="sm-form-group"><label htmlFor="employment-type">Employment type</label><select id="employment-type" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contractor">Contractor</option><option value="seasonal">Seasonal</option></select></div>
            <div className="sm-form-group"><label htmlFor="assigned-location">Assigned location</label><input id="assigned-location" value={assignedLocation} onChange={(e) => setAssignedLocation(e.target.value)} placeholder="Location / branch" /></div>
          </div>
          <div className="sm-form-group"><label htmlFor="staff-address">Address</label><input id="staff-address" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div className="sm-form-row">
            <div className="sm-form-group"><label htmlFor="staff-skills">Skills</label><input id="staff-skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="comma separated" /></div>
            <div className="sm-form-group"><label htmlFor="staff-certs">Certifications &amp; expiry</label><input id="staff-certs" value={certifications} onChange={(e) => setCertifications(e.target.value)} placeholder="Food safety (YYYY-MM-DD)" /></div>
          </div>
          <div className="sm-form-row">
            <div className="sm-form-group"><label htmlFor="last-working-date">Last working date</label><input id="last-working-date" type="date" value={lastWorkingDate} onChange={(e) => setLastWorkingDate(e.target.value)} /></div>
            <div className="sm-form-group"><label htmlFor="termination-date">Termination date</label><input id="termination-date" type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} /></div>
            <div className="sm-form-group"><label htmlFor="rehire-date">Rehire date</label><input id="rehire-date" type="date" value={rehireDate} onChange={(e) => setRehireDate(e.target.value)} /></div>
          </div>
          <div className="sm-form-group"><label htmlFor="compensation-rate">Hourly compensation rate</label><input id="compensation-rate" type="number" min="0" step="0.01" value={compensationRate} onChange={(e) => setCompensationRate(e.target.value)} /></div>
          <div className="sm-form-group"><label htmlFor="staff-documents">Document metadata</label><input id="staff-documents" value={documents} onChange={(e) => setDocuments(e.target.value)} placeholder="ID proof, contract (comma separated)" /></div>
          <div className="sm-form-group">
            <label>Regular availability</label>
            <div className="sm-availability-list">
              {DAY_LABELS.map((day) => (
                <label key={day} className="sm-availability-day">
                  <input
                    type="checkbox"
                    checked={availability[day] !== false}
                    onChange={(e) => setAvailability((current) => ({ ...current, [day]: e.target.checked }))}
                  />
                  {day}
                </label>
              ))}
            </div>
          </div>
          <div className="sm-form-row">
            <div className="sm-form-group">
              <label htmlFor="preferred-shift">Preferred shift</label>
              <select id="preferred-shift" value={preferredShift} onChange={(e) => setPreferredShift(e.target.value)}>
                <option value="flexible">Flexible</option><option value="morning">Morning</option><option value="evening">Evening</option><option value="night">Night</option>
              </select>
            </div>
            <div className="sm-form-group">
              <label htmlFor="min-hours">Min weekly hours</label>
              <input id="min-hours" type="number" min="0" max="168" value={minWeeklyHours} onChange={(e) => setMinWeeklyHours(e.target.value)} />
            </div>
            <div className="sm-form-group">
              <label htmlFor="max-hours">Max weekly hours</label>
              <input id="max-hours" type="number" min="0" max="168" value={maxWeeklyHours} onChange={(e) => setMaxWeeklyHours(e.target.value)} />
            </div>
          </div>
          <div className="sm-form-group">
            <label htmlFor="availability-exception">Temporary availability exception</label>
            <input id="availability-exception" type="date" onChange={(e) => {
              if (e.target.value) setAvailabilityExceptions((current) => [...current, { date: e.target.value, type: "unavailable" }]);
            }} />
            {availabilityExceptions.map((item) => <span className="sm-tag sm-tag-zone" key={`${item.date}-${item.type}`}>{item.date} unavailable</span>)}
          </div>
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="sm-btn sm-btn-gold" onClick={handleConfirm} disabled={saving}>
            {saving ? (isEdit ? "Saving…" : "Adding…") : isEdit ? "Save changes" : "Add member"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Pause / Restore confirm ======================= */
function ConfirmModal({ title, body, confirmLabel, danger, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const handleConfirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError("Failed: " + err.message);
      setBusy(false);
    }
  };
  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal sm-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>{title}</h3>
          <button className="sm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sm-modal-body">
          {error && <div className="sm-error">{error}</div>}
          <p>{body}</p>
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={`sm-btn ${danger ? "sm-btn-danger" : "sm-btn-gold"}`} onClick={handleConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Reset PIN result modal ======================= */
function ResetPinModal({ staff, newPin, onClose }) {
  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal sm-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>PIN Reset</h3>
          <button className="sm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sm-modal-body">
          <p>
            New login PIN for <strong>{staff.name}</strong>:
          </p>
          <div className="sm-pin-reveal">{newPin}</div>
          <p className="sm-hint">Share this PIN with the staff member directly.</p>
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-gold" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Tab 1: Staff & Roles ======================= */
function StaffTab({ staffList }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [revealedPins, setRevealedPins] = useState({});
  const [confirmTarget, setConfirmTarget] = useState(null); // { staff, mode: "pause"|"restore" }
  const [resetResult, setResetResult] = useState(null);
  const [editStaff, setEditStaff] = useState(null);
  const permissions = getStaffPermissions();

  const filtered = useMemo(() => {
    let list = staffList;
    if (roleFilter !== "all") list = list.filter((s) => s.role === roleFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) => (s.name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [staffList, roleFilter, search]);

  const togglePinReveal = (id) => setRevealedPins((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="sm-panel">
      <div className="sm-toolbar">
        <div className="sm-search">
          <Search size={15} className="sm-search-icon" />
          <input placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="sm-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <div className="sm-spacer" />
        {permissions.manageStaff && <button className="sm-btn sm-btn-gold" onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Add Staff
        </button>}
      </div>

      <div className="sm-table">
        <div className="sm-thead">
          <span>Employee</span>
          <span>Role &amp; Access</span>
          <span>Contact</span>
          <span>Login PIN</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {filtered.length === 0 ? (
          <div className="sm-state-msg">No staff match this view.</div>
        ) : (
          filtered.map((s) => {
            const meta = ROLE_META[s.role] || ROLE_META.Floor;
            const revealed = !!revealedPins[s.id];
            return (
              <div className="sm-trow" key={s.id}>
                <span className="sm-cell-employee">
                  <span className="sm-avatar">{(s.name || "?").trim().charAt(0).toUpperCase()}</span>
                  <span>
                    <span className="sm-emp-name">{s.name}</span>
                    <span className="sm-emp-email">{s.email || "No email on file"}</span>
                    {(s.zone || s.team || s.jobRole) && (
                      <span className="sm-emp-tags">
                        {s.zone && <span className="sm-tag sm-tag-zone">{s.zone}</span>}
                        {s.team && <span className="sm-tag sm-tag-team">{s.team}</span>}
                        {s.jobRole && <span className="sm-tag sm-tag-jobrole">{s.jobRole}</span>}
                      </span>
                    )}
                  </span>
                </span>
                <span>
                  <span className={`sm-rolebadge sm-rolebadge-${meta.key}`}>{meta.label}</span>
                </span>
                <span className="sm-cell-contact">{s.phone || "—"}</span>
                <span className="sm-cell-pin">
                  <span className="sm-pin-value">{revealed ? "Set securely" : "••••"}</span>
                  <button className="sm-icon-btn sm-icon-btn-inline" aria-label="PIN is hidden" onClick={() => togglePinReveal(s.id)}>
                    {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </span>
                <span>
                  <span className={`sm-status-dot sm-status-dot-${s.status}`} />
                  {s.status === "active" ? "Active" : "Inactive"}
                </span>
                <span className="sm-cell-actions">
                  {permissions.manageStaff && <button
                    className="sm-btn sm-btn-ghost sm-btn-xs"
                    onClick={() => setEditStaff(s)}
                  >
                    Edit
                  </button>}
                  {permissions.manageStaff && <button
                    className="sm-btn sm-btn-ghost sm-btn-xs"
                    onClick={async () => {
                      try {
                        const newPin = await resetStaffPin(s.id);
                        setResetResult({ staff: s, newPin });
                      } catch (err) {
                        alert("Failed to reset PIN: " + err.message);
                      }
                    }}
                  >
                    Reset PIN
                  </button>}
                  {permissions.manageStaff && (s.status === "active" ? (
                    <button
                      className="sm-btn sm-btn-danger sm-btn-xs"
                      onClick={() => setConfirmTarget({ staff: s, mode: "pause" })}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      className="sm-btn sm-btn-gold sm-btn-xs"
                      onClick={() => setConfirmTarget({ staff: s, mode: "restore" })}
                    >
                      Reactivate
                    </button>
                  ))}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="sm-access-note">
        <div className="sm-access-note-title">What each role can access</div>
        <div className="sm-access-grid">
          <div>
            <span className="sm-rolebadge sm-rolebadge-admin">Admin</span>
            <p>Full access, including staff management and PIN resets.</p>
          </div>
          <div>
            <span className="sm-rolebadge sm-rolebadge-gm">General Manager</span>
            <p>All operations and finance — cannot edit staff PINs.</p>
          </div>
          <div>
            <span className="sm-rolebadge sm-rolebadge-kitchen">Kitchen</span>
            <p>Orders board and inventory view only.</p>
          </div>
          <div>
            <span className="sm-rolebadge sm-rolebadge-floor">Floor</span>
            <p>Orders, tables, and manual order entry.</p>
          </div>
        </div>
      </div>

      {showAdd && (
        <StaffFormModal
          onClose={() => setShowAdd(false)}
          onConfirm={async (profile) => {
            await addStaff(profile);
            setShowAdd(false);
          }}
        />
      )}
      {editStaff && (
        <StaffFormModal
          initialStaff={editStaff}
          onClose={() => setEditStaff(null)}
          onConfirm={async (profile) => {
            await updateStaff(editStaff.id, profile);
            setEditStaff(null);
          }}
        />
      )}

      {confirmTarget && confirmTarget.mode === "pause" && (
        <ConfirmModal
          title="Deactivate Staff Member"
          body={`Deactivate ${confirmTarget.staff.name}? Their profile and history will be retained, but their PIN will stop working.`}
          confirmLabel="Deactivate"
          danger
          onClose={() => setConfirmTarget(null)}
          onConfirm={async () => {
            await pauseStaff(confirmTarget.staff.id);
            setConfirmTarget(null);
          }}
        />
      )}
      {confirmTarget && confirmTarget.mode === "restore" && (
        <ConfirmModal
          title="Reactivate Staff Member"
          body={`Reactivate ${confirmTarget.staff.name} and allow their PIN to be used again?`}
          confirmLabel="Reactivate"
          onClose={() => setConfirmTarget(null)}
          onConfirm={async () => {
            await restoreStaff(confirmTarget.staff.id);
            setConfirmTarget(null);
          }}
        />
      )}
      {resetResult && (
        <ResetPinModal staff={resetResult.staff} newPin={resetResult.newPin} onClose={() => setResetResult(null)} />
      )}
    </div>
  );
}

/* ======================= Shift editor modal ======================= */
function ShiftEditorModal({ staff, dayLabel, dayIndex, current, unavailable, onClose, onSave }) {
  const [type, setType] = useState(current?.type || "morning");
  const [start, setStart] = useState(current?.start || "09:00");
  const [end, setEnd] = useState(current?.end || "17:00");
  const [isOff, setIsOff] = useState(!current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!isOff && unavailable) {
      setError("This staff member has approved time off on this date.");
      return;
    }
    if (!isOff) {
      const validation = typeof validateShift === "function"
        ? validateShift({ type, start, end })
        : { valid: Boolean(type && start && end), error: "Complete the shift details." };
      if (!validation.valid) {
        setError(validation.error);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      await onSave(dayIndex, isOff ? null : { type, start, end });
      onClose();
    } catch (err) {
      setError(err.message || "Could not save this shift.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal sm-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>
            {staff.name} · {dayLabel}
          </h3>
          <button className="sm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sm-modal-body">
          {error && <div className="sm-error">{error}</div>}
          {unavailable && !isOff && <div className="sm-error">Approved time off makes this date unavailable.</div>}
          <div className="sm-form-group">
            <label>
              <input type="checkbox" checked={isOff} onChange={(e) => setIsOff(e.target.checked)} /> Off this day
            </label>
          </div>
          {!isOff && (
            <>
              <div className="sm-form-group">
                <label>Shift type</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                  <option value="night">Night</option>
                </select>
              </div>
              <div className="sm-form-row">
                <div className="sm-form-group">
                  <label>Start</label>
                  <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="sm-form-group">
                  <label>End</label>
                  <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="sm-btn sm-btn-gold" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Log request modal ======================= */
function LogRequestModal({ staffList, kind, onClose, onConfirm }) {
  const [staffId, setStaffId] = useState(staffList[0]?.id || "");
  const [withStaffId, setWithStaffId] = useState(staffList[1]?.id || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!staffId) {
      setError("Select a staff member");
      return;
    }
    if (!startDate) {
      setError(kind === "timeoff" ? "Start date is required" : "Swap date is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm({ staffId, withStaffId, startDate, endDate, reason });
      onClose();
    } catch (err) {
      setError("Failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal sm-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>Log {kind === "timeoff" ? "Time-off" : "Shift-swap"} Request</h3>
          <button className="sm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sm-modal-body">
          {error && <div className="sm-error">{error}</div>}
          <div className="sm-form-group">
            <label>Staff member</label>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {kind === "swap" && (
            <div className="sm-form-group">
              <label>Swap with</label>
              <select value={withStaffId} onChange={(e) => setWithStaffId(e.target.value)}>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="sm-form-row">
            <div className="sm-form-group">
              <label>{kind === "timeoff" ? "Start date" : "Date"}</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            {kind === "timeoff" && (
              <div className="sm-form-group">
                <label>End date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            )}
          </div>
          <div className="sm-form-group">
            <label>Reason</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional note" />
          </div>
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="sm-btn sm-btn-gold" onClick={handleConfirm} disabled={saving}>
            {saving ? "Saving…" : "Log request"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Tab 2: Schedule & Roster ======================= */
function RosterTab({ staffList }) {
  const permissions = getStaffPermissions();
  const [weekKey, setWeekKey] = useState(weekKeyFor());
  const [rosterMap, setRosterMap] = useState(new Map());
  const [timeOffList, setTimeOffList] = useState([]);
  const [swapList, setSwapList] = useState([]);
  const [editCell, setEditCell] = useState(null); // { staff, dayIndex }
  const [logKind, setLogKind] = useState(null); // "timeoff" | "swap"
  const [published, setPublished] = useState(false);

  useEffect(() => {
    const unsub = subscribeRoster(weekKey, setRosterMap);
    setPublished(false);
    return () => unsub();
  }, [weekKey]);

  useEffect(() => {
    const unsub = subscribeTimeOffRequests(setTimeOffList);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeSwapRequests(setSwapList);
    return () => unsub();
  }, []);

  const pendingTimeOff = timeOffList.filter((r) => r.status === "pending");
  const pendingSwaps = swapList.filter((r) => r.status === "pending");
  const requestHistory = [...timeOffList, ...swapList]
    .filter((r) => r.status !== "pending")
    .sort((a, b) => String(b.decidedAt || b.createdAt || "").localeCompare(String(a.decidedAt || a.createdAt || "")));

  return (
    <div className="sm-panel">
      <div className="sm-toolbar">
        <button className="sm-icon-btn sm-week-nav" onClick={() => setWeekKey((k) => shiftWeekKey(k, -1))}>
          <ArrowLeft size={16} />
        </button>
        <span className="sm-week-label">{fmtWeekLabel(weekKey)}</span>
        <button className="sm-icon-btn sm-week-nav" onClick={() => setWeekKey((k) => shiftWeekKey(k, 1))}>
          <ArrowRight size={16} />
        </button>
        <div className="sm-spacer" />
        {permissions.editRoster && <button className="sm-btn sm-btn-ghost" onClick={() => setLogKind("timeoff")}>
          Log time-off
        </button>}
        {permissions.editRoster && <button className="sm-btn sm-btn-ghost" onClick={() => setLogKind("swap")}>
          Log swap
        </button>}
        {permissions.editRoster && <button className="sm-btn sm-btn-ghost" onClick={async () => {
          const name = window.prompt("Shift template name");
          if (name) await createShiftTemplate({ name, shifts: [{ type: "morning", start: "09:00", end: "17:00" }] });
        }}>Save template</button>}
        <button
          className="sm-btn sm-btn-gold"
          disabled={!permissions.editRoster}
          onClick={async () => {
            await publishRoster(weekKey);
            setPublished(true);
          }}
        >
          {published ? "Published ✓" : "Publish roster"}
        </button>
      </div>

      <div className="sm-legend">
        {Object.values(SHIFT_META).map((m) => (
          <span key={m.key} className="sm-legend-item">
            <span className={`sm-legend-dot sm-legend-dot-${m.key}`} /> {m.label}
          </span>
        ))}
        <span className="sm-legend-item">
          <span className="sm-legend-dot sm-legend-dot-off" /> Off
        </span>
      </div>

      <div className="sm-roster-scroll">
        <div className="sm-roster-grid" style={{ gridTemplateColumns: `160px repeat(7, 1fr)` }}>
          <div className="sm-roster-headcell sm-roster-corner">Staff</div>
          {DAY_LABELS.map((d) => (
            <div className="sm-roster-headcell" key={d}>
              {d}
            </div>
          ))}
          {staffList.map((s) => {
            const days = rosterMap.get(s.id) || Array(7).fill(null);
            return (
              <React.Fragment key={s.id}>
                <div className="sm-roster-namecell">
                  <span className="sm-avatar sm-avatar-sm">{(s.name || "?").charAt(0).toUpperCase()}</span>
                  {s.name}
                </div>
                {days.map((shift, i) => {
                  const meta = shift ? SHIFT_META[shift.type] : null;
                  return (
                    <div
                      className="sm-roster-cell"
                      key={i}
                      onClick={() => permissions.editRoster && setEditCell({ staff: s, dayIndex: i, current: shift })}
                    >
                      {shift ? (
                        <span className={`sm-shift-chip sm-shift-chip-${meta.key}`}>
                          {meta.label}
                          <small>
                            {shift.start}–{shift.end}
                          </small>
                        </span>
                      ) : (
                        <span className="sm-shift-off">Off</span>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="sm-requests-cols">
        <div className="sm-requests-col">
          <h4>Time-off requests</h4>
          {pendingTimeOff.length === 0 ? (
            <div className="sm-state-msg">No pending time-off requests.</div>
          ) : (
            pendingTimeOff.map((r) => (
              <div className="sm-request-card" key={r.id}>
                <div className="sm-request-who">{r.staffName}</div>
                <div className="sm-request-dates">
                  {r.startDate}
                  {r.endDate ? ` → ${r.endDate}` : ""}
                </div>
                {r.reason && <div className="sm-request-reason">{r.reason}</div>}
                {permissions.editRoster && <div className="sm-request-actions">
                    <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={() => decideTimeOffRequest(r.id, "approved")}>
                      Approve
                    </button>
                    <button className="sm-btn sm-btn-danger sm-btn-xs" onClick={() => decideTimeOffRequest(r.id, "denied")}>
                      Deny
                    </button>
                  </div>}
              </div>
            ))
          )}
        </div>
        <div className="sm-requests-col">
          <h4>Shift-swap requests</h4>
          {pendingSwaps.length === 0 ? (
            <div className="sm-state-msg">No pending swap requests.</div>
          ) : (
            pendingSwaps.map((r) => (
              <div className="sm-request-card" key={r.id}>
                <div className="sm-request-who">
                  {r.staffName} ↔ {r.withStaffName || "—"}
                </div>
                <div className="sm-request-dates">{r.date}</div>
                {r.reason && <div className="sm-request-reason">{r.reason}</div>}
                {permissions.editRoster && <div className="sm-request-actions">
                    <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={() => decideSwapRequest(r.id, "approved")}>
                      Approve
                    </button>
                    <button className="sm-btn sm-btn-danger sm-btn-xs" onClick={() => decideSwapRequest(r.id, "denied")}>
                      Deny
                    </button>
                  </div>}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="sm-request-history">
        <h4>Request history</h4>
        {requestHistory.length === 0 ? (
          <div className="sm-state-msg">No decided requests yet.</div>
        ) : (
          requestHistory.map((request) => (
            <div className="sm-request-history-row" key={`${request.id}-${request.status}`}>
              <span>{request.staffName || "Staff"}{request.withStaffName ? ` ↔ ${request.withStaffName}` : ""}</span>
              <span>{request.startDate || request.date}{request.endDate ? ` → ${request.endDate}` : ""}</span>
              <span className={`sm-request-status sm-request-status-${request.status}`}>{request.status}</span>
            </div>
          ))
        )}
      </div>

      {editCell && (
        <ShiftEditorModal
          staff={editCell.staff}
          dayLabel={DAY_LABELS[editCell.dayIndex]}
          dayIndex={editCell.dayIndex}
          current={editCell.current}
          unavailable={typeof isDateUnavailable === "function" && isDateUnavailable(
            dateKeyOf(datesForWeek(weekKey)[editCell.dayIndex]),
            editCell.staff,
            timeOffList,
          )}
          onClose={() => setEditCell(null)}
          onSave={(dayIndex, shift) => setShift(weekKey, editCell.staff.id, dayIndex, shift)}
        />
      )}

      {logKind && (
        <LogRequestModal
          staffList={staffList}
          kind={logKind}
          onClose={() => setLogKind(null)}
          onConfirm={async ({ staffId, withStaffId, startDate, endDate, reason }) => {
            const staff = staffList.find((s) => s.id === staffId);
            if (logKind === "timeoff") {
              await addTimeOffRequest({ staffId, staffName: staff?.name, startDate, endDate, reason });
            } else {
              const withStaff = staffList.find((s) => s.id === withStaffId);
              await addSwapRequest({
                staffId,
                staffName: staff?.name,
                withStaffId,
                withStaffName: withStaff?.name,
                date: startDate,
                reason,
              });
            }
          }}
        />
      )}
    </div>
  );
}

/* ======================= Tab 3: Attendance & Timecards ======================= */
const toDateTimeInput = (value) => {
  if (!value) return "";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function AttendanceCorrectionModal({ record, onClose, onSave }) {
  const [clockInAt, setClockInAt] = useState(toDateTimeInput(record.clockInAt));
  const [clockOutAt, setClockOutAt] = useState(toDateTimeInput(record.clockOutAt));
  const [breakMinutes, setBreakMinutes] = useState(String(record.breakMinutes || 0));
  const [correctionReason, setCorrectionReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave({ clockInAt, clockOutAt, breakMinutes, correctionReason });
      onClose();
    } catch (err) {
      setError(err.message || "Could not correct this timecard.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal sm-modal-small" onClick={(event) => event.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>Correct attendance · {record.staffName}</h3>
          <button className="sm-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sm-modal-body">
          {error && <div className="sm-error">{error}</div>}
          <div className="sm-form-group"><label>Clock in</label><input type="datetime-local" value={clockInAt} onChange={(e) => setClockInAt(e.target.value)} /></div>
          <div className="sm-form-group"><label>Clock out <span className="sm-optional">(optional)</span></label><input type="datetime-local" value={clockOutAt} onChange={(e) => setClockOutAt(e.target.value)} /></div>
          <div className="sm-form-group"><label>Break minutes</label><input type="number" min="0" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} /></div>
          <div className="sm-form-group"><label>Correction reason</label><textarea rows={3} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="Required for an audit trail" /></div>
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="sm-btn sm-btn-gold" onClick={save} disabled={saving || !correctionReason.trim()}>{saving ? "Saving…" : "Save correction"}</button>
        </div>
      </div>
    </div>
  );
}

function AttendanceTab({ staffList }) {
  const permissions = getStaffPermissions();
  const [pinDigits, setPinDigits] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [rangeStart, setRangeStart] = useState(() => dateKeyOf(new Date(Date.now() - 6 * 86400000)));
  const [rangeEnd, setRangeEnd] = useState(() => dateKeyOf(new Date()));
  const [rangeRecords, setRangeRecords] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  const loadReport = async () => {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return;
    setReportLoading(true);
    try {
      setRangeRecords(await getAttendanceForDateRange(rangeStart, rangeEnd));
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    const unsub = subscribeTodayAttendance(setAttendance);
    return () => unsub();
  }, []);

  const handleDigit = async (digit) => {
    if (pinDigits.length >= 4) return;
    const next = pinDigits + digit;
    setPinDigits(next);
    setPinError("");
    if (next.length === 4) {
      try {
        const { staff, action } = await punchPin(next);
        setPinMessage(`${staff.name} clocked ${action === "in" ? "IN" : "OUT"}`);
      } catch (err) {
        setPinError(err.message || "Invalid or inactive PIN");
      } finally {
        setPinDigits("");
        setTimeout(() => setPinMessage(""), 3000);
      }
    }
  };

  const clearPin = () => {
    setPinDigits("");
    setPinError("");
  };

  const summary = useMemo(() => {
    let onShift = 0;
    let onBreak = 0;
    let totalHours = 0;
    attendance.forEach((r) => {
      const status = attendanceStatus(r);
      if (status === "on-shift") onShift += 1;
      if (status === "on-break") onBreak += 1;
      totalHours += hoursOf(r);
    });
    return { onShift, onBreak, totalHours };
  }, [attendance]);

  const exportCsv = () => {
    const header = ["Employee", "Clock in", "Clock out", "Break (min)", "Hours", "Status"];
    const rows = attendance.map((r) => [
      r.staffName,
      fmtClock(r.clockInAt),
      fmtClock(r.clockOutAt),
      r.breakMinutes || 0,
      hoursOf(r).toFixed(2),
      attendanceStatus(r),
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <div className="sm-panel sm-att-panel">
      <div className="sm-att-left">
        <div className="sm-punch-card">
          <h4>Staff Punch Clock</h4>
          <div className="sm-pin-dots">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className={`sm-pin-dot ${i < pinDigits.length ? "filled" : ""}`} />
            ))}
          </div>
          {pinError && <div className="sm-error">{pinError}</div>}
          {pinMessage && <div className="sm-success">{pinMessage}</div>}
          <div className="sm-keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <button key={n} className="sm-key" onClick={() => handleDigit(n)}>
                {n}
              </button>
            ))}
            <button className="sm-key sm-key-fn" onClick={clearPin}>
              Clear
            </button>
            <button className="sm-key" onClick={() => handleDigit("0")}>
              0
            </button>
            <span className="sm-key sm-key-blank" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="sm-att-right">
        <div className="sm-summary-strip">
          <div className="sm-summary-card">
            <div className="sm-summary-n">{summary.onShift}</div>
            <div className="sm-summary-lbl">On shift</div>
          </div>
          <div className="sm-summary-card">
            <div className="sm-summary-n">{summary.onBreak}</div>
            <div className="sm-summary-lbl">On break</div>
          </div>
          <div className="sm-summary-card">
            <div className="sm-summary-n">{summary.totalHours.toFixed(1)}h</div>
            <div className="sm-summary-lbl">Total hours today</div>
          </div>
          <button className="sm-btn sm-btn-ghost sm-export-btn" onClick={exportCsv}>
            <Download size={14} /> Export CSV
          </button>
        </div>

        <div className="sm-table sm-att-table">
          <div className="sm-thead sm-thead-att">
            <span>Employee</span>
            <span>Clock in</span>
            <span>Clock out</span>
            <span>Break</span>
            <span>Hours</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {attendance.length === 0 ? (
            <div className="sm-state-msg">No punches recorded yet today.</div>
          ) : (
            attendance.map((r) => {
              const status = attendanceStatus(r);
              return (
                <div className="sm-trow sm-trow-att" key={r.id}>
                  <span className="sm-att-field">
                    <span className="sm-cell-label">Employee</span>
                    <span>{r.staffName}</span>
                  </span>
                  <span className="sm-att-field">
                    <span className="sm-cell-label">Clock in</span>
                    <span>{fmtClock(r.clockInAt)}</span>
                  </span>
                  <span className="sm-att-field">
                    <span className="sm-cell-label">Clock out</span>
                    <span>{fmtClock(r.clockOutAt)}</span>
                  </span>
                  <span className="sm-att-field">
                    <span className="sm-cell-label">Break</span>
                    <span>{r.breakMinutes || 0}m</span>
                  </span>
                  <span className="sm-att-field">
                    <span className="sm-cell-label">Hours</span>
                    <span>{hoursOf(r).toFixed(2)}</span>
                  </span>
                  <span className="sm-att-field">
                    <span className="sm-cell-label">Status</span>
                    <span className={`sm-att-status sm-att-status-${status}`}>
                      {status === "on-shift" && "On shift"}
                      {status === "on-break" && "On break"}
                      {status === "clocked-out" && "Clocked out"}
                      {status === "not-in" && "Not in"}
                    </span>
                  </span>
                  <span className="sm-cell-actions">
                    {permissions.correctAttendance && <button
                      className="sm-btn sm-btn-ghost sm-btn-xs"
                      onClick={() => setEditingRecord(r)}
                    >Correct</button>}
                    {status !== "clocked-out" && status !== "not-in" && (
                      <>
                        <button
                          className="sm-btn sm-btn-ghost sm-btn-xs"
                          disabled={busyId === r.id}
                          onClick={async () => {
                            setBusyId(r.id);
                            try {
                              await toggleBreak(r.id, r);
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          {r.onBreak ? "Resume" : "Break"}
                        </button>
                        <button
                          className="sm-btn sm-btn-danger sm-btn-xs"
                          disabled={busyId === r.id}
                          onClick={async () => {
                            setBusyId(r.id);
                            try {
                              await clockOutRecord(r.id, r);
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          Clock out
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
        <div className="sm-report-panel">
          <div className="sm-report-head">
            <h4>Attendance history &amp; report</h4>
            <div className="sm-form-row">
              <input aria-label="Report start date" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
              <input aria-label="Report end date" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
              <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={loadReport} disabled={reportLoading}>
                {reportLoading ? "Loading…" : "Load report"}
              </button>
            </div>
          </div>
          {rangeRecords.length > 0 && (
            <div className="sm-report-summary">
              {rangeRecords.length} timecard{rangeRecords.length === 1 ? "" : "s"} ·{" "}
              {rangeRecords.reduce((total, record) => total + hoursOf(record), 0).toFixed(2)} total hours
            </div>
          )}
          {rangeRecords.map((record) => (
            <div className="sm-report-row" key={record.id}>
              <span>{record.dateKey} · {record.staffName}</span>
              <span>{hoursOf(record).toFixed(2)}h</span>
              {permissions.correctAttendance && <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setEditingRecord(record)}>Correct</button>}
            </div>
          ))}
          {!reportLoading && rangeRecords.length === 0 && <div className="sm-state-msg">Choose a date range to view timecards.</div>}
        </div>
      </div>
    </div>
    {editingRecord && (
      <AttendanceCorrectionModal
        record={editingRecord}
        onClose={() => setEditingRecord(null)}
        onSave={(correction) => updateAttendanceRecord(editingRecord.id, correction)}
      />
    )}
    </>
  );
}

/* ======================= Day attendance modal (Calendar tab) ======================= */
function DayAttendanceModal({ dateLabel, records, onClose }) {
  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal sm-modal-cal-day" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>Attendance · {dateLabel}</h3>
          <button className="sm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sm-modal-body">
          {records.length === 0 ? (
            <div className="sm-state-msg">No attendance recorded for this day.</div>
          ) : (
            <div className="sm-table sm-cal-day-table">
              <div className="sm-thead sm-thead-caldot">
                <span>Employee</span>
                <span>Clock in</span>
                <span>Clock out</span>
                <span>Break</span>
                <span>Hours</span>
                <span>Status</span>
              </div>
              {records.map((r) => {
                const status = attendanceStatus(r);
                return (
                  <div className="sm-trow sm-trow-caldot" key={r.id}>
                    <span className="sm-att-field">
                      <span className="sm-cell-label">Employee</span>
                      <span>{r.staffName}</span>
                    </span>
                    <span className="sm-att-field">
                      <span className="sm-cell-label">Clock in</span>
                      <span>{fmtClock(r.clockInAt)}</span>
                    </span>
                    <span className="sm-att-field">
                      <span className="sm-cell-label">Clock out</span>
                      <span>{fmtClock(r.clockOutAt)}</span>
                    </span>
                    <span className="sm-att-field">
                      <span className="sm-cell-label">Break</span>
                      <span>{r.breakMinutes || 0}m</span>
                    </span>
                    <span className="sm-att-field">
                      <span className="sm-cell-label">Hours</span>
                      <span>{hoursOf(r).toFixed(2)}</span>
                    </span>
                    <span className="sm-att-field">
                      <span className="sm-cell-label">Status</span>
                      <span className={`sm-att-status sm-att-status-${status}`}>
                        {status === "on-shift" && "On shift"}
                        {status === "on-break" && "On break"}
                        {status === "clocked-out" && "Clocked out"}
                        {status === "not-in" && "Not in"}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-gold" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** yyyy-mm-dd for a Date, local time — matches staffService's dateKey format. */
const dateKeyOf = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function StaffOperationsTab({ staffList, mode }) {
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === "audit" && typeof subscribeStaffAuditLog === "function") {
      return subscribeStaffAuditLog(setRows);
    }
    if (mode === "notifications" && typeof subscribeStaffNotifications === "function") {
      return subscribeStaffNotifications(setRows);
    }
    return undefined;
  }, [mode]);

  if (mode === "payroll") {
    // Payroll now has its own dedicated page (period controls, summary tiles,
    // per-staff table, and a drill-down per run) instead of living in this
    // tab — see routes.staffPayroll.
    return (
      <div className="sm-panel">
        <h3>Payroll &amp; compensation</h3>
        <div className="sm-state-msg">Payroll now has its own page with pay-period controls, summary totals, and per-staff breakdowns.</div>
        <button className="sm-btn sm-btn-gold" onClick={() => navigate(routes.staffPayroll)}>
          Open payroll
        </button>
      </div>
    );
  }

  return (
    <div className="sm-panel">
      <h3>{mode === "audit" ? "Audit history" : "Staff notifications"}</h3>
      {rows.length === 0 && <div className="sm-state-msg">No records yet.</div>}
      {rows.map((row) => (
        <div className="sm-request-history-row" key={row.id}>
          <span>{mode === "audit" ? `${row.action} · ${row.actor || "system"}` : row.message}</span>
          <span>
            {row.createdAt?.toDate ? row.createdAt.toDate().toLocaleString() : "Recent"}
            {mode === "notifications" && !row.read && (
              <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => markStaffNotificationRead?.(row.id)}>
                Mark read
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ======================= Tab 4: Calendar ======================= */
function CalendarTab() {
  // `monthAnchor` is always the 1st of the displayed month.
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [attendanceByDay, setAttendanceByDay] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null); // { dateKey, dateLabel }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const startOfMonth = new Date(monthAnchor);
    const endOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
    const startKey = dateKeyOf(startOfMonth);
    const endKey = dateKeyOf(endOfMonth);
    getAttendanceForDateRange(startKey, endKey).then((records) => {
      if (cancelled) return;
      const map = new Map();
      records.forEach((r) => {
        const list = map.get(r.dateKey) || [];
        list.push(r);
        map.set(r.dateKey, list);
      });
      setAttendanceByDay(map);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [monthAnchor]);

  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Build a Mon..Sun grid of cells covering the full month, padded with
  // leading/trailing days from adjacent months so every week row is full.
  const gridDays = useMemo(() => {
    const firstOfMonth = new Date(monthAnchor);
    const firstDow = firstOfMonth.getDay(); // 0 = Sun .. 6 = Sat
    const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1; // days before Monday
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - leadingBlanks);

    const lastOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
    const lastDow = lastOfMonth.getDay();
    const trailingBlanks = lastDow === 0 ? 0 : 7 - lastDow;
    const gridEnd = new Date(lastOfMonth);
    gridEnd.setDate(gridEnd.getDate() + trailingBlanks);

    const days = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      days.push({
        date: new Date(cursor),
        inMonth: cursor.getMonth() === monthAnchor.getMonth(),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return days;
  }, [monthAnchor]);

  const todayStr = dateKeyOf(new Date());

  return (
    <div className="sm-panel">
      <div className="sm-toolbar">
        <button className="sm-icon-btn sm-week-nav" onClick={() => setMonthAnchor((d) => {
          const next = new Date(d);
          next.setMonth(next.getMonth() - 1);
          return next;
        })}>
          <ArrowLeft size={16} />
        </button>
        <span className="sm-week-label">{monthLabel}</span>
        <button className="sm-icon-btn sm-week-nav" onClick={() => setMonthAnchor((d) => {
          const next = new Date(d);
          next.setMonth(next.getMonth() + 1);
          return next;
        })}>
          <ArrowRight size={16} />
        </button>
        <div className="sm-spacer" />
        {loading && <span className="sm-hint">Loading…</span>}
      </div>

      <div className="sm-cal-grid">
        {DAY_LABELS.map((d) => (
          <div className="sm-cal-headcell" key={d}>
            {d}
          </div>
        ))}
        {gridDays.map(({ date, inMonth }) => {
          const dateKey = dateKeyOf(date);
          const records = attendanceByDay.get(dateKey) || [];
          const clockedInCount = new Set(
            records.filter((r) => r.clockInAt).map((r) => r.staffId),
          ).size;
          const isToday = dateKey === todayStr;
          return (
            <div
              key={dateKey}
              className={`sm-cal-cell ${inMonth ? "" : "sm-cal-cell-out"} ${isToday ? "sm-cal-cell-today" : ""}`}
              onClick={() =>
                setSelectedDay({
                  dateKey,
                  dateLabel: date.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }),
                })
              }
            >
              <span className="sm-cal-daynum">{date.getDate()}</span>
              {clockedInCount > 0 && <span className="sm-cal-badge">{clockedInCount} in</span>}
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <DayAttendanceModal
          dateLabel={selectedDay.dateLabel}
          records={attendanceByDay.get(selectedDay.dateKey) || []}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

/* ======================= Main page ======================= */
function StaffManagement() {
  const navigate = useNavigate();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("staff");

  useEffect(() => {
    const unsub = subscribeStaff((list) => {
      setStaffList(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const [attendanceForStats, setAttendanceForStats] = useState([]);
  useEffect(() => {
    const unsub = subscribeTodayAttendance(setAttendanceForStats);
    return () => unsub();
  }, []);

  const [timeOffForStats, setTimeOffForStats] = useState([]);
  useEffect(() => {
    const unsub = subscribeTimeOffRequests(setTimeOffForStats);
    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    const onShift = attendanceForStats.filter((r) => attendanceStatus(r) === "on-shift").length;
    const onBreak = attendanceForStats.filter((r) => attendanceStatus(r) === "on-break").length;
    const pendingTimeOff = timeOffForStats.filter((r) => r.status === "pending").length;
    return { total: staffList.length, onShift, onBreak, pendingTimeOff };
  }, [staffList, attendanceForStats, timeOffForStats]);

  return (
    <div className="staff-mgmt-page">
      <div className="sm-pagehead">
        <div>
          <h1 className="sm-page-h1">Staff Management</h1>
          <div className="sm-page-sub">Staff directory, roster, and live attendance — backed by Firestore</div>
        </div>
        <button
          className="sm-back-btn"
          onClick={() => {
            sessionStorage.removeItem("staffAuth");
            sessionStorage.removeItem("staffRole");
            navigate(routes.dashboard, { replace: true });
          }}
        >
          <ChevronLeft size={16} /> Back to Dashboard
        </button>
      </div>

      <div className="sm-stats">
        <div className="sm-statc">
          <div className="sm-statc-n">{stats.total}</div>
          <div className="sm-statc-lbl">Total Staff</div>
        </div>
        <div className="sm-statc">
          <div className="sm-statc-n sm-statc-n-shift">{stats.onShift}</div>
          <div className="sm-statc-lbl">On Shift Now</div>
        </div>
        <div className="sm-statc">
          <div className="sm-statc-n sm-statc-n-break">{stats.onBreak}</div>
          <div className="sm-statc-lbl">On Break</div>
        </div>
        <div className="sm-statc">
          <div className="sm-statc-n sm-statc-n-pending">{stats.pendingTimeOff}</div>
          <div className="sm-statc-lbl">Time-off Pending</div>
        </div>
      </div>

      <div className="sm-tabs">
        <button className={`sm-tab ${tab === "staff" ? "on" : ""}`} onClick={() => setTab("staff")}>
          Staff &amp; Roles
        </button>
        <button className={`sm-tab ${tab === "roster" ? "on" : ""}`} onClick={() => setTab("roster")}>
          Schedule &amp; Roster
        </button>
        <button className={`sm-tab ${tab === "att" ? "on" : ""}`} onClick={() => setTab("att")}>
          Attendance &amp; Timecards
        </button>
        <button className={`sm-tab ${tab === "calendar" ? "on" : ""}`} onClick={() => setTab("calendar")}>
          <CalendarIcon size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Calendar
        </button>
        <button className={`sm-tab ${tab === "audit" ? "on" : ""}`} onClick={() => setTab("audit")}>Audit history</button>
        <button className={`sm-tab ${tab === "notifications" ? "on" : ""}`} onClick={() => setTab("notifications")}>Notifications</button>
        <button className={`sm-tab ${tab === "payroll" ? "on" : ""}`} onClick={() => setTab("payroll")}>Payroll</button>
      </div>

      {loading ? (
        <div className="sm-state-msg">Loading staff…</div>
      ) : (
        <>
          {tab === "staff" && <StaffTab staffList={staffList} />}
          {tab === "roster" && <RosterTab staffList={staffList} />}
          {tab === "att" && <AttendanceTab staffList={staffList} />}
          {tab === "calendar" && <CalendarTab />}
          {tab === "audit" && <StaffOperationsTab staffList={staffList} mode="audit" />}
          {tab === "notifications" && <StaffOperationsTab staffList={staffList} mode="notifications" />}
          {tab === "payroll" && <StaffOperationsTab staffList={staffList} mode="payroll" />}
        </>
      )}
    </div>
  );
}

export default StaffManagement;
