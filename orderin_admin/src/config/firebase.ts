// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyAk-pLesgCvvG2yoq22IgU575l_NkjfddA',
  authDomain: 'orderin-7f8bc.firebaseapp.com',
  projectId: 'orderin-7f8bc',
  storageBucket: 'orderin-7f8bc.firebasestorage.app',
  messagingSenderId: '977042319750',
  appId: '1:977042319750:web:fbdd7df96eba136669a407',
  measurementId: 'G-VKTVY98QFT',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics
const analytics = getAnalytics(app);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Storage
export const storage = getStorage(app);

// Export app and analytics
export { app, analytics };
