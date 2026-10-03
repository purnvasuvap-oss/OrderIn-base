// Manager side of attendance (Staff Management → Attendance):
//   * AttendanceDisplayCard — open the entrance display, restaurant location,
//     radius and face-match settings.
//   * AttendanceApprovals — approve phones (with the enrolled face) and
//     manual-attendance requests, following staff → Manager → Admin.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, MapPin, Settings, Smartphone, ClipboardList } from "lucide-react";
import routes from "../../routes";
import {
  subscribeActiveKioskSession,
  saveAttendanceSettings,
  hasRestaurantLocation,
  insecureContextMessage,
  subscribeAllDevices,
  decideDevice,
  revokeDevice,
  subscribeAttendanceRequests,
  decideManualRequest,
  canApprove,
  currentApprover,
  toMillis,
} from "../../services/attendanceService";
import { useNow, parseLatLng, captureRestaurantGeo, fmtTime, fmtDateTime } from "./shared";

function AttendanceSettingsForm({ settings, onClose }) {
  const [radius, setRadius] = useState(String(settings.radiusMeters));
  const [threshold, setThreshold] = useState(String(settings.faceMatchThreshold));
  const [location, setLocation] = useState(hasRestaurantLocation(settings) ? { lat: settings.lat, lng: settings.lng } : null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const useCurrentLocation = async () => {
    setBusy(true);
    setError("");
    try {
      const geo = await captureRestaurantGeo(settings.maxAccuracyMeters);
      setLocation({ lat: geo.lat, lng: geo.lng });
      setNote(`Location captured (±${Math.round(geo.accuracy)} m). Save to apply.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const applyManual = () => {
    const parsed = parseLatLng(manual);
    if (!parsed) {
      setError("Enter coordinates as latitude, longitude — e.g. 12.97160, 77.59460");
      return;
    }
    setError("");
    setLocation(parsed);
    setManual("");
    setNote("Coordinates set. Save to apply.");
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await saveAttendanceSettings({
        lat: location ? location.lat : null,
        lng: location ? location.lng : null,
        radiusMeters: Number(radius),
        faceMatchThreshold: Number(threshold),
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sm-qr-settings">
      {error && <div className="sm-error">{error}</div>}
      {note && !error && <div className="sm-success">{note}</div>}
      <div className="sm-form-group">
        <label>Restaurant location</label>
        <div className="sm-qr-loc-row">
          <span className="sm-qr-loc">{location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : "Not set"}</span>
          <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={useCurrentLocation} disabled={busy}><MapPin size={12} /> Use current location</button>
          {location && <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setLocation(null)} disabled={busy}>Clear</button>}
        </div>
        <div className="sm-qr-loc-row">
          <input aria-label="Restaurant coordinates" placeholder="12.97160, 77.59460" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={applyManual} disabled={busy || !manual.trim()}>Use these</button>
        </div>
        <p className="sm-hint">Capture inside the restaurant, or paste coordinates from Google Maps.</p>
      </div>
      <div className="sm-form-group">
        <label htmlFor="att-radius">Allowed radius (meters)</label>
        <input id="att-radius" type="number" min="20" max="5000" value={radius} onChange={(e) => setRadius(e.target.value)} />
        <p className="sm-hint">Indoor GPS is often off by 20–80 m; below 75 m may reject staff who are on site.</p>
      </div>
      <div className="sm-form-group">
        <label htmlFor="att-face">Face match strictness (0.40–0.95)</label>
        <input id="att-face" type="number" min="0.4" max="0.95" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        <p className="sm-hint">Higher rejects more look-alikes but also more genuine scans in poor light. Start at 0.60.</p>
      </div>
      <div className="sm-qr-actions">
        <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="sm-btn sm-btn-gold" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
      </div>
    </div>
  );
}

export function AttendanceDisplayCard({ settings, canConfigure = false }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [error, setError] = useState("");
  const now = useNow(15000);
  const insecure = insecureContextMessage();

  useEffect(() => subscribeActiveKioskSession(setSession), []);
  const live = Boolean(session) && toMillis(session.expiresAt) > now;

  const saveLocationHere = async () => {
    setSavingLocation(true);
    setError("");
    try {
      const geo = await captureRestaurantGeo(settings.maxAccuracyMeters);
      await saveAttendanceSettings({ lat: geo.lat, lng: geo.lng });
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingLocation(false);
    }
  };

  return (
    <div className="sm-punch-card sm-qr-panel">
      <div className="sm-qr-head">
        <h4><Monitor size={15} /> Attendance Display</h4>
        {canConfigure && (
          <button className="sm-icon-btn" aria-label="Attendance settings" onClick={() => setShowSettings((v) => !v)}>
            <Settings size={15} />
          </button>
        )}
      </div>
      {insecure && <div className="sm-error" role="alert">{insecure}</div>}
      {error && <div className="sm-error">{error}</div>}
      {showSettings ? (
        <AttendanceSettingsForm settings={settings} onClose={() => setShowSettings(false)} />
      ) : (
        <>
          {!hasRestaurantLocation(settings) && canConfigure && (
            <div className="sm-qr-setup" role="note">
              <strong>Restaurant location not set.</strong>
              <span>Staff can't clock in until it's saved. Stand inside the restaurant and tap below.</span>
              <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={saveLocationHere} disabled={savingLocation || Boolean(insecure)}>
                <MapPin size={12} /> {savingLocation ? "Locating…" : "Save this spot as restaurant location"}
              </button>
            </div>
          )}
          <p className="sm-hint">
            {live
              ? <><span className="sm-qr-live">● Live</span> until {fmtTime(session.expiresAt)}</>
              : "Closed. Open it on the entrance tablet each morning."}
          </p>
          <p className="sm-hint">Staff scan its QR from the Staff Portal on their registered phone, inside {settings.radiusMeters} m, then pass a face check.</p>
          <button className="sm-btn sm-btn-gold sm-qr-start" onClick={() => navigate(routes.attendanceDisplay)}>
            Open Attendance Display
          </button>
        </>
      )}
    </div>
  );
}

function ApproveButtons({ allowed, busy, onApprove, onReject }) {
  return (
    <span className="sm-cell-actions" title={allowed.ok ? "" : allowed.reason}>
      <button className="sm-btn sm-btn-gold sm-btn-xs" disabled={!allowed.ok || busy} onClick={onApprove}>Approve</button>
      <button className="sm-btn sm-btn-ghost sm-btn-xs" disabled={!allowed.ok || busy} onClick={onReject}>Reject</button>
    </span>
  );
}

export function AttendanceApprovals() {
  const [devices, setDevices] = useState([]);
  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [showDevices, setShowDevices] = useState(false);
  const approver = currentApprover();

  useEffect(() => subscribeAllDevices(setDevices), []);
  useEffect(() => subscribeAttendanceRequests(setRequests), []);

  const run = async (id, action) => {
    setBusyId(id);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const pendingDevices = devices.filter((d) => d.status === "pending");
  const activeDevices = devices.filter((d) => d.status === "active");
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const recentDecided = requests.filter((r) => r.status !== "pending").slice(0, 5);

  return (
    <div className="sm-panel sm-att-approvals">
      <h3>Attendance approvals {pendingDevices.length + pendingRequests.length > 0 && <span className="sm-badge">{pendingDevices.length + pendingRequests.length}</span>}</h3>
      {error && <div className="sm-error" role="alert">{error}</div>}

      <h4><Smartphone size={14} /> Phones waiting for approval</h4>
      {pendingDevices.length === 0 ? <p className="sm-hint">None.</p> : (
        <ul className="sm-att-approval-list">
          {pendingDevices.map((d) => {
            const replacing = activeDevices.find((a) => a.staffId === d.staffId);
            return (
              <li key={d.id}>
                <img className="sm-att-face" src={d.faceThumbnail} alt={`Enrolled face of ${d.staffName}`} />
                <div className="sm-att-approval-body">
                  <strong>{d.staffName}</strong> <span className="sm-hint">{d.staffRole || "Staff"}</span>
                  <div>{d.label} <span className="sm-hint">· {d.platform} · {fmtDateTime(d.requestedAt)}</span></div>
                  {replacing && <div className="sm-hint">Replaces {replacing.label}{d.reason ? ` — "${d.reason}"` : ""}</div>}
                  <div className="sm-hint">Check the photo is really this person before approving.</div>
                </div>
                <ApproveButtons
                  allowed={canApprove(approver, d)}
                  busy={busyId === d.id}
                  onApprove={() => run(d.id, () => decideDevice(d, "approved", approver))}
                  onReject={() => run(d.id, () => decideDevice(d, "rejected", approver))}
                />
              </li>
            );
          })}
        </ul>
      )}

      <h4><ClipboardList size={14} /> Manual attendance requests</h4>
      {pendingRequests.length === 0 ? <p className="sm-hint">None.</p> : (
        <ul className="sm-att-approval-list">
          {pendingRequests.map((r) => (
            <li key={r.id}>
              <div className="sm-att-approval-body">
                <strong>{r.staffName}</strong> <span className="sm-hint">{r.staffRole || "Staff"}</span>
                <div>{r.dateKey} · in {r.inAt ? fmtTime(r.inAt) : "—"} · out {r.outAt ? fmtTime(r.outAt) : "—"}</div>
                <div className="sm-hint">"{r.reason}" · sent {fmtDateTime(r.createdAt)}</div>
              </div>
              <ApproveButtons
                allowed={canApprove(approver, r)}
                busy={busyId === r.id}
                onApprove={() => run(r.id, () => decideManualRequest(r, "approved", { approver }))}
                onReject={() => {
                  const note = window.prompt(`Reason for rejecting ${r.staffName}'s request?`);
                  if (note === null) return;
                  run(r.id, () => decideManualRequest(r, "rejected", { approver, note }));
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {recentDecided.length > 0 && (
        <p className="sm-hint">
          Recently decided: {recentDecided.map((r) => `${r.staffName} ${r.dateKey} (${r.status})`).join(" · ")}
        </p>
      )}

      <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setShowDevices((v) => !v)}>
        {showDevices ? "Hide" : "Show"} registered phones ({activeDevices.length})
      </button>
      {showDevices && (
        <ul className="sm-att-approval-list">
          {activeDevices.map((d) => (
            <li key={d.id}>
              <img className="sm-att-face" src={d.faceThumbnail} alt="" />
              <div className="sm-att-approval-body">
                <strong>{d.staffName}</strong>
                <div>{d.label} <span className="sm-hint">· approved {fmtDateTime(d.decidedAt)}</span></div>
              </div>
              <span className="sm-cell-actions" title={canApprove(approver, d).ok ? "" : canApprove(approver, d).reason}>
                <button
                  className="sm-btn sm-btn-danger sm-btn-xs"
                  disabled={!canApprove(approver, d).ok || busyId === d.id}
                  onClick={() => {
                    if (!window.confirm(`Remove ${d.label} for ${d.staffName}? They'll need to register a phone again.`)) return;
                    run(d.id, () => revokeDevice(d, approver));
                  }}
                >Remove</button>
              </span>
            </li>
          ))}
          {activeDevices.length === 0 && <li className="sm-hint">No phones registered yet.</li>}
        </ul>
      )}
    </div>
  );
}
