// Staff Portal → Attendance. Clocking in/out = scan the entrance display QR,
// on this staff member's registered phone, inside the restaurant radius,
// then pass a face check. Other phones can view everything but never get the
// scanner; they can request a device change or manual attendance instead.
import React, { useEffect, useRef, useState } from "react";
import { QrCode, Smartphone, ClipboardList } from "lucide-react";
import {
  getDeviceIdentity,
  subscribeStaffDevices,
  requestDeviceRegistration,
  subscribeMyAttendanceRequests,
  submitManualRequest,
  verifyKioskQr,
  getAttendanceSettings,
  getStaffFace,
  evaluateAttendanceGeo,
  evaluateFaceMatch,
  recordKioskScan,
  getCurrentGeo,
  insecureContextMessage,
  toMillis,
} from "../../services/attendanceService";
import { faceSimilarity } from "../../services/faceRecognition";
import { QrScannerView, FaceCapture, fmtTime, fmtDateTime } from "./shared";

const localDateKey = (date = new Date()) => date.toLocaleDateString("en-CA");
const STATUS_TEXT = { pending: "Waiting for approval", approved: "Approved", rejected: "Rejected" };

/** Scan → location → face → save. */
function KioskScanFlow({ staff, identity, onFinished, onCancel }) {
  const [step, setStep] = useState("scan");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const contextRef = useRef(null);
  const busyRef = useRef(false);

  const fail = (err) => {
    setError(err?.message || String(err));
    setStep("error");
  };

  const handleDecode = async (text) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStep("checking");
    try {
      const [code, geo, settings, enrolled] = await Promise.all([
        verifyKioskQr(text),
        getCurrentGeo(),
        getAttendanceSettings(),
        getStaffFace(staff.id),
      ]);
      const geoCheck = evaluateAttendanceGeo({ staffGeo: geo, settings });
      if (!geoCheck.ok) throw new Error(geoCheck.reason);
      if (!enrolled?.embedding?.length || enrolled.deviceId !== identity.deviceId) {
        throw new Error("No face is enrolled for this phone. Ask your manager to re-approve your device.");
      }
      contextRef.current = { code, geo, geoCheck, settings, enrolled };
      setStep("face");
    } catch (err) {
      fail(err);
    } finally {
      busyRef.current = false;
    }
  };

  const handleFace = async (captured) => {
    const { code, geo, geoCheck, settings, enrolled } = contextRef.current;
    setStep("saving");
    try {
      const similarity = await faceSimilarity(enrolled.embedding, captured.embedding);
      const check = evaluateFaceMatch({ similarity, real: captured.real, live: captured.live, threshold: settings.faceMatchThreshold });
      if (!check.ok) throw new Error(check.reason);
      const saved = await recordKioskScan({
        staff,
        identity,
        codeId: code.codeId,
        geo,
        geoCheck,
        face: { similarity, real: captured.real, live: captured.live },
        selfie: captured.thumbnail,
      });
      setResult({ ...saved, distanceM: geoCheck.distanceM });
      setStep("done");
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="sm-att-flow">
      {step === "scan" && (
        <>
          <p className="sm-hint">Point your camera at the QR on the entrance display.</p>
          <QrScannerView onDecode={handleDecode} />
          <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={onCancel}>Cancel</button>
        </>
      )}
      {step === "checking" && <p className="sm-hint" role="status">Checking the QR and your location…</p>}
      {step === "face" && <FaceCapture title="Face check" onCaptured={handleFace} onCancel={onCancel} />}
      {step === "saving" && <p className="sm-hint" role="status">Verifying your face…</p>}
      {step === "done" && result && (
        <>
          <div className="sm-success" role="status">
            Clocked {result.action === "in" ? "IN" : "OUT"} at {fmtTime(new Date())} · {result.distanceM} m from the restaurant
          </div>
          <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={onFinished}>Done</button>
        </>
      )}
      {step === "error" && (
        <>
          <div className="sm-error" role="alert">{error}</div>
          <div className="sm-qr-actions">
            <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={onCancel}>Close</button>
            <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={() => { setError(""); setStep("scan"); }}>Scan again</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Register this phone: name it, consent, enrol face → pending approval. */
function RegisterDeviceForm({ staff, identity, replacing, onDone, onCancel }) {
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const [consent, setConsent] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");

  const canStart = label.trim() && consent && (!replacing || reason.trim().length >= 5);

  const submit = async (face) => {
    setCapturing(false);
    setError("");
    try {
      await requestDeviceRegistration({ staff, identity, label, reason, face });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };

  if (capturing) {
    return <FaceCapture title="Enrol your face" onCaptured={submit} onCancel={() => setCapturing(false)} />;
  }
  return (
    <div className="sm-att-flow">
      {error && <div className="sm-error">{error}</div>}
      <div className="sm-form-group">
        <label htmlFor="device-label">Phone name</label>
        <input id="device-label" value={label} maxLength={60} placeholder="e.g. Vivo Y35" onChange={(e) => setLabel(e.target.value)} />
      </div>
      {replacing && (
        <div className="sm-form-group">
          <label htmlFor="device-reason">Why are you changing phones?</label>
          <textarea id="device-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. old phone damaged" />
        </div>
      )}
      <label className="sm-qr-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        I agree that the restaurant stores my face template and a photo, used only to verify my attendance.
      </label>
      <div className="sm-qr-actions">
        <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={onCancel}>Cancel</button>
        <button className="sm-btn sm-btn-gold sm-btn-xs" disabled={!canStart} onClick={() => setCapturing(true)}>Continue to face capture</button>
      </div>
    </div>
  );
}

function ManualRequestForm({ staff, onDone, onCancel }) {
  const [dateKey, setDateKey] = useState(localDateKey());
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await submitManualRequest({ staff, dateKey, inTime, outTime, reason });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sm-att-flow">
      {error && <div className="sm-error">{error}</div>}
      <div className="sm-form-group"><label htmlFor="manual-date">Date</label><input id="manual-date" type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} /></div>
      <div className="sm-att-time-row">
        <div className="sm-form-group"><label htmlFor="manual-in">Clock in</label><input id="manual-in" type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} /></div>
        <div className="sm-form-group"><label htmlFor="manual-out">Clock out</label><input id="manual-out" type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} /></div>
      </div>
      <div className="sm-form-group">
        <label htmlFor="manual-reason">Reason</label>
        <textarea id="manual-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. phone screen broken, couldn't scan" />
      </div>
      <p className="sm-hint">{["admin", "general manager"].includes(String(staff.role || "").toLowerCase()) ? "Your request goes to the Admin (owner)." : "Your request goes to your manager."} You can raise it in advance.</p>
      <div className="sm-qr-actions">
        <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
      </div>
    </div>
  );
}

export default function StaffAttendanceCard({ staff, clockedIn = false }) {
  const [identity, setIdentity] = useState(null);
  const [identityError, setIdentityError] = useState("");
  const [devices, setDevices] = useState([]);
  const [requests, setRequests] = useState([]);
  const [mode, setMode] = useState(null); // "scan" | "register" | "manual"
  const [message, setMessage] = useState("");
  const insecure = insecureContextMessage();
  const staffId = staff?.id;

  useEffect(() => {
    getDeviceIdentity().then(setIdentity).catch((err) => setIdentityError(err.message));
  }, []);
  useEffect(() => (staffId ? subscribeStaffDevices(staffId, setDevices) : undefined), [staffId]);
  useEffect(() => (staffId ? subscribeMyAttendanceRequests(staffId, setRequests) : undefined), [staffId]);

  const thisDevice = identity ? devices.find((d) => d.id === identity.deviceId) : null;
  const activeDevice = devices.find((d) => d.status === "active");
  const registered = thisDevice?.status === "active";
  const pending = thisDevice?.status === "pending";

  const finish = (text) => {
    setMode(null);
    if (text) setMessage(text);
  };

  if (!staff) return null;

  return (
    <section className="sm-ss-card sm-qr-staff-card">
      <div className="sm-ss-card-head">
        <h3><QrCode size={16} /> Attendance</h3>
        <span className={`sm-att-status sm-att-status-${clockedIn ? "on-shift" : "not-in"}`}>{clockedIn ? "On shift" : "Not clocked in"}</span>
      </div>
      {insecure && <div className="sm-error" role="alert">{insecure}</div>}
      {identityError && <div className="sm-error">{identityError}</div>}
      {message && !mode && <div className="sm-success" role="status">{message}</div>}

      {mode === "scan" && identity && (
        <KioskScanFlow staff={staff} identity={identity} onFinished={() => finish("")} onCancel={() => finish("")} />
      )}
      {mode === "register" && identity && (
        <RegisterDeviceForm
          staff={staff}
          identity={identity}
          replacing={Boolean(activeDevice && activeDevice.id !== identity.deviceId)}
          onDone={() => finish("Phone registered. Your manager needs to approve it before you can scan.")}
          onCancel={() => finish("")}
        />
      )}
      {mode === "manual" && (
        <ManualRequestForm staff={staff} onDone={() => finish("Request sent for approval.")} onCancel={() => finish("")} />
      )}

      {!mode && identity && (
        <div className="sm-att-device">
          {registered && (
            <>
              <p className="sm-hint"><Smartphone size={12} /> {thisDevice.label} is your registered phone.</p>
              <button className="sm-btn sm-btn-gold" disabled={Boolean(insecure)} onClick={() => { setMessage(""); setMode("scan"); }}>
                Scan to clock {clockedIn ? "out" : "in"}
              </button>
            </>
          )}
          {pending && <p className="sm-hint">This phone ({thisDevice.label}) is waiting for your manager's approval.</p>}
          {!registered && !pending && (
            <>
              <p className="sm-hint">
                {activeDevice
                  ? `Attendance can only be marked from your registered phone (${activeDevice.label}). Got a new phone? Request a device change.`
                  : "Register this phone to mark attendance. Your manager approves it once."}
                {thisDevice?.status === "rejected" && " Your last request for this phone was rejected."}
                {thisDevice?.status === "revoked" && " This phone was removed by a manager."}
              </p>
              <button className="sm-btn sm-btn-gold sm-btn-xs" disabled={Boolean(insecure)} onClick={() => setMode("register")}>
                {activeDevice ? "Request device change" : "Register this phone"}
              </button>
            </>
          )}
        </div>
      )}

      {!mode && (
        <div className="sm-att-requests">
          <div className="sm-ss-card-head">
            <h4><ClipboardList size={14} /> Manual attendance requests</h4>
            <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setMode("manual")}>New request</button>
          </div>
          {requests.length === 0 ? (
            <p className="sm-hint">Phone not working? Ask for manual attendance with a reason.</p>
          ) : (
            <ul className="sm-att-request-list">
              {requests.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <span>{r.dateKey} · {r.inAt ? fmtTime(r.inAt) : "—"} – {r.outAt ? fmtTime(r.outAt) : "—"}</span>
                  <span className={`sm-att-req-status sm-att-req-${r.status}`}>{STATUS_TEXT[r.status] || r.status}</span>
                  {r.decisionNote && <span className="sm-hint">{r.decisionNote}</span>}
                  <span className="sm-hint">Sent {fmtDateTime(r.createdAt)}{toMillis(r.decidedAt) ? ` · decided ${fmtDateTime(r.decidedAt)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
