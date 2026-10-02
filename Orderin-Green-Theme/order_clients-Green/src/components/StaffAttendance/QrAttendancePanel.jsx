// Manager side of QR + geolocation attendance (Staff Management → Attendance).
// Starts/ends the QR session, scans staff-portal QRs with the device camera,
// and edits the restaurant location / radius the scans are checked against.
import React, { useEffect, useRef, useState } from "react";
import { QrCode, MapPin, Square, Settings } from "lucide-react";
import {
  subscribeActiveQrSession,
  startQrSession,
  endQrSession,
  redeemAttendanceToken,
  saveAttendanceSettings,
  getCurrentGeo,
  insecureContextMessage,
} from "../../services/staffService";

const useNow = (intervalMs = 1000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
};

const millisOf = (value) => (value?.toMillis ? value.toMillis() : value?.toDate ? value.toDate().getTime() : new Date(value).getTime());
const hasLocation = (settings) => Number.isFinite(settings?.lat) && Number.isFinite(settings?.lng);

// Accepts "12.9716, 77.5946" as copied from Google Maps (right-click → coordinates).
export const parseLatLng = (text) => {
  const match = String(text || "").trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

/** Capture this device's position for the restaurant location, refusing
 * fixes too imprecise to anchor every future scan. */
const captureRestaurantGeo = async (maxAccuracyMeters) => {
  const geo = await getCurrentGeo();
  if (geo.accuracy > maxAccuracyMeters) {
    throw new Error(`Location is only accurate to ±${Math.round(geo.accuracy)} m. Move near a window or the entrance and try again, or paste coordinates in settings.`);
  }
  return geo;
};

const fmtCountdown = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Camera view that calls onDecode(text) for each QR it reads. */
function QrScannerView({ onDecode }) {
  const videoRef = useRef(null);
  const onDecodeRef = useRef(onDecode);
  const [error, setError] = useState("");
  onDecodeRef.current = onDecode;

  useEffect(() => {
    let scanner = null;
    let cancelled = false;
    (async () => {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (cancelled || !videoRef.current) return;
        scanner = new QrScanner(videoRef.current, (result) => onDecodeRef.current(result.data), {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          preferredCamera: "environment",
          maxScansPerSecond: 4,
        });
        await scanner.start();
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err) || "Camera unavailable. Allow camera access (HTTPS is required).");
      }
    })();
    return () => {
      cancelled = true;
      if (scanner) {
        scanner.stop();
        scanner.destroy();
      }
    };
  }, []);

  return (
    <div className="sm-qr-scanner">
      {error ? <div className="sm-error">{error}</div> : <video ref={videoRef} className="sm-qr-video" muted playsInline />}
    </div>
  );
}

function AttendanceSettingsForm({ settings, onClose }) {
  const [radius, setRadius] = useState(String(settings.radiusMeters));
  const [requireManagerProximity, setRequireManagerProximity] = useState(Boolean(settings.requireManagerProximity));
  const [allowPinFallback, setAllowPinFallback] = useState(Boolean(settings.allowPinFallback));
  const [location, setLocation] = useState(hasLocation(settings) ? { lat: settings.lat, lng: settings.lng } : null);
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
        requireManagerProximity,
        allowPinFallback,
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
          <span className="sm-qr-loc">{location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : "Not set — manager's device is used"}</span>
          <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={useCurrentLocation} disabled={busy}><MapPin size={12} /> Use current location</button>
          {location && <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setLocation(null)} disabled={busy}>Clear</button>}
        </div>
        <p className="sm-hint">Capture this while standing inside the restaurant, or paste coordinates from Google Maps.</p>
        <div className="sm-qr-loc-row">
          <input
            aria-label="Restaurant coordinates"
            placeholder="12.97160, 77.59460"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={applyManual} disabled={busy || !manual.trim()}>Use these</button>
        </div>
      </div>
      <div className="sm-form-group">
        <label htmlFor="qr-radius">Allowed radius (meters)</label>
        <input id="qr-radius" type="number" min="20" max="5000" value={radius} onChange={(e) => setRadius(e.target.value)} />
        <p className="sm-hint">Indoor GPS is often off by 20–80 m; below 75 m may reject staff who are on site.</p>
      </div>
      <label className="sm-qr-check">
        <input type="checkbox" checked={requireManagerProximity} onChange={(e) => setRequireManagerProximity(e.target.checked)} />
        Also require staff to be near the manager's device
      </label>
      <label className="sm-qr-check">
        <input type="checkbox" checked={allowPinFallback} onChange={(e) => setAllowPinFallback(e.target.checked)} />
        Allow PIN keypad as a fallback (staff without smartphones)
      </label>
      <div className="sm-qr-actions">
        <button className="sm-btn sm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="sm-btn sm-btn-gold" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
      </div>
    </div>
  );
}

export default function QrAttendancePanel({ settings, canConfigure = false }) {
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scans, setScans] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const insecure = insecureContextMessage();
  const processingRef = useRef(false);
  const lastTextRef = useRef({ text: "", at: 0 });
  const now = useNow();

  useEffect(() => subscribeActiveQrSession(setSession), []);

  const remainingMs = session ? millisOf(session.expiresAt) - now : 0;
  const sessionLive = Boolean(session) && remainingMs > 0;

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      let managerGeo = null;
      try {
        managerGeo = await getCurrentGeo();
      } catch (geoErr) {
        if (!hasLocation(settings)) throw geoErr;
      }
      await startQrSession({
        managerGeo,
        startedBy: sessionStorage.getItem("staffId") || sessionStorage.getItem("staffRole") || "manager",
      });
      setScans([]);
    } catch (err) {
      setError(err.message || "Could not start the QR session.");
    } finally {
      setBusy(false);
    }
  };

  const saveLocationHere = async () => {
    setSavingLocation(true);
    setError("");
    try {
      const geo = await captureRestaurantGeo(settings.maxAccuracyMeters);
      await saveAttendanceSettings({ lat: geo.lat, lng: geo.lng });
    } catch (err) {
      setError(err.message || "Could not save the restaurant location.");
    } finally {
      setSavingLocation(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await endQrSession(session?.id);
    } catch (err) {
      setError(err.message || "Could not end the session.");
    } finally {
      setBusy(false);
    }
  };

  const handleDecode = async (text) => {
    const nowMs = Date.now();
    // The camera re-reads the same QR several times a second; only act once.
    if (processingRef.current) return;
    if (lastTextRef.current.text === text && nowMs - lastTextRef.current.at < 5000) return;
    processingRef.current = true;
    lastTextRef.current = { text, at: nowMs };
    try {
      const result = await redeemAttendanceToken(text, {
        sessionId: session?.id,
        managerGeo: session?.managerGeo || null,
        verifiedBy: sessionStorage.getItem("staffId") || sessionStorage.getItem("staffRole") || "manager",
      });
      setScans((prev) => [{ key: nowMs, ok: true, name: result.staff.name, action: result.action, distanceM: result.distanceM }, ...prev].slice(0, 20));
    } catch (err) {
      setScans((prev) => [{ key: nowMs, ok: false, reason: err.message || "Rejected" }, ...prev].slice(0, 20));
    } finally {
      processingRef.current = false;
    }
  };

  return (
    <div className="sm-punch-card sm-qr-panel">
      <div className="sm-qr-head">
        <h4><QrCode size={15} /> QR Attendance</h4>
        {canConfigure && (
          <button className="sm-icon-btn" aria-label="QR attendance settings" onClick={() => setShowSettings((v) => !v)}>
            <Settings size={15} />
          </button>
        )}
      </div>

      {showSettings && <AttendanceSettingsForm settings={settings} onClose={() => setShowSettings(false)} />}

      {insecure && <div className="sm-error" role="alert">{insecure}</div>}
      {error && <div className="sm-error">{error}</div>}

      {!showSettings && !hasLocation(settings) && canConfigure && (
        <div className="sm-qr-setup" role="note">
          <strong>Restaurant location not set.</strong>
          <span>Scans are checked against this device until you save it. Stand inside the restaurant and tap below.</span>
          <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={saveLocationHere} disabled={savingLocation || Boolean(insecure)}>
            <MapPin size={12} /> {savingLocation ? "Locating…" : "Save this spot as restaurant location"}
          </button>
        </div>
      )}

      {!showSettings && (sessionLive ? (
        <>
          <div className="sm-qr-session-bar">
            <span className="sm-qr-live">● Live · {fmtCountdown(remainingMs)}</span>
            <button className="sm-btn sm-btn-danger sm-btn-xs" onClick={stop} disabled={busy}><Square size={11} /> End</button>
          </div>
          <p className="sm-hint">Ask staff to open their Staff Portal and show their attendance QR.</p>
          <QrScannerView onDecode={handleDecode} />
          <ul className="sm-qr-results" aria-live="polite">
            {scans.map((s) => (
              <li key={s.key} className={s.ok ? "ok" : "bad"}>
                {s.ok
                  ? `✓ ${s.name} clocked ${s.action === "in" ? "IN" : "OUT"} · ${s.distanceM} m away`
                  : `✕ ${s.reason}`}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="sm-hint">
            Starts a {settings.sessionMinutes}-minute window. Staff QRs only appear while it is live and are checked
            against {hasLocation(settings) ? "the restaurant location" : "this device's location"} ({settings.radiusMeters} m).
          </p>
          <button className="sm-btn sm-btn-gold sm-qr-start" onClick={start} disabled={busy || Boolean(insecure)}>
            {busy ? "Starting…" : "Start QR Attendance"}
          </button>
        </>
      ))}
    </div>
  );
}
