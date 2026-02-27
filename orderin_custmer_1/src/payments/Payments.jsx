// Payments.js
import React, { useState, useEffect } from "react";
import { Minus, Plus, Trash2, X, CreditCard, Wallet, Banknote } from "lucide-react";
import { useCart } from "../context/CartContext";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useNavigate } from "react-router-dom";
import { useTableNumber } from "../hooks/useTableNumber";
import Loading from "../Loading";
import { generateDisplayOrderId } from "../utils/displayOrderIdGenerator";
import { safeDeleteUnpaidOrders } from "../utils/orderCleanupUtils";
import { getPlaceholder } from "../utils/placeholder";
import resolveImageUrl from "../utils/storageResolver";
import "./Payments.css";

function Payments({ onBackClick }) {
  const { cartItems, updateQuantity, removeFromCart, getTotalPrice, placeOrder, markPaymentSuccessful, saveOrderTempState, clearOrderTempState } = useCart();
  const [selectedPayment, setSelectedPayment] = useState(null);
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();

  // Clean up all unpaid orders when user ENTERS the Payments page
  // This ensures no stale unpaid orders exist before starting a new payment
  useEffect(() => {
    const cleanupOnPageEnter = async () => {
      try {
        const user = JSON.parse(localStorage.getItem("user"));
        if (user && user.phone) {
          console.log('Payments page loaded: Deleting unpaid orders for', user.phone);
          await safeDeleteUnpaidOrders(user.phone);
        }
      } catch (err) {
        console.error('Error cleaning up unpaid orders on page enter:', err);
      }
    };

    cleanupOnPageEnter();
  }, []); // Run only once when component mounts

  // Fallback onBackClick: navigate back and clean up unpaid orders from Firestore
  const handleBackClick = async () => {
    // Step 1: Delete unpaid orders from Firestore BEFORE navigating back
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      if (user && user.phone) {
        // Delete all unpaid orders for this user
        // This is called when user navigates BACK from Payments page
        await safeDeleteUnpaidOrders(user.phone);
      }
    } catch (err) {
      console.error('Error during order cleanup on back navigation:', err);
      // Continue navigation anyway - don't let cleanup errors block back button
    }

    // Step 2: Clear session storage
    sessionStorage.removeItem('pendingOrderId');
    sessionStorage.removeItem('pendingOrderForFirestore');
    sessionStorage.removeItem('pendingVerificationCode');
    localStorage.removeItem('orderin_countercode_orderId');
    localStorage.removeItem('orderin_countercode_paymentMethod');
    localStorage.removeItem('orderin_onlinepayment_orderId');
    localStorage.removeItem('pendingVerificationCode');

    // Step 3: Navigate back
    if (onBackClick) {
      onBackClick();
    } else {
      navigate(getPathWithTable('/cart'));
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [resolvedImages, setResolvedImages] = useState({});

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      try {
        const entries = await Promise.all(cartItems.map(async (it) => {
          const key = it.name || it.id || JSON.stringify(it);
          const img = it.image || it.imageURL || it.imageUrl || it.image_url || it.img || '';
          if (!img) return [key, ''];
          try {
            if (img.startsWith('gs://')) {
              const r = await resolveImageUrl(img);
              if (r) return [key, r];
              console.warn('Payments: resolveImageUrl returned no URL for', img, 'item=', it.name || it.id);
              return [key, ''];
            }
            if (!img.startsWith('http://') && !img.startsWith('https://') && !img.startsWith('data:') && !img.startsWith('blob:')) {
              const r = await resolveImageUrl(img);
              if (r) return [key, r];
            }
            return [key, img];
          } catch (e) {
            console.warn('Payments: error resolving image', img, e);
            return [key, ''];
          }
        }));
        if (cancelled) return;
        const map = Object.fromEntries(entries.filter(Boolean));
        setResolvedImages(map);
      } catch (e) { /* ignore */ }
    };
    if (cartItems && cartItems.length) resolve();
    return () => { cancelled = true; };
  }, [cartItems]);
  const subtotal = parseFloat(getTotalPrice());
  // Charge ₹0.04 for every ₹1
  const tax = subtotal * 0.04;
  const total = subtotal + tax;

  const handlePaymentSelect = (method) => {
    setSelectedPayment(method);
  };

  const handlePlaceOrder = async () => {
    if (!selectedPayment) {
      alert("Please select a payment method");
      return;
    }

    // --- Firestore order saving logic with human-readable order ID ---
    let order; // declared here so it's available after the try/catch
    let orderSaveError = null;
    let phoneNumber = null; // Declare phoneNumber here so it's accessible throughout the function
    
    try {
      setIsSaving(true);
      // Get user info from localStorage
      const user = JSON.parse(localStorage.getItem("user"));
      const tableNumber = localStorage.getItem("tableNumber") || "1";
      if (!user || !user.phone) {
        throw new Error("User not logged in or phone number missing");
      }
      phoneNumber = user.phone; // Assign to the outer variable

      // Firestore path: Restaurant/orderin_restaurant_2/customers/<phoneNumber>
      const customerRef = doc(db, "Restaurant", "orderin_restaurant_2", "customers", phoneNumber);
      const customerSnap = await getDoc(customerRef);
      let pastOrders = [];
      if (customerSnap.exists()) {
        const data = customerSnap.data();
        pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
      }

      // Generate human-readable order ID (format: ORD-DDMMYY<sequence>)
      // This is now the PRIMARY order ID stored in the database
      let orderId = null;
      try {
        orderId = await generateDisplayOrderId();
        if (!orderId) {
          throw new Error('generateDisplayOrderId returned empty value');
        }
        console.log('Generated order ID:', orderId);
      } catch (displayIdErr) {
        console.warn('Failed to generate order ID, creating fallback:', displayIdErr);
        // Fallback: use a simple timestamp-based ID if counter generation fails
        const now = new Date();
        const timestamp = now.getTime();
        orderId = `ORD-${timestamp}`;
        console.log('Using fallback order ID:', orderId);
      }

      // Ensure orderId is defined before proceeding
      if (!orderId) {
        throw new Error('Failed to generate order ID: orderId is undefined');
      }

      // Calculate tax BEFORE creating order (so we can use the exact calculation)
      // Charge ₹0.04 for every ₹1
      const calculatedSubtotal = parseFloat(getTotalPrice());
      const calculatedTax = calculatedSubtotal * 0.04;
      const calculatedTotal = calculatedSubtotal + calculatedTax;
      
      console.log('Calculated - Subtotal:', calculatedSubtotal, 'Tax:', calculatedTax, 'Total:', calculatedTotal);

      // Place the order with the human-readable ID
      order = placeOrder(selectedPayment);
      console.log('Order created from placeOrder():', order);
      // Override the order id in the in-memory order object (orderHistory stores the same object reference)
      if (!order) {
        throw new Error('placeOrder() returned null or undefined');
      }
      order.id = orderId;
      
      // Override with exact calculated values to ensure consistency
      order.subtotal = calculatedSubtotal;
      order.taxes = calculatedTax;
      order.total = calculatedTotal;
      console.log('Order updated with calculated values - Subtotal:', order.subtotal, 'Taxes:', order.taxes, 'Total:', order.total);

      // Generate verification code for cash/card orders (4 random digits)
      let verificationCode = null;
      if (selectedPayment === 'Cash' || selectedPayment === 'Card') {
        verificationCode = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      }

      // Persist verification code locally so the UI/verification page can use the same code
      try {
        if (verificationCode) {
          sessionStorage.setItem('pendingVerificationCode', verificationCode);
          localStorage.setItem('pendingVerificationCode', verificationCode);
          console.log('Payments: generated verificationCode saved to sessionStorage/localStorage=', verificationCode);
        } else {
          sessionStorage.removeItem('pendingVerificationCode');
          localStorage.removeItem('pendingVerificationCode');
        }
      } catch (err) {
        console.warn('Payments: could not persist pendingVerificationCode', err);
      }

      // Prepare order object for Firestore (no images/media)
      const orderForFirestore = {
        id: orderId,
        items: order.items.map(({ name, price, quantity, instructions, specifications }) => ({
          name,
          price,
          quantity,
          instructions: instructions || "",
        })),
        subtotal: order.subtotal,
        taxes: order.taxes,
        total: order.total,
        paymentMethod: order.paymentMethod,
        status: order.status,
        tableNo: tableNumber,
        time: order.time,
        createdAt: new Date().toISOString(),
        paymentStatus: 'unpaid',
        verificationCode: verificationCode,
        OnlinePayMethod: ""  // Empty string initially, will be updated to UPI/CARD/NET BANKING/WALLET from embedded payment page
      };

      console.log('Order object before saving to Firestore:', orderForFirestore);
      console.log('OnlinePayMethod value:', orderForFirestore.OnlinePayMethod);

      // Save to Firestore immediately with 'unpaid' status
      // It will be deleted if user goes back, or updated to 'paid' after verification
      pastOrders.push(orderForFirestore);
      console.log('Past orders array before Firestore save:', pastOrders);
      await setDoc(customerRef, { pastOrders, lastOrderAt: serverTimestamp() }, { merge: true });
      console.log('Order saved to Firestore successfully');
      
      // Save temporary order state to localStorage for refresh recovery
      const billing = {
        subtotal: calculatedSubtotal,
        taxes: calculatedTax,
        total: calculatedTotal
      };
      saveOrderTempState(orderId, cartItems, billing, 'unpaid');
      
      console.log("Order saved to Firestore with id:", orderId, "Status: unpaid");
      console.log("Saved billing:", billing);
    } catch (err) {
      console.error("Error during order processing:", err);
      orderSaveError = err;
      // Don't show alert yet - check if order was actually saved and has an ID
    } finally {
      setIsSaving(false);
    }

    // Only show error alert if order creation completely failed
    if (orderSaveError && (!order || !order.id)) {
      console.warn("Order save failed - showing error to user:", orderSaveError.message);
      alert("Error saving order to backend: " + orderSaveError.message);
      return;
    }

    if (!order) {
      // If order wasn't created (e.g., save failed), stop further actions
      return;
    }

    if (selectedPayment === 'Online') {
      console.log('Online payment selected, order id:', order.id);
      // Fetch restaurant information from Firestore
      const fetchRestaurantData = async () => {
        try {
          const restaurantRef = doc(db, "Restaurant", "orderin_restaurant_2");
          const restaurantSnap = await getDoc(restaurantRef);
          
          if (restaurantSnap.exists()) {
            const restaurantData = restaurantSnap.data();
            console.log('Restaurant data fetched:', restaurantData);
            
            // Prepare payment data with restaurant info
            const paymentData = {
              orderId: order.id,
              subtotal: order.subtotal,
              taxes: order.taxes,
              total: order.total,
              taxRate: 0.04, // 0.04 rupees per rupee (4 paise per rupee)
              useProvidedTax: true, // Tell embedded page: don't recalculate, use this tax value
              restaurantId: 'orderin_restaurant_2',
              restaurantName: restaurantData.Restaurant_name || 'Restaurant',
              ifscCode: restaurantData.IFSC || '',
              accountNumber: restaurantData.account || '',
              paymentMethod: selectedPayment,
              customerPhone: phoneNumber,
              timestamp: new Date().toISOString()
            };
            
            console.log('Payment data being sent:', paymentData);
            
            // Store all payment data for the embedded page
            sessionStorage.setItem('pendingOrderId', order.id);
            localStorage.setItem('orderin_onlinepayment_orderId', order.id);
            sessionStorage.setItem('paymentData', JSON.stringify(paymentData));
            localStorage.setItem('orderin_paymentData', JSON.stringify(paymentData));
            
            console.log('Payment data stored:', paymentData);
            console.log('About to navigate to /online-payment');
            
            // Small delay to ensure storage is committed before navigation
            setTimeout(() => {
              console.log('Navigating now...');
              navigate(getPathWithTable('/online-payment'));
            }, 100);
          } else {
            console.error('Restaurant document not found');
            alert('Error: Restaurant information not found. Please try again.');
          }
        } catch (err) {
          console.error('Error fetching restaurant data:', err);
          alert('Error: Could not fetch restaurant information: ' + err.message);
        }
      };
      
      fetchRestaurantData();
    } else {
      // For Card or Cash, store the order ID temporarily and go to counter code page
      // The counter code page will verify the code and then mark payment successful
      sessionStorage.setItem('pendingOrderId', order.id);
      // Also persist counter-code page state to localStorage for refresh recovery
      localStorage.setItem('orderin_countercode_orderId', order.id);
      localStorage.setItem('orderin_countercode_paymentMethod', selectedPayment);
      navigate(getPathWithTable('/counter-code'));
    }
  };

  return (
    <div className="payments-container">
      <Loading isLoading={isSaving} />
      <div className="payments-card">
        {/* Close Button */}
        <button className="close-button" onClick={handleBackClick}>
          <X size={22} />
        </button>

        {/* Header */}
        <h2 className="checkout-header">Checkout</h2>

        {/* Order Items */}
        {cartItems.map((item, index) => (
          <div key={index} className="order-item">
            <img
              src={(resolvedImages[item.name] && resolvedImages[item.name] !== '') ? resolvedImages[item.name] : (item.image && !(item.image.startsWith && item.image.startsWith('gs://')) ? item.image : getPlaceholder('No Image'))}
              alt={item.name}
              className="order-item-image"
              onError={(e) => { console.warn('Payments image load failed', e.currentTarget.src, 'orderItem', item && (item.id || item.name)); e.currentTarget.src = getPlaceholder('No Image'); }}
            />
            <div className="order-item-details">
              <h3 className="order-item-name">{item.name}</h3>
              <p className="order-item-price">₹{(parseFloat(String(item.price || '').replace(/[^0-9.\-]/g, '')) * item.quantity).toFixed(2)}</p>
                <p className="order-item-each">₹{(parseFloat(String(item.price || '').replace(/[^0-9.\-]/g, '')) || 0).toFixed(2)} each</p>
              {item.instructions && (
                <p className="order-item-instructions"><strong>Cooking Preferences:</strong> {item.instructions}</p>
              )}
            </div>

            <div className="quantity-controls">
              <button
                onClick={() => updateQuantity(item.name, item.quantity - 1)}
                className="qty-button"
              >
                <Minus size={14} />
              </button>
              <span className="qty-value">{item.quantity}</span>
              <button
                onClick={() => updateQuantity(item.name, item.quantity + 1)}
                className="qty-button"
              >
                <Plus size={14} />
              </button>
              <button className="remove-button" onClick={() => removeFromCart(item.name)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {/* Billing Breakdown */}
        <div className="billing-breakdown">
          <h4 className="billing-header">Billing Breakdown</h4>
          <div className="billing-row">
            <span>Subtotal :</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          <div className="billing-row">
            <span>Taxes :</span>
            <span>₹{tax.toFixed(2)}</span>
          </div>
          <div className="billing-total">
            <span>Total :</span>
            <span>₹{total.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Method */}
        <div className="payment-methods">
          <h4 className="payment-header">Payment Method</h4>
          <div className="payment-grid">
            <button
              className={`payment-option ${selectedPayment === 'Online' ? 'selected' : ''}`}
              onClick={() => handlePaymentSelect('Online')}
            >
              <Wallet className="payment-icon-online" size={22} />
              <span className="payment-label">Online</span>
            </button>
            <button
              className={`payment-option ${selectedPayment === 'Card' ? 'selected' : ''}`}
              onClick={() => handlePaymentSelect('Card')}
            >
              <CreditCard className="payment-icon-card" size={22} />
              <span className="payment-label">Card</span>
            </button>
            <button
              className={`payment-option ${selectedPayment === 'Cash' ? 'selected' : ''}`}
              onClick={() => handlePaymentSelect('Cash')}
            >
              <Banknote className="payment-icon-cash" size={22} />
              <span className="payment-label">Cash</span>
            </button>
          </div>
        </div>

        {/* Place Order Button */}
        <button className="place-order-btn" onClick={handlePlaceOrder}>
          Place Order
        </button>
      </div>
    </div>
  );
}

export default Payments;
