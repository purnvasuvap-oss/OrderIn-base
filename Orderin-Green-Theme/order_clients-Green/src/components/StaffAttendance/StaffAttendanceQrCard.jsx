// Staff side of QR + geolocation attendance (Staff Portal). The QR only
// appears while a manager has a QR session live; it rotates every
// QR_REFRESH_MS and each token carries the phone's latest location.
import React, { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, MapPin } from "lucide-react";
import {
  subscribeActiveQrSession,
  createAttendanceToken,
  subscribeAttendanceToken,
  insecureContextMessage,
  QR_REFRESH_MS,
} from "../../services/staffService";

const millisOf = (value) => (value?.toMillis ? value.toMillis() : value?.toDate ? value.toDate().getTime() : new Date(value).getTime());

export default function StaffAttendanceQrCard({ staffId, clockedIn = false }) {
  const [session, setSession] = useState(null);
  const [showing, setShowing] = useState(false);
  const [hasGeo, setHasGeo] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [outcome, setOutcome] = useState(null);
  const geoRef = useRef(null);
  const insecure = insecureContextMessage();

  const [, setExpiryCheck] = useState(0);

  useEffect(() => subscribeActiveQrSession(setSession), []);

  // A session that simply times out produces no snapshot; re-render at expiry.
  useEffect(() => {
    if (!session) return undefined;
    const ms = millisOf(session.expiresAt) - Date.now();
    if (ms <= 0) return undefined;
    const id = window.setTimeout(() => setExpiryCheck((n) => n + 1), ms + 250);
    return () => window.clearTimeout(id);
  }, [session]);

  const sessionId = session && millisOf(session.expiresAt) > Date.now() ? session.id : null;

  // Session ended or switched: drop whatever QR was on screen.
  useEffect(() => {
    if (!sessionId) {
      setShowing(false);
      setToken(null);
    }
  }, [sessionId]);

  // Track location continuously while the QR is visible.
  useEffect(() => {
    if (!showing) return undefined;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location is not available on this device/browser.");
      return undefined;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        geoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setAccuracy(Math.round(pos.coords.accuracy));
        setHasGeo(true);
        setError("");
      },
      (err) => setError(err.code === 1
        ? "Location permission was denied. Allow location access in your browser settings to mark attendance."
        : "Could not get your location. Move near a window and try again."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      geoRef.current = null;
      setHasGeo(false);
    };
  }, [showing]);

  // Rotation clock.
  useEffect(() => {
    if (!showing) return undefined;
    const id = window.setInterval(() => setRefreshTick((t) => t + 1), QR_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [showing]);

  // Mint a fresh token on show, on each rotation, and after a rejected scan.
  useEffect(() => {
    if (!showing || !sessionId || !hasGeo || !geoRef.current) return undefined;
    let cancelled = false;
    createAttendanceToken({ staffId, sessionId, geo: geoRef.current })
      .then((next) => { if (!cancelled) setToken(next); })
      .catch((err) => { if (!cancelled) setError(err.message || "Could not generate QR."); });
    return () => { cancelled = true; };
  }, [showing, sessionId, hasGeo, refreshTick, staffId]);

  // Watch the current token for the manager's scan result.
  useEffect(() => {
    if (!token) return undefined;
    return subscribeAttendanceToken(token.tokenId, (doc) => {
      if (!doc?.result) return;
      if (doc.result.status === "accepted" && doc.result.action) {
        setOutcome({ ok: true, text: `Clocked ${doc.result.action === "in" ? "IN" : "OUT"} at ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` });
        setShowing(false);
        setToken(null);
      } else if (doc.result.status === "rejected") {
        setOutcome({ ok: false, text: doc.result.reason || "Scan rejected." });
        setRefreshTick((t) => t + 1);
      }
    });
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((token.expiresAt.getTime() - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [token]);

  const open = () => {
    setOutcome(null);
    setError("");
    setShowing(true);
  };

  return (
    <section className="sm-ss-card sm-qr-staff-card">
      <div className="sm-ss-card-head">
        <h3><QrCode size={16} /> Attendance</h3>
        <span className={`sm-att-status sm-att-status-${clockedIn ? "on-shift" : "not-in"}`}>{clockedIn ? "On shift" : "Not clocked in"}</span>
      </div>
      {outcome && <div className={outcome.ok ? "sm-success" : "sm-error"} role="status">{outcome.text}</div>}
      {insecure && sessionId && <div className="sm-error" role="alert">{insecure}</div>}
      {error && <div className="sm-error">{error}</div>}

      {!sessionId && (
        <p className="sm-hint">Your attendance QR appears here when your manager starts a QR attendance session.</p>
      )}

      {sessionId && !showing && (
        <button className="sm-btn sm-btn-gold" onClick={open} disabled={Boolean(insecure)}>
          Show my QR to {clockedIn ? "clock out" : "clock in"}
        </button>
      )}

      {sessionId && showing && (
        <div className="sm-qr-staff-body">
          {token ? (
            <>
              <div className="sm-qr-box" aria-label="Attendance QR code">
                <QRCodeSVG value={token.payload} size={220} level="M" marginSize={2} />
              </div>
              <p className="sm-hint">Show this to your manager. Refreshes in {secondsLeft}s.</p>
            </>
          ) : (
            <p className="sm-hint">{hasGeo ? "Generating QR…" : "Getting your location…"}</p>
          )}
          {accuracy !== null && <p className="sm-hint"><MapPin size={11} /> Location accuracy ±{accuracy} m</p>}
          <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={() => setShowing(false)}>Hide</button>
        </div>
      )}
    </section>
  );
}
