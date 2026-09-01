// Thin wrapper around the browser Notification API for OS-level popups that
// fire while the POS is open in a tab (desktop + Android Chrome; iOS only when
// installed as a PWA). No service worker / push — a fully closed browser is out
// of scope. See src/components/NotificationWatcher.jsx for the event wiring and
// the "Notifications" tab in src/pages/Settings.jsx for the user controls.

import { emit, EVENTS } from "./bus";

const PREFS_KEY = "orderin_notify_prefs";
const HISTORY_KEY = "orderin_notify_history";
const HISTORY_LIMIT = 100;

const DEFAULT_PREFS = {
  enabled: true,
  newOrder: true,
  kitchenDelay: true,
  lowStock: true,
  printFail: true,
  sound: true,
};

export const NOTIFY_CATEGORIES = [
  { key: "newOrder", label: "New orders" },
  { key: "kitchenDelay", label: "Kitchen delays" },
  { key: "lowStock", label: "Low stock alerts" },
  { key: "printFail", label: "Print failures" },
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

// --- notification history (device-local, so it lives in localStorage next to
// the prefs rather than the synced IndexedDB stores). Powers the
// /notifications page and the unread badge in the top bar. ---

export function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  } catch {
    // storage disabled — history just won't persist
  }
  emit(EVENTS.NOTIFICATIONS_CHANGED);
}

/** Append an entry to the history log. Called for every alert the app raises,
 *  regardless of whether an OS popup was actually shown. */
export function recordNotification({ category, title, body, url }) {
  const entry = {
    id: `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    category: category || null,
    title,
    body: body || "",
    url: url || null,
    at: Date.now(),
    read: false,
  };
  writeHistory([entry, ...getHistory()]);
  return entry;
}

export function unreadCount() {
  return getHistory().filter((n) => !n.read).length;
}

export function markRead(id) {
  writeHistory(getHistory().map((n) => (n.id === id ? { ...n, read: true } : n)));
}

export function markAllRead() {
  writeHistory(getHistory().map((n) => ({ ...n, read: true })));
}

export function deleteNotification(id) {
  writeHistory(getHistory().filter((n) => n.id !== id));
}

export function clearHistory() {
  writeHistory([]);
}

// A burst of orders/alerts arriving together must not turn into a machine-gun
// of overlapping beeps. One beep per this window, no matter how many popups.
const BEEP_MIN_GAP_MS = 4000;
let lastBeepAt = 0;

function beep() {
  const now = Date.now();
  if (now - lastBeepAt < BEEP_MIN_GAP_MS) return;
  lastBeepAt = now;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
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
