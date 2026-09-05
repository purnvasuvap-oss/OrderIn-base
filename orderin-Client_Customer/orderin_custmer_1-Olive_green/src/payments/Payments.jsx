// Payments.js
import React, { useState, useEffect } from "react";
import { Minus, Plus, Trash2, X, CreditCard, Wallet, Banknote } from "lucide-react";
import { useCart } from "../context/CartContext";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useNavigate } from "react-router-dom";
import { useTableNumber } from "../hooks/useTableNumber";
import Loading from "../Loading";
import { safeDeleteUnpaidOrders } from "../utils/orderCleanupUtils";
import { getPlaceholder } from "../utils/placeholder";
import resolveImageUrl from "../utils/storageResolver";
import { calculateBilling, TAX_RATE } from "../utils/billing";
import { parsePriceValue } from "../utils/pricing";
import "./Payments.css";

function Payments({ onBackClick }) {
  const { cartItems, updateQuantity, removeFromCart, getTotalPrice, markPaymentSuccessful, saveOrderTempState, clearOrderTempState } = useCart();
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [confirmedOrderData, setConfirmedOrderData] = useState(null);
  const [confirmedOrderId, setConfirmedOrderId] = useState(null);
  // Gates rendering until we know whether a confirmed order exists, so the
  // page never flashes its full cart/payment UI right before redirecting away.
  const [initializing, setInitializing] = useState(true);
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();

  // On mount, load confirmed order data from storage (set by AwaitingConfirmation)
  useEffect(() => {
    const orderId = sessionStorage.getItem("confirmedOrderId") || localStorage.getItem("orderin_confirmed_orderid");
    const orderDataStr = sessionStorage.getItem("confirmedOrderData") || localStorage.getItem("orderin_confirmed_orderdata");

    if (orderId && orderDataStr) {
      try {
        const parsedData = JSON.parse(orderDataStr);
        setConfirmedOrderId(orderId);
        setConfirmedOrderData(parsedData);
        console.log("Payments: loaded confirmed order:", orderId, parsedData);
        setInitializing(false);
      } catch (e) {
        console.warn("Payments: error parsing confirmed order data", e);
        navigate(getPathWithTable("/menu"), { replace: true });
      }
    } else {
      console.warn("Payments: no confirmed order found. Redirecting to menu.");
      // Navigate immediately — no reason to delay, and delaying only risked
      // a state update racing the navigation.
      navigate(getPathWithTable("/menu"), { replace: true });
    }
  }, []);

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

  // Every hook must run on every render — the early `initializing` return
  // below is only allowed AFTER all hooks are declared (Rules of Hooks).
  if (initializing) {
    return <Loading isLoading={true} />;
  }

  // Fallback onBackClick: navigate back and clean up unpaid orders from Firestore
  const handleBackClick = async () => {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      if (user && user.phone && confirmedOrderId) {
        // Fix #16: Pass specific confirmedOrderId to only delete the current pending order
        await safeDeleteUnpaidOrders(user.phone, confirmedOrderId);
      }
    } catch (err) {
      console.error('Error during order cleanup on back navigation:', err);
    }

    // Clear payment-related storage
    sessionStorage.removeItem('pendingOrderId');
    sessionStorage.removeItem('pendingOrderForFirestore');
    sessionStorage.removeItem('pendingVerificationCode');
    sessionStorage.removeItem('confirmedOrderId');
    sessionStorage.removeItem('confirmedOrderData');
    localStorage.removeItem('orderin_countercode_orderId');
    localStorage.removeItem('orderin_countercode_paymentMethod');
    localStorage.removeItem('orderin_onlinepayment_orderId');
    localStorage.removeItem('orderin_confirmed_orderid');
    localStorage.removeItem('orderin_confirmed_orderdata');
    localStorage.removeItem('pendingVerificationCode');

    if (onBackClick) {
      onBackClick();
    } else {
      navigate(getPathWithTable('/cart'));
    }
  };

  // Use the cart items data for display and calculate billing.
  // Deliberately NOT passed `selectedPayment`: Cash/Card round the tax to a
  // whole rupee for easier physical settlement, but recalculating this on
  // every tap of a payment button made the on-screen total visibly jump
  // around as the customer merely explored options, which reads as prices
  // being manipulated. The exact, stable total is shown throughout checkout;
  // the (at most few-paise) rounding is only applied to what's actually
  // billed once a method is picked, in handlePlaceOrder below.
  const subtotal = parseFloat(getTotalPrice());
  const displayedBilling = calculateBilling(subtotal, null);

  const handlePaymentSelect = (method) => {
    setSelectedPayment(method);
  };

  const handlePlaceOrder = async () => {
    if (!selectedPayment) {
      alert("Please select a payment method");
      return;
    }
    
    if (!confirmedOrderId) {
      alert("No confirmed order to process payment for");
      return;
    }

    setIsSaving(true);
    let phoneNumber = null;
    
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      if (!user || !user.phone) {
        throw new Error("User not logged in or phone number missing");
      }
      phoneNumber = user.phone;

      // Generate verification code for Cash/Card payments
      let verificationCode = null;
      if (selectedPayment === 'Cash' || selectedPayment === 'Card') {
        verificationCode = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      }

      try {
        if (verificationCode) {
          sessionStorage.setItem('pendingVerificationCode', verificationCode);
          localStorage.setItem('pendingVerificationCode', verificationCode);
        } else {
          sessionStorage.removeItem('pendingVerificationCode');
          localStorage.removeItem('pendingVerificationCode');
        }
      } catch (err) {
        console.warn('Payments: could not persist pendingVerificationCode', err);
      }

      // Calculate billing with selected payment method
      const calculatedSubtotal = parseFloat(getTotalPrice()) || 0;
      const calculatedBilling = calculateBilling(calculatedSubtotal, selectedPayment);

      // Update the confirmed order in Firestore with payment method and billing
      const customerRef = doc(db, "Restaurant", "orderin_restaurant_3", "customers", phoneNumber);
      const customerSnap = await getDoc(customerRef);
      
      if (customerSnap.exists()) {
        const data = customerSnap.data();
        const pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
        
        const idsMatch = (left, right) => String(left) === String(right);
        const updatedOrders = pastOrders.map(order => {
          if (!idsMatch(order.id, confirmedOrderId)) return order;
          // Update the order with payment method and billing
          return {
            ...order,
            paymentMethod: selectedPayment,
            subtotal: calculatedBilling.subtotal,
            taxes: calculatedBilling.taxes,
            total: calculatedBilling.total,
            verificationCode: verificationCode || null,
            awaitingConfirmation: false,
          };
        });
        
        await setDoc(customerRef, { pastOrders: updatedOrders }, { merge: true });
        console.log("Payments: Updated confirmed order with payment method:", selectedPayment);
      }

      // Store payment data for use on payment pages
      const paymentData = {
        orderId: confirmedOrderId,
        subtotal: calculatedBilling.subtotal,
        taxes: calculatedBilling.taxes,
        total: calculatedBilling.total,
        taxRate: TAX_RATE,
        useProvidedTax: true,
        restaurantId: 'orderin_restaurant_3',
        paymentMethod: selectedPayment,
        customerPhone: phoneNumber
      };
      sessionStorage.setItem('paymentData', JSON.stringify(paymentData));
      localStorage.setItem('orderin_paymentData', JSON.stringify(paymentData));

      // Store pending order IDs for payment pages
      sessionStorage.setItem('pendingOrderId', confirmedOrderId);
      localStorage.setItem('orderin_countercode_orderId', confirmedOrderId);
      localStorage.setItem('orderin_countercode_paymentMethod', selectedPayment);
      localStorage.setItem('orderin_onlinepayment_orderId', confirmedOrderId); // Fix #10: store for online payment fallback

      // Also save temp state for page refresh recovery
      const billing = {
        subtotal: calculatedBilling.subtotal,
        taxes: calculatedBilling.taxes,
        total: calculatedBilling.total
      };
      saveOrderTempState(confirmedOrderId, cartItems, billing, 'unpaid');

      // Navigate to the appropriate payment flow
      setIsSaving(false);
      setTimeout(() => {
        if (selectedPayment === 'Online') {
          navigate(getPathWithTable('/online-payment'));
        } else {
          // For Cash/Card, go to counter code verification
          navigate(getPathWithTable('/counter-code'));
        }
      }, 100);
      
    } catch (err) {
      setIsSaving(false);
      console.error("Error processing payment method selection:", err);
      alert("Error processing payment: " + err.message);
    }
  };

  return (
    <div className="payments-container">
      <Loading isLoading={isSaving} />
      <div className="payments-card">
        <button className="close-button" onClick={handleBackClick}>
          <X size={22} />
        </button>

        <h2 className="checkout-header">Checkout</h2>

        {cartItems.map((item, index) => {
          const cartKey = item.cartKey || item.name;
          const unitPrice = item.effectivePrice ?? parsePriceValue(item.price);
          return (
          <div key={index} className="order-item">
            <img
              src={(resolvedImages[item.name] && resolvedImages[item.name] !== '') ? resolvedImages[item.name] : (item.image && !(item.image.startsWith && item.image.startsWith('gs://')) ? item.image : getPlaceholder('No Image'))}
              alt={item.name}
              className="order-item-image"
              onError={(e) => { console.warn('Payments image load failed', e.currentTarget.src, 'orderItem', item && (item.id || item.name)); e.currentTarget.src = getPlaceholder('No Image'); }}
            />
            <div className="order-item-details">
              <h3 className="order-item-name">{item.name}</h3>
              <p className="order-item-price">₹{(unitPrice * item.quantity).toFixed(2)}</p>
                <p className="order-item-each">₹{unitPrice.toFixed(2)} each</p>
              {item.instructions && (
                <p className="order-item-instructions"><strong>Cooking Preferences:</strong> {item.instructions}</p>
              )}
            </div>

            <div className="quantity-controls">
              <button
                onClick={() => updateQuantity(cartKey, item.quantity - 1)}
                className="qty-button"
              >
                <Minus size={14} />
              </button>
              <span className="qty-value">{item.quantity}</span>
              <button
                onClick={() => updateQuantity(cartKey, item.quantity + 1)}
                className="qty-button"
              >
                <Plus size={14} />
              </button>
              <button className="remove-button" onClick={() => removeFromCart(cartKey)}>
                <Trash2 size={16} />
              </button>
            </div>
            </div>
          );
        })}

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
