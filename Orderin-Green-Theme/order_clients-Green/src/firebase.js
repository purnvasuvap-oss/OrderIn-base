import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAkRQXh5tKRSajUFe9T0ioBz3iF-AAbz6E",
  authDomain: "orderin-7f8bc.firebaseapp.com",
  projectId: "orderin-7f8bc",
  storageBucket: "orderin-7f8bc.firebasestorage.app",
  messagingSenderId: "977042319750",
  appId: "1:977042319750:web:f71a81c21ba20a5a69a407",
  measurementId: "G-ETFSL4X1ST"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// Monitor auth state and ensure an authenticated client for Storage writes.
onAuthStateChanged(auth, (user) => {
  console.log('Auth state changed:', user ? { uid: user.uid, isAnonymous: user.isAnonymous } : null);
});

// Automatic anonymous sign-in is disabled to avoid admin-restricted-operation errors
// (enable/trigger manually only if you need legacy Firebase Storage operations).
let lastAuthError = null;

console.log('Firebase project:', app?.options?.projectId);

export function getAuthInfo() {
  return {
    isAnonymousSignedIn: Boolean(auth.currentUser),
    lastAuthError
  };
}

export async function trySignInAnonymously() {
  try {
    const cred = await signInAnonymously(auth);
    lastAuthError = null;
    console.log('Anonymous sign-in succeeded:', cred.user && { uid: cred.user.uid });
    return { success: true, uid: cred.user && cred.user.uid };
  } catch (err) {
    lastAuthError = err && err.message ? err.message : String(err);
    console.warn('Retry anonymous sign-in failed:', err);
    return { success: false, error: lastAuthError };
  }
}
export const verifyMainLogin = async (username, password) => {
  console.log("Attempting login with username:", username, "password:", password ? '***' : '(empty)');
  // Ensure inactive period is enforced (may flip status to 'Off' if expired),
  // then check restaurant status before attempting credential check.
  try {
    await checkAndExpireInactiveStatus();
    const restStatus = await getRestaurantStatus();
    if (!restStatus.allowed) {
      console.warn('Login blocked by restaurant status:', restStatus);
      return false;
    }
  } catch (err) {
    console.warn('Could not determine restaurant status, proceeding with login check', err);
  }

  const userDocRef = doc(db, "Restaurant", "orderin_restaurant_4", "accessControl", "roles", "mainLogin", username);
  try {
    console.log('verifyMainLogin - doc path:', userDocRef.path, 'project:', app?.options?.projectId);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      console.log("User doc data:", data);
      const isValid = data.password === password;
      console.log("Password match:", isValid);
      return isValid;
    } else {
      console.log("User doc does not exist for username:", username);
      return false;
    }
  } catch (error) {
    console.error('verifyMainLogin - error fetching doc:', userDocRef.path, error);
    throw error;
  }
};

// Returns restaurant status info and whether login actions are allowed.
export const getRestaurantStatus = async () => {
  const restRef = doc(db, "Restaurant", "orderin_restaurant_4");
  try {
    const snap = await getDoc(restRef);
    if (!snap.exists()) {
      return { status: 'Unknown', allowed: true };
    }
    const data = snap.data() || {};
    const status = (data.status || 'Active').toString();

    if (status === 'Active') {
      return { status, allowed: true, daysLeft: null };
    }

    if (status === 'Off') {
      return { status, allowed: false, daysLeft: 0 };
    }

    // status === 'Inactive' or other
    if (status === 'Inactive') {
      // Look for an explicit `inactiveTimestamp` first, then fallback fields.
      const tsCandidate = data.inactiveTimestamp || data.statusChangedAt || data.statusUpdatedAt || data.inactiveSince;
      const parseTimestamp = (ts) => {
        if (!ts) return null;
        // Firestore Timestamp object
        if (typeof ts.toDate === 'function') return ts.toDate();
        // seconds/nanoseconds object (server-exported)
        if (ts.seconds && typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
        // unix ms number
        if (typeof ts === 'number') return new Date(ts);
        // ISO string
        if (typeof ts === 'string') {
          const d = new Date(ts);
          if (!Number.isNaN(d.getTime())) return d;
        }
        return null;
      };

      const changedAt = parseTimestamp(tsCandidate);
      if (changedAt) {
        const now = new Date();
        const elapsedMs = now - changedAt;
        const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
        // Allowed for up to 5 full days after the timestamp. After 5 days => blocked.
        const daysLeft = Math.max(0, 5 - elapsedDays);
        return { status, allowed: daysLeft > 0, daysLeft };
      }

      // If we don't have a usable timestamp, be conservative and disallow login.
      return { status, allowed: false, daysLeft: 0 };
    }

    // Unknown status value - allow by default but return info
    return { status, allowed: true, daysLeft: null };
  } catch (error) {
    console.error('getRestaurantStatus - error fetching restaurant doc:', error);
    throw error;
  }
};

// Helper: parse different timestamp shapes into a JS Date or null.
const parseTimestamp = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts.seconds && typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts === 'string') {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
};

// If restaurant is Inactive and the 5-day window has expired, update to 'Off'.
export const checkAndExpireInactiveStatus = async () => {
  const restRef = doc(db, "Restaurant", "orderin_restaurant_4");
  try {
    const snap = await getDoc(restRef);
    if (!snap.exists()) return;
    const data = snap.data() || {};
    const status = (data.status || 'Active').toString();
    if (status !== 'Inactive') return;

    const tsCandidate = data.inactiveTimestamp || data.statusChangedAt || data.statusUpdatedAt || data.inactiveSince;
    const changedAt = parseTimestamp(tsCandidate);
    if (!changedAt) return;

    const now = new Date();
    const elapsedMs = now - changedAt;
    const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
    if (elapsedDays >= 5) {
      // Transition to 'Off' state
      try {
        await updateDoc(restRef, {
          status: 'Off',
          statusChangedAt: now
        });
        console.log('Restaurant status auto-updated from Inactive to Off');
      } catch (err) {
        console.warn('Failed to update restaurant status to Off:', err);
      }
    }
  } catch (error) {
    console.error('checkAndExpireInactiveStatus - error:', error);
    throw error;
  }
};

export const verifySectionPasscode = async (sectionName, passcode) => {
  const sectionRef = collection(db, "Restaurant", "orderin_restaurant_4", "accessControl", "roles", sectionName);
  const querySnapshot = await getDocs(sectionRef);
  for (const doc of querySnapshot.docs) {
    const data = doc.data();
    if (data.passcodeHash === passcode) {
      return true;
    }
  }
  return false;
};

// Live-subscribe to the restaurant's "accepting orders" toggle. Defaults to
// `true` when the field is missing so restaurants that never touch this
// toggle keep accepting orders exactly as before this feature existed.
export function subscribeAcceptingOrders(onUpdate) {
  // NOTE: every other collection in this app (orders, menu, inventory,
  // staff, tables) and the entire customer-facing app read/write
  // "orderin_restaurant_4" — using a different id here would write this
  // toggle to a document the customer app never looks at.
  const restRef = doc(db, "Restaurant", "orderin_restaurant_4");
  return onSnapshot(restRef, (snap) => {
    const data = snap.exists() ? snap.data() || {} : {};
    const accepting = data.acceptingOrders === undefined ? true : Boolean(data.acceptingOrders);
    onUpdate(accepting);
  }, (err) => {
    console.error("subscribeAcceptingOrders - snapshot error:", err);
  });
}

// Flip the restaurant's "accepting orders" toggle. Writes directly onto the
// same Restaurant/{RESTAURANT_ID} doc read by getRestaurantStatus, etc.
export const setAcceptingOrders = async (value) => {
  const restRef = doc(db, "Restaurant", "orderin_restaurant_4");
  try {
    await updateDoc(restRef, { acceptingOrders: Boolean(value) });
  } catch (error) {
    console.error("setAcceptingOrders - error updating doc:", error);
    throw error;
  }
};

export { app, auth, db, updateDoc, analytics };
