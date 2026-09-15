// Firebase Cloud Messaging background handler.
//
// This file MUST be served from the site root (public/firebase-messaging-sw.js
// -> https://<host>/firebase-messaging-sw.js) — that's a hard FCM requirement,
// not a convention. It runs in a separate worker context with no access to
// the app's modules, so it uses the "compat" SDK via importScripts() and
// re-declares the same Firebase config from src/lib/firebase.js by hand.
//
// Push messages are sent as *data-only* (see functions/index.js sendPush()),
// deliberately with no top-level "notification" field, so this handler is the
// only thing that ever calls showNotification() for a background push — the
// same title/body/tag/url shape the app's own notify() helper uses in the
// foreground (src/lib/notifications.js), so a punter can't tell which path a
// given alert came from.

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAkRQXh5tKRSajUFe9T0ioBz3iF-AAbz6E",
  authDomain: "orderin-7f8bc.firebaseapp.com",
  projectId: "orderin-7f8bc",
  storageBucket: "orderin-7f8bc.firebasestorage.app",
  messagingSenderId: "977042319750",
  appId: "1:977042319750:web:3ddde13ba464854b69a407",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || "Orderin POS";
  self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag || data.category || "orderin",
    icon: "/favicon.svg",
    // There's no standard way to attach a custom sound file here — the OS's
    // own notification chime plays instead (silent:false is the default, set
    // explicitly so it's clear that's deliberate, not an oversight). Vibration
    // *is* something we control, so mirror the app's double bell-strike "ding-
    // ding" as a double buzz on devices that support it.
    silent: false,
    vibrate: [200, 90, 200],
    data: { url: data.url || "/notifications" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    })
  );
});
