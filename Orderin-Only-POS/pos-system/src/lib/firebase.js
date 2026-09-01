import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

// Same Firebase project used by the other Orderin apps (order_clients-Maroon,
// orderin_custmer-Maroon, etc.) — see src/firebase.js in those folders. The
// POS syncs into its own restaurant's data under "Restaurant/{RESTAURANT_ID}/..."
// (orders, products, categories, inventory, employees, suppliers, expenses,
// wastage, customers, settings — see sync.js / realtime.js), matching the
// same nested convention the other client apps and orderin_admin use, so it's
// safe to share the project and visible to the shared admin dashboard.
// A client-side Firebase config isn't a secret — access is controlled by
// Firestore security rules, not by hiding this object — so hardcoding it
// here matches how every sibling app in this repo does it.
const DEFAULT_CONFIG = {
  apiKey: "AIzaSyAkRQXh5tKRSajUFe9T0ioBz3iF-AAbz6E",
  authDomain: "orderin-7f8bc.firebaseapp.com",
  projectId: "orderin-7f8bc",
  storageBucket: "orderin-7f8bc.firebasestorage.app",
  messagingSenderId: "977042319750",
  appId: "1:977042319750:web:3ddde13ba464854b69a407",
  measurementId: "G-K939RFQGZ4",
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

// Restaurant doc id this POS syncs under — mirrors the other apps' hardcoded
// RESTAURANT_ID pattern (e.g. Orderin-RED-Theme's "orderin_restaurant_1").
export const RESTAURANT_ID = "orderin_restaurant_pos";

const app = getApps().length ? getApps()[0] : initializeApp(cfg);
const db = getFirestore(app);

// Self-registers this restaurant in the shared top-level "Restaurant"
// collection that orderin_admin's loadPrimaryRestaurants reads from, so it
// shows up in the admin dashboard without a manual Firestore write. Only
// fills in the doc if it doesn't already exist — never overwrites fields an
// admin has since edited (name, owner, bank details, status...). `status` is
// deliberately omitted: orderin_admin already treats a missing status as
// "Off", so a brand-new restaurant stays inactive until an admin turns it on.
export async function ensureRestaurantDoc() {
  if (!firebaseEnabled) return;
  try {
    const ref = doc(db, "Restaurant", RESTAURANT_ID);
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    await setDoc(ref, {
      Restaurant_name: "Orderin POS",
      city: "",
      Owner: "",
      Owner_Contact: "",
      email: "",
      address: "",
      account: "",
      IFSC: "",
    });
  } catch (err) {
    console.warn("ensureRestaurantDoc failed:", err?.message || err);
  }
}

export { app, db };
