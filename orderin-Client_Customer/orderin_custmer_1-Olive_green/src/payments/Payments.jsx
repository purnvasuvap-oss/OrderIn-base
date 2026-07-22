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
import { createOrderTimestamp } from "../utils/orderDateTime";
import { calculateBilling, TAX_RATE } from "../utils/billing";
import "./Payments.css";

function Payments({ onBackClick }) {
  const { cartItems, updateQuantity, removeFromCart, getTotalPrice, placeOrder, markPaymentSuccessful, saveOrderTempState, clearOrderTempState } = useCart();
  const [selectedPayment, setSelectedPayment] = useState(null);
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();

  // Fallback onBackClick: navigate back and clean up unpaid orders from Firestore
  const handleBackClick = async () => {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      if (user && user.phone) {
        await safeDeleteUnpaidOrders(user.phone);
      }
    } catch (err) {
      console.error('Error during order cleanup on back navigation:', err);
    }

    sessionStorage.removeItem('pendingOrderId');
    sessionStorage.removeItem('pendingOrderForFirestore');
    sessionStorage.removeItem('pendingVerificationCode');
    localStorage.removeItem('orderin_countercode_orderId');
    localStorage.removeItem('orderin_countercode_paymentMethod');
    localStorage.removeItem('orderin_onlinepayment_orderId');
    localStorage.removeItem('pendingVerificationCode');

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
  const displayedBilling = calculateBilling(subtotal, selectedPayment);

  const handlePaymentSelect = (method) => {
    setSelectedPayment(method);
  };

  const handlePlaceOrder = async () => {
    if (!selectedPayment) {
      alert("Please select a payment method");
      return;
    }

    let order;
    let orderSaveError = null;
    let phoneNumber = null;
    
    try {
      setIsSaving(true);
      const user = JSON.parse(localStorage.getItem("user"));
      const tableNumber = localStorage.getItem("tableNumber") || "1";
      if (!user || !user.phone) {
        throw new Error("User not logged in or phone number missing");
      }
      phoneNumber = user.phone;

      const customerRef = doc(db, "Restaurant", "orderin_restaurant_3", "customers", phoneNumber);
      const customerSnap = await getDoc(customerRef);
      let pastOrders = [];
      if (customerSnap.exists()) {
        const data = customerSnap.data();
        pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
      }

      let orderId = null;
      try {
        orderId = await generateDisplayOrderId();
        if (!orderId) {
          throw new Error('generateDisplayOrderId returned empty value');
        }
        console.log('Generated order ID:', orderId);
      } catch (displayIdErr) {
        console.warn('Failed to generate order ID, creating fallback:', displayIdErr);
        const now = new Date();
        const timestamp = now.getTime();
        orderId = `ORD-${timestamp}`;
        console.log('Using fallback order ID:', orderId);
      }

      if (!orderId) {
        throw new Error('Failed to generate order ID: orderId is undefined');
      }

      const calculatedSubtotal = parseFloat(getTotalPrice());
      const calculatedBilling = calculateBilling(calculatedSubtotal, selectedPayment);
      
      console.log('Calculated - Subtotal:', calculatedBilling.subtotal, 'Tax:', calculatedBilling.taxes, 'Total:', calculatedBilling.total);

      order = placeOrder(selectedPayment);
      console.log('Order created from placeOrder():', order);
      if (!order) {
        throw new Error('placeOrder() returned null or undefined');
      }
      order.id = orderId;
      
      order.subtotal = calculatedBilling.subtotal;
      order.taxes = calculatedBilling.taxes;
      order.total = calculatedBilling.total;
      console.log('Order updated with calculated values - Subtotal:', order.subtotal, 'Taxes:', order.taxes, 'Total:', order.total);

      let verificationCode = null;
      if (selectedPayment === 'Cash' || selectedPayment === 'Card') {
        verificationCode = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      }

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

      const orderTimestamp = createOrderTimestamp();

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
        time: orderTimestamp.time,
        createdAt: orderTimestamp.createdAt,
        createdAtMs: orderTimestamp.createdAtMs,
        paymentStatus: 'unpaid',
        verificationCode: verificationCode,
        OnlinePayMethod: ""
      };

      console.log('Order object before saving to Firestore:', orderForFirestore);
      console.log('OnlinePayMethod value:', orderForFirestore.OnlinePayMethod);

      const pendingOrderBackup = {
        phoneNumber,
        restaurantId: 'orderin_restaurant_3',
        order: orderForFirestore,
      };
      sessionStorage.setItem('pendingOrderForFirestore', JSON.stringify(pendingOrderBackup));
      localStorage.setItem('pendingOrderForFirestore', JSON.stringify(pendingOrderBackup));

      pastOrders.push(orderForFirestore);
      console.log('Past orders array before Firestore save:', pastOrders);
      await setDoc(customerRef, { pastOrders, lastOrderAt: serverTimestamp() }, { merge: true });
      console.log('Order saved to Firestore successfully');
      
      const billing = {
        subtotal: calculatedBilling.subtotal,
        taxes: calculatedBilling.taxes,
        total: calculatedBilling.total
      };
      saveOrderTempState(orderId, cartItems, billing, 'unpaid');
      
      console.log("Order saved to Firestore with id:", orderId, "Status: unpaid");
      console.log("Saved billing:", billing);
    } catch (err) {
      console.error("Error during order processing:", err);
      orderSaveError = err;
    } finally {
      setIsSaving(false);
    }

    if (orderSaveError && (!order || !order.id)) {
      console.warn("Order save failed - showing error to user:", orderSaveError.message);
      alert("Error saving order to backend: " + orderSaveError.message);
      return;
    }

    if (!order) {
      return;
    }

    // Store pending order ID and payment method for use after restaurant confirmation
    sessionStorage.setItem('pendingOrderId', order.id);
    localStorage.setItem('orderin_countercode_orderId', order.id);
    localStorage.setItem('orderin_countercode_paymentMethod', selectedPayment);

    // Store payment data for later use
    const paymentData = {
      orderId: order.id,
      subtotal: order.subtotal,
      taxes: order.taxes,
      total: order.total,
      taxRate: TAX_RATE,
      useProvidedTax: true,
      restaurantId: 'orderin_restaurant_3',
      paymentMethod: selectedPayment,
      customerPhone: phoneNumber
    };
    sessionStorage.setItem('paymentData', JSON.stringify(paymentData));
    localStorage.setItem('orderin_paymentData', JSON.stringify(paymentData));

    // NEW FLOW: Redirect to AwaitingConfirmation page
    // Restaurant staff must accept/reject the order before payment proceeds
    setTimeout(() => {
      navigate(getPathWithTable('/awaiting-confirmation'));
    }, 100);
  };

  return (
    <div className="payments-container">
      <Loading isLoading={isSaving} />
      <div className="payments-card">
        <button className="close-button" onClick={handleBackClick}>
          <X size={22} />
        </button>

        <h2 className="checkout-header">Checkout</h2>

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

        <div className="billing-breakdown">
          <h4 className="billing-header">Billing Breakdown</h4>
          <div className="billing-row">
            <span>Subtotal :</span>
            <span>₹{displayedBilling.subtotal.toFixed(2)}</span>
          </div>
          <div className="billing-row">
            <span>Additional Charges :</span>
            <span>₹{displayedBilling.taxes.toFixed(2)}</span>
          </div>
          <div className="billing-total">
            <span>Total :</span>
            <span>₹{displayedBilling.total.toFixed(2)}</span>
          </div>
        </div>
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
        <button className="place-order-btn" onClick={handlePlaceOrder}>
          Place Order
        </button>
      </div>
      </div>
  );
}

export default Payments;
