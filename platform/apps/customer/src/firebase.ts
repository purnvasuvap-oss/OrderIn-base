import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { resolveRestaurantRef } from '@orderin/core';
import type { Gateway, MenuItem, Profile } from './types';

const publicConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAkRQXh5tKRSajUFe9T0ioBz3iF-AAbz6E',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'orderin-7f8bc.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'orderin-7f8bc',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'orderin-7f8bc.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '977042319750',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:977042319750:web:3ddde13ba464854b69a407',
};

function functionsBase() {
  return import.meta.env.VITE_FUNCTIONS_BASE || `https://us-central1-${publicConfig.projectId}.cloudfunctions.net`;
}

export function createGateway(): Gateway {
  const app = initializeApp(publicConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'us-central1');
  let restaurantId = '';
  let tableId = '';
  let orderId = '';
  let ready = false;

  async function sessionClaims() {
    if (!auth.currentUser) await signInAnonymously(auth);
    const token = await auth.currentUser!.getIdTokenResult(true);
    return token.claims as { sessionId?: string };
  }

  return {
    resolve() {
      const ref = resolveRestaurantRef({
        host: window.location.host,
        search: window.location.search,
        pathname: window.location.pathname,
      });
      tableId = ref.tableId;
      return ref;
    },
    async load(ref) {
      let id = ref.restaurantId;
      if (!id && ref.subdomain) {
        const index = await getDoc(doc(db, 'restaurantIndex', ref.subdomain));
        id = index.exists() ? String(index.data().restaurantId || '') : '';
      }
      restaurantId = id;
      if (!id) return { profile: null, menu: [] };
      const profileSnap = await getDoc(doc(db, 'Restaurant', id, 'profile', 'public'));
      const menuSnap = await getDocs(collection(db, 'Restaurant', id, 'menu'));
      return {
        profile: profileSnap.exists() ? (profileSnap.data() as Profile) : null,
        menu: menuSnap.docs.map((row) => ({ id: row.id, ...row.data() }) as MenuItem),
      };
    },
    async ensureSession(nextTable) {
      tableId = nextTable;
      if (ready) return;
      if (!auth.currentUser) await signInAnonymously(auth);
      const open = httpsCallable(functions, 'openTableSession');
      await open({ restaurantId, tableId: nextTable });
      await auth.currentUser!.getIdToken(true);
      ready = true;
    },
    async place(input) {
      const claims = await sessionClaims();
      const placeOrder = httpsCallable(functions, 'placeOrder');
      const result = await placeOrder({
        restaurantId,
        tableId,
        sessionId: claims.sessionId,
        items: input.lines,
        customerName: input.name || null,
        customerPhone: input.phone || null,
        loyaltyOptIn: Boolean(input.loyaltyOptIn),
      });
      const data = result.data as { order?: { id: string } };
      orderId = data.order?.id || orderId;
      return data;
    },
    async request(type) {
      const claims = await sessionClaims();
      const call = httpsCallable(functions, 'serviceRequest');
      await call({ restaurantId, tableId, sessionId: claims.sessionId, type });
    },
    async payOnline(amountPaise) {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${functionsBase()}/createRazorpayOrder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ restaurantId, orderId, amountPaise }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Payment could not start');
      await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const Razorpay = window.Razorpay;
        if (!Razorpay) {
          reject(new Error('Could not load Razorpay'));
          return;
        }
        const checkout = new Razorpay({
          key: payload.keyId,
          amount: payload.amount,
          currency: 'INR',
          order_id: payload.order_id,
          handler: async (paid: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            const verify = await fetch(`${functionsBase()}/verifyRazorpayPayment`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ ...paid, restaurantId, orderId }),
            });
            if (!verify.ok) reject(new Error('Payment was not confirmed'));
            else resolve();
          },
          modal: { ondismiss: () => reject(new Error('Payment closed')) },
        });
        checkout.open();
      });
    },
    async feedback(rating, comment) {
      const claims = await sessionClaims();
      const save = httpsCallable(functions, 'saveFeedback');
      const result = await save({ restaurantId, sessionId: claims.sessionId, orderId, rating, comment });
      const data = result.data as { review?: { show: boolean; url?: string } };
      return { show: Boolean(data.review?.show), url: data.review?.url };
    },
  };
}

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay'));
    document.body.appendChild(script);
  });
}

declare global {
  interface Window {
    Razorpay?: new (options: any) => { open: () => void };
  }
}
