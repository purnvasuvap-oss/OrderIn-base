import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { bytesToBase64, kotByStation, parseMenuCsv, tableQrUrl } from '@orderin/core';
import type { FloorData, StaffGateway, StaffUser } from './types';

const publicConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAkRQXh5tKRSajUFe9T0ioBz3iF-AAbz6E',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'orderin-7f8bc.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'orderin-7f8bc',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'orderin-7f8bc.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '977042319750',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:977042319750:web:3ddde13ba464854b69a407',
};

const STAFF_ROLES = ['platformAdmin', 'owner', 'manager', 'captain', 'cashier', 'kitchen'];

export function createGateway(): StaffGateway {
  const app = initializeApp(publicConfig, 'orderin-staff');
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'us-central1');

  async function claims(): Promise<StaffUser> {
    const current = auth.currentUser;
    if (!current) throw new Error('Sign in first');
    const token = await current.getIdTokenResult();
    const role = String(token.claims.role || '');
    if (!STAFF_ROLES.includes(role)) throw new Error('This login is not a staff account.');
    const restaurantIds = Array.isArray(token.claims.restaurantIds) ? token.claims.restaurantIds.map(String) : [];
    const restaurantId = String(token.claims.restaurantId || restaurantIds[0] || '');
    return {
      uid: current.uid,
      email: current.email || '',
      name: current.displayName || current.email || '',
      role,
      restaurantId,
      restaurantIds: restaurantIds.length ? restaurantIds : (restaurantId ? [restaurantId] : []),
    };
  }

  function call<T>(name: string, data: unknown) {
    return httpsCallable(functions, name)(data).then((result) => result.data as T);
  }

  return {
    async login(email, password) {
      await signInWithEmailAndPassword(auth, email, password);
      try {
        return await claims();
      } catch (error) {
        await signOut(auth);
        throw error;
      }
    },
    async logout() {
      await signOut(auth);
    },
    async load(restaurantId): Promise<FloorData> {
      const [profileSnap, menuSnap, orderSnap, tableSnap, requestSnap, customerSnap, reservationSnap] = await Promise.all([
        getDoc(doc(db, 'Restaurant', restaurantId, 'profile', 'public')),
        getDocs(collection(db, 'Restaurant', restaurantId, 'menu')),
        getDocs(collection(db, 'Restaurant', restaurantId, 'orders')),
        getDocs(collection(db, 'Restaurant', restaurantId, 'tables')),
        getDocs(collection(db, 'Restaurant', restaurantId, 'serviceRequests')),
        getDocs(collection(db, 'Restaurant', restaurantId, 'customers')),
        getDocs(collection(db, 'Restaurant', restaurantId, 'reservations')),
      ]);
      const map = (snap: { docs: { id: string; data: () => any }[] }) => snap.docs.map((row) => ({ id: row.id, ...row.data() }));
      return {
        profile: profileSnap.exists() ? profileSnap.data() : null,
        menu: map(menuSnap),
        orders: map(orderSnap),
        tables: map(tableSnap),
        requests: map(requestSnap),
        customers: map(customerSnap),
        reservations: map(reservationSnap),
      };
    },
    async saveProfile(restaurantId, profile) {
      await setDoc(doc(db, 'Restaurant', restaurantId, 'profile', 'public'), profile, { merge: true });
      if (profile.subdomain) {
        await setDoc(doc(db, 'restaurantIndex', profile.subdomain), { restaurantId, name: profile.name || '' });
      }
    },
    async importMenu(restaurantId, csv) {
      const items = parseMenuCsv(csv);
      await Promise.all(items.map((item: any, index: number) => setDoc(
        doc(db, 'Restaurant', restaurantId, 'menu', `item_${index + 1}`),
        item,
      )));
      return items.length;
    },
    async saveTables(restaurantId, tables) {
      await Promise.all(tables.map((tableId) => setDoc(
        doc(db, 'Restaurant', restaurantId, 'tables', tableId),
        { label: tableId, status: 'free' },
        { merge: true },
      )));
      const origin = import.meta.env.VITE_CUSTOMER_ORIGIN || window.location.origin;
      return tables.map((tableId) => tableQrUrl({ origin, restaurantId, tableId }));
    },
    async createStaff(input) {
      await call('createStaffUser', input);
    },
    async updateItem(input) {
      await call('updateItemStatus', input);
    },
    async ack(restaurantId, requestId) {
      await call('acknowledgeServiceRequest', { restaurantId, requestId });
    },
    async move(restaurantId, orderId, toTableId) {
      await call('moveTable', { restaurantId, orderId, toTableId });
    },
    async discount(restaurantId, orderId, amount, reason) {
      await call('applyManagerDiscount', { restaurantId, orderId, amount, reason, coupon: { type: 'flat', value: amount, requiresManager: true, code: 'MANUAL' } });
    },
    async voidOrder(restaurantId, orderId, reason) {
      await call('voidOrder', { restaurantId, orderId, reason });
    },
    async closeDay(restaurantId, businessDate, cashCounted) {
      const result = await call<{ dayClose: any }>('closeDay', { restaurantId, businessDate, cashCounted });
      return result.dayClose;
    },
    async issueCode(restaurantId, orderId) {
      const result = await call<{ code: string }>('issueCounterCode', { restaurantId, orderId });
      return result.code;
    },
    async reserve(input) {
      await call('saveReservation', input);
    },
    async payroll(restaurantId, rows, allowNegative) {
      return call('finalisePayroll', { restaurantId, rows, allowNegative });
    },
    async clock(restaurantId, punch) {
      await call('clock', { restaurantId, punch });
    },
    async addOutlet(input) {
      const result = await call<{ restaurantIds: string[] }>('addOutlet', input);
      return result.restaurantIds;
    },
    async printOrder(order, profile) {
      const tickets = kotByStation(order, profile);
      const url = import.meta.env.VITE_PRINT_BRIDGE_URL || 'http://127.0.0.1:9101/print';
      try {
        for (const ticket of tickets) {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              station: ticket.station,
              contentType: 'application/escpos',
              data: bytesToBase64(ticket.bytes),
            }),
          });
          if (!response.ok) throw new Error('Print bridge refused the ticket');
        }
        return 'Sent to the print bridge';
      } catch (error) {
        return 'Print bridge is not running on this computer. Install the bridge in docs/PRINTING.md, then try again.';
      }
    },
  };
}
