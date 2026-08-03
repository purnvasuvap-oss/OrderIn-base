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
} from "lucide-react";
import routes from "../routes";
import "./StaffManagement.css";
import {
  ROLES,
  DAY_LABELS,
  subscribeStaff,
  addStaff,
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
} from "../services/staffService";

const ROLE_META = {
  Admin: { key: "admin", label: "Admin" },
  "General Manager": { key: "gm", label: "General Manager" },
  Kitchen: { key: "kitchen", label: "Kitchen" },
  Floor: { key: "floor", label: "Floor" },
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
function StaffFormModal({ onClose, onConfirm }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Floor");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
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
    setSaving(true);
    setError("");
    try {
      await onConfirm({ name, role, phone, email, pin });
    } catch (err) {
      setError("Failed to add staff: " + err.message);
      setSaving(false);
    }
  };

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-head">
          <h3>Add Staff</h3>
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
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="sm-form-group">
            <label>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 98765 43210" />
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
              placeholder="4-digit PIN"
            />
          </div>
        </div>
        <div className="sm-modal-foot">
          <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="sm-btn sm-btn-gold" onClick={handleConfirm} disabled={saving}>
            {saving ? "Adding…" : "Add member"}
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
        <button className="sm-btn sm-btn-gold" onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Add Staff
        </button>
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
                  </span>
                </span>
                <span>
                  <span className={`sm-rolebadge sm-rolebadge-${meta.key}`}>{meta.label}</span>
                </span>
                <span className="sm-cell-contact">{s.phone || "—"}</span>
                <span className="sm-cell-pin">
                  <span className="sm-pin-value">{revealed ? s.pin : "••••"}</span>
                  <button className="sm-icon-btn sm-icon-btn-inline" onClick={() => togglePinReveal(s.id)}>
                    {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </span>
                <span>
                  <span className={`sm-status-dot sm-status-dot-${s.status}`} />
                  {s.status === "active" ? "Active" : "Paused"}
                </span>
                <span className="sm-cell-actions">
                  <button
                    className="sm-btn sm-btn-ghost sm-btn-xs"
                    onClick={async () => {
                      const newPin = await resetStaffPin(s.id);
                      setResetResult({ staff: s, newPin });
                    }}
                  >
                    Reset PIN
                  </button>
                  {s.status === "active" ? (
                    <button
                      className="sm-btn sm-btn-danger sm-btn-xs"
                      onClick={() => setConfirmTarget({ staff: s, mode: "pause" })}
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      className="sm-btn sm-btn-gold sm-btn-xs"
                      onClick={() => setConfirmTarget({ staff: s, mode: "restore" })}
                    >
                      Restore
                    </button>
                  )}
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
          onConfirm={async ({ name, role, phone, email, pin }) => {
            await addStaff({ name, role, phone, email, pin });
            setShowAdd(false);
          }}
        />
      )}

      {confirmTarget && confirmTarget.mode === "pause" && (
        <ConfirmModal
          title="Pause Staff Member"
          body={`Pause ${confirmTarget.staff.name}? Their PIN will stop working for clock-in and section access until restored.`}
          confirmLabel="Pause"
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
          title="Restore Staff Member"
          body={`Restore ${confirmTarget.staff.name} to active status?`}
          confirmLabel="Restore"
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
function ShiftEditorModal({ staff, dayLabel, dayIndex, current, onClose, onSave }) {
  const [type, setType] = useState(current?.type || "morning");
  const [start, setStart] = useState(current?.start || "09:00");
  const [end, setEnd] = useState(current?.end || "17:00");
  const [isOff, setIsOff] = useState(!current);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(dayIndex, isOff ? null : { type, start, end });
      onClose();
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
        <button className="sm-btn sm-btn-ghost" onClick={() => setLogKind("timeoff")}>
          Log time-off
        </button>
        <button className="sm-btn sm-btn-ghost" onClick={() => setLogKind("swap")}>
          Log swap
        </button>
        <button
          className="sm-btn sm-btn-gold"
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
                      onClick={() => setEditCell({ staff: s, dayIndex: i, current: shift })}
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
                <div className="sm-request-actions">
                  <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={() => decideTimeOffRequest(r.id, "approved")}>
                    Approve
                  </button>
                  <button className="sm-btn sm-btn-danger sm-btn-xs" onClick={() => decideTimeOffRequest(r.id, "denied")}>
                    Deny
                  </button>
                </div>
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
                <div className="sm-request-actions">
                  <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={() => decideSwapRequest(r.id, "approved")}>
                    Approve
                  </button>
                  <button className="sm-btn sm-btn-danger sm-btn-xs" onClick={() => decideSwapRequest(r.id, "denied")}>
                    Deny
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {editCell && (
        <ShiftEditorModal
          staff={editCell.staff}
          dayLabel={DAY_LABELS[editCell.dayIndex]}
          dayIndex={editCell.dayIndex}
          current={editCell.current}
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
function AttendanceTab({ staffList }) {
  const [pinDigits, setPinDigits] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [busyId, setBusyId] = useState(null);

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
                  <span>{r.staffName}</span>
                  <span>{fmtClock(r.clockInAt)}</span>
                  <span>{fmtClock(r.clockOutAt)}</span>
                  <span>{r.breakMinutes || 0}m</span>
                  <span>{hoursOf(r).toFixed(2)}</span>
                  <span>
                    <span className={`sm-att-status sm-att-status-${status}`}>
                      {status === "on-shift" && "On shift"}
                      {status === "on-break" && "On break"}
                      {status === "clocked-out" && "Clocked out"}
                      {status === "not-in" && "Not in"}
                    </span>
                  </span>
                  <span className="sm-cell-actions">
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
      </div>
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
        <button className="sm-back-btn" onClick={() => navigate(routes.dashboard)}>
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
      </div>

      {loading ? (
        <div className="sm-state-msg">Loading staff…</div>
      ) : (
        <>
          {tab === "staff" && <StaffTab staffList={staffList} />}
          {tab === "roster" && <RosterTab staffList={staffList} />}
          {tab === "att" && <AttendanceTab staffList={staffList} />}
        </>
      )}
    </div>
  );
}

export default StaffManagement;
