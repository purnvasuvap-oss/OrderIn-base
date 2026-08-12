import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Same Firebase project used by the other Orderin apps (order_clients-Maroon,
// orderin_custmer-Maroon, etc.) — see src/firebase.js in those folders. The
// POS uses its own top-level collections (orders, products, categories,
// inventory, employees, suppliers, expenses, wastage, customers, settings)
// which don't overlap with the other apps' nested "Restaurant/{id}/..." data,
// so it's safe to share the project without touching their data.
// A client-side Firebase config isn't a secret — access is controlled by
// Firestore security rules, not by hiding this object — so hardcoding it
// here matches how every sibling app in this repo does it.
const DEFAULT_CONFIG = {
  apiKey: "AIzaSyAkRQXh5tKRSajUFe9T0ioBz3iF-AAbz6E",
  authDomain: "orderin-7f8bc.firebaseapp.com",
  projectId: "orderin-7f8bc",
  storageBucket: "orderin-7f8bc.firebasestorage.app",
  messagingSenderId: "977042319750",
  appId: "1:977042319750:web:f71a81c21ba20a5a69a407",
  measurementId: "G-ETFSL4X1ST",
};

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_CONFIG.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_CONFIG.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_CONFIG.appId,
};

export const firebaseEnabled = Boolean(cfg.apiKey && cfg.projectId);

const app = getApps().length ? getApps()[0] : initializeApp(cfg);
const db = getFirestore(app);

export { app, db };
