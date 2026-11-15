// Quick diagnostic script to test if auth is properly initialized
// Run this in the browser console after the app loads

import { auth } from './src/firebaseConfig.js';

console.log('=== AUTH DIAGNOSTIC ===');
console.log('auth object:', auth);
console.log('auth type:', typeof auth);
console.log('auth.app:', auth?.app);
console.log('auth.currentUser:', auth?.currentUser);
console.log('================');
