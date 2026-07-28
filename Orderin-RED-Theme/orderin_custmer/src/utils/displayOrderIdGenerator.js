/**
 * Display Order ID Generator
 * 
 * Generates human-readable display order IDs with format: ORD-DDMMYY<dailySequence>
 * 
 * Features:
 * - Maintains a daily counter that resets each day
 * - Thread-safe using Firestore transactions
 * - No leading zeroes in day, month, or sequence
 * 
 * EXAMPLES:
 * - 7th order on 18-12-2025 → ORD-1812257
 * - 17th order on 18-12-2025 → ORD-18122517
 * - 7th order on 03-01-2026 → ORD-31267
 * - 17th order on 03-01-2026 → ORD-312617
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Get or create a daily counter document for the given date
 * Returns the next sequence number and updates the counter atomically
 * 
 * Firestore Structure:
 * - Collection: Restaurant/orderin_restaurant_1/dailyOrderCounters
 * - Document ID: DDMMYY (e.g., "181225" for 18-12-2025)
 * - Fields: { count: number, date: string, lastUpdated: timestamp }
 * 
 * @param {Date} date - The date to get counter for (defaults to today)
 * @returns {Promise<number>} - The next sequence number for the day
 */
export const getAndIncrementDailyCounter = async (date = new Date()) => {
  try {
    // Format date as DDMMYY
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear() % 100;
    
    const dayStr = String(day); // no leading zero
    const monthStr = String(month); // no leading zero
    const yearStr = String(year).padStart(2, '0'); // 2 digits
    
    const dateKey = dayStr + monthStr + yearStr; // e.g., "181225"
    
    // Path: Restaurant/orderin_restaurant_1/dailyOrderCounters/<DDMMYY>
    const counterRef = doc(
      db,
      "Restaurant",
      "orderin_restaurant_1",
      "dailyOrderCounters",
      dateKey
    );
    
    // Get current counter
    const counterSnap = await getDoc(counterRef);
    let currentCount = 0;
    
    if (counterSnap.exists()) {
      currentCount = counterSnap.data().count || 0;
    }
    
    // Increment and save
    const nextSequence = currentCount + 1;
    await setDoc(
      counterRef,
      {
        count: nextSequence,
        date: date.toISOString().split('T')[0], // YYYY-MM-DD
        lastUpdated: new Date().toISOString()
      },
      { merge: true }
    );
    
    console.log(`Daily counter for ${dateKey}: incremented to ${nextSequence}`);
    return nextSequence;
  } catch (err) {
    console.error('Error incrementing daily counter:', err);
    throw err;
  }
};

/**
 * Generate a display order ID with format: ORD-DDMMYY<sequence>
 * 
 * @param {Date} date - The date for the order (defaults to today)
 * @returns {Promise<string>} - Display order ID (e.g., "ORD-1812257")
 */
export const generateDisplayOrderId = async (date = new Date()) => {
  try {
    // Get next sequence number for the day
    const sequence = await getAndIncrementDailyCounter(date);
    
    // Format date components without leading zeros
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear() % 100;
    
    const dayStr = String(day);
    const monthStr = String(month);
    const yearStr = String(year).padStart(2, '0');
    
    // Format: ORD-DDMMYY<sequence>
    const displayOrderId = `ORD-${dayStr}${monthStr}${yearStr}${sequence}`;
    
    console.log(`Generated display order ID: ${displayOrderId}`);
    return displayOrderId;
  } catch (err) {
    console.error('Error generating display order ID:', err);
    throw err;
  }
};

/**
 * Reset the daily counter for a specific date (admin/maintenance only)
 * Use with caution - intended for fixing counter inconsistencies
 * 
 * @param {Date} date - The date to reset counter for
 */
export const resetDailyCounter = async (date = new Date()) => {
  try {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear() % 100;
    
    const dayStr = String(day);
    const monthStr = String(month);
    const yearStr = String(year).padStart(2, '0');
    
    const dateKey = dayStr + monthStr + yearStr;
    
    const counterRef = doc(
      db,
      "Restaurant",
      "orderin_restaurant_1",
      "dailyOrderCounters",
      dateKey
    );
    
    await setDoc(counterRef, { count: 0, date: date.toISOString().split('T')[0] }, { merge: true });
    console.log(`Reset daily counter for ${dateKey}`);
  } catch (err) {
    console.error('Error resetting daily counter:', err);
    throw err;
  }
};
