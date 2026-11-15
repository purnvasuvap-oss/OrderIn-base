// Attendance Display — runs on a tablet at the entrance. Shows a QR that
// rotates every KIOSK_REFRESH_MS; staff scan it from the Staff Portal on
// their registered phone. A manager opens it once a day.
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ChevronLeft, Maximize, MapPin } from "lucide-react";
import routes from "../routes";
import "./StaffManagement.css";
import { subscribeTodayAttendance } from "../services/staffService";
import {
  subscribeAttendanceSettings,
  subscribeActiveKioskSession,
  startKioskSession,
  endKioskSession,
  createKioskCode,
  saveAttendanceSettings,
  hasRestaurantLocation,
  insecureContextMessage,
  toMillis,
  KIOSK_REFRESH_MS,
  ATTENDANCE_SETTINGS_DEFAULTS,
} from "../services/attendanceService";
import { useNow, captureRestaurantGeo, fmtTime } from "../components/StaffAttendance/shared";

export default function AttendanceDisplay() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(ATTENDANCE_SETTINGS_DEFAULTS);
  const [session, setSession] = useState(null);
  const [code, setCode] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const wakeLockRef = useRef(null);
  const now = useNow();
  const insecure = insecureContextMessage();

  useEffect(() => subscribeAttendanceSettings(setSettings), []);
  useEffect(() => subscribeActiveKioskSession(setSession), []);
  useEffect(() => {
    const unsub = subscribeTodayAttendance(setAttendance);
    return () => unsub();
  }, []);

  const live = Boolean(session) && toMillis(session.expiresAt) > now;
  const sessionId = live ? session.id : null;

  // Rotate the code while the display is live.
  useEffect(() => {
    if (!sessionId) {
      setCode(null);
      return undefined;
    }
    let cancelled = false;
    const mint = () => createKioskCode(sessionId)
      .then((next) => { if (!cancelled) { setCode({ ...next, mintedAt: Date.now() }); setError(""); } })
      .catch((err) => { if (!cancelled) setError(err.message || "Could not refresh the QR."); });
    mint();
    const id = window.setInterval(mint, KIOSK_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionId]);

  // Keep the tablet screen awake while the display runs.
  useEffect(() => {
    if (!sessionId || !navigator.wakeLock) return undefined;
    let released = false;
    const acquire = () => navigator.wakeLock.request("screen")
      .then((lock) => { wakeLockRef.current = lock; })
      .catch(() => {});
    acquire();
    const onVisible = () => { if (!released && document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, [sessionId]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await startKioskSession({ startedBy: sessionStorage.getItem("staffId") || sessionStorage.getItem("staffRole") || "manager" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!window.confirm("Close the attendance display? Staff won't be able to clock in until it's opened again.")) return;
    setBusy(true);
    try {
      await endKioskSession(sessionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveTabletLocation = async () => {
    setBusy(true);
    setError("");
    try {
      const geo = await captureRestaurantGeo(settings.maxAccuracyMeters);
      await saveAttendanceSettings({ lat: geo.lat, lng: geo.lng });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const recent = attendance
    .slice()
    .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))
    .slice(0, 6);
  const secondsLeft = code ? Math.max(0, Math.ceil((code.mintedAt + KIOSK_REFRESH_MS - now) / 1000)) : 0;

  return (
    <main className="staff-mgmt-page att-display-page" aria-label="Attendance display">
      <div className="sm-pagehead">
        <div>
          <h1 className="sm-page-h1">Staff Attendance</h1>
          <div className="sm-page-sub">{new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · {new Date(now).toLocaleTimeString()}</div>
        </div>
        <div className="sm-qr-actions">
          <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
            <Maximize size={13} /> Full screen
          </button>
          <button className="sm-back-btn" onClick={() => navigate(routes.staffManagement)}><ChevronLeft size={16} /> Back</button>
        </div>
      </div>

      {insecure && <div className="sm-error" role="alert">{insecure}</div>}
      {error && <div className="sm-error" role="alert">{error}</div>}

      <div className="att-display-grid">
        <section className="sm-ss-card att-display-qr">
          {!hasRestaurantLocation(settings) ? (
            <div className="sm-qr-setup" role="note">
              <strong>Restaurant location not set.</strong>
              <span>Scans are checked against this spot. With the tablet in its place at the entrance, tap below.</span>
              <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={saveTabletLocation} disabled={busy || Boolean(insecure)}>
                <MapPin size={12} /> Save this spot as restaurant location
              </button>
            </div>
          ) : live ? (
            <>
              <p className="att-display-instruction">Open <strong>Staff Portal → Attendance</strong> on your phone and scan</p>
              <div className="sm-qr-box att-display-qr-box" aria-label="Attendance QR code">
                {code ? <QRCodeSVG value={code.payload} size={320} level="M" marginSize={2} /> : <div className="att-display-qr-wait">Preparing QR…</div>}
              </div>
              <p className="sm-hint">New code in {secondsLeft}s · open until {fmtTime(session.expiresAt)}</p>
              <button className="sm-btn sm-btn-danger sm-btn-xs" onClick={stop} disabled={busy}>Close display</button>
            </>
          ) : (
            <>
              <p className="att-display-instruction">The attendance display is closed.</p>
              <button className="sm-btn sm-btn-gold" onClick={start} disabled={busy || Boolean(insecure)}>
                {busy ? "Opening…" : "Open today's attendance"}
              </button>
              <p className="sm-hint">Runs until the end of the day. Keep this tablet at the entrance, plugged in.</p>
            </>
          )}
        </section>

        <section className="sm-ss-card att-display-feed">
          <h3>Today</h3>
          {recent.length === 0 ? (
            <p className="sm-hint">No one has clocked in yet.</p>
          ) : (
            <ul className="att-display-list" aria-live="polite">
              {recent.map((r) => (
                <li key={r.id}>
                  {r.clockInSelfie || r.clockOutSelfie
                    ? <img src={r.clockOutAt ? r.clockOutSelfie || r.clockInSelfie : r.clockInSelfie} alt="" className="att-display-selfie" />
                    : <span className="att-display-selfie att-display-initial">{(r.staffName || "?").charAt(0)}</span>}
                  <span className="att-display-name">{r.staffName}</span>
                  <span className={r.clockOutAt ? "att-display-out" : "att-display-in"}>
                    {r.clockOutAt ? `Out ${fmtTime(r.clockOutAt)}` : `In ${fmtTime(r.clockInAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
