import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useTableNumber } from "../hooks/useTableNumber";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "./PaymentSuccess.css";
import "../Bill.css";
import { parseOrderTimestamp } from "../utils/orderDateTime";

function PaymentSuccess() {
  const navigate = useNavigate();
  const { orderHistory, clearOrderTempState } = useCart();
  const { getPathWithTable } = useTableNumber();
  const [displayOrderId, setDisplayOrderId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);


  // On mount, fetch the latest paid order from Firestore backend
  useEffect(() => {
    const fetchLatestOrderFromBackend = async () => {
      const getFallbackOrderId = () => {
        const savedOrderId = localStorage.getItem('orderin_countercode_orderId') || localStorage.getItem('orderin_orderId');
        let fallbackOrderId = orderHistory[orderHistory.length - 1]?.id;
        if (!fallbackOrderId) {
          try {
            const storedHistory = JSON.parse(localStorage.getItem('orderHistory') || '[]');
            fallbackOrderId = Array.isArray(storedHistory) ? storedHistory[storedHistory.length - 1]?.id : null;
          } catch (parseErr) {
            fallbackOrderId = null;
          }
        }
        return savedOrderId || fallbackOrderId || null;
      };

      const immediateOrderId = getFallbackOrderId();
      if (immediateOrderId) {
        setDisplayOrderId(immediateOrderId);
        setIsLoading(false);
      }

      try {
        const user = JSON.parse(localStorage.getItem("user"));
        if (!user || !user.phone) {
          console.log('PaymentSuccess: User not logged in, using fallback');
          setDisplayOrderId(immediateOrderId);
          setIsLoading(false);
          return;
        }

        const phoneNumber = user.phone;
        const customerRef = doc(db, "Restaurant", "orderin_restaurant_2", "customers", phoneNumber);
        const customerSnap = await getDoc(customerRef);

        if (customerSnap.exists()) {
          const data = customerSnap.data();
          const pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
          
          // Find the most recent paid order
          const paidOrder = pastOrders
            .filter(o => o.paymentStatus === 'paid')
            .sort((a, b) => parseOrderTimestamp(b) - parseOrderTimestamp(a))[0];

          if (paidOrder) {
            console.log('PaymentSuccess: fetched paid order from backend:', paidOrder.id);
            // Display the order ID (now uses human-readable format ORD-DDMMYY<sequence>)
            setDisplayOrderId(paidOrder.id);
            setIsLoading(false);
            return;
          }
        }
        
        // Fallback to localStorage or orderHistory if backend fetch fails
        const orderIdToDisplay = getFallbackOrderId();
        console.log('PaymentSuccess: using fallback orderId=', orderIdToDisplay);
        setDisplayOrderId(orderIdToDisplay);
        setIsLoading(false);
      } catch (err) {
        console.error('PaymentSuccess: Error fetching order from backend:', err);
        // Fallback to localStorage or orderHistory
        const orderIdToDisplay = getFallbackOrderId();
        setDisplayOrderId(orderIdToDisplay);
        setIsLoading(false);
      }
    };

    fetchLatestOrderFromBackend();

    // Clear all temporary localStorage after displaying (give UI time to render)
    // Use setTimeout to ensure state is set before clearing
    const clearTimer = setTimeout(() => {
      clearOrderTempState();
      console.log('PaymentSuccess: cleared temp state from localStorage');
    }, 1000);

    return () => clearTimeout(clearTimer);
  }, [orderHistory, clearOrderTempState]);

  return (
    <div className="payment-success-container">
      <div className="success-card">
        <div className="success-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="#00a693"
            className="success-svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2>Payment Successful!</h2>
        {isLoading ? (
          <p className="order-id">Preparing your receipt...</p>
        ) : displayOrderId ? (
          <p className="order-id">Order ID: {displayOrderId}</p>
        ) : (
          <p className="order-id order-id-warning">Order details unavailable. Please ask the counter for help.</p>
        )}

        <button className="view-bill-btn" disabled={!displayOrderId} onClick={() => navigate(getPathWithTable('/review'))}>
          View Bill
        </button>

        <button className="back-home-btn" onClick={() => navigate(getPathWithTable('/menu'))}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

export default PaymentSuccess;
