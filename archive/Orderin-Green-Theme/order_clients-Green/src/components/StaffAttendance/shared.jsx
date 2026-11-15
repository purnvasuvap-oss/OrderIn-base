// Building blocks shared by the attendance screens (display tablet, staff
// portal, manager panel).
import React, { useEffect, useRef, useState } from "react";
import { captureFace } from "../../services/faceRecognition";
import { getCurrentGeo, toMillis } from "../../services/attendanceService";

export const useNow = (intervalMs = 1000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
};

export const fmtTime = (value) => {
  const ms = toMillis(value);
  return ms ? new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
};

export const fmtDateTime = (value) => {
  const ms = toMillis(value);
  return ms ? new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
};

// Accepts "12.9716, 77.5946" as copied from Google Maps (right-click → coordinates).
export const parseLatLng = (text) => {
  const match = String(text || "").trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

/** Capture this device's position as the restaurant location, refusing fixes
 * too imprecise to anchor every future scan. */
export const captureRestaurantGeo = async (maxAccuracyMeters) => {
  const geo = await getCurrentGeo();
  if (geo.accuracy > maxAccuracyMeters) {
    throw new Error(`Location is only accurate to ±${Math.round(geo.accuracy)} m. Move near a window or the entrance and try again, or paste coordinates.`);
  }
  return geo;
};

/** Rear-camera view that calls onDecode(text) for each QR it reads. */
export function QrScannerView({ onDecode }) {
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

/**
 * Front-camera face capture with on-screen guidance. Calls onCaptured with
 * { embedding, real, live, thumbnail }. The first run downloads the face
 * models (~10 MB), later runs use the browser cache.
 */
export function FaceCapture({ onCaptured, onCancel, title = "Face check" }) {
  const videoRef = useRef(null);
  const [hint, setHint] = useState("Starting camera…");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const onCapturedRef = useRef(onCaptured);
  onCapturedRef.current = onCaptured;

  useEffect(() => {
    const controller = new AbortController();
    let stream = null;
    setError("");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } }, audio: false });
        if (controller.signal.aborted) return;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        setHint("Loading face check… (first time can take a moment)");
        const result = await captureFace(video, { onHint: setHint, signal: controller.signal });
        if (!controller.signal.aborted) onCapturedRef.current(result);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err?.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access to continue."
            : err?.message || "Face check failed.");
        }
      }
    })();
    return () => {
      controller.abort();
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [attempt]);

  return (
    <div className="sm-face-capture">
      <h4>{title}</h4>
      <div className="sm-face-frame">
        <video ref={videoRef} className="sm-face-video" muted playsInline />
        <span className="sm-face-oval" aria-hidden="true" />
      </div>
      {error ? <div className="sm-error">{error}</div> : <p className="sm-hint" aria-live="polite">{hint}</p>}
      <div className="sm-qr-actions">
        {onCancel && <button className="sm-btn sm-btn-ghost sm-btn-xs" onClick={onCancel}>Cancel</button>}
        {error && <button className="sm-btn sm-btn-gold sm-btn-xs" onClick={() => setAttempt((n) => n + 1)}>Try again</button>}
      </div>
    </div>
  );
}
