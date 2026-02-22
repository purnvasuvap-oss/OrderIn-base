/**
 * Order Cleanup Utilities
 * 
 * Handles deletion of unpaid orders from Firestore when user navigates back
 * during the payment flow.
 * 
 * IMPORTANT:
 * - Only deletes orders with paymentStatus = "unpaid"
 * - Never deletes paid orders
 * - Called only on back navigation, not on refresh or forward
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Delete all unpaid orders for the current user from Firestore
 * 
 * This is called when user navigates BACK from payment flow pages
 * (Counter Code, Payment Gateway, etc.)
 * 
 * @param {string} phoneNumber - User's phone number (Firestore customer ID)
 * @returns {Promise<number>} - Number of orders deleted
 * 
 * @throws {Error} - If Firestore operation fails
 */
export const deleteUnpaidOrders = async (phoneNumber) => {
  try {
    if (!phoneNumber) {
      console.warn('deleteUnpaidOrders: phoneNumber not provided');
      return 0;
    }

    const customerRef = doc(db, "Restaurant", "orderin_restaurant_1", "customers", phoneNumber);
    const customerSnap = await getDoc(customerRef);

    if (!customerSnap.exists()) {
      console.log('deleteUnpaidOrders: Customer document not found for', phoneNumber);
      return 0;
    }

    const data = customerSnap.data();
    let pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
    
    // Count unpaid orders BEFORE deletion
    const unpaidCount = pastOrders.filter(o => o.paymentStatus === 'unpaid').length;
    
    if (unpaidCount === 0) {
      console.log('deleteUnpaidOrders: No unpaid orders found for', phoneNumber);
      return 0;
    }

    // Filter out unpaid orders (keep only paid ones)
    const filteredOrders = pastOrders.filter(o => o.paymentStatus !== 'unpaid');
    
    // Save updated list back to Firestore
    await setDoc(customerRef, { pastOrders: filteredOrders }, { merge: true });
    
    console.log(`deleteUnpaidOrders: Deleted ${unpaidCount} unpaid order(s) for ${phoneNumber}`);
    return unpaidCount;
  } catch (err) {
    console.error('deleteUnpaidOrders: Error deleting unpaid orders:', err);
    throw err;
  }
};

/**
 * Delete a specific unpaid order by ID
 * 
 * @param {string} phoneNumber - User's phone number (Firestore customer ID)
 * @param {string} orderId - Order ID to delete
 * @returns {Promise<boolean>} - True if deleted, false if not found or already paid
 * 
 * @throws {Error} - If Firestore operation fails
 */
export const deleteUnpaidOrderById = async (phoneNumber, orderId) => {
  try {
    if (!phoneNumber || !orderId) {
      console.warn('deleteUnpaidOrderById: phoneNumber or orderId not provided');
      return false;
    }

    const customerRef = doc(db, "Restaurant", "orderin_restaurant_1", "customers", phoneNumber);
    const customerSnap = await getDoc(customerRef);

    if (!customerSnap.exists()) {
      console.log('deleteUnpaidOrderById: Customer document not found for', phoneNumber);
      return false;
    }

    const data = customerSnap.data();
    let pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
    
    // Find the order
    const orderIndex = pastOrders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) {
      console.log('deleteUnpaidOrderById: Order not found with ID', orderId);
      return false;
    }

    const order = pastOrders[orderIndex];

    // Only delete if unpaid
    if (order.paymentStatus !== 'unpaid') {
      console.log(`deleteUnpaidOrderById: Order ${orderId} has status "${order.paymentStatus}", not deleting`);
      return false;
    }

    // Remove the unpaid order
    pastOrders.splice(orderIndex, 1);
    
    // Save updated list back to Firestore
    await setDoc(customerRef, { pastOrders }, { merge: true });
    
    console.log(`deleteUnpaidOrderById: Deleted unpaid order ${orderId} for ${phoneNumber}`);
    return true;
  } catch (err) {
    console.error('deleteUnpaidOrderById: Error deleting order:', err);
    throw err;
  }
};

/**
 * Safely delete unpaid orders with error handling
 * 
 * Wrapper function that handles errors gracefully without crashing
 * Used when user navigates back from payment pages
 * 
 * @param {string} phoneNumber - User's phone number
 * @param {string} [orderId] - Optional specific order ID to delete
 * @returns {Promise<void>}
 */
export const safeDeleteUnpaidOrders = async (phoneNumber, orderId = null) => {
  console.log('safeDeleteUnpaidOrders: Called with phoneNumber=', phoneNumber, 'orderId=', orderId);
  
  try {
    if (orderId) {
      const deleted = await deleteUnpaidOrderById(phoneNumber, orderId);
      console.log('safeDeleteUnpaidOrders: deleteUnpaidOrderById returned', deleted);
    } else {
      const count = await deleteUnpaidOrders(phoneNumber);
      console.log('safeDeleteUnpaidOrders: deleteUnpaidOrders deleted', count, 'orders');
    }
  } catch (err) {
    // Log error but don't throw - allow navigation to proceed
    console.error('safeDeleteUnpaidOrders: Failed to delete unpaid orders', err);
    // Could also send to error tracking service (Sentry, etc.)
  }
};
