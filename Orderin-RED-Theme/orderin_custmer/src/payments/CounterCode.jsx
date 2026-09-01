import React, { useState, useEffect } from "react";
import { ChevronLeft, CreditCard, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useTableNumber } from "../hooks/useTableNumber";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { safeDeleteUnpaidOrders } from "../utils/orderCleanupUtils";
import "./CounterCode.css";

const idsMatch = (left, right) => String(left) === String(right);

function CounterCode({ onBackClick }) {
  const [counterCode, setCounterCode] = useState(["", "", "", ""]);
  const [restoredOrderId, setRestoredOrderId] = useState(null); // For displaying restored order ID
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();
  const { markPaymentSuccessful, orderHistory } = useCart();

  // Restore counter code page state from localStorage on mount
  useEffect(() => {
    const savedOrderId = localStorage.getItem('orderin_countercode_orderId');
    const savedPaymentMethod = localStorage.getItem('orderin_countercode_paymentMethod');
    if (savedOrderId && savedPaymentMethod) {
      console.log('Restored counter code page state: orderId=', savedOrderId, 'method=', savedPaymentMethod);
      setRestoredOrderId(savedOrderId);
      // Also store in sessionStorage for use in handleSubmit
      sessionStorage.setItem('pendingOrderId', savedOrderId);
    }
  }, []);

  // Fallback onBackClick: navigate back and clean up unpaid orders from Firestore
  const handleBackClick = async () => {
    // Step 1: Delete unpaid orders from Firestore BEFORE navigating back
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      if (user && user.phone) {
        // Delete all unpaid orders for this user
        // This is called when user navigates BACK from Counter Code page
        await safeDeleteUnpaidOrders(user.phone);
      }
    } catch (err) {
      console.error('Error during order cleanup on back navigation:', err);
      // Continue navigation anyway - don't let cleanup errors block back button
    }

    // Step 2: Clear session storage
    sessionStorage.removeItem('pendingOrderId');
    sessionStorage.removeItem('pendingOrderForFirestore');
    localStorage.removeItem('orderin_countercode_orderId');
    localStorage.removeItem('orderin_countercode_paymentMethod');

    // Step 3: Navigate back
    if (onBackClick) {
      onBackClick();
    } else {
      navigate(getPathWithTable('/cart'));
    }
  };

  const focusCodeInput = (index) => {
    const input = document.getElementById(`code-${index}`);
    if (input) input.focus();
  };

  const fillCodeFromIndex = (index, value) => {
    const digits = value.replace(/\D/g, '').slice(0, 4 - index).split('');
    if (!digits.length) return;

    const newCode = [...counterCode];
    digits.forEach((digit, offset) => {
      newCode[index + offset] = digit;
    });
    setCounterCode(newCode);
    focusCodeInput(Math.min(index + digits.length, 3));
  };

  const handleChange = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...counterCode];
    newCode[index] = digit;
    setCounterCode(newCode);

    // Auto-focus next input when a digit is entered
    if (digit && index < 3) {
      focusCodeInput(index + 1);
    }
    // Handle backspace on mobile (when field becomes empty after having value)
    else if (!digit && index > 0 && counterCode[index] !== '') {
      // Previous field had value, now it's empty - move back
      const newCodeBk = [...counterCode];
      newCodeBk[index - 1] = '';
      setCounterCode(newCodeBk);
      focusCodeInput(index - 1);
    }
  };

  const handlePaste = (index, e) => {
    e.preventDefault();
    fillCodeFromIndex(index, e.clipboardData.getData('text'));
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      const newCode = [...counterCode];
      
      // If current cell has value, clear it
      if (newCode[index]) {
        e.preventDefault();
        newCode[index] = '';
        setCounterCode(newCode);
      } else if (index > 0) {
        // If current cell is empty, go to previous cell and clear it
        e.preventDefault();
        newCode[index - 1] = '';
        setCounterCode(newCode);
        focusCodeInput(index - 1);
      }
    }
  };

  const handleSubmit = async () => {
    const fullCode = counterCode.join("").trim();
    // Prefer pendingOrderId stored in sessionStorage (set by Payments) to avoid race issues
    const pendingOrderId = sessionStorage.getItem('pendingOrderId');
    const latestOrder = orderHistory[orderHistory.length - 1];
    const orderIdToCheck = pendingOrderId || latestOrder?.id;

    if (!orderIdToCheck) {
      alert("No order found to verify");
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem("user"));
      if (!user || !user.phone) {
        alert("User not logged in");
        return;
      }
      const phoneNumber = user.phone;

      const customerRef = doc(db, "Restaurant", "orderin_restaurant_1", "customers", phoneNumber);
      const customerSnap = await getDoc(customerRef);
      if (!customerSnap.exists()) {
        alert("Customer record not found");
        return;
      }

      const data = customerSnap.data();
      console.log('CounterCode: fetched customer doc for phone:', phoneNumber, 'data:', data);
      console.log('CounterCode: pastOrders length:', Array.isArray(data.pastOrders) ? data.pastOrders.length : 0);
      const pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];

      // Find the current order in Firestore by the resolved id
      const firestoreOrder = pastOrders.find(o => idsMatch(o.id, orderIdToCheck));
      console.log('CounterCode: resolved firestoreOrder for id', orderIdToCheck, firestoreOrder);
      if (!firestoreOrder) {
        alert("Order not found in records");
        return;
      }

      // Extract verification code robustly (support different key names/formats)
      const extractVerificationCode = (orderObj) => {
        if (!orderObj || typeof orderObj !== 'object') return '';
        const directKeys = ['verificationCode', 'verification_code', 'verification', 'verificationcode', 'code', 'otp'];
        for (const k of directKeys) {
          if (k in orderObj && orderObj[k] != null && orderObj[k] !== '') return orderObj[k];
        }
        // fallback: any key matching verif|code|otp
        for (const k of Object.keys(orderObj)) {
          if (/verif|code|otp/i.test(k) && orderObj[k] != null && orderObj[k] !== '') return orderObj[k];
        }
        // nested search (one level)
        for (const k of Object.keys(orderObj)) {
          const val = orderObj[k];
          if (val && typeof val === 'object') {
            for (const kk of Object.keys(val)) {
              if (/verif|code|otp/i.test(kk) && val[kk] != null && val[kk] !== '') return val[kk];
            }
          }
        }
        return '';
      };

      // First, check if a pending verification code was recently generated and saved in sessionStorage/localStorage
      const pendingFromSession = sessionStorage.getItem('pendingVerificationCode');
      const pendingFromLocal = localStorage.getItem('pendingVerificationCode');
      if (pendingFromSession || pendingFromLocal) {
        console.log('CounterCode: pending verification code available (session/local):', pendingFromSession, pendingFromLocal);
      }

      const storedCode = extractVerificationCode(firestoreOrder).toString();
      const normalize = (s) => (s || "").toString().trim().replace(/\D/g, '');
      const enteredNorm = normalize(fullCode);
      const storedNorm = normalize(storedCode);

      console.log('CounterCode: entered=', fullCode, 'normalized=', enteredNorm, 'stored=', storedCode, 'normalized=', storedNorm, 'orderId=', orderIdToCheck);

      // If we have a pending verification code in sessionStorage, prefer that as the expected value
      const pendingExpected = (pendingFromSession || pendingFromLocal || '').toString().trim().replace(/\D/g, '');
      if (pendingExpected) {
        console.log('CounterCode: using pendingExpected from storage=', pendingExpected);
      }

      const expectedToCompare = pendingExpected || storedNorm;

      if (enteredNorm === expectedToCompare && enteredNorm.length === 4) {
        // Payment verified! Update order status from 'unpaid' to 'paid'
        try {
          const user = JSON.parse(localStorage.getItem("user"));
          if (user && user.phone) {
            const phoneNumber = user.phone;
            const customerRef = doc(db, "Restaurant", "orderin_restaurant_1", "customers", phoneNumber);
            const customerSnap = await getDoc(customerRef);
            
            if (customerSnap.exists()) {
              const data = customerSnap.data();
              let pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
              
              // Find and update the order status from 'unpaid' to 'paid'
              const orderIndex = pastOrders.findIndex(o => idsMatch(o.id, orderIdToCheck));
              if (orderIndex !== -1) {
                pastOrders[orderIndex].paymentStatus = 'paid';
                pastOrders[orderIndex].paidAt = new Date().toISOString();
                await setDoc(customerRef, { pastOrders }, { merge: true });
                console.log('Order successfully updated to paymentStatus=paid, orderId=', orderIdToCheck);
              }
            }
          }
        } catch (err) {
          console.error("Error updating order status to paid:", err);
          // Continue anyway - verification passed, user should see success page
        }

        // Clear pending id before marking success
        // DO NOT clear temp state here - let PaymentSuccess page do it for display
        sessionStorage.removeItem('pendingOrderId');
        // Also remove pending verification code after success
        sessionStorage.removeItem('pendingVerificationCode');
        localStorage.removeItem('pendingVerificationCode');
        markPaymentSuccessful(orderIdToCheck);
        navigate(getPathWithTable('/payment-success'));
      } else {
        console.warn('CounterCode mismatch: entered', enteredNorm, 'expected (pending/db)', pendingExpected || storedNorm, 'stored(db)=', storedNorm);
        alert(`Invalid counter code. Please try again. (entered: ${fullCode}, expected (pending/db): ${pendingExpected || storedCode})`);
        setCounterCode(["", "", "", ""]);
      }
    } catch (err) {
      console.error("Error verifying counter code:", err);
      alert("Error verifying code: " + err.message);
    }
  };

  return (
    <div className="counter-code-container">
      <header className="counter-code-header">
        <button
          className="counter-back-icon"
          onClick={handleBackClick}
          aria-label="Back to cart"
        >
          <ChevronLeft size={22} />
        </button>
        <h1>Payment Verification</h1>
      </header>

      <div className="code-entry-section">
        <div className="code-entry-box">
          <div className="counter-code-badge" aria-hidden="true">
            <ShieldCheck size={32} />
          </div>

          <div className="counter-copy">
            <p className="counter-eyebrow">Counter Payment</p>
            <h2>Enter Verification Code</h2>
            <p>Ask the counter for the 4 digit code and enter it below to complete payment.</p>
          </div>

          <div className="counter-order-summary">
            <div className="counter-order-icon" aria-hidden="true">
              <CreditCard size={20} />
            </div>
            <div>
              <span>Order ID</span>
              <strong>#{restoredOrderId || orderHistory[orderHistory.length - 1]?.id || 'N/A'}</strong>
            </div>
          </div>

          <div className="digit-inputs" aria-label="Counter code input">
            {counterCode.map((digit, index) => (
              <input
                key={index}
                id={`code-${index}`}
                type="text"
                pattern="[0-9]*"
                maxLength="1"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={(e) => handlePaste(index, e)}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                aria-label={`Counter code digit ${index + 1}`}
              />
            ))}
          </div>

          <p className="instruction-text">The code is used only to confirm this counter payment.</p>

          <div className="counter-actions">
            <button className="verify-button" onClick={handleSubmit}>
              Verify Payment
            </button>
            <button className="counter-back-button" onClick={handleBackClick}>
              Back to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CounterCode;
