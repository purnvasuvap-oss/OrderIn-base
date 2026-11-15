import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";

// Note: this only makes the CALLER stop waiting after `ms` — the Firestore
// SDK has no way to actually cancel an in-flight getDocs() call, so the
// original request still completes in the background (wasting Firestore
// read quota on a timed-out query). Its result is otherwise safely ignored:
// Promise.race never attaches a .then() to the loser, so a late resolution
// here can't overwrite state after the timeout path already ran.
export const withTimeout = (promise, ms) => {
  const t = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
  return Promise.race([promise, t]);
};

// Relocated from Menu.jsx (same Firestore path/logic) so both the
// authenticated Menu page and the pre-login public flipbook menu share one
// implementation instead of two copies that could drift apart.
export const fetchMenuItems = async (restaurantId, { timeoutMs = 8000 } = {}) => {
  const snap = await withTimeout(getDocs(collection(db, "Restaurant", restaurantId, "menu")), timeoutMs);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const fetchPromotions = async (restaurantId, { timeoutMs = 5000 } = {}) => {
  try {
    const snap = await withTimeout(getDocs(collection(db, "Restaurant", restaurantId, "promotions")), timeoutMs);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const now = Date.now();
    return list.filter((p) => {
      if (!p.expiryAt) return false;
      const expiry = typeof p.expiryAt === "object" && p.expiryAt.toMillis ? p.expiryAt.toMillis() : p.expiryAt;
      return expiry >= now;
    });
  } catch (err) {
    console.warn("fetchPromotions", err);
    return [];
  }
};
