// Web Push subscription management — the piece that makes notifications work
// even when the POS tab (or the whole browser) is closed. Foreground OS
// popups (lib/notifications.js) needed none of this; delivering an alert to a
// closed browser needs a registered Service Worker + an FCM device token
// stored somewhere a Cloud Function can read it (functions/index.js).
//
// A token is scoped to *this browser install*, not this Firebase project —
// there's no Firebase Auth UID to key it on (see lib/auth.js), so we mint a
// random per-device id once and store the token doc under that.

import { getToken, deleteToken, onMessage } from "firebase/messaging";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, RESTAURANT_ID, firebaseEnabled, getMessagingIfSupported, FCM_VAPID_KEY } from "./firebase";

const DEVICE_ID_KEY = "orderin_pos_device_id";
const SW_URL = "/firebase-messaging-sw.js";

function deviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function tokenDocRef() {
  return doc(db, "Restaurant", RESTAURANT_ID, "fcmTokens", deviceId());
}

export async function pushSupported() {
  if (!("serviceWorker" in navigator)) return false;
  return Boolean(await getMessagingIfSupported());
}

/**
 * Registers the background service worker, requests an FCM token, and saves
 * it to Firestore so a Cloud Function can push to this device later. Safe to
 * call repeatedly (e.g. once per app load) — tokens can rotate, and this
 * keeps Firestore holding whatever's current.
 *
 * Returns the token string, or null if push isn't available/permitted here.
 */
export async function registerPush({ employeeId, role } = {}) {
  if (!firebaseEnabled) return null;
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;
  if (!FCM_VAPID_KEY) {
    console.warn("registerPush: VITE_FCM_VAPID_KEY is not set — see .env.example.");
    return null;
  }
  if (Notification.permission !== "granted") return null;

  try {
    const registration = await navigator.serviceWorker.register(SW_URL);
    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;

    await setDoc(
      tokenDocRef(),
      {
        token,
        employeeId: employeeId || null,
        role: role || null,
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return token;
  } catch (err) {
    console.warn("registerPush failed:", err?.message || err);
    return null;
  }
}

/** Called on logout / "disable notifications" — stops this device from
 * receiving pushes without touching any other device's subscription. */
export async function unregisterPush() {
  try {
    const messaging = await getMessagingIfSupported();
    if (messaging) await deleteToken(messaging).catch(() => {});
    if (firebaseEnabled) await deleteDoc(tokenDocRef()).catch(() => {});
  } catch {
    // best-effort — a stale token just fails silently server-side
  }
}

/**
 * Foreground delivery: FCM only auto-displays a message via the service
 * worker when the tab isn't focused. While the POS is open and focused, the
 * data-only payload arrives here instead, so the caller can route it through
 * the same notify()/beep()/history path a locally-detected event would use.
 */
export function onForegroundPush(callback) {
  let unsub = () => {};
  getMessagingIfSupported().then((messaging) => {
    if (!messaging) return;
    unsub = onMessage(messaging, (payload) => callback(payload.data || {}));
  });
  return () => unsub();
}
