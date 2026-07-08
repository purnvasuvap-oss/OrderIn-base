// Import the functions you need from the SDKs you need
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, initializeAuth, browserLocalPersistence, connectAuthEmulator } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// Use the working Firebase configuration provided
const firebaseConfig = {
  apiKey: "AIzaSyAkRQXh5tKRSajUFe9T0ioBz3iF-AAbz6E",
  authDomain: "orderin-7f8bc.firebaseapp.com",
  projectId: "orderin-7f8bc",
  storageBucket: "orderin-7f8bc.firebasestorage.app",
  messagingSenderId: "977042319750",
  appId: "1:977042319750:web:db7f2ecbba2edb2a69a407",
  measurementId: "G-B3GKRJ27DS"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication with explicit persistence
export const auth = (() => {
  try {
    // Try to initialize with explicit persistence
    const authInstance = initializeAuth(app, {
      persistence: [browserLocalPersistence]
    });
    console.info('Firebase Auth initialized with initializeAuth');
    
    // Preemptively set appVerificationDisabledForTesting to avoid Firebase SDK bug
    // and enable a developer testing bypass when running locally. This property
    // gets accessed by the RecaptchaVerifier constructor.
    try {
      const shouldDisable = (typeof window !== 'undefined' && (window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))) || (process && process.env && process.env.NODE_ENV !== 'production');
      const value = shouldDisable ? true : false;
      Object.defineProperty(authInstance, 'appVerificationDisabledForTesting', {
        value,
        writable: true,
        configurable: true,
        enumerable: true
      });
      console.info('appVerificationDisabledForTesting property defined =', value);
    } catch (err) {
      console.warn('Could not set appVerificationDisabledForTesting property', err);
    }
    
    return authInstance;
  } catch (e) {
    // If already initialized, just use getAuth
    console.info('Auth already initialized, using getAuth:', e.message);
    const authInstance = getAuth(app);
    
    // Ensure the property exists on the fallback auth instance as well
    try {
      const shouldDisable = (typeof window !== 'undefined' && (window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))) || (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production');
      const value = shouldDisable ? true : false;
      Object.defineProperty(authInstance, 'appVerificationDisabledForTesting', {
        value,
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch (err) {
      console.warn('Could not set appVerificationDisabledForTesting on fallback auth', err);
    }
    
    console.info('Auth from getAuth:', typeof authInstance);
    return authInstance;
  }
})();

console.info('firebaseConfig: auth object exported');

console.info('firebaseConfig: auth object exported');

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Initialize Analytics if available (catch for environments without a window/Analytics support)
export const analytics = (() => {
  try {
    return getAnalytics(app);
  } catch (e) {
    console.info('Firebase Analytics not initialized:', e?.message || e);
    return null;
  }
})();

// Connect to Auth emulator when running on localhost to enable phone auth testing.
// Probe the emulator endpoint first; if it's not reachable we skip connecting so
// the app does not produce noisy connection-refused errors in the browser.
(async function tryConnectAuthEmulator() {
  try {
    if (typeof window === 'undefined') return;
    const hostname = window.location && window.location.hostname;

    // Developer opt-in to using the Auth emulator. Prevents noisy "connection refused" errors
    // when the emulator is not running in local environments. Use any of:
    //  - Set REACT_APP_AUTH_EMULATOR=true in env
    //  - Set localStorage.setItem('useAuthEmulator', '1')
    //  - Add URL param ?useEmulator=1 during testing
    const useEmulatorFlag = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_AUTH_EMULATOR === 'true')
      || (window.localStorage && window.localStorage.getItem && window.localStorage.getItem('useAuthEmulator') === '1')
      || (window.location && window.location.search && window.location.search.indexOf('useEmulator=1') !== -1);

    // Only run probe on localhost/127.0.0.1 AND when the developer has opted-in
    if (!(hostname === 'localhost' || hostname === '127.0.0.1') || !useEmulatorFlag) return;

    const probeUrl = 'http://localhost:9099/';
    const probe = async () => {
      try {
        const resp = await fetch(probeUrl, { method: 'GET', cache: 'no-store' });
        return resp && resp.ok;
      } catch (err) {
        return false;
      }
    };

    // Timeout the probe quickly so page load isn't delayed.
    const ok = await Promise.race([probe(), new Promise((res) => setTimeout(() => res(false), 800))]);
    if (ok) {
      try {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
        console.info('Connected Firebase Auth emulator at http://localhost:9099');
      } catch (err) {
        console.info('Failed to connect to Auth emulator:', err?.message || err);
      }
    } else {
      console.info('Auth emulator not reachable at http://localhost:9099; skipping emulator connection');
    }
  } catch (e) {
    console.info('Auth emulator probe error:', e?.message || e);
  }
})();
