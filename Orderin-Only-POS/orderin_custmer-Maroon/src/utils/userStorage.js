// src/utils/userStorage.js
//
// `localStorage.getItem("user")` was being JSON.parse'd directly in a dozen+
// places across cart/checkout/payments code with no try/catch. If that value
// is ever corrupted (a browser extension touching localStorage, a manual
// edit, or a prior partial/interrupted write), every one of those call sites
// throws uncaught — several of them inside a useEffect with no error
// boundary, which silently breaks checkout/order-tracking for that session.
// Centralizing the parse here means a corrupted value degrades to "logged
// out" instead of crashing.

/** Reads and parses the stored `user` object, or null if missing/corrupted. */
export const safeGetUser = () => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("safeGetUser: corrupted 'user' value in localStorage, treating as logged out", e);
    return null;
  }
};
