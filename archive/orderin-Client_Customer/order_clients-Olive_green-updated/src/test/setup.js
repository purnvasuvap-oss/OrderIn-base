import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

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
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// --- Firebase stubs -------------------------------------------------------
// src/firebase.js calls initializeApp / getAnalytics / getAuth at import time,
// which hit the network and break under jsdom. Stub the SDK entry points so any
// module that imports firebase loads harmlessly. Individual tests still mock
// `../firebase` (or its helpers) with `vi.mock` when they need specific data.
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ options: { projectId: 'test' } })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({ options: { projectId: 'test' } })),
}));

vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => ({})),
  isSupported: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  signInAnonymously: vi.fn(() => Promise.resolve({ user: { uid: 'anon' } })),
  onAuthStateChanged: vi.fn(() => () => {}),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ app: { options: { projectId: 'test' } } })),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ path: 'mock/path' })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [], forEach: () => {}, size: 0, empty: true })),
  updateDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-doc' })),
  setDoc: vi.fn(() => Promise.resolve()),
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
