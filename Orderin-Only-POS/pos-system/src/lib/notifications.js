// Two things live here: (1) a thin wrapper around the browser Notification
// API for OS-level popups while the POS is open in a tab, and (2) the
// notification *history* — what powers the /notifications page and the
// unread badge. The history used to be device-local (localStorage); it's now
// backed by Firestore (Restaurant/{RESTAURANT_ID}/notifications) so an alert
// raised by this device, another device, or a Cloud Function while the app
// was closed (see functions/index.js + lib/push.js) all land in the same
// list. The read API below (getHistory/unreadCount/markRead/...) keeps its
// original synchronous shape on purpose — everything reads from an in-memory
// cache kept current by a live Firestore listener, so Notifications.jsx,
// Topbar.jsx and Settings.jsx needed zero changes for this swap.
//
// See src/components/NotificationWatcher.jsx for the event wiring and the
// "Notifications" tab in src/pages/Settings.jsx for the user controls.

import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, writeBatch,
} from "firebase/firestore";
import { emit, EVENTS } from "./bus";
import { db, RESTAURANT_ID, firebaseEnabled } from "./firebase";

const PREFS_KEY = "orderin_notify_prefs";
const HISTORY_LIMIT = 200;

const DEFAULT_PREFS = {
  enabled: true,
  newOrder: true,
  kitchenDelay: true,
  lowStock: true,
  printFail: true,
  activity: true,
  sound: true,
};

export const NOTIFY_CATEGORIES = [
  { key: "newOrder", label: "New orders" },
  { key: "kitchenDelay", label: "Kitchen delays" },
  { key: "lowStock", label: "Low stock alerts" },
  { key: "printFail", label: "Print failures" },
  // Menu, inventory catalog edits, staff, suppliers, expenses, settings, and
  // order status/cancel/refund — anything else the app does a CRUD write for
  // (see functions/index.js onAuditLogCreated). Admin/manager only server-side.
  { key: "activity", label: "Menu, staff & other updates" },
];

export function notifySupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permission() {
  return notifySupported() ? Notification.permission : "denied";
}

export async function requestPermission() {
  if (!notifySupported()) return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    // Older Safari used a callback signature; fall back to whatever it is now.
    return Notification.permission;
  }
}

export function getPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage disabled — prefs just won't persist this session.
  }
  return next;
}

// --- notification history (Firestore-backed, shared across every device
// this restaurant runs the POS on). ---

function notificationsCollectionRef() {
  return collection(db, "Restaurant", RESTAURANT_ID, "notifications");
}

// In-memory mirror of the live query below. Synchronous reads (getHistory(),
// unreadCount()) serve straight from this — it starts empty and fills in the
// moment the first snapshot arrives, same cold-start feel the old
// localStorage version had on a brand-new device.
let cache = [];
let listening = false;

function startHistorySync() {
  if (listening || !firebaseEnabled) return;
  listening = true;
  const q = query(notificationsCollectionRef(), orderBy("at", "desc"), limit(HISTORY_LIMIT));
  onSnapshot(
    q,
    (snapshot) => {
      cache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      emit(EVENTS.NOTIFICATIONS_CHANGED);
    },
    (err) => console.warn("notification history listener failed:", err?.message || err)
  );
}

export function getHistory() {
  startHistorySync();
  return cache;
}

/** Record an alert. Called for every event the app raises, regardless of
 *  whether an OS popup was actually shown — and safe to call for an event a
 *  Cloud Function *also* records: `refId` (the order/item/job id) makes the
 *  Firestore doc id deterministic, so both writers land on the same
 *  document instead of creating duplicates. */
export function recordNotification({ category, title, body, url, refId }) {
  startHistorySync();
  const id = `${category || "alert"}_${refId != null ? refId : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`}`;
  const entry = { category: category || null, title, body: body || "", url: url || null, at: Date.now(), read: false };
  if (firebaseEnabled) {
    setDoc(doc(notificationsCollectionRef(), id), entry, { merge: true }).catch((err) =>
      console.warn("recordNotification failed:", err?.message || err)
    );
  }
  return { id, ...entry };
}

export function unreadCount() {
  return getHistory().filter((n) => !n.read).length;
}

export function markRead(id) {
  updateDoc(doc(notificationsCollectionRef(), id), { read: true }).catch(() => {});
}

export function markAllRead() {
  const unread = cache.filter((n) => !n.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(notificationsCollectionRef(), n.id), { read: true }));
  batch.commit().catch(() => {});
}

export function deleteNotification(id) {
  deleteDoc(doc(notificationsCollectionRef(), id)).catch(() => {});
}

export function clearHistory() {
  if (!cache.length) return;
  const batch = writeBatch(db);
  cache.forEach((n) => batch.delete(doc(notificationsCollectionRef(), n.id)));
  batch.commit().catch(() => {});
}

// A burst of orders/alerts arriving together must not turn into a machine-gun
// of overlapping beeps. One beep per this window, no matter how many popups.
const BEEP_MIN_GAP_MS = 4000;
let lastBeepAt = 0;

// A real bell doesn't ring in a harmonic overtone series (1x, 2x, 3x...) —
// that's what makes a flute sound like a flute. It rings on a handful of
// *inharmonic* partials, which is what actually reads as "metal" to the ear.
// Ratios below approximate a small, bright countertop service bell.
const BELL_PARTIALS = [
  { ratio: 1, gain: 1.0 },
  { ratio: 1.5, gain: 0.55 },
  { ratio: 2.4, gain: 0.35 },
  { ratio: 3.2, gain: 0.22 },
  { ratio: 4.7, gain: 0.12 },
];
const BELL_FREQ = 1100; // bright/high — a front-desk "ding", not a church bell
const BELL_PEAK_SCALE = 0.3; // headroom so 5 summed partials + the strike noise don't clip

/** One strike: the tonal partials above, plus a very short high-passed noise
 * burst standing in for the metallic "clack" of the striker hitting the bell. */
function strikeBell(ctx, time, intensity, decay) {
  BELL_PARTIALS.forEach(({ ratio, gain }) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = BELL_FREQ * ratio;
    osc.connect(g);
    g.connect(ctx.destination);
    const peak = intensity * gain * BELL_PEAK_SCALE;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.start(time);
    osc.stop(time + decay + 0.05);
  });

  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.025));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 3500;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(intensity * 0.22, time);
  noise.connect(highpass);
  highpass.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(time);
}

/** Classic kitchen/counter service bell — a sharp double "ding-ding", louder
 * than a typical UI chime on purpose so it cuts through a working kitchen.
 * Only plays while this tab is loaded somewhere (even unfocused in the
 * background) — Web Audio has no access outside a running page, so a fully
 * closed browser falls back to the OS's own notification sound instead (see
 * public/firebase-messaging-sw.js, which can't attach a custom sound file —
 * no browser exposes that from a service worker). */
function beep() {
  const now = Date.now();
  if (now - lastBeepAt < BEEP_MIN_GAP_MS) return;
  lastBeepAt = now;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    strikeBell(ctx, ctx.currentTime, 1.0, 0.9);
    strikeBell(ctx, ctx.currentTime + 0.22, 0.8, 0.75);
    setTimeout(() => ctx.close(), 1300);
  } catch {
    // Autoplay policy may block this until the first user gesture — ignore.
  }
}

/**
 * Show an OS notification for `category`, unless the user has muted it (master
 * switch or per-category) or hasn't granted permission. `url` is an absolute
 * app path the click handler navigates to. Returns true if a popup was shown.
 */
export function notify(category, title, { body, tag, url } = {}) {
  const prefs = getPrefs();
  if (!notifySupported() || permission() !== "granted") return false;
  if (!prefs.enabled || (category && prefs[category] === false)) return false;

  try {
    const n = new Notification(title, {
      body: body || "",
      tag: tag || category || "orderin",
      icon: "/favicon.svg",
    });
    n.onclick = () => {
      window.focus();
      if (url) window.location.assign(url);
      n.close();
    };
    setTimeout(() => n.close(), 8000);
    if (prefs.sound) beep();
    return true;
  } catch {
    return false;
  }
}

export function sendTestNotification() {
  return notify(null, "Orderin POS", {
    body: "Notifications are working. You'll be alerted here.",
    tag: "orderin-test",
  });
}
