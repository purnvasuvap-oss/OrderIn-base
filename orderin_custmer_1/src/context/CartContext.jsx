import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getPlaceholder } from '../utils/placeholder';
import { resolveImageUrl } from '../utils/storageResolver';

const CartContext = createContext();

export const useCart = () => {
  return useContext(CartContext);
};

// Helper functions to manage temporary order state in localStorage
// Export stable function references pointing at methods of a frozen object to avoid
// export-shape changes that can break Vite Fast Refresh.
const orderTempState = {
  save(orderId, cartItems, billing, paymentStatus = 'unpaid') {
    const tempState = {
      orderin_orderId: orderId,
      orderin_cart: JSON.stringify(cartItems),
      orderin_billing: JSON.stringify(billing),
      orderin_paymentStatus: paymentStatus
    };
    Object.entries(tempState).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
    console.log('Order temp state saved to localStorage:', tempState);
  },
  load() {
    const orderId = localStorage.getItem('orderin_orderId');
    const cartStr = localStorage.getItem('orderin_cart');
    const billingStr = localStorage.getItem('orderin_billing');
    const paymentStatus = localStorage.getItem('orderin_paymentStatus');

    if (!orderId || !cartStr || !billingStr) {
      return null; // No valid temp state
    }

    try {
      return {
        orderin_orderId: orderId,
        orderin_cart: JSON.parse(cartStr),
        orderin_billing: JSON.parse(billingStr),
        orderin_paymentStatus: paymentStatus || 'unpaid'
      };
    } catch (err) {
      console.error('Error parsing temp order state:', err);
      return null;
    }
  },
  clear() {
    const keys = ['orderin_orderId', 'orderin_cart', 'orderin_billing', 'orderin_paymentStatus', 'orderin_countercode_orderId', 'orderin_countercode_paymentMethod'];
    keys.forEach(key => localStorage.removeItem(key));
    console.log('Order temp state cleared from localStorage');
  }
};

// Freeze to keep export shape stable across HMR
try { Object.freeze(orderTempState); } catch (e) { /* ignore */ }

export function saveOrderTempState(...args) { return orderTempState.save(...args); }
export function loadOrderTempState() { return orderTempState.load(); }
export function clearOrderTempState() { return orderTempState.clear(); }

// Helper to persist cart items to localStorage
const saveCartToLocalStorage = (items) => {
  try {
    localStorage.setItem('cart_items', JSON.stringify(items));
    console.log('Cart persisted to localStorage:', items.length, 'items');
  } catch (err) {
    console.error('Error saving cart to localStorage:', err);
  }
};

// Helper to load cart items from localStorage
const loadCartFromLocalStorage = () => {
  try {
    const cartStr = localStorage.getItem('cart_items');
    if (cartStr) {
      const items = JSON.parse(cartStr);
      // Normalize items to ensure `image` property exists (match against menu `products` if available)
      const normalized = (items || []).map(i => normalizeCartItem(i));
      console.log('Cart restored from localStorage:', normalized.length, 'items (normalized)');
      return normalized;
    }
  } catch (err) {
    console.error('Error loading cart from localStorage:', err);
  }
  return null;
};

// Ensure the cart item has expected fields like `image` and normalized price
const PLACEHOLDER_IMAGE = getPlaceholder('No Image');
const normalizeCartItem = (item) => {
  if (!item) return item;
  try {
    // If image present, use it
    if (item.image && String(item.image).trim() !== '') return item;

    // Try to match against global `products` array (imported by Menu sets it)
    // We avoid importing Menu here to prevent cycles; rely on window-level products if available
    const globalProducts = (typeof window !== 'undefined' && window.__menu_products__) ? window.__menu_products__ : null;
    let resolvedImage = '';
    if (globalProducts && Array.isArray(globalProducts)) {
      const match = globalProducts.find(p => String(p.name || '').toLowerCase() === String(item.name || '').toLowerCase());
      if (match) resolvedImage = match.image || match.imageUrl || match.imageURL || match.image_url || match.img || '';
    }
    return { ...item, image: (resolvedImage || item.image || PLACEHOLDER_IMAGE) };
  } catch (err) {
    return { ...item, image: item.image || PLACEHOLDER_IMAGE };
  }
};

// Try to find a menu product by name using a normalization similar to Profile
const normalizeForMatch = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const findProductInWindow = (name) => {
  try {
    const products = (typeof window !== 'undefined' && window.__menu_products__) ? window.__menu_products__ : null;
    if (!products || !name) return null;
    const n = normalizeForMatch(name);
    // exact
    let match = products.find(p => normalizeForMatch(p.name) === n);
    if (match) return match;
    // substring
    match = products.find(p => normalizeForMatch(p.name).includes(n) || n.includes(normalizeForMatch(p.name)));
    if (match) return match;
    // token overlap
    const tokens = n.split(' ').filter(Boolean);
    let best = null; let bestScore = 0;
    for (const p of products) {
      const pTokens = normalizeForMatch(p.name).split(' ').filter(Boolean);
      const common = tokens.filter(t => pTokens.includes(t)).length;
      if (common > bestScore) { bestScore = common; best = p; }
    }
    if (bestScore > 0) return best;
  } catch (err) {
    return null;
  }
  return null;
};

// Replace cart items with canonical menu details when menu becomes available
const updateCartItemsWithMenu = (cartItems) => {
  try {
    const products = (typeof window !== 'undefined' && window.__menu_products__) ? window.__menu_products__ : null;
    if (!products) return cartItems;
    return (cartItems || []).map(ci => {
      const match = findProductInWindow(ci.name || ci.productName || ci.itemName || '');
      if (match) {
        const resolvedImage = match.image || match.imageUrl || match.imageURL || match.image_url || match.img || ci.image || PLACEHOLDER_IMAGE;
        return { ...match, quantity: ci.quantity || 1, instructions: ci.instructions || '', image: (resolvedImage || PLACEHOLDER_IMAGE) };
      }
      // no match; ensure image exists
      return { ...ci, image: ci.image || PLACEHOLDER_IMAGE };
    });
  } catch (err) {
    return cartItems;
  }
};

// Helper to clear cart from localStorage
const clearCartFromLocalStorage = () => {
  try {
    localStorage.removeItem('cart_items');
    console.log('Cart cleared from localStorage');
  } catch (err) {
    console.error('Error clearing cart from localStorage:', err);
  }
};

export const CartProvider = ({ children, tableNo = '1' }) => {
  const [cartItems, setCartItems] = useState(() => {
    // Load cart from localStorage on initial mount
    const savedCart = loadCartFromLocalStorage();
    return savedCart || [];
  });
  const [orderHistory, setOrderHistory] = useState([]);
  const [currentTableNo, setCurrentTableNo] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableFromUrl = urlParams.get('table');
    if (tableFromUrl) {
      localStorage.setItem('tableNumber', tableFromUrl);
      return tableFromUrl;
    }
    return localStorage.getItem('tableNumber') || tableNo;
  });

  // Load orderHistory from localStorage on mount
  useEffect(() => {
    const savedOrderHistory = localStorage.getItem('orderHistory');
    if (savedOrderHistory) {
      setOrderHistory(JSON.parse(savedOrderHistory));
    }
  }, []);

  // Persist cartItems to localStorage whenever they change
  useEffect(() => {
    saveCartToLocalStorage(cartItems);
  }, [cartItems]);

  // Background-resolve any gs:// images that may be present on cart items (run once per changed item)
  useEffect(() => {
    let cancelled = false;
    const resolveImages = async () => {
      try {
        const targets = cartItems.filter(it => it && it.image && String(it.image).startsWith('gs://'));
        if (!targets.length) return;
        await Promise.all(targets.map(async (it) => {
          try {
            const r = await resolveImageUrl(it.image);
            if (cancelled) return;
            if (r) setCartItems(prev => prev.map(ci => (ci.name === it.name ? { ...ci, image: r } : ci)));
          } catch (e) { /* ignore per-item */ }
        }));
      } catch (e) { /* ignore */ }
    };
    if (cartItems && cartItems.length) resolveImages();
    return () => { cancelled = true; };
  }, [cartItems]);

  // Load temporary order state on mount (e.g., after page refresh during payment)
  useEffect(() => {
    const tempState = loadOrderTempState();
    if (tempState) {
      console.log('Restoring temp order state from localStorage:', tempState);
      // Restore cart items from temp state
      // Normalize cart items when restoring
      const restored = (tempState.orderin_cart || []).map(i => normalizeCartItem(i));
      // If menu already loaded on window, upgrade items to canonical menu data
      const upgraded = (typeof window !== 'undefined' && window.__menu_products__) ? updateCartItemsWithMenu(restored) : restored;
      setCartItems(upgraded);
      // Note: orderId is used by Payments/CounterCode components via sessionStorage if needed
    }
  }, []);

  // If the menu is loaded later, listen for the 'menu:loaded' event to update cart items
  useEffect(() => {
    const handler = (e) => {
      try {
        setCartItems(prev => updateCartItemsWithMenu(prev));
        console.log('CartContext: updated cart items with loaded menu');
      } catch (err) {
        console.error('Error updating cart items after menu load', err);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('menu:loaded', handler);
      // also run immediately if menu is already present
      if (window.__menu_products__) handler();
    }
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('menu:loaded', handler);
    };
  }, []);

  // Save orderHistory to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('orderHistory', JSON.stringify(orderHistory));
  }, [orderHistory]);

  const addToCart = (item, quantity, instructions) => {
    const existingItem = cartItems.find(cartItem => cartItem.name === item.name);
    if (existingItem) {
      setCartItems(cartItems.map(cartItem =>
        cartItem.name === item.name
          ? { ...cartItem, quantity: cartItem.quantity + quantity, instructions: instructions || cartItem.instructions }
          : cartItem
      ));
    } else {
      setCartItems(prev => {
        const newItems = [...prev, { ...item, quantity, instructions: instructions || '' }];
        return newItems;
      });
    }

    // Resolve gs:// image in background and update cart item when available
    (async () => {
      try {
        // Accept alternate field name 'image_url'
        const img = item.image || item.imageURL || item.image_url || '';
        if (img && String(img).startsWith('gs://')) {
          const resolved = await resolveImageUrl(img);
          if (resolved) {
            setCartItems(prev => prev.map(ci => (ci.name === item.name ? { ...ci, image: resolved } : ci)));
          }
        }
      } catch (e) { /* ignore */ }
    })();
  };

  const updateQuantity = (name, quantity) => {
    setCartItems(cartItems.map(item =>
      item.name === name ? { ...item, quantity: Math.max(1, quantity) } : item
    ));
  };

  const updateInstructions = (name, instructions) => {
    setCartItems(cartItems.map(item =>
      item.name === name ? { ...item, instructions } : item
    ));
  };

  const removeFromCart = (name) => {
    setCartItems(cartItems.filter(item => item.name !== name));
  };

  const getTotalPrice = () => {
    return cartItems.reduce((total, item) => {
      const num = parseFloat(String(item.price || '').replace(/[^0-9.\-]/g, '')) || 0;
      return total + (num * item.quantity);
    }, 0).toFixed(2);
  };

  const clearCart = () => {
    setCartItems([]);
    clearCartFromLocalStorage();
  };

  const placeOrder = (paymentMethod) => {
    const subtotal = cartItems.reduce((sum, item) => {
      const num = parseFloat(String(item.price || '').replace(/[^0-9.\-]/g, '')) || 0;
      return sum + (num * item.quantity);
    }, 0);
    // Tax policy: ₹0.04 for every ₹1 (4 paise per rupee)
    const computedTax = subtotal * 0.04;
    const taxes = computedTax; // store as rupees
    const total = subtotal + taxes;

    // Create order object
    const order = {
      id: Date.now(),
      items: cartItems,
      subtotal: subtotal.toFixed(2),
      taxes: Number(taxes).toFixed(2),
      total: Number(total).toFixed(2),
      paymentMethod,
      status: 'Pending',
      tableNo: currentTableNo, // Use the current table number from URL
      time: new Date().toLocaleString(),
      timestamp: new Date()
    };

    // Add to order history but DON'T clear cart yet
    setOrderHistory(prev => [...prev, order]);

    // Cart will be cleared only after payment is marked successful
    // clearCart();

    return order;
  };

  const markPaymentSuccessful = (orderId) => {
    // Find the order and mark it as paid
    setOrderHistory(prev => prev.map(order =>
      order.id === orderId ? { ...order, status: 'Paid' } : order
    ));
    // Now clear the cart after successful payment (both in-memory and localStorage)
    clearCart();
    clearOrderTempState(); // Also clear the temporary payment-stage state

    // Update Firestore to mark order as paid
    const updateOrderInFirestore = async () => {
      try {
        const user = JSON.parse(localStorage.getItem("user"));
        if (!user || !user.phone) return;
        const phoneNumber = user.phone;

        const customerRef = doc(db, "Restaurant", "orderin_restaurant_2", "customers", phoneNumber);
        const customerSnap = await getDoc(customerRef);
        if (!customerSnap.exists()) return;

        const data = customerSnap.data();
        const pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];

        // Find and update the order with matching ID
        const updatedOrders = pastOrders.map(order =>
          order.id === orderId ? { ...order, paymentStatus: 'paid' } : order
        );

        await setDoc(customerRef, { pastOrders: updatedOrders }, { merge: true });
        console.log("Order marked as paid in Firestore:", orderId);
      } catch (err) {
        console.error("Error updating payment status in Firestore:", err);
      }
    };

    updateOrderInFirestore();
  };

  return (
    <CartContext.Provider value={{
      cartItems,
      addToCart,
      updateQuantity,
      updateInstructions,
      removeFromCart,
      getTotalPrice,
      clearCart,
      placeOrder,
      markPaymentSuccessful,
      orderHistory,
      currentTableNo,
      saveOrderTempState,
      loadOrderTempState,
      clearOrderTempState
    }}>
      {children}
    </CartContext.Provider>
  );
};
