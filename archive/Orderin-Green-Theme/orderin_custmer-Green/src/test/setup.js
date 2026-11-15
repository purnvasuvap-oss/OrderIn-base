import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// --- Firebase SDK stubs -------------------------------------------------
// src/firebaseConfig.js calls initializeApp / initializeAuth / getAnalytics
// at import time, which need the network and break under jsdom. Stub the
// SDK entry points so any module importing firebase loads harmlessly.
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ options: { projectId: 'test' } })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({ options: { projectId: 'test' } })),
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({})),
  getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/mock.png')),
  uploadBytes: vi.fn(() => Promise.resolve({})),
  deleteObject: vi.fn(() => Promise.resolve()),
}));
vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => ({})),
  isSupported: vi.fn(() => Promise.resolve(false)),
}));
vi.mock('firebase/auth', () => {
  const auth = { currentUser: null };
  return {
    getAuth: vi.fn(() => auth),
    initializeAuth: vi.fn(() => auth),
    browserLocalPersistence: {},
    indexedDBLocalPersistence: {},
    connectAuthEmulator: vi.fn(),
    onAuthStateChanged: vi.fn(() => () => {}),
    signInWithPhoneNumber: vi.fn(() => Promise.resolve({ confirm: vi.fn() })),
    signInAnonymously: vi.fn(() => Promise.resolve({ user: { uid: 'anon' } })),
    RecaptchaVerifier: vi.fn(() => ({ render: vi.fn(() => Promise.resolve(1)), clear: vi.fn() })),
    signOut: vi.fn(() => Promise.resolve()),
  };
});
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ app: { options: { projectId: 'test' } } })),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: 'mock', path: 'mock/path' })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [], forEach: () => {}, empty: true, size: 0 })),
  setDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-doc' })),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => ({ __type: 'serverTimestamp' })),
  Timestamp: {
    fromDate: (d) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000) }),
    now: () => ({ toDate: () => new Date(), seconds: Math.floor(Date.now() / 1000) }),
  },
}));

// `restoreMocks: true` wipes vi.fn() implementations between tests, so
// (re)install the jsdom polyfills the app relies on before every test.
beforeEach(() => {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
  window.prompt = vi.fn(() => '');
  window.scrollTo = vi.fn();
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
